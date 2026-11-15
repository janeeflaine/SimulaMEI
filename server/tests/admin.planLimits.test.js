/**
 * Admin > Funcionalidades: limites de uso por plano conferidos antes de gravar
 * (antes "abc" ia para o banco e o servidor lia como "sem limite") e
 * /api/settings sem chaves internas, com conferência e registro.
 */
const mockDb = { query: jest.fn() }
const mockClient = { query: jest.fn(), release: jest.fn() }
jest.mock('../db', () => ({ db: mockDb, pool: { query: jest.fn(), connect: jest.fn(async () => mockClient) } }))
jest.mock('../middleware/auth', () => ({
    authMiddleware: (req, res, next) => { req.user = { id: 1, role: 'ADMIN' }; next() },
    adminMiddleware: (req, res, next) => next()
}))
const mockAudit = { log: jest.fn(async () => {}) }
jest.mock('../utils/auditLogger', () => mockAudit)
jest.mock('../utils/userDeletion', () => ({ deleteUserData: jest.fn(), cancelStripeSubscriptionIfActive: jest.fn() }))
jest.mock('../utils/encryption', () => ({ encrypt: (v) => `enc(${v})` }))

const express = require('express')
const request = require('supertest')
const app = express()
app.use(express.json())
app.use('/api/admin', require('../routes/admin.routes'))
app.use('/api/settings', require('../routes/settings.routes'))

const norm = (sql) => sql.replace(/\s+/g, ' ').trim()
let saved, writes
beforeEach(() => {
    jest.clearAllMocks()
    saved = { wallet_limit_1: '2', transaction_limit_2: 'abc', single_device_3: 'true' }
    writes = []
    const handler = async (raw, params = []) => {
        const q = norm(raw)
        if (q.startsWith('SELECT id, name, price, "isActive" FROM plans')) return { rows: [{ id: 1, name: 'Gratuito', price: 0, isActive: 1 }, { id: 2, name: 'Prata', price: 19.9, isActive: 1 }, { id: 3, name: 'Ouro', price: 39.9, isActive: 1 }] }
        if (q.startsWith('SELECT id, name FROM plans')) return { rows: [{ id: 1, name: 'Gratuito' }, { id: 2, name: 'Prata' }, { id: 3, name: 'Ouro' }] }
        if (q.startsWith('SELECT key, value FROM system_settings WHERE key ~')) return { rows: Object.entries(saved).map(([key, value]) => ({ key, value })) }
        if (q.startsWith('SELECT key, value FROM system_settings WHERE key = ANY')) return { rows: Object.entries(saved).filter(([k]) => params[0].includes(k)).map(([key, value]) => ({ key, value })) }
        if (q.startsWith('SELECT value, "isEncrypted" FROM system_settings')) return { rows: saved[params[0]] !== undefined ? [{ value: saved[params[0]], isEncrypted: 0 }] : [] }
        if (q.startsWith('INSERT INTO system_settings')) { writes.push(params); return { rows: [] } }
        return { rows: [] }
    }
    mockDb.query.mockImplementation(handler)
    mockClient.query.mockImplementation(handler)
    jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => console.error.mockRestore())

test('GET: valor gravado inválido aparece como o padrão (não como "sem limite")', async () => {
    const res = await request(app).get('/api/admin/plan-limits')
    expect(res.status).toBe(200)
    expect(res.body.limits[2].transaction_limit).toBe(0)
    expect(res.body.limits[1].wallet_limit).toBe(2)
    expect(res.body.limits[3].single_device).toBe(true)
    expect(res.body.limits[3].whatsapp_numbers).toBe(4)
    expect(res.body.limits[1].invoice_upload_limit).toBe(20)
})

test('PUT grava só o que mudou, numa transação, com registro', async () => {
    const res = await request(app).put('/api/admin/plan-limits').send({ limits: { 1: { wallet_limit: 2, transaction_limit: 50 }, 3: { single_device: false } } })
    expect(res.status).toBe(200)
    expect(writes).toEqual([['transaction_limit_1', '50'], ['single_device_3', 'false']])
    expect(mockClient.query.mock.calls.map(c => norm(c[0]))).toContain('COMMIT')
    expect(mockAudit.log).toHaveBeenCalledTimes(1)
})

test.each([
    [{ 1: { wallet_limit: 'abc' } }],
    [{ 1: { wallet_limit: -1 } }],
    [{ 1: { wallet_limit: 2.5 } }],
    [{ 1: { wallet_limit: 5000 } }],
    [{ 1: { single_device: 'sim' } }],
    [{ 1: { qualquer_coisa: 1 } }],
    [{ 99: { wallet_limit: 1 } }],
    [{ abc: { wallet_limit: 1 } }],
])('PUT dado ruim %j: 400, nada gravado', async (limits) => {
    const res = await request(app).put('/api/admin/plan-limits').send({ limits })
    expect(res.status).toBe(400)
    expect(writes).toHaveLength(0)
})

test('/api/settings: limite com texto é recusado; número válido é gravado e registrado', async () => {
    expect((await request(app).put('/api/settings').send({ key: 'transaction_limit_1', value: 'abc' })).status).toBe(400)
    expect((await request(app).put('/api/settings').send({ key: 'wallet_pf_limit_2', value: '3' })).status).toBe(200)
    expect(writes[0]).toEqual(['wallet_pf_limit_2', '3', 0])
    expect(mockAudit.log).toHaveBeenCalled()
})

test('/api/settings: chave interna, chave estranha e valor objeto são recusados', async () => {
    expect((await request(app).put('/api/settings').send({ key: 'whatsapp_last_run', value: '{}' })).status).toBe(400)
    expect((await request(app).put('/api/settings').send({ key: "x'; drop", value: '1' })).status).toBe(400)
    expect((await request(app).put('/api/settings').send({ key: 'algo', value: { a: 1 } })).status).toBe(400)
    expect(writes).toHaveLength(0)
})

test('/api/settings: segredo não vai para o registro', async () => {
    const res = await request(app).put('/api/settings').send({ key: 'MERCADOPAGO_ACCESS_TOKEN', value: 'APP_USR-segredo' })
    expect(res.status).toBe(200)
    expect(JSON.stringify(mockAudit.log.mock.calls)).not.toContain('segredo')
})
