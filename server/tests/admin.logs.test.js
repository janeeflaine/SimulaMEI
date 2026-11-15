/**
 * Admin > Logs de auditoria. Antes: página, data ou conta inválida no endereço
 * davam erro 500; a lista mandava navegador, aparelho, valores alterados e
 * metadados de 50 registros de uma vez; "%" na busca casava com tudo; e registros
 * antigos mostravam tokens e nome/e-mail de contas.
 */
const mockPool = { query: jest.fn(), connect: jest.fn() }
jest.mock('../db', () => ({ db: { query: jest.fn() }, pool: mockPool }))
jest.mock('../middleware/auth', () => ({
    authMiddleware: (req, res, next) => { req.user = { id: 1, role: 'ADMIN' }; next() },
    adminMiddleware: (req, res, next) => next()
}))
jest.mock('../utils/auditLogger', () => ({ log: jest.fn(async () => {}) }))
jest.mock('../utils/userDeletion', () => ({ deleteUserData: jest.fn(), cancelStripeSubscriptionIfActive: jest.fn() }))

const express = require('express')
const request = require('supertest')
const app = express()
app.use(express.json())
app.use('/api/admin', require('../routes/admin.routes'))

const norm = (sql) => sql.replace(/\s+/g, ' ').trim()
let calls
let detailRow
beforeEach(() => {
    jest.clearAllMocks()
    calls = []
    detailRow = null
    mockPool.query.mockImplementation(async (rawSql, params) => {
        const q = norm(rawSql)
        calls.push({ q, params })
        if (q.startsWith('SELECT COUNT(*)')) return { rows: [{ total: 3 }] }
        if (q.includes('WHERE al.id = $1')) return { rows: detailRow ? [detailRow] : [] }
        if (q === 'SELECT id, name FROM plans') return { rows: [{ id: 1, name: 'Gratuito' }, { id: 2, name: 'Prata' }] }
        return { rows: [] }
    })
    jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => console.error.mockRestore())

const listCall = () => calls.find(c => c.q.includes('ORDER BY al.timestamp DESC'))

test('página inválida vira página 1 (não erro)', async () => {
    const res = await request(app).get('/api/admin/logs?page=abc&limit=xyz')
    expect(res.status).toBe(200)
    expect(listCall().params.slice(-2)).toEqual([50, 0])
})

test('data, nível ou conta inválidos: 400 com mensagem, sem consultar o banco', async () => {
    for (const qs of ['from=amanha', 'to=2026-02-30', 'level=DEBUG', 'user_id=abc', 'event_type=x;drop']) {
        const res = await request(app).get('/api/admin/logs?' + qs)
        expect(res.status).toBe(400)
        expect(res.body.message).toBeTruthy()
    }
    expect(mockPool.query).not.toHaveBeenCalled()
})

test('dia escolhido vale no horário de Brasília e o fim inclui o dia todo', async () => {
    await request(app).get('/api/admin/logs?from=2026-11-14&to=2026-11-15')
    const { q, params } = listCall()
    expect(q).toContain("AT TIME ZONE 'America/Sao_Paulo'")
    expect(q).toMatch(/al\.timestamp < \(\(\(\(\$2::date\) \+ 1\)/)
    expect(params.slice(0, 2)).toEqual(['2026-11-14', '2026-11-15'])
})

test('lista só com o necessário (sem navegador, aparelho, valores nem metadados)', async () => {
    await request(app).get('/api/admin/logs')
    const { q } = listCall()
    for (const col of ['user_agent', 'device_fingerprint', 'old_value', 'new_value', 'metadata', 'u.email']) expect(q).not.toContain(col)
    expect(q).toContain('al.id DESC')
})

test('"%" e "_" na busca valem como texto', async () => {
    await request(app).get('/api/admin/logs?search=' + encodeURIComponent('50%_a'))
    expect(listCall().params[0]).toBe('%50\\%\\_a%')
})

test('detalhe esconde token antigo e nome/e-mail de conta alterada', async () => {
    detailRow = {
        id: 7, timestamp: '2026-11-15T12:00:00Z', level: 'INFO', event_type: 'SETTINGS_UPDATED', user_id: 1,
        resource_type: 'SYSTEM_SETTINGS', resource_id: 'whatsapp_token',
        old_value: '"EAAGm0PX4ZCpsBAKZA1234567890123456"', new_value: '"EAAGm0PX4ZCpsBAKZA9999999999999999"', metadata: null
    }
    let res = await request(app).get('/api/admin/logs/7')
    expect(res.status).toBe(200)
    expect(res.body.old_value).toBe('(secreto)')
    expect(JSON.stringify(res.body)).not.toContain('EAAG')

    detailRow = {
        id: 8, event_type: 'USER_UPDATED', level: 'INFO', resource_type: 'USER', resource_id: '5',
        old_value: JSON.stringify({ name: 'Maria Antiga', email: 'maria@ex.com', planId: 1 }),
        new_value: JSON.stringify({ name: 'Maria Nova', planId: 2, stripeKey: 'sk_live_abc' }),
        metadata: JSON.stringify({ note: 'sk_test_123' })
    }
    res = await request(app).get('/api/admin/logs/8')
    expect(res.body.old_value).toEqual({ name: '(alterado)', email: '(alterado)', planId: 'Gratuito' })
    expect(res.body.new_value).toEqual({ name: '(alterado)', planId: 'Prata', stripeKey: '(secreto)' })
    expect(res.body.metadata).toEqual({ note: '(secreto)' })
})

test('detalhe: id inválido 400, inexistente 404', async () => {
    expect((await request(app).get('/api/admin/logs/abc')).status).toBe(400)
    expect((await request(app).get('/api/admin/logs/99')).status).toBe(404)
})

test('entradas: só dos últimos 7 dias e de contas que existem', async () => {
    await request(app).get('/api/admin/logs/sessions')
    const q = calls[0].q
    expect(q).toContain("INTERVAL '7 days'")
    expect(q).toContain('"deletedAt" IS NULL')
})
