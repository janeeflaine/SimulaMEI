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

    test('Gera código com link wa.me para o número do EuSempreMEI', async () => {
        mockBot.createLinkCode.mockResolvedValue({ code: '123456', expiresAt: '2026-11-12T12:15:00Z' })
        const res = await request(app).post('/api/whatsapp/link-code')
        expect(res.statusCode).toBe(200)
        expect(mockBot.createLinkCode).toHaveBeenCalledWith(42)
        expect(res.body.message).toBe('VINCULAR 123456')
        expect(res.body.waLink).toBe('https://wa.me/5533999990000?text=VINCULAR%20123456')
    })

    test('Status mostra só os 4 últimos dígitos do número', async () => {
        mockDb.query.mockResolvedValue({ rows: [{ phone: '553399998193', reminderEnabled: true, optInAt: '2026-11-12' }] })
        const res = await request(app).get('/api/whatsapp/status')
        expect(res.statusCode).toBe(200)
        expect(res.body).toMatchObject({ available: true, mediaAvailable: false, linked: true, phone: '•••• 8193', reminderEnabled: true })
        expect(JSON.stringify(res.body)).not.toContain('553399998193')
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
