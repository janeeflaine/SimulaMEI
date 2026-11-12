/**
 * Canal WhatsApp — rotas HTTP, assinatura do webhook, cron e agente Gemini
 */
process.env.WHATSAPP_VERIFY_TOKEN = 'verify-token-teste'
process.env.WHATSAPP_APP_SECRET = 'app-secret-teste'
process.env.CRON_SECRET = 'cron-secret-teste'
process.env.WHATSAPP_PUBLIC_NUMBER = '+55 33 99999-0000'
process.env.GEMINI_API_KEY = 'gemini-teste'

const crypto = require('crypto')

const mockDb = { query: jest.fn() }
jest.mock('../db', () => ({ db: mockDb, pool: mockDb }))

let mockCurrentUser
jest.mock('../middleware/auth', () => ({
    authMiddleware: (req, res, next) => { req.user = { ...mockCurrentUser }; next() }
}))

const mockBot = {
    handleWebhookPayload: jest.fn().mockResolvedValue(),
    createLinkCode: jest.fn(),
    sendDailyReminders: jest.fn()
}
jest.mock('../utils/whatsappBot', () => mockBot)

const mockBackground = []
jest.mock('../utils/background', () => ({ runInBackground: (p) => { mockBackground.push(p); return p } }))

const mockGenerate = jest.fn()
jest.mock('@google/genai', () => ({
    GoogleGenAI: jest.fn().mockImplementation(() => ({ models: { generateContent: (...a) => mockGenerate(...a) } }))
}))

const request = require('supertest')
const express = require('express')
const whatsappRoutes = require('../routes/whatsapp.routes')
const { verifySignature } = require('../utils/whatsappClient')
const agent = require('../utils/whatsappAgent')

const app = express()
app.post('/api/whatsapp/webhook', express.raw({ type: '*/*' }), whatsappRoutes.webhookHandler)
app.use(express.json())
app.use('/api/whatsapp', whatsappRoutes.router)

const sign = (body, secret = 'app-secret-teste') =>
    'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex')

const PRATA_USER = { id: 42, role: 'USER', planId: 2, isInTrial: false, planFeatures: { whatsapp: true, whatsapp_midia: false } }
const FREE_USER = { id: 43, role: 'USER', planId: 1, isInTrial: false, planFeatures: { whatsapp: false } }

describe('Webhook do WhatsApp', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockBackground.length = 0
    })

    test('GET aceita o desafio da Meta com o verify token correto', async () => {
        const res = await request(app).get('/api/whatsapp/webhook')
            .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'verify-token-teste', 'hub.challenge': '12345' })
        expect(res.statusCode).toBe(200)
        expect(res.text).toBe('12345')
    })

    test('GET recusa verify token errado (403)', async () => {
        const res = await request(app).get('/api/whatsapp/webhook')
            .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'errado', 'hub.challenge': '12345' })
        expect(res.statusCode).toBe(403)
    })

    test('POST com assinatura inválida é recusado (401) e nada é processado', async () => {
        const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [] })
        const res = await request(app).post('/api/whatsapp/webhook')
            .set('Content-Type', 'application/json')
            .set('X-Hub-Signature-256', sign(body, 'outro-segredo'))
            .send(body)
        expect(res.statusCode).toBe(401)
        expect(mockBot.handleWebhookPayload).not.toHaveBeenCalled()
    })

    test('POST sem assinatura é recusado (401)', async () => {
        const res = await request(app).post('/api/whatsapp/webhook')
            .set('Content-Type', 'application/json')
            .send('{}')
        expect(res.statusCode).toBe(401)
    })

    test('POST assinado responde 200 e processa em segundo plano', async () => {
        const payload = { object: 'whatsapp_business_account', entry: [{ changes: [] }] }
        const body = JSON.stringify(payload)
        const res = await request(app).post('/api/whatsapp/webhook')
            .set('Content-Type', 'application/json')
            .set('X-Hub-Signature-256', sign(body))
            .send(body)
        expect(res.statusCode).toBe(200)
        expect(mockBot.handleWebhookPayload).toHaveBeenCalledWith(payload)
        expect(mockBackground).toHaveLength(1)
    })

    test('verifySignature rejeita formatos inesperados', () => {
        const body = Buffer.from('{}')
        expect(verifySignature(body, 'sha1=abc', 's')).toBe(false)
        expect(verifySignature(body, 'sha256=zz', 's')).toBe(false)
        expect(verifySignature(body, undefined, 's')).toBe(false)
        expect(verifySignature(body, sign(body, 's'), 's')).toBe(true)
    })
})

describe('Área do usuário', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockCurrentUser = { ...PRATA_USER }
    })

    test('Plano sem WhatsApp não gera código (403)', async () => {
        mockCurrentUser = { ...FREE_USER }
        const res = await request(app).post('/api/whatsapp/link-code')
        expect(res.statusCode).toBe(403)
        expect(mockBot.createLinkCode).not.toHaveBeenCalled()
    })

    test('Gera código com link wa.me e repassa as carteiras escolhidas', async () => {
        mockDb.query.mockResolvedValue({ rows: [{ count: 0 }] })
        mockBot.createLinkCode.mockResolvedValue({ code: '123456', expiresAt: '2026-11-12T12:15:00Z' })
        const res = await request(app).post('/api/whatsapp/link-code').send({ personalWalletId: 21, businessWalletId: 22 })
        expect(res.statusCode).toBe(200)
        expect(mockBot.createLinkCode).toHaveBeenCalledWith(42, { personalWalletId: 21, businessWalletId: 22 })
        expect(res.body.message).toBe('VINCULAR 123456')
        expect(res.body.waLink).toBe('https://wa.me/5533999990000?text=VINCULAR%20123456')
    })

    test('No limite de números do plano não gera código (403)', async () => {
        mockDb.query.mockResolvedValue({ rows: [{ count: 3 }] }) // Prata = 3 números
        const res = await request(app).post('/api/whatsapp/link-code')
        expect(res.statusCode).toBe(403)
        expect(res.body.message).toContain('3 número(s)')
        expect(mockBot.createLinkCode).not.toHaveBeenCalled()
    })

    test('Limite de números: padrão Gratuito 1, Prata 3, Ouro 4; admin e trial usam o do Ouro', async () => {
        const { maxWhatsappNumbers } = require('../utils/financeActions')
        mockDb.query.mockResolvedValue({ rows: [] }) // nada configurado no painel
        expect(await maxWhatsappNumbers({ role: 'USER', planId: 1 })).toBe(1)
        expect(await maxWhatsappNumbers({ role: 'USER', planId: 2 })).toBe(3)
        expect(await maxWhatsappNumbers({ role: 'USER', planId: 3 })).toBe(4)
        expect(await maxWhatsappNumbers({ role: 'ADMIN', planId: 1 })).toBe(4)
        expect(await maxWhatsappNumbers({ role: 'USER', planId: 1, isInTrial: true })).toBe(4)
        expect(mockDb.query.mock.calls.at(-1)[1]).toEqual(['whatsapp_numbers_3'])

        mockDb.query.mockResolvedValue({ rows: [{ value: '6' }] }) // definido no painel
        expect(await maxWhatsappNumbers({ role: 'USER', planId: 2 })).toBe(6)
        mockDb.query.mockResolvedValue({ rows: [{ value: '0' }] }) // 0 = ilimitado
        expect(await maxWhatsappNumbers({ role: 'USER', planId: 2 })).toBe(Infinity)
    })

    test('Status devolve maxNumbers null quando o limite é ilimitado', async () => {
        mockDb.query.mockImplementation(async (sql) => {
            if (sql.includes('system_settings')) return { rows: [{ value: '0' }] }
            return { rows: [] }
        })
        const res = await request(app).get('/api/whatsapp/status')
        expect(res.body.maxNumbers).toBeNull()
        expect(res.body.links).toEqual([])
    })

    test('Status lista os números (só 4 últimos dígitos), as carteiras e o limite', async () => {
        mockDb.query.mockImplementation(async (sql) => {
            if (sql.includes('FROM whatsapp_links l')) {
                return { rows: [{ id: 7, phone: '553399998193', reminderEnabled: true, optInAt: '2026-11-12', personalWalletId: 21, personalWalletName: 'Miriam Cristina (PF)', businessWalletId: null, businessWalletName: null }] }
            }
            if (sql.includes('FROM business_units')) return { rows: [{ id: 21, name: 'Miriam Cristina (PF)', accountType: 'PF' }] }
            return { rows: [] }
        })
        const res = await request(app).get('/api/whatsapp/status')
        expect(res.statusCode).toBe(200)
        expect(res.body).toMatchObject({ available: true, mediaAvailable: false, maxNumbers: 3, linked: true, phone: '•••• 8193', reminderEnabled: true })
        expect(res.body.links).toEqual([{
            id: 7, phone: '•••• 8193', reminderEnabled: true, linkedAt: '2026-11-12',
            personalWallet: { id: 21, name: 'Miriam Cristina (PF)' }, businessWallet: null
        }])
        expect(res.body.wallets).toEqual([{ id: 21, name: 'Miriam Cristina (PF)', accountType: 'PF' }])
        expect(JSON.stringify(res.body)).not.toContain('553399998193')
    })

    test('Lembrete com linkId altera só aquele número do usuário', async () => {
        mockDb.query.mockResolvedValue({ rows: [{ reminderEnabled: false }] })
        const res = await request(app).put('/api/whatsapp/settings').send({ linkId: 8, reminderEnabled: false })
        expect(res.statusCode).toBe(200)
        const [sql, params] = mockDb.query.mock.calls[0]
        expect(sql).toContain('AND id = $2')
        expect(params).toEqual([42, 8, false])
    })

    test('Desconectar um número só apaga se for do usuário', async () => {
        mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 })
        const res = await request(app).delete('/api/whatsapp/link/8')
        expect(res.statusCode).toBe(404)
        const [sql, params] = mockDb.query.mock.calls[0]
        expect(sql).toContain('"userId" = $2')
        expect(params).toEqual([8, 42])
    })

    test('Settings exige booleano (400)', async () => {
        const res = await request(app).put('/api/whatsapp/settings').send({ reminderEnabled: 'sim' })
        expect(res.statusCode).toBe(400)
    })

    test('Desconectar apaga o vínculo do próprio usuário', async () => {
        mockDb.query.mockResolvedValue({ rows: [], rowCount: 1 })
        const res = await request(app).delete('/api/whatsapp/link')
        expect(res.statusCode).toBe(200)
        const calls = mockDb.query.mock.calls
        expect(calls.some(([sql, params]) => sql.includes('DELETE FROM whatsapp_links') && params[0] === 42)).toBe(true)
    })
})

describe('Cron do lembrete diário', () => {
    beforeEach(() => jest.clearAllMocks())

    test('Sem o CRON_SECRET correto é recusado (401)', async () => {
        const res = await request(app).get('/api/whatsapp/cron/daily-reminders').set('Authorization', 'Bearer errado')
        expect(res.statusCode).toBe(401)
        expect(mockBot.sendDailyReminders).not.toHaveBeenCalled()
    })

    test('Com o CRON_SECRET executa os lembretes', async () => {
        mockBot.sendDailyReminders.mockResolvedValue({ candidates: 1, sent: 1, skipped: 0, failed: 0 })
        const res = await request(app).get('/api/whatsapp/cron/daily-reminders').set('Authorization', 'Bearer cron-secret-teste')
        expect(res.statusCode).toBe(200)
        expect(res.body.sent).toBe(1)
    })
})

describe('Agente Gemini', () => {
    beforeEach(() => jest.clearAllMocks())

    const base = { userName: 'Ana', today: '2026-11-12', categories: [{ name: 'Vendas', type: 'RECEITA' }] }

    test('Devolve a função escolhida pelo Gemini', async () => {
        mockGenerate.mockResolvedValue({ functionCalls: [{ name: 'listar_contas', args: { periodo: 'SEMANA' } }], text: '' })
        const result = await agent.interpret({ ...base, text: 'contas da semana' })
        expect(result).toEqual({ action: 'listar_contas', args: { periodo: 'SEMANA' } })
        const request = mockGenerate.mock.calls[0][0]
        expect(request.config.systemInstruction).toContain('2026-11-12')
        expect(request.config.systemInstruction).toContain('Vendas')
        expect(request.config.tools[0].functionDeclarations.map(f => f.name))
            .toEqual(['registrar_lancamento', 'listar_contas', 'marcar_conta_paga', 'resumo_do_mes'])
    })

    test('O prompt lista as carteiras do usuário e pede para não adivinhar a forma de pagamento', async () => {
        mockGenerate.mockResolvedValue({ text: 'ok' })
        await agent.interpret({ ...base, text: 'oi', wallets: [{ name: 'Miriam Cristina MEI', accountType: 'PJ' }] })
        const prompt = mockGenerate.mock.calls[0][0].config.systemInstruction
        expect(prompt).toContain('Miriam Cristina MEI')
        expect(prompt).toContain('Forma de pagamento: só preencha se a pessoa disse')
        const props = agent.FUNCTION_DECLARATIONS[0].parameters.properties
        expect(Object.keys(props)).toEqual(expect.arrayContaining(['carteira', 'categoria_pedida', 'forma_pagamento']))
    })

    test('Nenhuma função recebe ou escolhe o usuário', () => {
        for (const fn of agent.FUNCTION_DECLARATIONS) {
            const props = Object.keys(fn.parameters.properties || {})
            expect(props.some(p => /user|usuario|id$/i.test(p))).toBe(false)
        }
    })

    test('Envia a mídia junto com o texto', async () => {
        mockGenerate.mockResolvedValue({ text: 'ok' })
        await agent.interpret({ ...base, media: { buffer: Buffer.from('abc'), mimeType: 'image/jpeg' } })
        const parts = mockGenerate.mock.calls[0][0].contents[0].parts
        expect(parts[0].inlineData).toEqual({ data: Buffer.from('abc').toString('base64'), mimeType: 'image/jpeg' })
    })

    test('Tenta o próximo modelo se o primeiro falhar', async () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
        mockGenerate.mockRejectedValueOnce(new Error('503')).mockResolvedValueOnce({ text: 'Oi! Posso ajudar com suas finanças.' })
        const result = await agent.interpret({ ...base, text: 'oi' })
        warn.mockRestore()
        expect(result.reply).toContain('finanças')
        expect(mockGenerate).toHaveBeenCalledTimes(2)
        expect(mockGenerate.mock.calls[1][0].model).not.toBe(mockGenerate.mock.calls[0][0].model)
    })
})
