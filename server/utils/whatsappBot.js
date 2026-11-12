/**
 * whatsappBot.js — Orquestra o atendimento do WhatsApp.
 *
 * Fluxo de uma mensagem recebida:
 *   1. ignora reenvios da Meta (id da mensagem já visto);
 *   2. limita 30 mensagens por hora por número;
 *   3. "VINCULAR 123456" liga o número à conta que gerou o código;
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
    '• *Registrar gastos e receitas*: "gastei 50 no mercado", "recebi 300 do cliente Ana"',
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

    if (!type) return { error: 'Não entendi se é uma despesa ou uma receita. Pode repetir?' }
    if (!Number.isFinite(amount) || amount <= 0 || amount > 10000000) {
        return { error: 'Não consegui identificar o valor. Pode mandar de novo com o valor? Ex: "gastei 50 no mercado".' }
    }
    if (!description) return { error: 'Qual a descrição desse lançamento?' }
    if (isBill && !dueDate) return { error: 'Qual é a data de vencimento dessa conta?' }
    if (!isBill && method === 'Cartão de Crédito') {
        return { error: 'Compras no cartão de crédito precisam do cartão e da fatura. Por enquanto, lance pelo site ou envie a fatura na área de Cartões.' }
    }
    if (!isBill && date && date > fa.todayISO()) {
        return { error: 'Essa data está no futuro. Se for uma conta a pagar, me diga o vencimento: "boleto de 100 vence dia 20".' }
    }

    return {
        tx: {
            type, amount, description, target, isBill, dueDate,
            date: isBill ? null : date,
            categoryName: args.categoria ? String(args.categoria).slice(0, 60) : null,
            paymentMethod: isBill ? 'Boleto' : (method === 'Boleto' ? null : method)
        }
    }
}

function describeTransaction(tx) {
    const what = tx.isBill ? 'conta a pagar' : tx.type === 'RECEITA' ? 'receita' : 'despesa'
    const lines = [`*${what[0].toUpperCase()}${what.slice(1)}*: ${tx.description}`, `Valor: *${brl(tx.amount)}*`]
    if (tx.isBill) lines.push(`Vencimento: ${brDate(tx.dueDate)}`)
    else lines.push(`Data: ${brDate(tx.date || fa.todayISO())}`)
    if (tx.target) lines.push(`Carteira: ${targetLabel(tx.target)}`)
    if (tx.categoryName) lines.push(`Categoria: ${tx.categoryName}`)
    return lines.join('\n')
}

// ─── Execução das ações ──────────────────────────────────────────────────────

async function askToConfirmTransaction(ctx, link, phone, args) {
    const { tx, error } = normalizeTransactionArgs(args || {})
    if (error) return wa.sendText(phone, error)
    if (tx.isBill && !fa.hasFeature(ctx, 'contas_pagar')) {
        return wa.sendText(phone, 'Contas a pagar fazem parte do plano Prata. Veja os planos em ' + `${siteUrl()}/planos`)
    }

    const nonce = await savePending(link.id, { kind: 'CREATE', tx })
    if (!tx.target) {
        return wa.sendButtons(phone, `${describeTransaction(tx)}\n\nÉ do *MEI* ou *pessoal*?`, [
            { id: `tgt:BUSINESS:${nonce}`, title: 'MEI' },
            { id: `tgt:PERSONAL:${nonce}`, title: 'Pessoal' },
            { id: `no:${nonce}`, title: 'Cancelar' }
        ])
    }
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
        if (kind === 'tgt') tx.target = rest[0] === 'BUSINESS' ? 'BUSINESS' : 'PERSONAL'
        else if (kind !== 'ok') return wa.sendText(phone, 'Não entendi a resposta. Pode mandar de novo?')
        if (!tx.target) return wa.sendText(phone, 'Faltou dizer se é do MEI ou pessoal. Pode mandar de novo?')
        return createConfirmedTransaction(ctx, phone, tx)
    }
    if (pending.kind === 'PAY' && kind === 'ok') return payBill(ctx, phone, pending.transactionId)
    return wa.sendText(phone, 'Não entendi a resposta. Pode mandar de novo?')
}

// ─── Vínculo do número ───────────────────────────────────────────────────────

/** Gera um código de 6 dígitos para o usuário vincular o número. Substitui códigos anteriores. */
async function createLinkCode(userId) {
    await db.query('DELETE FROM whatsapp_link_codes WHERE "userId" = $1 OR "expiresAt" < NOW()', [userId])
    for (let attempt = 0; attempt < 5; attempt++) {
        const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0')
        const { rowCount } = await db.query(
            `INSERT INTO whatsapp_link_codes ("userId", "codeHash", "expiresAt")
             VALUES ($1, $2, NOW() + ($3 || ' minutes')::interval)
             ON CONFLICT ("codeHash") DO NOTHING`,
            [userId, hashCode(code), String(LINK_CODE_TTL_MINUTES)]
        )
        if (rowCount === 1) {
            return { code, expiresAt: new Date(Date.now() + LINK_CODE_TTL_MINUTES * 60000).toISOString() }
        }
    }
    throw new Error('Não foi possível gerar o código')
}

async function handleLinkCommand(phone, code) {
    const { rows: [row] } = await db.query(
        'DELETE FROM whatsapp_link_codes WHERE "codeHash" = $1 AND "expiresAt" > NOW() RETURNING "userId"',
        [hashCode(code)]
    )
    if (!row) {
        return wa.sendText(phone, `Código inválido ou expirado. Gere um novo em ${siteUrl()}/conta, na seção WhatsApp.`)
    }
    const ctx = await fa.getUserContext(row.userId)
    if (!ctx) return wa.sendText(phone, 'Não foi possível vincular esta conta.')

    // O número passa a valer só para a conta que provou ter acesso a ele agora
    await db.query('DELETE FROM whatsapp_links WHERE phone = $1 AND "userId" <> $2', [phone, ctx.id])
    await db.query(
        `INSERT INTO whatsapp_links ("userId", phone, "optInAt", "reminderEnabled")
         VALUES ($1, $2, NOW(), TRUE)
         ON CONFLICT ("userId") DO UPDATE
         SET phone = EXCLUDED.phone, "optInAt" = NOW(), "reminderEnabled" = TRUE,
             "pendingNonce" = NULL, "pendingAction" = NULL, "pendingExpiresAt" = NULL`,
        [ctx.id, phone]
    )
    const name = firstName(ctx.name)
    return wa.sendText(phone, `✅ Pronto${name ? `, ${name}` : ''}! Este número está conectado à sua conta do EuSempreMEI.\nO lembrete diário de contas está ligado.\n\n${HELP_TEXT()}`)
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

    const categories = await fa.listCategories(ctx.id)
    const result = await agent.interpret({
        text,
        media,
        userName: firstName(ctx.name),
        today: fa.todayISO(),
        categories
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

    const { rows } = await db.query(
        `SELECT l.id AS "linkId", l.phone, l."userId",
                COUNT(t.id)::int AS count, COALESCE(SUM(t.amount), 0) AS total
         FROM whatsapp_links l
         JOIN finance_transactions t
           ON t."userId" = l."userId" AND t.status = 'PENDING'
          AND t."dueDate" IS NOT NULL AND t."dueDate" <= $1
         WHERE l."reminderEnabled" = TRUE
           AND (l."lastReminderOn" IS NULL OR l."lastReminderOn" < $1)
         GROUP BY l.id, l.phone, l."userId"`,
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
                    firstName(ctx.name) || 'cliente',
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
    hashCode
}
