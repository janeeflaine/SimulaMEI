/**
 * Admin > Configurações. Antes: PUT /api/admin/settings/:key gravava qualquer chave
 * sem conferir e copiava o valor (inclusive tokens) para os registros de auditoria;
 * /api/settings aceitava uma chave nova qualquer em texto puro e devolvia as chaves
 * internas. Agora a tela mostra só se cada serviço está configurado, sem valores.
 */
const mockDb = { query: jest.fn() }
jest.mock('../db', () => ({ db: mockDb, pool: { query: jest.fn(), connect: jest.fn() } }))
jest.mock('../middleware/auth', () => ({
    authMiddleware: (req, res, next) => { req.user = { id: 1, role: 'ADMIN' }; next() },
    adminMiddleware: (req, res, next) => next()
}))
const mockAudit = { log: jest.fn(async () => {}) }
jest.mock('../utils/auditLogger', () => mockAudit)
jest.mock('../utils/userDeletion', () => ({ deleteUserData: jest.fn(), cancelStripeSubscriptionIfActive: jest.fn() }))
jest.mock('../utils/encryption', () => ({}))

const express = require('express')
const request = require('supertest')
const app = express()
app.use(express.json())
app.use('/api/admin', require('../routes/admin.routes'))
app.use('/api/settings', require('../routes/settings.routes'))

const ENV_KEYS = ['VERCEL_ENV', 'NODE_ENV', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'JWT_SECRET', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'ADMIN_DEFAULT_PASSWORD', 'GEMINI_API_KEY', 'DATABASE_URL']
let envBackup
beforeEach(() => {
    jest.clearAllMocks()
    envBackup = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]))
    mockDb.query.mockImplementation(async (raw) => {
        if (/SELECT key, value, "isEncrypted", "updatedAt" FROM system_settings/.test(raw)) {
            return { rows: [
                { key: 'wallet_limit_1', value: '2', isEncrypted: 0 },
                { key: 'plan_migration_v2', value: 'done', isEncrypted: 0 },
                { key: 'email_last_status', value: '{"to":"pessoa@ex.com"}', isEncrypted: 0 },
            ] }
        }
        return { rows: [] }
    })
})
afterEach(() => {
    for (const [k, v] of Object.entries(envBackup)) { if (v === undefined) delete process.env[k]; else process.env[k] = v }
})

test('a rota antiga que gravava qualquer chave não existe mais', async () => {
    const res = await request(app).put('/api/admin/settings/whatsapp_token').send({ value: 'EAAsegredo' })
    expect(res.status).toBe(404)
    expect(mockDb.query).not.toHaveBeenCalled()
    expect(mockAudit.log).not.toHaveBeenCalled()
})

test('/api/settings não grava chave fora da lista', async () => {
    for (const key of ['whatsapp_token', 'STRIPE_SECRET_KEY', 'qualquer_coisa']) {
        const res = await request(app).put('/api/settings').send({ key, value: 'sk_live_segredo' })
        expect(res.status).toBe(400)
    }
    expect(mockDb.query).not.toHaveBeenCalled()
})

test('/api/settings não devolve chaves internas nem marcas de migração', async () => {
    const res = await request(app).get('/api/settings')
    const keys = res.body.map((s) => s.key)
    expect(keys).toContain('wallet_limit_1')
    expect(keys).not.toContain('plan_migration_v2')
    expect(keys).not.toContain('email_last_status')
    expect(keys).not.toContain('MERCADOPAGO_ACCESS_TOKEN')
})

test('situação dos serviços: diz se está configurado, nunca o valor', async () => {
    process.env.VERCEL_ENV = 'production'
    process.env.STRIPE_SECRET_KEY = 'sk_test_abc123segredo'
    process.env.WHATSAPP_TOKEN = 'EAAGsegredo123'
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123456'
    process.env.JWT_SECRET = 'curta'
    process.env.ADMIN_DEFAULT_PASSWORD = 'senha-inicial'
    delete process.env.STRIPE_WEBHOOK_SECRET
    delete process.env.GEMINI_API_KEY
    const res = await request(app).get('/api/admin/system-status')
    expect(res.status).toBe(200)
    expect(res.headers['cache-control']).toBe('no-store')
    const text = JSON.stringify(res.body)
    for (const secret of ['abc123segredo', 'EAAGsegredo', 'curta', 'senha-inicial']) expect(text).not.toContain(secret)
    const items = Object.fromEntries(res.body.groups.flatMap((g) => g.items).map((i) => [i.key, i.state]))
    expect(items.stripe_key).toBe('warn')        // modo de teste no site no ar
    expect(items.stripe_webhook).toBe('missing')
    expect(items.wa_api).toBe('ok')
    expect(items.jwt).toBe('warn')               // chave curta
    expect(items.admin_pass).toBe('warn')
    expect(items.gemini).toBe('missing')
    expect(res.body.environment).toBe('production')
})
