/**
 * Admin > Relatórios (GET /api/admin/reports). Antes: a "receita" somava o preço do
 * plano de qualquer conta criada no período (inclusive admin, apagada e quem não
 * paga), os números vinham como texto, o Gratuito aparecia duas vezes e a conta
 * de conversão usava esses mesmos números errados.
 */
const mockDb = { query: jest.fn() }
jest.mock('../db', () => ({ db: mockDb, pool: { query: jest.fn(), connect: jest.fn() } }))
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
beforeEach(() => {
    jest.clearAllMocks()
    calls = []
    mockDb.query.mockImplementation(async (rawSql, params) => {
        const q = norm(rawSql)
        calls.push({ q, params })
        if (q.includes('generate_series') && q.includes('FROM users t')) return { rows: [{ date: '2026-11-14', count: '1' }, { date: '2026-11-15', count: '2' }] }
        if (q.includes('generate_series') && q.includes('FROM simulations t')) return { rows: [{ date: '2026-11-14', count: '0' }, { date: '2026-11-15', count: '3' }] }
        if (q.includes('JOIN plans p ON p.id = u."planId"') && q.includes('date_trunc')) return { rows: [{ count: '1' }] }
        if (q.includes('LEFT JOIN plans p')) return { rows: [
            { id: 3, name: 'Ouro', price: 39.9, count: 2, paying: 1, canceling: 0 },
            { id: null, name: null, price: 0, count: 1, paying: 0, canceling: 0 },
            { id: 1, name: 'Gratuito', price: 0, count: 2, paying: 0, canceling: 0 },
        ] }
        return { rows: [] }
    })
    jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => console.error.mockRestore())

test('números de verdade: série por dia, conversão de quem paga e receita só de assinantes', async () => {
    const res = await request(app).get('/api/admin/reports?period=7d')
    expect(res.status).toBe(200)
    expect(res.body.period).toBe('7d')
    expect(res.body.series).toEqual([
        { date: '2026-11-14', signups: 1, simulations: 0 },
        { date: '2026-11-15', signups: 2, simulations: 3 },
    ])
    expect(res.body.totals).toEqual({ signups: 3, simulations: 3, converted: 1, conversionRate: 1 / 3 })
    expect(res.body.subscriptions).toEqual({ paying: 1, monthlyRevenue: 39.9 })
    expect(res.body.plans.map(p => [p.name, p.count])).toEqual([['Gratuito', 3], ['Ouro', 2]])
})

test('período fora da lista vira 30 dias e nunca entra no SQL', async () => {
    const res = await request(app).get('/api/admin/reports?period=' + encodeURIComponent("1 day'; DROP TABLE users; --"))
    expect(res.status).toBe(200)
    expect(res.body.period).toBe('30d')
    for (const c of calls) {
        expect(c.q).not.toContain('DROP')
        if (c.params) expect(c.params).toEqual(['day', 30])
    }
})

test('nomes antigos do período continuam valendo', async () => {
    expect((await request(app).get('/api/admin/reports?period=year')).body.period).toBe('12m')
    expect(calls.find(c => c.params)?.params).toEqual(['month', 12])
})

test('cadastros sem admin e sem conta apagada; conversão só de quem paga no Stripe', async () => {
    await request(app).get('/api/admin/reports')
    const users = calls.find(c => c.q.includes('FROM users t')).q
    expect(users).toContain(`t.role = 'USER'`)
    expect(users).toContain('t."deletedAt" IS NULL')
    const conv = calls.find(c => c.q.includes('JOIN plans p ON p.id = u."planId"') && c.q.includes('date_trunc')).q
    expect(conv).toContain('"stripeSubscriptionId" IS NOT NULL')
    expect(conv).toContain("America/Sao_Paulo")
})

test('erro no banco vira 500 com mensagem, sem detalhe interno', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('relation x does not exist'))
    const res = await request(app).get('/api/admin/reports')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ message: 'Erro ao gerar relatórios' })
})
