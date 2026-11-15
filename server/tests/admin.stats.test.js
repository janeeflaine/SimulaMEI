/**
 * Admin > Painel (GET /api/admin/stats): receita só de quem paga de verdade
 * (assinatura no Stripe valendo), conta sem plano somada ao Gratuito e lista de
 * atividade sem IP, e-mail nem metadata. Antes a receita somava quem só escolheu
 * o plano pago, quem ganhou o plano do admin e as contas de administrador.
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
let sql
beforeEach(() => {
    jest.clearAllMocks()
    sql = []
    mockDb.query.mockImplementation(async (rawSql) => {
        const q = norm(rawSql)
        sql.push(q)
        if (q.includes('FROM users WHERE role')) return { rows: [{ total: 8, new30: 6, blocked: 1, pendingPayment: 1 }] }
        if (q.includes('LEFT JOIN plans p')) return { rows: [
            { id: 3, name: 'Ouro', price: 39.9, count: 2, paying: 1, canceling: 0 },
            { id: null, name: null, price: 0, count: 1, paying: 0, canceling: 0 },
            { id: 1, name: 'Gratuito', price: 0, count: 2, paying: 0, canceling: 0 },
            { id: 2, name: 'Prata', price: 19.9, count: 3, paying: 2, canceling: 1 },
        ] }
        if (q.includes('FROM simulations')) return { rows: [{ total: 10, last30: 4 }] }
        if (q.includes('FROM audit_logs al')) return { rows: [{ id: 5, timestamp: '2026-11-15T12:00:00Z', level: 'WARN', event_type: 'USER_LOGIN_FAILED', user_name: null }] }
        if (q.includes('COUNT(*)::int AS count FROM audit_logs')) return { rows: [{ count: 3 }] }
        return { rows: [] }
    })
    jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => console.error.mockRestore())

test('receita = assinantes pagando × preço; conta sem plano entra no Gratuito; planos em ordem de preço', async () => {
    const res = await request(app).get('/api/admin/stats')
    expect(res.status).toBe(200)
    expect(res.body.subscriptions).toEqual({ paying: 3, canceling: 1, monthlyRevenue: 79.7 })
    expect(res.body.usersByPlan.map(p => [p.name, p.count])).toEqual([['Gratuito', 3], ['Prata', 3], ['Ouro', 2]])
    expect(res.body.users).toEqual({ total: 8, new30: 6, blocked: 1, pendingPayment: 1 })
    expect(res.body.simulations).toEqual({ total: 10, last30: 4 })
    expect(res.body.suspiciousCount).toBe(3)
})

test('quem paga: plano pago + assinatura no Stripe + situação que cobra; contas de admin e apagadas fora', async () => {
    await request(app).get('/api/admin/stats')
    const plansSql = sql.find(q => q.includes('LEFT JOIN plans p'))
    expect(plansSql).toContain('"stripeSubscriptionId" IS NOT NULL')
    expect(plansSql).toContain(`"subscriptionStatus" IN ('active', 'canceling')`)
    expect(plansSql).toContain(`u.role = 'USER' AND u."deletedAt" IS NULL`)
})

test('atividade recente sem IP, e-mail nem metadata (ficam em Logs de auditoria)', async () => {
    await request(app).get('/api/admin/stats')
    const actSql = sql.find(q => q.includes('FROM audit_logs al'))
    expect(actSql).not.toMatch(/ip_address|metadata|email/)
})

test('erro no banco: 500 com mensagem, sem detalhes do erro', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('senha do banco xyz'))
    const res = await request(app).get('/api/admin/stats')
    expect(res.status).toBe(500)
    expect(JSON.stringify(res.body)).not.toContain('xyz')
})
