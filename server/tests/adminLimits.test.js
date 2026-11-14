/**
 * Admin > Limites MEI: limite por ano (LC 238/2026) e dados conferidos antes de gravar
 * (antes qualquer JSON ia direto para o banco, e texto virava erro 500).
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
const { currentYearBR } = require('../utils/meiLimits')
const app = express()
app.use(express.json())
app.use('/api/admin', require('../routes/admin.routes'))

const norm = (sql) => sql.replace(/\s+/g, ' ').trim()
let saved, sql
beforeEach(() => {
    jest.clearAllMocks()
    sql = []
    saved = { 2026: 81000 }
    mockDb.query.mockImplementation(async (rawSql, params = []) => {
        const q = norm(rawSql)
        sql.push({ q, params })
        if (q.startsWith('SELECT "annualLimit", "updatedAt" FROM mei_limits WHERE year = $1')) return { rows: saved[params[0]] ? [{ annualLimit: saved[params[0]] }] : [] }
        if (q.startsWith('SELECT "warningPercentage", "dangerPercentage" FROM mei_limits')) return { rows: [{ warningPercentage: 70, dangerPercentage: 90 }] }
        return { rows: [], rowCount: 1 }
    })
    jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => console.error.mockRestore())
const inserts = () => sql.filter(s => s.q.startsWith('INSERT INTO mei_limits'))

test('GET: ano atual nos campos de sempre e os anos ao redor, com o da lei onde não há valor gravado', async () => {
    const res = await request(app).get('/api/admin/limits')
    const y = currentYearBR()
    expect(res.status).toBe(200)
    expect(res.body.year).toBe(y)
    expect(res.body.years.map(r => r.year)).toEqual([y - 1, y, y + 1, y + 2])
    const by = Object.fromEntries(res.body.years.map(r => [r.year, r]))
    if (by[2027]) expect(by[2027]).toMatchObject({ annualLimit: 110000, source: 'lei' })
    if (by[2028]) expect(by[2028]).toMatchObject({ annualLimit: 140000, source: 'lei' })
})

test('PUT grava o limite do ano pedido', async () => {
    const res = await request(app).put('/api/admin/limits').send({ year: 2027, annualLimit: 110000, warningPercentage: 70, dangerPercentage: 90 })
    expect(res.status).toBe(200)
    expect(inserts()[0].params).toEqual([2027, 110000, 70, 90, 1])
})

test.each([
    [{ year: 2027, annualLimit: 'abc', warningPercentage: 70, dangerPercentage: 90 }],
    [{ year: 2027, annualLimit: 500, warningPercentage: 70, dangerPercentage: 90 }],
    [{ year: 1999, annualLimit: 81000, warningPercentage: 70, dangerPercentage: 90 }],
    [{ year: 2027.5, annualLimit: 81000, warningPercentage: 70, dangerPercentage: 90 }],
    [{ year: 2027, annualLimit: 81000, warningPercentage: 95, dangerPercentage: 90 }],
    [{ year: 2027, annualLimit: 81000, warningPercentage: 70, dangerPercentage: 150 }]
])('PUT recusa %o sem gravar', async (body) => {
    const res = await request(app).put('/api/admin/limits').send(body)
    expect(res.status).toBe(400)
    expect(inserts()).toHaveLength(0)
})
