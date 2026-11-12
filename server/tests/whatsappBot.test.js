/**
 * Canal WhatsApp — orquestração das mensagens (whatsappBot)
 *
 * Banco, WhatsApp Cloud API e Gemini são simulados. O banco responde conforme
 * o SQL recebido, para que os testes não dependam da ordem exata das consultas.
 */
process.env.FRONTEND_URL = 'https://www.eusempremei.com.br'

const mockDb = { query: jest.fn() }
jest.mock('../db', () => ({ db: mockDb, pool: mockDb }))

const mockWa = {
    sendText: jest.fn().mockResolvedValue({}),
    sendButtons: jest.fn().mockResolvedValue({}),
    sendList: jest.fn().mockResolvedValue({}),
    sendTemplate: jest.fn().mockResolvedValue({}),
    markAsRead: jest.fn().mockResolvedValue({}),
    downloadMedia: jest.fn()
}
jest.mock('../utils/whatsappClient', () => mockWa)

const mockInterpret = jest.fn()
jest.mock('../utils/whatsappAgent', () => ({ interpret: (...args) => mockInterpret(...args) }))

const bot = require('../utils/whatsappBot')

const PHONE = '553399990000'
const PRATA = JSON.stringify({ whatsapp: true, whatsapp_midia: false, contas_pagar: true })
const OURO = JSON.stringify({ whatsapp: true, whatsapp_midia: true, contas_pagar: true })
const GRATUITO = JSON.stringify({ whatsapp: false, whatsapp_midia: false, contas_pagar: false })

let state

function resetState() {
    state = {
        seenWamids: new Set(),
        rateCount: 1,
        link: { id: 7, userId: 42, phone: PHONE, reminderEnabled: true },
        user: { id: 42, name: 'Ana Souza', role: 'USER', planId: 2, isBlocked: 0, deletedAt: null, subscriptionStatus: 'active', planExpiresAt: null, planFeatures: PRATA },
        pending: null, // { nonce, action }
        linkCodeUserId: null,
        linkCodeWallets: { personalWalletId: null, businessWalletId: null },
        linkCount: 0,
        sameAccountLink: false,
        pendingBills: [],
        inserted: [],
        categories: [],
        createdCategories: [],
        wallets: [
            { id: 12, name: 'Ana Souza (PF)', accountType: 'PF', ownerId: 42 },
            { id: 11, name: 'Ana MEI', accountType: 'PJ', ownerId: 42 },
            { id: 21, name: 'Miriam Cristina (PF)', accountType: 'PF', ownerId: 42 },
            { id: 22, name: 'Miriam Cristina MEI', accountType: 'PJ', ownerId: 42 },
            { id: 99, name: 'Carteira de outro usuário', accountType: 'PF', ownerId: 7 }
        ]
    }
}

const userWallets = () => state.wallets.filter(w => w.ownerId === state.user.id)

function route(sql, params = []) {
    const q = sql.replace(/\s+/g, ' ')
    if (q.startsWith('INSERT INTO whatsapp_events')) {
        if (state.seenWamids.has(params[0])) return { rowCount: 0, rows: [] }
        state.seenWamids.add(params[0])
        return { rowCount: 1, rows: [{ id: 1 }] }
    }
    if (q.includes('COUNT(*)::int AS count FROM whatsapp_events')) return { rows: [{ count: state.rateCount }] }
    if (q.startsWith('DELETE FROM whatsapp_link_codes WHERE "codeHash"')) {
        return state.linkCodeUserId
            ? { rows: [{ userId: state.linkCodeUserId, ...state.linkCodeWallets }], rowCount: 1 }
            : { rows: [], rowCount: 0 }
    }
    if (q.startsWith('SELECT id FROM whatsapp_links WHERE phone = $1 AND "userId"')) {
        return { rows: state.sameAccountLink ? [{ id: 7 }] : [] }
    }
    if (q.startsWith('SELECT COUNT(*)::int AS count FROM whatsapp_links')) return { rows: [{ count: state.linkCount }] }
    if (q.startsWith('SELECT id, name, "account_type" AS "accountType", "isPrimary" FROM business_units')) {
        return { rows: userWallets().filter(w => params[0] === state.user.id) }
    }
    if (q.startsWith('SELECT id, name, "account_type" AS "accountType" FROM business_units WHERE id = $1')) {
        const wallet = state.wallets.find(w => w.id === params[0] && w.ownerId === params[1])
        return { rows: wallet ? [wallet] : [] }
    }
    if (q.startsWith('SELECT id, name FROM finance_categories')) {
        const found = state.categories.find(c => c.type === params[1] && c.name.toLowerCase() === String(params[2]).toLowerCase())
        return { rows: found ? [found] : [] }
    }
    if (q.startsWith('INSERT INTO finance_categories')) {
        state.createdCategories.push(params)
        return { rows: [{ id: 501 }] }
    }
    if (q.startsWith('SELECT * FROM whatsapp_links WHERE phone')) return { rows: state.link ? [state.link] : [] }
    if (q.includes('FROM users u LEFT JOIN plans p')) return { rows: state.user ? [state.user] : [] }
    if (q.startsWith('UPDATE whatsapp_links SET "pendingNonce" = $2')) {
        state.pending = { nonce: params[1], action: params[2] }
        return { rowCount: 1, rows: [] }
    }
    if (q.startsWith('WITH old AS')) {
        if (state.pending && state.pending.nonce === params[1]) {
            const action = state.pending.action
            state.pending = null
            return { rows: [{ pendingAction: action }] }
        }
        return { rows: [] }
    }
    if (q.startsWith('SELECT id, name, type FROM finance_categories')) return { rows: state.categories }
    if (q.startsWith('SELECT id FROM business_units')) return { rows: [{ id: params[1] === 'PJ' ? 11 : 12 }] }
    if (q.startsWith('SELECT value FROM system_settings')) return { rows: [{ value: '0' }] }
    if (q.startsWith('INSERT INTO finance_transactions')) {
        state.inserted.push(params)
        return { rows: [{ id: 99 }] }
    }
    if (q.startsWith('UPDATE finance_transactions SET status = \'PAID\'')) {
        const bill = state.pendingBills.find(b => b.id === params[0])
        return { rows: bill && params[1] === state.user.id ? [{ ...bill, status: 'PAID' }] : [] }
    }
    if (q.includes('FROM whatsapp_links l JOIN finance_transactions t')) return { rows: state.reminderRows || [] }
    if (q.startsWith('UPDATE whatsapp_links SET "lastReminderOn"')) return { rowCount: 1 }
    return { rows: [], rowCount: 1 }
}

const textMsg = (body, id = `wamid.${Math.random()}`) => ({ from: PHONE, id, type: 'text', text: { body } })
const buttonMsg = (replyId) => ({ from: PHONE, id: `wamid.${Math.random()}`, type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: replyId, title: 'x' } } })
const listMsg = (replyId) => ({ from: PHONE, id: `wamid.${Math.random()}`, type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: replyId } } })
const lastButtons = () => mockWa.sendButtons.mock.calls.at(-1)[2]
const lastButtonsBody = () => mockWa.sendButtons.mock.calls.at(-1)[1]
const buttonByTitle = (title) => lastButtons().find(b => b.title === title)
const sqlCalls = (prefix) => mockDb.query.mock.calls.filter(([sql]) => sql.replace(/\s+/g, ' ').trim().startsWith(prefix))

describe('whatsappBot - mensagens recebidas', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        resetState()
        mockDb.query.mockImplementation(async (sql, params) => route(sql, params))
    })

    test('Ignora reenvio da mesma mensagem pela Meta', async () => {
        mockInterpret.mockResolvedValue({ reply: 'oi' })
        const msg = textMsg('oi', 'wamid.repetida')
        await bot.handleIncomingMessage(msg)
        await bot.handleIncomingMessage(msg)
        expect(mockInterpret).toHaveBeenCalledTimes(1)
        expect(mockWa.sendText).toHaveBeenCalledTimes(1)
    })

    test('Número não vinculado recebe instruções de como conectar', async () => {
        state.link = null
        await bot.handleIncomingMessage(textMsg('gastei 50 no mercado'))
        expect(mockInterpret).not.toHaveBeenCalled()
        expect(mockWa.sendText.mock.calls[0][1]).toContain('/conta')
    })

    test('VINCULAR com código válido liga o número à conta do código', async () => {
        state.link = null
        state.linkCodeUserId = 42
        await bot.handleIncomingMessage(textMsg('vincular 123456'))
        const upsert = sqlCalls('INSERT INTO whatsapp_links')
        expect(upsert).toHaveLength(1)
        expect(upsert[0][1]).toEqual([42, PHONE, null, null])
        expect(mockWa.sendText.mock.calls[0][1]).toContain('Pronto, Ana')
        // o código é procurado pelo hash, nunca em texto puro
        const lookup = sqlCalls('DELETE FROM whatsapp_link_codes WHERE "codeHash"')[0]
        expect(lookup[1][0]).toBe(bot.hashCode('123456'))
    })

    test('VINCULAR com código inválido não cria vínculo', async () => {
        state.link = null
        await bot.handleIncomingMessage(textMsg('VINCULAR 000000'))
        expect(sqlCalls('INSERT INTO whatsapp_links')).toHaveLength(0)
        expect(mockWa.sendText.mock.calls[0][1]).toContain('inválido ou expirado')
    })

    test('Plano sem WhatsApp recebe aviso e o Gemini não é chamado', async () => {
        state.user.planId = 1
        state.user.planFeatures = GRATUITO
        await bot.handleIncomingMessage(textMsg('gastei 50 no mercado'))
        expect(mockInterpret).not.toHaveBeenCalled()
        expect(mockWa.sendText.mock.calls[0][1]).toContain('Prata e Ouro')
    })

    test('Acima de 30 mensagens por hora, nada é processado', async () => {
        state.rateCount = bot.RATE_LIMIT_PER_HOUR + 5
        await bot.handleIncomingMessage(textMsg('gastei 50 no mercado'))
        expect(mockInterpret).not.toHaveBeenCalled()
        expect(mockWa.sendText).not.toHaveBeenCalled()
    })

    test('Lançamento só é gravado depois do Confirmar, sempre no usuário do número', async () => {
        mockInterpret.mockResolvedValue({
            action: 'registrar_lancamento',
            args: { tipo: 'DESPESA', valor: 50, descricao: 'Mercado', destino: 'PESSOAL', forma_pagamento: 'PIX', userId: 999 }
        })
        await bot.handleIncomingMessage(textMsg('gastei 50 no mercado no pix'))

        expect(state.inserted).toHaveLength(0)
        const [, body, buttons] = mockWa.sendButtons.mock.calls[0]
        expect(body).toContain('R$')
        expect(body).toContain('Carteira: Ana Souza (PF)')
        expect(body).toContain('Pagamento: PIX')
        expect(buttons.map(b => b.title)).toEqual(['Confirmar', 'Cancelar'])

        await bot.handleIncomingMessage(buttonMsg(buttons[0].id))
        expect(state.inserted).toHaveLength(1)
        const params = state.inserted[0]
        expect(params[0]).toBe(42)          // userId vem do vínculo, não do Gemini
        expect(params[1]).toBe('DESPESA')
        expect(params[2]).toBe('PERSONAL')
        expect(params[3]).toBe(50)
        expect(params[8]).toBe('PAID')
        expect(params[10]).toBe(12)         // carteira PF
        expect(mockWa.sendText.mock.calls.at(-1)[1]).toContain('Registrado')
    })

    test('Toque duplo em Confirmar não grava duas vezes', async () => {
        mockInterpret.mockResolvedValue({ action: 'registrar_lancamento', args: { tipo: 'RECEITA', valor: 300, descricao: 'Venda', destino: 'MEI', forma_pagamento: 'PIX' } })
        await bot.handleIncomingMessage(textMsg('vendi 300 no pix'))
        const okId = mockWa.sendButtons.mock.calls[0][2][0].id
        await bot.handleIncomingMessage(buttonMsg(okId))
        await bot.handleIncomingMessage(buttonMsg(okId))
        expect(state.inserted).toHaveLength(1)
        expect(mockWa.sendText.mock.calls.at(-1)[1]).toContain('expirou')
    })

    test('Cancelar não grava nada', async () => {
        mockInterpret.mockResolvedValue({ action: 'registrar_lancamento', args: { tipo: 'DESPESA', valor: 20, descricao: 'Lanche', destino: 'PESSOAL', forma_pagamento: 'Dinheiro' } })
        await bot.handleIncomingMessage(textMsg('gastei 20 no lanche em dinheiro'))
        const cancelId = mockWa.sendButtons.mock.calls[0][2][1].id
        await bot.handleIncomingMessage(buttonMsg(cancelId))
        expect(state.inserted).toHaveLength(0)
        expect(mockWa.sendText.mock.calls.at(-1)[1]).toContain('Cancelado')
    })

    test('Sem MEI/pessoal definido, pergunta com botões e só grava depois do resumo final', async () => {
        mockInterpret.mockResolvedValue({ action: 'registrar_lancamento', args: { tipo: 'DESPESA', valor: 80, descricao: 'Gasolina', destino: 'INDEFINIDO', forma_pagamento: 'Dinheiro' } })
        await bot.handleIncomingMessage(textMsg('gasolina 80 em dinheiro'))
        const buttons = mockWa.sendButtons.mock.calls[0][2]
        expect(buttons.map(b => b.title)).toEqual(['MEI', 'Pessoal', 'Cancelar'])
        await bot.handleIncomingMessage(buttonMsg(buttons[0].id))
        expect(state.inserted).toHaveLength(0)
        expect(lastButtonsBody()).toContain('Carteira: Ana MEI')
        await bot.handleIncomingMessage(buttonMsg(buttonByTitle('Confirmar').id))
        expect(state.inserted[0][2]).toBe('BUSINESS')
        expect(state.inserted[0][10]).toBe(11) // carteira PJ
    })

    test('Conta a pagar entra como PENDING com vencimento', async () => {
        mockInterpret.mockResolvedValue({
            action: 'registrar_lancamento',
            args: { tipo: 'DESPESA', valor: 180.5, descricao: 'Conta de luz', destino: 'PESSOAL', conta_a_pagar: true, vencimento: '2099-01-20' }
        })
        await bot.handleIncomingMessage(textMsg('boleto da luz 180,50 vence dia 20'))
        await bot.handleIncomingMessage(buttonMsg(mockWa.sendButtons.mock.calls[0][2][0].id))
        const params = state.inserted[0]
        expect(params[6]).toBe('Boleto')
        expect(params[8]).toBe('PENDING')
        expect(params[9]).toBe('2099-01-20')
    })

    test('Resposta em texto do Gemini (ex.: assunto fora do escopo) é repassada', async () => {
        mockInterpret.mockResolvedValue({ reply: 'Só consigo ajudar com as suas finanças no EuSempreMEI.' })
        await bot.handleIncomingMessage(textMsg('quem ganhou o jogo ontem?'))
        expect(mockWa.sendText).toHaveBeenCalledWith(PHONE, 'Só consigo ajudar com as suas finanças no EuSempreMEI.')
        expect(state.inserted).toHaveLength(0)
    })

    test('Áudio no plano Prata não é baixado nem enviado ao Gemini', async () => {
        await bot.handleIncomingMessage({ from: PHONE, id: 'wamid.audio1', type: 'audio', audio: { id: 'm1', mime_type: 'audio/ogg; codecs=opus' } })
        expect(mockWa.downloadMedia).not.toHaveBeenCalled()
        expect(mockInterpret).not.toHaveBeenCalled()
        expect(mockWa.sendText.mock.calls[0][1]).toContain('plano Ouro')
    })

    test('Áudio no plano Ouro é baixado e enviado ao Gemini', async () => {
        state.user.planId = 3
        state.user.planFeatures = OURO
        mockWa.downloadMedia.mockResolvedValue({ buffer: Buffer.from('ogg'), mimeType: 'audio/ogg' })
        mockInterpret.mockResolvedValue({ reply: 'ok' })
        await bot.handleIncomingMessage({ from: PHONE, id: 'wamid.audio2', type: 'audio', audio: { id: 'm2', mime_type: 'audio/ogg; codecs=opus' } })
        expect(mockWa.downloadMedia).toHaveBeenCalledWith('m2')
        expect(mockInterpret.mock.calls[0][0].media.mimeType).toBe('audio/ogg')
    })

    test('Tocar numa conta da lista marca como paga só se for do usuário', async () => {
        state.pendingBills = [{ id: 5, description: 'Internet', amount: 99.9 }]
        await bot.handleIncomingMessage({ from: PHONE, id: 'wamid.list1', type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: 'pay:5' } } })
        const update = sqlCalls("UPDATE finance_transactions SET status = 'PAID'")[0]
        expect(update[1][0]).toBe(5)
        expect(update[1][1]).toBe(42)
        expect(mockWa.sendText.mock.calls.at(-1)[1]).toContain('marcada como paga')
    })

    test('PARAR desliga o lembrete diário', async () => {
        await bot.handleIncomingMessage(textMsg('PARAR'))
        const update = sqlCalls('UPDATE whatsapp_links SET "reminderEnabled" = FALSE')
        expect(update).toHaveLength(1)
        expect(mockInterpret).not.toHaveBeenCalled()
    })

    test('Erro no processamento avisa o usuário sem derrubar o webhook', async () => {
        mockInterpret.mockRejectedValue(new Error('Gemini fora do ar'))
        const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
        await bot.handleWebhookPayload({
            object: 'whatsapp_business_account',
            entry: [{ changes: [{ field: 'messages', value: { messages: [textMsg('gastei 10')] } }] }]
        })
        errSpy.mockRestore()
        expect(mockWa.sendText.mock.calls.at(-1)[1]).toContain('problema')
    })
})

describe('whatsappBot - carteiras, forma de pagamento e categoria', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        resetState()
        mockDb.query.mockImplementation(async (sql, params) => route(sql, params))
    })

    test('Sem forma de pagamento, pergunta numa lista e grava a escolhida', async () => {
        mockInterpret.mockResolvedValue({ action: 'registrar_lancamento', args: { tipo: 'DESPESA', valor: 10, descricao: 'Teste', destino: 'PESSOAL', forma_pagamento: 'INDEFINIDO' } })
        await bot.handleIncomingMessage(textMsg('gastei 10 no teste'))

        expect(mockWa.sendButtons).not.toHaveBeenCalled()
        const [, body, label, rows] = mockWa.sendList.mock.calls[0]
        expect(body).toContain('Como você pagou?')
        expect(label).toBe('Forma de pagamento')
        expect(rows.map(r => r.title)).toEqual(['PIX', 'Dinheiro', 'Cartão de Débito', 'Cartão de Crédito'])

        await bot.handleIncomingMessage(listMsg(rows[0].id))
        expect(state.inserted).toHaveLength(0)
        expect(lastButtonsBody()).toContain('Pagamento: PIX')
        await bot.handleIncomingMessage(buttonMsg(buttonByTitle('Confirmar').id))
        expect(state.inserted).toHaveLength(1)
        expect(state.inserted[0][6]).toBe('PIX')
    })

    test('Cartão de crédito escolhido numa despesa manda para o site e não grava', async () => {
        mockInterpret.mockResolvedValue({ action: 'registrar_lancamento', args: { tipo: 'DESPESA', valor: 10, descricao: 'Loja', destino: 'PESSOAL' } })
        await bot.handleIncomingMessage(textMsg('gastei 10 na loja'))
        const credit = mockWa.sendList.mock.calls[0][3].find(r => r.title === 'Cartão de Crédito')
        await bot.handleIncomingMessage(listMsg(credit.id))
        expect(mockWa.sendText.mock.calls.at(-1)[1]).toContain('Nada foi registrado')
        expect(state.inserted).toHaveLength(0)
    })

    test('Receita no cartão de crédito (maquininha) é aceita', async () => {
        mockInterpret.mockResolvedValue({ action: 'registrar_lancamento', args: { tipo: 'RECEITA', valor: 3500, descricao: 'Maquininha', destino: 'MEI', forma_pagamento: 'Cartão de Crédito' } })
        await bot.handleIncomingMessage(textMsg('recebi 3500 da maquininha no crédito'))
        await bot.handleIncomingMessage(buttonMsg(buttonByTitle('Confirmar').id))
        expect(state.inserted[0][1]).toBe('RECEITA')
        expect(state.inserted[0][6]).toBe('Cartão de Crédito')
    })

    test('Carteira citada pelo nome exato grava nela, com o tipo da carteira', async () => {
        mockInterpret.mockResolvedValue({ action: 'registrar_lancamento', args: { tipo: 'DESPESA', valor: 10, descricao: 'Peixe', destino: 'INDEFINIDO', carteira: 'Miriam Cristina MEI', forma_pagamento: 'PIX' } })
        await bot.handleIncomingMessage(textMsg('comprei 10 de peixe carteira miriam mei pix'))
        expect(lastButtonsBody()).toContain('Carteira: Miriam Cristina MEI')
        await bot.handleIncomingMessage(buttonMsg(buttonByTitle('Confirmar').id))
        expect(state.inserted[0][2]).toBe('BUSINESS')
        expect(state.inserted[0][10]).toBe(22)
    })

    test('Carteira citada sem dizer MEI ou pessoal pergunta entre as carteiras da pessoa', async () => {
        mockInterpret.mockResolvedValue({ action: 'registrar_lancamento', args: { tipo: 'DESPESA', valor: 10, descricao: 'Peixe', destino: 'INDEFINIDO', carteira: 'miriam', forma_pagamento: 'PIX' } })
        await bot.handleIncomingMessage(textMsg('comprei 10,00 de peixe carteira miriam pix'))
        expect(lastButtons().map(b => b.title)).toEqual(['Miriam Cristina (PF)', 'Miriam Cristina MEI', 'Cancelar'])
        await bot.handleIncomingMessage(buttonMsg(buttonByTitle('Miriam Cristina (PF)').id))
        expect(state.inserted).toHaveLength(0)
        await bot.handleIncomingMessage(buttonMsg(buttonByTitle('Confirmar').id))
        expect(state.inserted[0][2]).toBe('PERSONAL')
        expect(state.inserted[0][10]).toBe(21)
    })

    test('Carteira fora das opções oferecidas (id adulterado) é recusada', async () => {
        mockInterpret.mockResolvedValue({ action: 'registrar_lancamento', args: { tipo: 'DESPESA', valor: 10, descricao: 'Peixe', destino: 'INDEFINIDO', carteira: 'miriam', forma_pagamento: 'PIX' } })
        await bot.handleIncomingMessage(textMsg('peixe 10 carteira miriam pix'))
        const nonce = lastButtons()[0].id.split(':').at(-1)
        await bot.handleIncomingMessage(buttonMsg(`wal:99:${nonce}`))
        expect(mockWa.sendText.mock.calls.at(-1)[1]).toContain('Não achei essa carteira')
        expect(state.inserted).toHaveLength(0)
    })

    test('Sem carteira citada, usa a carteira padrão do número', async () => {
        state.link = { ...state.link, personalWalletId: 21, businessWalletId: 22 }
        mockInterpret.mockResolvedValue({ action: 'registrar_lancamento', args: { tipo: 'DESPESA', valor: 30, descricao: 'Mercado', destino: 'PESSOAL', forma_pagamento: 'PIX' } })
        await bot.handleIncomingMessage(textMsg('mercado 30 pix'))
        expect(mockInterpret.mock.calls[0][0].userName).toBe('Miriam')
        expect(mockInterpret.mock.calls[0][0].wallets).toContainEqual({ name: 'Miriam Cristina (PF)', accountType: 'PF' })
        await bot.handleIncomingMessage(buttonMsg(buttonByTitle('Confirmar').id))
        expect(state.inserted[0][10]).toBe(21)
    })

    test('Carteiras enviadas à IA levam só nome e tipo', async () => {
        mockInterpret.mockResolvedValue({ reply: 'ok' })
        await bot.handleIncomingMessage(textMsg('oi'))
        for (const w of mockInterpret.mock.calls[0][0].wallets) {
            expect(Object.keys(w).sort()).toEqual(['accountType', 'name'])
        }
    })

    test('Categoria pedida que não existe: oferece criar e cria só ao confirmar', async () => {
        mockInterpret.mockResolvedValue({ action: 'registrar_lancamento', args: { tipo: 'RECEITA', valor: 3500, descricao: 'Maquininha do mês', destino: 'MEI', forma_pagamento: 'PIX', categoria: 'Maquininha', categoria_pedida: true } })
        await bot.handleIncomingMessage(textMsg('recebi 3500 da maquininha no pix categoria maquininha'))
        expect(lastButtons().map(b => b.title)).toEqual(['Criar categoria', 'Sem categoria', 'Cancelar'])
        await bot.handleIncomingMessage(buttonMsg(buttonByTitle('Criar categoria').id))
        expect(state.createdCategories).toHaveLength(0)
        expect(lastButtonsBody()).toContain('Categoria: Maquininha (nova)')
        await bot.handleIncomingMessage(buttonMsg(buttonByTitle('Confirmar').id))
        expect(state.createdCategories[0]).toEqual([42, 'Maquininha', 'RECEITA'])
        expect(state.inserted[0][5]).toBe(501)
    })

    test('Categoria pedida que já existe é usada sem perguntar', async () => {
        state.categories = [{ id: 77, name: 'Maquininha', type: 'RECEITA' }]
        mockInterpret.mockResolvedValue({ action: 'registrar_lancamento', args: { tipo: 'RECEITA', valor: 100, descricao: 'Vendas', destino: 'MEI', forma_pagamento: 'PIX', categoria: 'maquininha', categoria_pedida: true } })
        await bot.handleIncomingMessage(textMsg('recebi 100 no pix categoria maquininha'))
        expect(lastButtons().map(b => b.title)).toEqual(['Confirmar', 'Cancelar'])
        await bot.handleIncomingMessage(buttonMsg(buttonByTitle('Confirmar').id))
        expect(state.createdCategories).toHaveLength(0)
        expect(state.inserted[0][5]).toBe(77)
    })

    test('Categoria sugerida pela IA que não existe fica sem categoria, sem perguntar', async () => {
        mockInterpret.mockResolvedValue({ action: 'registrar_lancamento', args: { tipo: 'DESPESA', valor: 10, descricao: 'Teste', destino: 'PESSOAL', forma_pagamento: 'PIX', categoria: 'Inventada' } })
        await bot.handleIncomingMessage(textMsg('gastei 10 no teste no pix'))
        expect(lastButtons().map(b => b.title)).toEqual(['Confirmar', 'Cancelar'])
        expect(lastButtonsBody()).not.toContain('Categoria')
    })
})

describe('whatsappBot - vínculo de vários números', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        resetState()
        state.link = null
        state.linkCodeUserId = 42
        mockDb.query.mockImplementation(async (sql, params) => route(sql, params))
    })

    test('VINCULAR grava as carteiras escolhidas no site e cumprimenta pelo nome da carteira', async () => {
        state.linkCodeWallets = { personalWalletId: 21, businessWalletId: 22 }
        await bot.handleIncomingMessage(textMsg('VINCULAR 123456'))
        expect(sqlCalls('INSERT INTO whatsapp_links')[0][1]).toEqual([42, PHONE, 21, 22])
        const reply = mockWa.sendText.mock.calls[0][1]
        expect(reply).toContain('Pronto, Miriam')
        expect(reply).toContain('Pessoal: *Miriam Cristina (PF)*')
        expect(reply).toContain('MEI: *Miriam Cristina MEI*')
    })

    test('Carteira de outro usuário no código é ignorada', async () => {
        state.linkCodeWallets = { personalWalletId: 99, businessWalletId: null }
        await bot.handleIncomingMessage(textMsg('VINCULAR 123456'))
        expect(sqlCalls('INSERT INTO whatsapp_links')[0][1]).toEqual([42, PHONE, null, null])
    })

    test('Número novo acima do limite do plano não é vinculado', async () => {
        state.linkCount = 3 // Prata permite 3
        await bot.handleIncomingMessage(textMsg('VINCULAR 123456'))
        expect(sqlCalls('INSERT INTO whatsapp_links')).toHaveLength(0)
        expect(mockWa.sendText.mock.calls[0][1]).toContain('limite do seu plano')
    })

    test('O mesmo número da conta pode ser vinculado de novo (troca carteiras) mesmo no limite', async () => {
        state.linkCount = 3
        state.sameAccountLink = true
        state.linkCodeWallets = { personalWalletId: 12, businessWalletId: 11 }
        await bot.handleIncomingMessage(textMsg('VINCULAR 123456'))
        expect(sqlCalls('INSERT INTO whatsapp_links')[0][1]).toEqual([42, PHONE, 12, 11])
    })

    test('Código guarda só carteiras do próprio usuário e do tipo certo', async () => {
        await bot.createLinkCode(42, { personalWalletId: 22, businessWalletId: 22 }) // 22 é PJ
        const insert = sqlCalls('INSERT INTO whatsapp_link_codes')[0][1]
        expect(insert[0]).toBe(42)
        expect(insert[3]).toBeNull()
        expect(insert[4]).toBe(22)
    })
})

describe('whatsappBot - carteira citada (matchWallets)', () => {
    const wallets = [
        { id: 12, name: 'Jhonny Eflainy (PF)', accountType: 'PF' },
        { id: 11, name: 'Jhonny Eflainy MEI', accountType: 'PJ' },
        { id: 21, name: 'Miriam Cristina (PF)', accountType: 'PF' },
        { id: 22, name: 'Miriam Cristina MEI', accountType: 'PJ' }
    ]
    const ids = (query, target) => bot.matchWallets(wallets, query, target).map(w => w.id)

    test('Nome da pessoa traz as carteiras dela', () => {
        expect(ids('miriam')).toEqual([21, 22])
        expect(ids('carteira da Míriam')).toEqual([21, 22])
    })
    test('"mei" ou "pessoal" escolhe o tipo', () => {
        expect(ids('miriam mei')).toEqual([22])
        expect(ids('jhonny pessoal')).toEqual([12])
    })
    test('Nome exato da lista', () => {
        expect(ids('Jhonny Eflainy MEI')).toEqual([11])
    })
    test('Palpite de tipo da IA que elimina tudo é ignorado', () => {
        const only = [{ id: 30, name: 'Maria (PF)', accountType: 'PF' }]
        expect(bot.matchWallets(only, 'maria', 'BUSINESS').map(w => w.id)).toEqual([30])
    })
    test('Nome que não existe não traz nada', () => {
        expect(ids('pedro')).toEqual([])
        expect(ids('mei')).toEqual([])
    })
})

describe('whatsappBot - validação do que o Gemini devolve', () => {
    test('Recusa valor inválido', () => {
        expect(bot.normalizeTransactionArgs({ tipo: 'DESPESA', valor: -5, descricao: 'x', destino: 'MEI' }).error).toBeDefined()
        expect(bot.normalizeTransactionArgs({ tipo: 'DESPESA', valor: 'abc', descricao: 'x', destino: 'MEI' }).error).toBeDefined()
    })

    test('Conta a pagar sem vencimento pede a data', () => {
        const r = bot.normalizeTransactionArgs({ tipo: 'DESPESA', valor: 10, descricao: 'Luz', destino: 'PESSOAL', conta_a_pagar: true })
        expect(r.error).toContain('vencimento')
    })

    test('Cartão de crédito em despesa é direcionado para o site', () => {
        const r = bot.normalizeTransactionArgs({ tipo: 'DESPESA', valor: 10, descricao: 'Loja', destino: 'PESSOAL', forma_pagamento: 'Cartão de Crédito' })
        expect(r.error).toContain('cartão de crédito')
    })

    test('Cartão de crédito em receita (maquininha) é aceito', () => {
        const r = bot.normalizeTransactionArgs({ tipo: 'RECEITA', valor: 10, descricao: 'Maquininha', destino: 'MEI', forma_pagamento: 'Cartão de Crédito' })
        expect(r.error).toBeUndefined()
        expect(r.tx.paymentMethod).toBe('Cartão de Crédito')
    })

    test('Forma de pagamento INDEFINIDO fica vazia (o bot pergunta)', () => {
        const r = bot.normalizeTransactionArgs({ tipo: 'DESPESA', valor: 10, descricao: 'x', destino: 'PESSOAL', forma_pagamento: 'INDEFINIDO' })
        expect(r.tx.paymentMethod).toBeNull()
    })

    test('Arredonda centavos e mapeia MEI/PESSOAL', () => {
        const r = bot.normalizeTransactionArgs({ tipo: 'RECEITA', valor: 10.555, descricao: 'Venda', destino: 'MEI' })
        expect(r.tx).toMatchObject({ amount: 10.56, target: 'BUSINESS', type: 'RECEITA', isBill: false })
    })
})

describe('whatsappBot - lembrete diário', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        resetState()
        mockDb.query.mockImplementation(async (sql, params) => route(sql, params))
    })

    test('Envia o template com nome, quantidade e total; pula plano sem o recurso', async () => {
        state.reminderRows = [{ linkId: 7, phone: PHONE, userId: 42, count: 2, total: 250 }]
        const summary = await bot.sendDailyReminders(new Date('2026-11-12T11:00:00Z'))
        expect(summary.sent).toBe(1)
        const [to, name, lang, params] = mockWa.sendTemplate.mock.calls[0]
        expect(to).toBe(PHONE)
        expect(name).toBe('contas_vencendo_hoje')
        expect(lang).toBe('pt_BR')
        expect(params[0]).toBe('Ana')
        expect(params[1]).toBe('2')
        expect(params[2]).toContain('250,00')

        jest.clearAllMocks()
        state.user.planFeatures = GRATUITO
        state.user.planId = 1
        const second = await bot.sendDailyReminders(new Date('2026-11-12T11:00:00Z'))
        expect(second.skipped).toBe(1)
        expect(mockWa.sendTemplate).not.toHaveBeenCalled()
    })

    test('Cada número da conta recebe o lembrete, com o nome da carteira pessoal dele', async () => {
        state.reminderRows = [
            { linkId: 7, phone: PHONE, userId: 42, personalWalletName: null, count: 1, total: 908.94 },
            { linkId: 8, phone: '553388887777', userId: 42, personalWalletName: 'Miriam Cristina (PF)', count: 1, total: 908.94 }
        ]
        const summary = await bot.sendDailyReminders(new Date('2026-11-12T11:00:00Z'))
        expect(summary.sent).toBe(2)
        const names = mockWa.sendTemplate.mock.calls.map(c => [c[0], c[3][0]])
        expect(names).toEqual([[PHONE, 'Ana'], ['553388887777', 'Miriam']])
    })
})
