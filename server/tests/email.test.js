/**
 * E-mail do site: sem SMTP, o link de nova senha não vai para o log da produção
 * (antes ia: quem visse o log trocava a senha de qualquer conta); com SMTP, envia
 * com o link certo; falha vira motivo em português; o admin vê a situação e manda
 * um e-mail de teste (sem mostrar senha do SMTP).
 */
const mockDb = { query: jest.fn() }
jest.mock('../db', () => ({ db: mockDb, pool: { query: jest.fn(), connect: jest.fn() } }))
const mockSendMail = jest.fn()
jest.mock('nodemailer', () => ({ createTransport: jest.fn(() => ({ sendMail: (...a) => mockSendMail(...a) })) }))
jest.mock('../middleware/auth', () => ({
    authMiddleware: (req, res, next) => { req.user = { id: 1, role: 'ADMIN', email: 'admin@teste.com' }; next() },
    adminMiddleware: (req, res, next) => next()
}))
jest.mock('../utils/auditLogger', () => ({ log: jest.fn(async () => {}) }))
jest.mock('../utils/userDeletion', () => ({ deleteUserData: jest.fn(), cancelStripeSubscriptionIfActive: jest.fn() }))

const express = require('express')
const request = require('supertest')
const nodemailer = require('nodemailer')

const ENV = { ...process.env }
const TOKEN = 'b'.repeat(64)
let settings, lease
const setSmtp = () => Object.assign(process.env, { SMTP_HOST: 'smtp.resend.com', SMTP_USER: 'resend', SMTP_PASS: 're_segredo123', SMTP_PORT: '465', SMTP_FROM: 'nao-responda@eusempremei.com.br' })
const clearSmtp = () => { for (const k of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_PORT', 'SMTP_FROM', 'SMTP_SECURE']) delete process.env[k] }

beforeEach(() => {
    jest.clearAllMocks()
    process.env = { ...ENV }
    clearSmtp()
    settings = {}
    lease = true
    mockDb.query.mockImplementation(async (sql, params = []) => {
        if (sql.includes("'email_last_status'") && sql.includes('INSERT')) { settings.email_last_status = params[0]; return { rows: [] } }
        if (sql.includes("WHERE key = 'email_last_status'")) return { rows: settings.email_last_status ? [{ value: settings.email_last_status }] : [] }
        if (sql.includes("'email_test_at'")) return { rows: lease ? [{ key: 'email_test_at' }] : [] }
        return { rows: [] }
    })
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { console.log.mockRestore(); console.error.mockRestore(); process.env = { ...ENV } })

const mail = () => require('../utils/email')
const logged = () => JSON.stringify([...console.log.mock.calls, ...console.error.mock.calls])

describe('Link de nova senha', () => {
    test('produção sem SMTP: não envia e o link NÃO aparece no log', async () => {
        process.env.VERCEL = '1'
        const r = await mail().sendPasswordResetEmail('joana@gmail.com', TOKEN)
        expect(r).toEqual({ sent: false, reason: 'not_configured' })
        expect(logged()).not.toContain(TOKEN)
        expect(JSON.parse(settings.email_last_status)).toMatchObject({ ok: false, kind: 'senha', to: 'jo***@gmail.com' })
        expect(settings.email_last_status).not.toContain(TOKEN)
    })

    test('com SMTP: envia do remetente certo, com o link no botão e no texto', async () => {
        setSmtp(); process.env.FRONTEND_URL = 'https://www.eusempremei.com.br'
        mockSendMail.mockResolvedValue({})
        const r = await mail().sendPasswordResetEmail('joana@gmail.com', TOKEN)
        expect(r.sent).toBe(true)
        expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({ host: 'smtp.resend.com', port: 465, secure: true }))
        const msg = mockSendMail.mock.calls[0][0]
        expect(msg.from).toBe('"EuSempreMEI" <nao-responda@eusempremei.com.br>')
        expect(msg.to).toBe('joana@gmail.com')
        expect(msg.html).toContain(`https://www.eusempremei.com.br/redefinir-senha?token=${TOKEN}`)
        expect(msg.text).toContain(`/redefinir-senha?token=${TOKEN}`)
        expect(JSON.parse(settings.email_last_status)).toMatchObject({ ok: true, kind: 'senha' })
    })

    test('senha do SMTP errada: motivo em português, sem derrubar nada', async () => {
        setSmtp()
        mockSendMail.mockRejectedValue(Object.assign(new Error('Invalid login'), { responseCode: 535 }))
        const r = await mail().sendPasswordResetEmail('joana@gmail.com', TOKEN)
        expect(r).toMatchObject({ sent: false, reason: 'smtp_error' })
        expect(JSON.parse(settings.email_last_status).reason).toMatch(/usuário ou a senha/)
        expect(logged()).not.toContain('re_segredo123')
    })
})

describe('Admin > E-mail do site', () => {
    const app = express()
    app.use(express.json())
    app.use('/api/admin', require('../routes/admin.routes'))

    test('situação: diz se está configurado, sem mostrar a senha', async () => {
        setSmtp()
        settings.email_last_status = JSON.stringify({ ok: false, reason: 'x' })
        const res = await request(app).get('/api/admin/email/status')
        expect(res.status).toBe(200)
        expect(res.body).toMatchObject({ configured: true, host: 'smtp.resend.com', port: 465, from: 'nao-responda@eusempremei.com.br', last: { ok: false } })
        expect(JSON.stringify(res.body)).not.toContain('re_segredo123')
    })

    test('teste sem SMTP: 400 explicando as variáveis', async () => {
        const res = await request(app).post('/api/admin/email/test')
        expect(res.status).toBe(400)
        expect(res.body.message).toMatch(/SMTP_HOST/)
    })

    test('teste com SMTP: vai para o e-mail do próprio admin', async () => {
        setSmtp(); mockSendMail.mockResolvedValue({})
        const res = await request(app).post('/api/admin/email/test')
        expect(res.status).toBe(200)
        expect(mockSendMail.mock.calls[0][0].to).toBe('admin@teste.com')
    })

    test('segundo teste no mesmo minuto: 429 sem enviar', async () => {
        setSmtp(); lease = false
        const res = await request(app).post('/api/admin/email/test')
        expect(res.status).toBe(429)
        expect(mockSendMail).not.toHaveBeenCalled()
    })
})
