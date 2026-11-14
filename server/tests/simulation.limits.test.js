/** GET /api/simulate/limits: público, só o limite do ano atual e do próximo. */
const mockDb = { query: jest.fn() }
jest.mock('../db', () => ({ db: mockDb, pool: { query: jest.fn() } }))
jest.mock('../middleware/auth', () => ({
    authMiddleware: (req, res) => res.status(401).json({ message: 'login' }),
    optionalAuth: (req, res, next) => next()
}))
const express = require('express')
const request = require('supertest')
const { currentYearBR, lawLimit } = require('../utils/meiLimits')
const app = express()
app.use('/api/simulate', require('../routes/simulation.routes'))

beforeEach(() => {
    mockDb.query.mockReset()
    mockDb.query.mockImplementation(async (sql, params = []) => {
        if (sql.includes('WHERE year = $1')) return { rows: params[0] === currentYearBR() ? [{ annualLimit: 85000 }] : [] }
        return { rows: [{ warningPercentage: 70, dangerPercentage: 90 }] }
    })
})

test('sem login: ano atual (valor do admin) e próximo (valor da lei), sem mais nada', async () => {
    const y = currentYearBR()
    const res = await request(app).get('/api/simulate/limits')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ current: { year: y, annualLimit: 85000 }, next: { year: y + 1, annualLimit: lawLimit(y + 1) } })
})
