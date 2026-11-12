/**
 * whatsappBot.js — Orquestra o atendimento do WhatsApp.
 *
 * Fluxo de uma mensagem recebida:
 *   1. ignora reenvios da Meta (id da mensagem já visto);
 *   2. limita 30 mensagens por hora por número;
 *   3. "VINCULAR 123456" liga o número à conta que gerou o código, com as
 *      carteiras padrão escolhidas no site (uma conta pode ter vários números);
 *   4. número não vinculado recebe instruções; plano sem WhatsApp recebe aviso;
 *   5. botões e listas executam a ação pendente;
 *   6. texto, áudio, foto ou PDF passam pelo Gemini, que escolhe a ação.
 * Lançamentos só são gravados depois que o usuário toca em Confirmar.
 *
 * O conteúdo das mensagens não é gravado no banco.
 */
const crypto = require('crypto')
const { db } = require('../db')
const wa = require('./whatsappClient')
const agent = require('./whatsappAgent')
const fa = require('./financeActions')

const RATE_LIMIT_PER_HOUR = 30
const PENDING_TTL_MINUTES = 30
const LINK_CODE_TTL_MINUTES = 15
const EVENTS_RETENTION_DAYS = 30
const MEDIA_TYPES = ['audio', 'image', 'document']
const SUPPORTED_MEDIA_MIME = /^(audio\/(ogg|mpeg|mp4|aac|amr|wav|webm)|image\/(jpeg|png|webp)|application\/pdf)$/

const siteUrl = () => (process.env.FRONTEND_URL || 'https://www.eusempremei.com.br').replace(/\/+$/, '')

// ─── Formatação ──────────────────────────────────────────────────────────────

const brl = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const brDate = (iso) => {
    if (!iso) return '-'
    const [y, m, d] = String(iso).slice(0, 10).split('-')
    return `${d}/${m}/${y}`
}
const shortDate = (iso) => brDate(iso).slice(0, 5)
const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || ''
const targetLabel = (target) => (target === 'BUSINESS' ? 'MEI' : 'Pessoal')
const hashCode = (code) => crypto.createHash('sha256').update(String(code)).digest('hex')

const HELP_TEXT = () => [
    'Posso te ajudar com:',
    '• *Registrar gastos e receitas*: "gastei 50 no mercado no pix", "recebi 300 do cliente Ana"',
    '• *Em outra carteira*: "comprei 10 de peixe carteira Maria pix"',
    '• *Com categoria*: "recebi 3500 da maquininha categoria maquininha"',
    '• *Contas a pagar*: "boleto da luz de 180 vence dia 20"',
    '• *Ver contas*: "contas de hoje", "contas da semana"',
    '• *Marcar como paga*: "paguei a conta de luz"',
    '• *Resumo*: "resumo do mês"',
    '',
    'Também entendo áudio e foto de boleto ou comprovante (plano Ouro).',
    'Envie *PARAR* para desligar o lembrete diário ou *DESVINCULAR* para desconectar este número.'
].join('\n')

const NOT_LINKED_TEXT = () => [
    'Olá! Este é o WhatsApp do *EuSempreMEI*.',
    '',
    'Este número ainda não está ligado a uma conta. Para conectar:',
    `1. Entre em ${siteUrl()}/conta`,
    '2. Na seção *WhatsApp*, toque em *Conectar*',
    '3. Envie para cá a mensagem com o código que aparecer.'
].join('\n')

// ─── Extração de dados da mensagem ───────────────────────────────────────────

function extractText(msg) {
    if (msg.type === 'text') return msg.text?.body || ''
    if (msg.type === 'button') return msg.button?.text || msg.button?.payload || ''
    if (msg.type === 'image') return msg.image?.caption || ''
    if (msg.type === 'document') return msg.document?.caption || ''
    return ''
}

function extractReplyId(msg) {
    if (msg.type !== 'interactive') return null
    return msg.interactive?.button_reply?.id || msg.interactive?.list_reply?.id || null
}

// ─── Ação pendente (aguardando Confirmar/Cancelar) ───────────────────────────

async function savePending(linkId, action) {
    const nonce = crypto.randomBytes(6).toString('hex')
    await db.query(
        `UPDATE whatsapp_links
         SET "pendingNonce" = $2, "pendingAction" = $3,
             "pendingExpiresAt" = NOW() + ($4 || ' minutes')::interval
         WHERE id = $1`,
        [linkId, nonce, JSON.stringify(action), String(PENDING_TTL_MINUTES)]
    )
    return nonce
}

/** Consome a ação pendente de forma atômica (evita gravar duas vezes com toque duplo). */
async function consumePending(linkId, nonce) {
    const { rows: [row] } = await db.query(
        `WITH old AS (
            SELECT id, "pendingAction" FROM whatsapp_links
            WHERE id = $1 AND "pendingNonce" = $2 AND "pendingExpiresAt" > NOW()
            FOR UPDATE
         )
         UPDATE whatsapp_links w
         SET "pendingNonce" = NULL, "pendingAction" = NULL, "pendingExpiresAt" = NULL
         FROM old WHERE w.id = old.id
         RETURNING old."pendingAction" AS "pendingAction"`,
        [linkId, nonce]
    )
    if (!row || !row.pendingAction) return null
    try { return JSON.parse(row.pendingAction) } catch (_) { return null }
}

// ─── Validação do que o Gemini devolveu ──────────────────────────────────────

const CREDIT_CARD_EXPENSE_TEXT = 'Compras no cartão de crédito precisam do cartão e da fatura. Por enquanto, lance pelo site ou envie a fatura na área de Cartões.'

// Formas de pagamento oferecidas na lista (id curto no botão → valor gravado)
const PAYMENT_OPTIONS = [
    { code: 'PIX', value: 'PIX', title: 'PIX' },
    { code: 'DIN', value: 'Dinheiro', title: 'Dinheiro' },
    { code: 'DEB', value: 'Cartão de Débito', title: 'Cartão de Débito' },
    { code: 'CRE', value: 'Cartão de Crédito', title: 'Cartão de Crédito' }
]

function normalizeTransactionArgs(args) {
    const type = args.tipo === 'RECEITA' ? 'RECEITA' : args.tipo === 'DESPESA' ? 'DESPESA' : null
    const amount = Math.round(Number(args.valor) * 100) / 100
    const description = String(args.descricao || '').trim().slice(0, 120)
    const target = args.destino === 'MEI' ? 'BUSINESS' : args.destino === 'PESSOAL' ? 'PERSONAL' : null
    const isBill = args.conta_a_pagar === true && type === 'DESPESA'
    const dueDate = isBill && fa.isValidISODate(args.vencimento) ? args.vencimento : null
    const date = fa.isValidISODate(args.data) ? args.data : null
    const method = ['PIX', 'Dinheiro', 'Cartão de Débito', 'Cartão de Crédito', 'Boleto'].includes(args.forma_pagamento)
        ? args.forma_pagamento : null
    const walletQuery = String(args.carteira || '').trim().slice(0, 60)

    if (!type) return { error: 'Não entendi se é uma despesa ou uma receita. Pode repetir?' }
    if (!Number.isFinite(amount) || amount <= 0 || amount > 10000000) {
        return { error: 'Não consegui identificar o valor. Pode mandar de novo com o valor? Ex: "gastei 50 no mercado".' }
    }
    if (!description) return { error: 'Qual a descrição desse lançamento?' }
    if (isBill && !dueDate) return { error: 'Qual é a data de vencimento dessa conta?' }
    // Receita no crédito (maquininha) é aceita; despesa no crédito depende do cartão e da fatura
    if (!isBill && type === 'DESPESA' && method === 'Cartão de Crédito') {
        return { error: CREDIT_CARD_EXPENSE_TEXT }
    }
    if (!isBill && date && date > fa.todayISO()) {
        return { error: 'Essa data está no futuro. Se for uma conta a pagar, me diga o vencimento: "boleto de 100 vence dia 20".' }
    }

    return {
        tx: {
            type, amount, description, target, isBill, dueDate,
            date: isBill ? null : date,
            categoryName: args.categoria ? String(args.categoria).trim().slice(0, 60) || null : null,
            categoryRequested: args.categoria_pedida === true,
            paymentMethod: isBill ? 'Boleto' : (method === 'Boleto' ? null : method),
            walletQuery: walletQuery || null,
            walletId: null,
            walletName: null
        }
    }
}

function describeTransaction(tx) {
    const what = tx.isBill ? 'conta a pagar' : tx.type === 'RECEITA' ? 'receita' : 'despesa'
    const lines = [`*${what[0].toUpperCase()}${what.slice(1)}*: ${tx.description}`, `Valor: *${brl(tx.amount)}*`]
    if (tx.isBill) lines.push(`Vencimento: ${brDate(tx.dueDate)}`)
    else lines.push(`Data: ${brDate(tx.date || fa.todayISO())}`)
    if (tx.walletName) lines.push(`Carteira: ${tx.walletName}`)
    else if (tx.target) lines.push(`Carteira: ${targetLabel(tx.target)}`)
    if (!tx.isBill && tx.paymentMethod) lines.push(`Pagamento: ${tx.paymentMethod}`)
    if (tx.categoryName) lines.push(`Categoria: ${tx.categoryName}${tx.createCategory ? ' (nova)' : ''}`)
    return lines.join('\n')
}

// ─── Carteiras citadas na mensagem ───────────────────────────────────────────

const normalizeText = (value) => String(value || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()

const BUSINESS_WORDS = ['mei', 'pj', 'empresa', 'cnpj']
const PERSONAL_WORDS = ['pf', 'pessoal', 'cpf']
const FILLER_WORDS = ['carteira', 'conta', 'da', 'do', 'de', 'na', 'no']

/**
 * Carteiras que combinam com o que a pessoa citou ("miriam", "Jhonny MEI").
 * Palavras como "mei"/"pessoal" filtram o tipo; as demais precisam aparecer no nome.
 */
function matchWallets(wallets, query, target) {
    const q = normalizeText(query)
    if (!q) return []
    const exact = wallets.filter(w => normalizeText(w.name) === q)
    if (exact.length) return exact

    const words = q.split(' ')
    let typeFilter = target === 'BUSINESS' ? 'PJ' : target === 'PERSONAL' ? 'PF' : null
    if (words.some(w => BUSINESS_WORDS.includes(w))) typeFilter = 'PJ'
    else if (words.some(w => PERSONAL_WORDS.includes(w))) typeFilter = 'PF'
    const ignored = [...BUSINESS_WORDS, ...PERSONAL_WORDS, ...FILLER_WORDS]
    const nameWords = words.filter(w => w.length >= 2 && !ignored.includes(w))
    if (!nameWords.length) return []

    const byName = wallets.filter(w => {
        const parts = normalizeText(w.name).split(' ')
        return nameWords.every(word => parts.some(part => part.startsWith(word)))
    })
    const byType = typeFilter ? byName.filter(w => w.accountType === typeFilter) : byName
    // Se o tipo veio só do palpite da IA e eliminou tudo, fica com o que bateu pelo nome
    return byType.length ? byType : byName
}

function applyWallet(tx, wallet) {
    tx.walletId = wallet.id
    tx.walletName = wallet.name
    tx.target = fa.walletTarget(wallet)
    tx.walletQuery = null
    tx.walletChecked = true
}

/** Primeiro nome do dono do número: da carteira pessoal padrão, senão o nome da conta. */
function ownerFirstName(ctx, personalWalletName) {
    return firstName(String(personalWalletName || '').replace(/\(.*?\)/g, '')) || firstName(ctx && ctx.name)
}

// ─── Execução das ações ──────────────────────────────────────────────────────

async function askToConfirmTransaction(ctx, link, phone, args) {
    const { tx, error } = normalizeTransactionArgs(args || {})
    if (error) return wa.sendText(phone, error)
    if (tx.isBill && !fa.hasFeature(ctx, 'contas_pagar')) {
        return wa.sendText(phone, 'Contas a pagar fazem parte do plano Prata. Veja os planos em ' + `${siteUrl()}/planos`)
    }
    return advanceTransaction(ctx, link, phone, tx)
}

/** Pede ao usuário que escolha entre carteiras (botões até 2, lista acima disso). */
async function askWallet(link, phone, tx, options, intro) {
    const nonce = await savePending(link.id, { kind: 'CREATE', tx, walletOptions: options.map(w => w.id) })
    const body = `${describeTransaction(tx)}\n\n${intro}`
    if (options.length <= 2) {
        return wa.sendButtons(phone, body, [
            ...options.map(w => ({ id: `wal:${w.id}:${nonce}`, title: w.name })),
            { id: `no:${nonce}`, title: 'Cancelar' }
        ])
    }
    return wa.sendList(phone, body, 'Escolher carteira',
        options.slice(0, 10).map(w => ({
            id: `wal:${w.id}:${nonce}`,
            title: w.name,
            description: w.accountType === 'PJ' ? 'MEI' : 'Pessoal'
        })), 'Carteiras')
}

/**
 * Completa o lançamento uma etapa por vez, nesta ordem:
 * carteira citada → MEI ou pessoal → carteira padrão do número → forma de
 * pagamento → categoria citada → resumo com Confirmar/Cancelar.
 * Cada pergunta grava a ação pendente com um nonce novo.
 */
async function advanceTransaction(ctx, link, phone, tx) {
    // 1. Carteira citada ("carteira miriam")
    if (tx.walletQuery && !tx.walletChecked) {
        const wallets = await fa.listWallets(ctx.id)
        const matches = matchWallets(wallets, tx.walletQuery, tx.target)
        if (matches.length === 1) {
            applyWallet(tx, matches[0])
        } else if (matches.length > 1) {
            return askWallet(link, phone, tx, matches, 'Em qual carteira?')
        } else if (wallets.length) {
            const sameType = tx.target ? wallets.filter(w => fa.walletTarget(w) === tx.target) : []
            const query = tx.walletQuery
            return askWallet(link, phone, tx, sameType.length ? sameType : wallets,
                `Não achei a carteira "${query}". Em qual carteira?`)
        } else {
            tx.walletQuery = null
            tx.walletChecked = true
        }
    }

    // 2. MEI ou pessoal
    if (!tx.target) {
        const nonce = await savePending(link.id, { kind: 'CREATE', tx })
        return wa.sendButtons(phone, `${describeTransaction(tx)}\n\nÉ do *MEI* ou *pessoal*?`, [
            { id: `tgt:BUSINESS:${nonce}`, title: 'MEI' },
            { id: `tgt:PERSONAL:${nonce}`, title: 'Pessoal' },
            { id: `no:${nonce}`, title: 'Cancelar' }
        ])
    }

    // 3. Carteira padrão do número (escolhida no site) ou a padrão da conta
    if (!tx.walletId) {
        const preferredId = tx.target === 'BUSINESS' ? link.businessWalletId : link.personalWalletId
        let wallet = preferredId ? await fa.getWallet(ctx.id, preferredId) : null
        if (!wallet || fa.walletTarget(wallet) !== tx.target) {
            const fallbackId = await fa.findWalletId(ctx.id, tx.target)
            wallet = fallbackId ? await fa.getWallet(ctx.id, fallbackId) : null
        }
        if (wallet) applyWallet(tx, wallet)
        tx.walletChecked = true
    }

    // 4. Forma de pagamento (obrigatória; conta a pagar já é Boleto)
    if (!tx.isBill && !tx.paymentMethod) {
        const nonce = await savePending(link.id, { kind: 'CREATE', tx })
        const question = tx.type === 'RECEITA' ? 'Como você recebeu?' : 'Como você pagou?'
        return wa.sendList(phone, `${describeTransaction(tx)}\n\n${question}`, 'Forma de pagamento',
            PAYMENT_OPTIONS.map(o => ({ id: `pm:${o.code}:${nonce}`, title: o.title })), 'Formas de pagamento')
    }

    // 5. Categoria citada: usa a existente; se a pessoa pediu uma que não existe, oferece criar
    if (tx.categoryName && !tx.categoryChecked) {
        const found = await fa.findCategory(ctx.id, tx.categoryName, tx.type, tx.target)
        if (found) {
            tx.categoryName = found.name
            tx.categoryChecked = true
        } else if (tx.categoryRequested && fa.hasFeature(ctx, 'categorias')) {
            const nonce = await savePending(link.id, { kind: 'CREATE', tx })
            return wa.sendButtons(phone,
                `${describeTransaction({ ...tx, categoryName: null })}\n\nA categoria *${tx.categoryName}* ainda não existe. Quer criar?`, [
                    { id: `cat:new:${nonce}`, title: 'Criar categoria' },
                    { id: `cat:none:${nonce}`, title: 'Sem categoria' },
                    { id: `no:${nonce}`, title: 'Cancelar' }
                ])
        } else {
            tx.categoryName = null
            tx.categoryChecked = true
        }
    }

    // 6. Resumo final
    const nonce = await savePending(link.id, { kind: 'CREATE', tx, ready: true })
    return wa.sendButtons(phone, `Confere?\n\n${describeTransaction(tx)}`, [
        { id: `ok:${nonce}`, title: 'Confirmar' },
        { id: `no:${nonce}`, title: 'Cancelar' }
    ])
}

async function createConfirmedTransaction(ctx, phone, tx) {
    const limit = await fa.checkTransactionLimit(ctx)
    if (!limit.allowed) {
        return wa.sendText(phone, `Seu plano permite ${limit.limit} lançamentos por mês e esse limite foi atingido. Veja os planos em ${siteUrl()}/planos`)
    }
    await fa.createTransaction(ctx, tx)
    const tail = tx.isBill ? 'Vou te lembrar no dia do vencimento.' : 'Já aparece no seu extrato.'
    return wa.sendText(phone, `✅ Registrado!\n\n${describeTransaction(tx)}\n\n${tail}`)
}

const PERIOD_LABEL = {
    HOJE: 'para hoje (incluindo atrasadas)',
    SEMANA: 'nos próximos 7 dias',
    MES: 'até o fim do mês',
    ATRASADAS: 'atrasadas',
    TODAS: 'pendentes'
}

async function sendBillsList(ctx, phone, period) {
    if (!fa.hasFeature(ctx, 'contas_pagar')) {
        return wa.sendText(phone, `Contas a pagar fazem parte do plano Prata. Veja os planos em ${siteUrl()}/planos`)
    }
    const safePeriod = fa.BILL_PERIODS.includes(period) ? period : 'HOJE'
    const bills = await fa.listPendingBills(ctx.id, safePeriod)
    if (!bills.length) {
        return wa.sendText(phone, `🎉 Nenhuma conta ${PERIOD_LABEL[safePeriod]}.`)
    }

    const today = fa.todayISO()
    const total = bills.reduce((acc, b) => acc + b.amount, 0)
    const lines = bills.slice(0, 15).map(b => {
        const flag = b.dueDate < today ? '🔴' : b.dueDate === today ? '🟡' : '⚪'
        return `${flag} ${shortDate(b.dueDate)} – ${b.description || b.categoryName || 'Conta'}: ${brl(b.amount)}`
    })
    if (bills.length > 15) lines.push(`…e mais ${bills.length - 15}. Veja todas em ${siteUrl()}/financas/contas`)

    const header = `*${bills.length} conta(s) ${PERIOD_LABEL[safePeriod]}* – total ${brl(total)}`
    return wa.sendList(phone, `${header}\n\n${lines.join('\n')}\n\nToque abaixo para marcar uma como paga.`, 'Marcar como paga',
        bills.slice(0, 10).map(b => ({
            id: `pay:${b.id}`,
            title: b.description || b.categoryName || 'Conta',
            description: `${brl(b.amount)} – vence ${shortDate(b.dueDate)}`
        })), 'Contas pendentes')
}

async function askWhichBillToPay(ctx, link, phone, args) {
    if (!fa.hasFeature(ctx, 'contas_pagar')) {
        return wa.sendText(phone, `Contas a pagar fazem parte do plano Prata. Veja os planos em ${siteUrl()}/planos`)
    }
    const bills = await fa.searchPendingBills(ctx.id, args && args.busca)
    if (!bills.length) {
        return wa.sendText(phone, `Não achei conta pendente com "${String(args?.busca || '').slice(0, 40)}". Mande *contas* para ver a lista.`)
    }
    if (bills.length === 1) {
        const bill = bills[0]
        const nonce = await savePending(link.id, { kind: 'PAY', transactionId: bill.id })
        return wa.sendButtons(phone,
            `Marcar como paga?\n\n*${bill.description || bill.categoryName || 'Conta'}*\nValor: ${brl(bill.amount)}\nVencimento: ${brDate(bill.dueDate)}`,
            [{ id: `ok:${nonce}`, title: 'Confirmar' }, { id: `no:${nonce}`, title: 'Cancelar' }])
    }
    return wa.sendList(phone, `Achei ${bills.length} contas. Qual você pagou?`, 'Escolher conta',
        bills.map(b => ({
            id: `pay:${b.id}`,
            title: b.description || b.categoryName || 'Conta',
            description: `${brl(b.amount)} – vence ${shortDate(b.dueDate)}`
        })), 'Contas pendentes')
}

async function payBill(ctx, phone, transactionId) {
    if (!fa.hasFeature(ctx, 'contas_pagar')) {
        return wa.sendText(phone, `Contas a pagar fazem parte do plano Prata. Veja os planos em ${siteUrl()}/planos`)
    }
    const paid = await fa.markBillPaid(ctx.id, transactionId)
    if (!paid) return wa.sendText(phone, 'Essa conta já estava paga ou não existe mais.')
    return wa.sendText(phone, `✅ *${paid.description || 'Conta'}* (${brl(paid.amount)}) marcada como paga.`)
}

async function sendMonthSummary(ctx, phone) {
    const s = await fa.monthSummary(ctx.id)
    const [y, m] = s.month.split('-')
    const lines = [
        `*Resumo de ${m}/${y}*`,
        '',
        '*MEI*',
        `Receitas: ${brl(s.receitaMei)}`,
        `Despesas: ${brl(s.despesaMei)}`,
        `Saldo: ${brl(s.receitaMei - s.despesaMei)}`,
        '',
        '*Pessoal*',
        `Receitas: ${brl(s.receitaPessoal)}`,
        `Despesas: ${brl(s.despesaPessoal)}`,
        `Saldo: ${brl(s.receitaPessoal - s.despesaPessoal)}`
    ]
    if (s.pendingCount > 0) lines.push('', `Contas pendentes até o fim do mês: ${s.pendingCount} (${brl(s.pendingTotal)})`)
    return wa.sendText(phone, lines.join('\n'))
}

async function executeAgentResult(ctx, link, phone, result) {
    if (!result || result.reply) return wa.sendText(phone, (result && result.reply) || 'Não entendi. Mande *ajuda* para ver o que eu faço.')
    switch (result.action) {
        case 'registrar_lancamento': return askToConfirmTransaction(ctx, link, phone, result.args)
        case 'listar_contas': return sendBillsList(ctx, phone, result.args && result.args.periodo)
        case 'marcar_conta_paga': return askWhichBillToPay(ctx, link, phone, result.args)
        case 'resumo_do_mes': return sendMonthSummary(ctx, phone)
        default: return wa.sendText(phone, 'Não entendi. Mande *ajuda* para ver o que eu faço.')
    }
}

async function handleReply(ctx, link, phone, replyId) {
    const [kind, ...rest] = String(replyId).split(':')

    if (kind === 'pay') return payBill(ctx, phone, rest[0])

    const nonce = rest[rest.length - 1]
    const pending = await consumePending(link.id, nonce)
    if (!pending) return wa.sendText(phone, 'Essa confirmação expirou. Pode mandar de novo?')
    if (kind === 'no') return wa.sendText(phone, 'Cancelado. Nada foi registrado.')

    if (pending.kind === 'CREATE') {
        const tx = { ...pending.tx }
        if (kind === 'ok') {
            // Só grava a partir do resumo final; qualquer outro "ok" retoma as etapas
            if (pending.ready) return createConfirmedTransaction(ctx, phone, tx)
            return advanceTransaction(ctx, link, phone, tx)
        }
        if (kind === 'tgt') {
            tx.target = rest[0] === 'BUSINESS' ? 'BUSINESS' : 'PERSONAL'
        } else if (kind === 'wal') {
            const walletId = parseInt(rest[0], 10)
            const allowed = Array.isArray(pending.walletOptions) && pending.walletOptions.includes(walletId)
            const wallet = allowed ? await fa.getWallet(ctx.id, walletId) : null
            if (!wallet) return wa.sendText(phone, 'Não achei essa carteira. Pode mandar de novo?')
            applyWallet(tx, wallet)
        } else if (kind === 'pm') {
            const option = PAYMENT_OPTIONS.find(o => o.code === rest[0])
            if (!option) return wa.sendText(phone, 'Não entendi a resposta. Pode mandar de novo?')
            if (option.value === 'Cartão de Crédito' && tx.type === 'DESPESA') {
                return wa.sendText(phone, `${CREDIT_CARD_EXPENSE_TEXT}\n\nNada foi registrado.`)
            }
            tx.paymentMethod = option.value
        } else if (kind === 'cat') {
            if (rest[0] === 'new') tx.createCategory = true
            else tx.categoryName = null
            tx.categoryChecked = true
        } else {
            return wa.sendText(phone, 'Não entendi a resposta. Pode mandar de novo?')
        }
        return advanceTransaction(ctx, link, phone, tx)
    }
    if (pending.kind === 'PAY' && kind === 'ok') return payBill(ctx, phone, pending.transactionId)
    return wa.sendText(phone, 'Não entendi a resposta. Pode mandar de novo?')
}

// ─── Vínculo do número ───────────────────────────────────────────────────────

/** Carteira do usuário, se for dele e do tipo esperado (PF ou PJ); senão null. */
async function ownWalletOfType(userId, walletId, accountType) {
    if (!walletId) return null
    const wallet = await fa.getWallet(userId, walletId)
    return wallet && wallet.accountType === accountType ? wallet : null
}

/**
 * Gera um código de 6 dígitos para vincular um número. Substitui códigos
 * anteriores do usuário. As carteiras escolhidas no site vão junto com o código.
 */
async function createLinkCode(userId, wallets = {}) {
    const [personal, business] = await Promise.all([
        ownWalletOfType(userId, wallets.personalWalletId, 'PF'),
        ownWalletOfType(userId, wallets.businessWalletId, 'PJ')
    ])
    await db.query('DELETE FROM whatsapp_link_codes WHERE "userId" = $1 OR "expiresAt" < NOW()', [userId])
    for (let attempt = 0; attempt < 5; attempt++) {
        const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0')
        const { rowCount } = await db.query(
            `INSERT INTO whatsapp_link_codes ("userId", "codeHash", "expiresAt", "personalWalletId", "businessWalletId")
             VALUES ($1, $2, NOW() + ($3 || ' minutes')::interval, $4, $5)
             ON CONFLICT ("codeHash") DO NOTHING`,
            [userId, hashCode(code), String(LINK_CODE_TTL_MINUTES), personal ? personal.id : null, business ? business.id : null]
        )
        if (rowCount === 1) {
            return { code, expiresAt: new Date(Date.now() + LINK_CODE_TTL_MINUTES * 60000).toISOString() }
        }
    }
    throw new Error('Não foi possível gerar o código')
}

async function countLinks(userId) {
    const { rows: [row] } = await db.query('SELECT COUNT(*)::int AS count FROM whatsapp_links WHERE "userId" = $1', [userId])
    return row ? Number(row.count) : 0
}

async function handleLinkCommand(phone, code) {
    const { rows: [row] } = await db.query(
        `DELETE FROM whatsapp_link_codes WHERE "codeHash" = $1 AND "expiresAt" > NOW()
         RETURNING "userId", "personalWalletId", "businessWalletId"`,
        [hashCode(code)]
    )
    if (!row) {
        return wa.sendText(phone, `Código inválido ou expirado. Gere um novo em ${siteUrl()}/conta, na seção WhatsApp.`)
    }
    const ctx = await fa.getUserContext(row.userId)
    if (!ctx) return wa.sendText(phone, 'Não foi possível vincular esta conta.')

    // Número novo na conta respeita o limite do plano; o mesmo número só atualiza as carteiras
    const { rows: [sameAccount] } = await db.query(
        'SELECT id FROM whatsapp_links WHERE phone = $1 AND "userId" = $2', [phone, ctx.id]
    )
    if (!sameAccount) {
        const max = fa.maxWhatsappNumbers(ctx)
        if (await countLinks(ctx.id) >= max) {
            return wa.sendText(phone, `Sua conta já tem ${max} número(s) de WhatsApp, o limite do seu plano. Desconecte um em ${siteUrl()}/conta para conectar este.`)
        }
    }

    const [personal, business] = await Promise.all([
        ownWalletOfType(ctx.id, row.personalWalletId, 'PF'),
        ownWalletOfType(ctx.id, row.businessWalletId, 'PJ')
    ])

    // O número passa a valer só para a conta que provou ter acesso a ele agora
    await db.query('DELETE FROM whatsapp_links WHERE phone = $1 AND "userId" <> $2', [phone, ctx.id])
    await db.query(
        `INSERT INTO whatsapp_links ("userId", phone, "optInAt", "reminderEnabled", "personalWalletId", "businessWalletId")
         VALUES ($1, $2, NOW(), TRUE, $3, $4)
         ON CONFLICT (phone) DO UPDATE
         SET "userId" = EXCLUDED."userId", "optInAt" = NOW(), "reminderEnabled" = TRUE,
             "personalWalletId" = EXCLUDED."personalWalletId", "businessWalletId" = EXCLUDED."businessWalletId",
             "pendingNonce" = NULL, "pendingAction" = NULL, "pendingExpiresAt" = NULL`,
        [ctx.id, phone, personal ? personal.id : null, business ? business.id : null]
    )
    const name = ownerFirstName(ctx, personal && personal.name)
    const walletLines = [
        personal ? `• Pessoal: *${personal.name}*` : null,
        business ? `• MEI: *${business.name}*` : null
    ].filter(Boolean)
    let walletText = ''
    if (walletLines.length) {
        const wallets = await fa.listWallets(ctx.id)
        const other = wallets.find(w => w.id !== personal?.id && w.id !== business?.id)
        const example = other ? firstName(String(other.name).replace(/\(.*?\)/g, '')) : ''
        walletText = `\n\nO que você lançar por aqui vai para:\n${walletLines.join('\n')}` +
            (example ? `\nPara outra carteira, cite o nome: "comprei 10 de peixe carteira ${example} pix".` : '')
    }
    return wa.sendText(phone, `✅ Pronto${name ? `, ${name}` : ''}! Este número está conectado à sua conta do EuSempreMEI.\nO lembrete diário de contas está ligado.${walletText}\n\n${HELP_TEXT()}`)
}

// ─── Entrada principal ───────────────────────────────────────────────────────

async function handleIncomingMessage(msg) {
    const phone = String(msg.from || '').replace(/\D/g, '')
    if (!phone || !msg.id) return

    // 1. Reenvio da Meta: já processado
    const inserted = await db.query(
        'INSERT INTO whatsapp_events (wamid, phone) VALUES ($1, $2) ON CONFLICT (wamid) DO NOTHING RETURNING id',
        [msg.id, phone]
    )
    if (!inserted.rowCount) return

    // 2. Limite por número (também protege o código de vínculo contra tentativas)
    const { rows: [rate] } = await db.query(
        `SELECT COUNT(*)::int AS count FROM whatsapp_events
         WHERE phone = $1 AND "createdAt" > NOW() - INTERVAL '1 hour'`,
        [phone]
    )
    if (rate && rate.count > RATE_LIMIT_PER_HOUR) {
        if (rate.count === RATE_LIMIT_PER_HOUR + 1) {
            await wa.sendText(phone, 'Você mandou muitas mensagens na última hora. Tente de novo daqui a pouco.')
        }
        return
    }

    wa.markAsRead(msg.id).catch(() => {})

    const text = extractText(msg).trim()
    const replyId = extractReplyId(msg)

    // 3. Vínculo
    const linkMatch = text.match(/^vincular\s+(\d{6})$/i)
    if (linkMatch) return handleLinkCommand(phone, linkMatch[1])

    // 4. Número precisa estar vinculado e o plano precisa ter WhatsApp
    const { rows: [link] } = await db.query('SELECT * FROM whatsapp_links WHERE phone = $1', [phone])
    if (!link) return wa.sendText(phone, NOT_LINKED_TEXT())

    const ctx = await fa.getUserContext(link.userId)
    if (!ctx) return
    if (!fa.hasFeature(ctx, 'whatsapp')) {
        return wa.sendText(phone, `O atendimento pelo WhatsApp faz parte dos planos Prata e Ouro. Veja em ${siteUrl()}/planos`)
    }
    await db.query('UPDATE whatsapp_links SET "lastMessageAt" = NOW() WHERE id = $1', [link.id])

    // 5. Botões e listas
    if (replyId) return handleReply(ctx, link, phone, replyId)

    // Comandos fixos
    const command = text.toLowerCase()
    if (['parar', 'parar lembrete', 'parar lembretes', 'stop'].includes(command)) {
        await db.query('UPDATE whatsapp_links SET "reminderEnabled" = FALSE WHERE id = $1', [link.id])
        return wa.sendText(phone, 'Lembrete diário desligado. Para ligar de novo, mande *LEMBRETE* ou use o site.')
    }
    if (['lembrete', 'lembretes', 'ligar lembrete'].includes(command)) {
        await db.query('UPDATE whatsapp_links SET "reminderEnabled" = TRUE WHERE id = $1', [link.id])
        return wa.sendText(phone, 'Lembrete diário ligado. Aviso às 8h quando houver conta vencendo.')
    }
    if (command === 'desvincular') {
        await db.query('DELETE FROM whatsapp_links WHERE id = $1', [link.id])
        return wa.sendText(phone, 'Número desconectado da sua conta. Você pode conectar de novo pelo site quando quiser.')
    }
    if (['ajuda', 'menu', 'help', '?'].includes(command)) return wa.sendText(phone, HELP_TEXT())
    if (['contas', 'ver contas'].includes(command)) return sendBillsList(ctx, phone, 'HOJE')

    // 6. Mídia
    let media = null
    if (MEDIA_TYPES.includes(msg.type)) {
        if (!fa.hasFeature(ctx, 'whatsapp_midia')) {
            return wa.sendText(phone, 'Áudios, fotos e PDFs fazem parte do plano Ouro. Por enquanto, me mande por texto, ex: "gastei 50 no mercado".')
        }
        const mediaInfo = msg[msg.type] || {}
        const declaredMime = String(mediaInfo.mime_type || '').split(';')[0].trim()
        if (declaredMime && !SUPPORTED_MEDIA_MIME.test(declaredMime)) {
            return wa.sendText(phone, 'Esse tipo de arquivo eu não leio. Mande áudio, foto ou PDF.')
        }
        try {
            media = await wa.downloadMedia(mediaInfo.id)
        } catch (err) {
            if (err.code === 'MEDIA_TOO_LARGE') return wa.sendText(phone, 'O arquivo passa de 10MB. Mande uma foto ou PDF menor.')
            throw err
        }
        if (!SUPPORTED_MEDIA_MIME.test(media.mimeType)) {
            return wa.sendText(phone, 'Esse tipo de arquivo eu não leio. Mande áudio, foto ou PDF.')
        }
    } else if (!text) {
        return wa.sendText(phone, 'Ainda não entendo esse tipo de mensagem. Mande texto, áudio ou foto.')
    }

    const [categories, wallets] = await Promise.all([fa.listCategories(ctx.id), fa.listWallets(ctx.id)])
    const personalWallet = wallets.find(w => w.id === link.personalWalletId)
    const result = await agent.interpret({
        text,
        media,
        userName: ownerFirstName(ctx, personalWallet && personalWallet.name),
        today: fa.todayISO(),
        categories,
        // Só nome e tipo: documentos (CPF/CNPJ) e fotos das carteiras não vão para a IA
        wallets: wallets.map(w => ({ name: w.name, accountType: w.accountType }))
    })
    return executeAgentResult(ctx, link, phone, result)
}

/** Processa o corpo do webhook da Meta. Erros de uma mensagem não afetam as outras. */
async function handleWebhookPayload(body) {
    if (!body || body.object !== 'whatsapp_business_account') return
    const messages = []
    for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
            if (change.field !== 'messages') continue
            for (const msg of (change.value && change.value.messages) || []) messages.push(msg)
        }
    }
    for (const msg of messages) {
        try {
            await handleIncomingMessage(msg)
        } catch (err) {
            console.error('[whatsapp] erro ao processar mensagem:', err.message)
            const phone = String(msg.from || '').replace(/\D/g, '')
            if (phone) {
                await wa.sendText(phone, 'Tive um problema para processar sua mensagem. Tente de novo em instantes.').catch(() => {})
            }
        }
    }
}

// ─── Lembrete diário ─────────────────────────────────────────────────────────

/**
 * Envia o template de lembrete para quem tem conta vencendo hoje ou atrasada.
 * Cada número recebe no máximo um lembrete por dia, mesmo se o cron repetir.
 */
async function sendDailyReminders(now = new Date()) {
    const today = fa.todayISO(now)
    const templateName = process.env.WHATSAPP_REMINDER_TEMPLATE || 'contas_vencendo_hoje'
    const templateLang = process.env.WHATSAPP_REMINDER_TEMPLATE_LANG || 'pt_BR'

    // Cada número da conta recebe o lembrete com todas as contas da conta
    const { rows } = await db.query(
        `SELECT l.id AS "linkId", l.phone, l."userId", pw.name AS "personalWalletName",
                COUNT(t.id)::int AS count, COALESCE(SUM(t.amount), 0) AS total
         FROM whatsapp_links l
         JOIN finance_transactions t
           ON t."userId" = l."userId" AND t.status = 'PENDING'
          AND t."dueDate" IS NOT NULL AND t."dueDate" <= $1
         LEFT JOIN business_units pw ON pw.id = l."personalWalletId" AND pw."ownerId" = l."userId"
         WHERE l."reminderEnabled" = TRUE
           AND (l."lastReminderOn" IS NULL OR l."lastReminderOn" < $1)
         GROUP BY l.id, l.phone, l."userId", pw.name`,
        [today]
    )

    const summary = { candidates: rows.length, sent: 0, skipped: 0, failed: 0 }
    const queue = [...rows]
    const worker = async () => {
        while (queue.length) {
            const row = queue.shift()
            try {
                const ctx = await fa.getUserContext(row.userId)
                if (!ctx || !fa.hasFeature(ctx, 'whatsapp') || !fa.hasFeature(ctx, 'contas_pagar')) {
                    summary.skipped++
                    continue
                }
                // Marca antes de enviar: se o cron repetir, não duplica
                const { rowCount } = await db.query(
                    `UPDATE whatsapp_links SET "lastReminderOn" = $2
                     WHERE id = $1 AND ("lastReminderOn" IS NULL OR "lastReminderOn" < $2)`,
                    [row.linkId, today]
                )
                if (!rowCount) { summary.skipped++; continue }
                await wa.sendTemplate(row.phone, templateName, templateLang, [
                    ownerFirstName(ctx, row.personalWalletName) || 'cliente',
                    String(row.count),
                    brl(row.total)
                ])
                summary.sent++
            } catch (err) {
                summary.failed++
                console.error('[whatsapp] falha no lembrete:', err.message)
            }
        }
    }
    await Promise.all(Array.from({ length: 5 }, worker))

    // Limpeza: ids de mensagens antigas e códigos vencidos
    await db.query(`DELETE FROM whatsapp_events WHERE "createdAt" < NOW() - ($1 || ' days')::interval`, [String(EVENTS_RETENTION_DAYS)])
    await db.query('DELETE FROM whatsapp_link_codes WHERE "expiresAt" < NOW()')

    return summary
}

module.exports = {
    RATE_LIMIT_PER_HOUR,
    handleWebhookPayload,
    handleIncomingMessage,
    createLinkCode,
    sendDailyReminders,
    normalizeTransactionArgs,
    matchWallets,
    hashCode
}
