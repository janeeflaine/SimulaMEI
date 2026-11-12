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
        pendingBills: [],
        inserted: []
    }
}

function route(sql, params = []) {
    const q = sql.replace(/\s+/g, ' ')
    if (q.startsWith('INSERT INTO whatsapp_events')) {
        if (state.seenWamids.has(params[0])) return { rowCount: 0, rows: [] }
        state.seenWamids.add(params[0])
        return { rowCount: 1, rows: [{ id: 1 }] }
    }
    if (q.includes('COUNT(*)::int AS count FROM whatsapp_events')) return { rows: [{ count: state.rateCount }] }
    if (q.startsWith('DELETE FROM whatsapp_link_codes WHERE "codeHash"')) {
        return state.linkCodeUserId ? { rows: [{ userId: state.linkCodeUserId }], rowCount: 1 } : { rows: [], rowCount: 0 }
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
    if (q.startsWith('SELECT id, name, type FROM finance_categories')) return { rows: [] }
    if (q.startsWith('SELECT id FROM finance_categories')) return { rows: [] }
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
        expect(upsert[0][1]).toEqual([42, PHONE])
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
            args: { tipo: 'DESPESA', valor: 50, descricao: 'Mercado', destino: 'PESSOAL', userId: 999 }
        })
        await bot.handleIncomingMessage(textMsg('gastei 50 no mercado'))

        expect(state.inserted).toHaveLength(0)
        const [, body, buttons] = mockWa.sendButtons.mock.calls[0]
        expect(body).toContain('R$')
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
        mockInterpret.mockResolvedValue({ action: 'registrar_lancamento', args: { tipo: 'RECEITA', valor: 300, descricao: 'Venda', destino: 'MEI' } })
        await bot.handleIncomingMessage(textMsg('vendi 300'))
        const okId = mockWa.sendButtons.mock.calls[0][2][0].id
        await bot.handleIncomingMessage(buttonMsg(okId))
        await bot.handleIncomingMessage(buttonMsg(okId))
        expect(state.inserted).toHaveLength(1)
        expect(mockWa.sendText.mock.calls.at(-1)[1]).toContain('expirou')
    })

    test('Cancelar não grava nada', async () => {
        mockInterpret.mockResolvedValue({ action: 'registrar_lancamento', args: { tipo: 'DESPESA', valor: 20, descricao: 'Lanche', destino: 'PESSOAL' } })
        await bot.handleIncomingMessage(textMsg('gastei 20 no lanche'))
        const cancelId = mockWa.sendButtons.mock.calls[0][2][1].id
        await bot.handleIncomingMessage(buttonMsg(cancelId))
        expect(state.inserted).toHaveLength(0)
        expect(mockWa.sendText.mock.calls.at(-1)[1]).toContain('Cancelado')
    })

    test('Sem MEI/pessoal definido, pergunta com botões e grava na carteira escolhida', async () => {
        mockInterpret.mockResolvedValue({ action: 'registrar_lancamento', args: { tipo: 'DESPESA', valor: 80, descricao: 'Gasolina', destino: 'INDEFINIDO' } })
        await bot.handleIncomingMessage(textMsg('gasolina 80'))
        const buttons = mockWa.sendButtons.mock.calls[0][2]
        expect(buttons.map(b => b.title)).toEqual(['MEI', 'Pessoal', 'Cancelar'])
        await bot.handleIncomingMessage(buttonMsg(buttons[0].id))
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

describe('whatsappBot - validação do que o Gemini devolve', () => {
    test('Recusa valor inválido', () => {
        expect(bot.normalizeTransactionArgs({ tipo: 'DESPESA', valor: -5, descricao: 'x', destino: 'MEI' }).error).toBeDefined()
        expect(bot.normalizeTransactionArgs({ tipo: 'DESPESA', valor: 'abc', descricao: 'x', destino: 'MEI' }).error).toBeDefined()
    })

    test('Conta a pagar sem vencimento pede a data', () => {
        const r = bot.normalizeTransactionArgs({ tipo: 'DESPESA', valor: 10, descricao: 'Luz', destino: 'PESSOAL', conta_a_pagar: true })
        expect(r.error).toContain('vencimento')
    })

    test('Cartão de crédito é direcionado para o site', () => {
        const r = bot.normalizeTransactionArgs({ tipo: 'DESPESA', valor: 10, descricao: 'Loja', destino: 'PESSOAL', forma_pagamento: 'Cartão de Crédito' })
        expect(r.error).toContain('cartão de crédito')
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
})
