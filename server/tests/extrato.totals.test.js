/**
 * Extrato: GET /api/finance/transactions devolve os totais do filtro inteiro
 * (receitas, despesas, pendentes), não só os da página carregada.
 */

const mockDb = { query: jest.fn() }
const mockPool = { query: jest.fn(), connect: jest.fn() }

jest.mock('../db', () => ({ db: mockDb, pool: mockPool }))

jest.mock('../middleware/auth', () => ({
    authMiddleware: (req, res, next) => {
        req.user = { id: 1, role: 'USER', planId: 2, isInTrial: false }
        next()
    }
}))

jest.mock('../middleware/walletSecurity', () => ({
    validateWalletOwnership: (req, res, next) => next(),
    validateReferenceOwnership: (req, res, next) => next()
}))

jest.mock('../middleware/planGuard', () => ({
    featureGuard: () => (req, res, next) => next()
}))

const express = require('express')
const request = require('supertest')

const app = express()
app.use(express.json())
app.use('/api/finance', require('../routes/finance.routes'))

beforeEach(() => {
    mockDb.query.mockReset()
})

describe('GET /api/finance/transactions — totais do filtro', () => {
    test('devolve totals com receitas, despesas e pendentes do filtro inteiro', async () => {
        mockDb.query
            // 1ª consulta: contagem + totais (o Postgres manda COUNT como texto)
            .mockResolvedValueOnce({ rows: [{ count: '23', receitas: 7565, despesas: 3605.9, pendentes: 76.9 }] })
            // 2ª consulta: a página
            .mockResolvedValueOnce({ rows: [{ id: 1, type: 'RECEITA', amount: 480 }] })

        const res = await request(app).get('/api/finance/transactions?page=1&limit=15&walletId=ALL&type=ALL')

        expect(res.status).toBe(200)
        expect(res.body.totalCount).toBe(23)
        expect(res.body.totalPages).toBe(2)
        expect(res.body.totals).toEqual({ receitas: 7565, despesas: 3605.9, pendentes: 76.9 })
        expect(res.body.data).toHaveLength(1)
    })

    test('os totais usam os mesmos filtros e parâmetros da contagem', async () => {
        mockDb.query
            .mockResolvedValueOnce({ rows: [{ count: '0', receitas: 0, despesas: 0, pendentes: 0 }] })
            .mockResolvedValueOnce({ rows: [] })

        await request(app).get('/api/finance/transactions?walletId=2&type=DESPESA&startDate=2026-11-01&endDate=2026-11-30')

        const [sql, params] = mockDb.query.mock.calls[0]
        expect(sql).toMatch(/SUM\(CASE WHEN type = 'RECEITA'/)
        expect(sql).toMatch(/status = 'PENDING'/)
        expect(sql).toMatch(/"business_unit_id" = \$2/)
        // a rota reaproveita a mesma lista e acrescenta limit/offset depois, para a 2ª consulta
        expect(params.slice(0, 5)).toEqual([1, 2, 'DESPESA', '2026-11-01', '2026-11-30'])
    })

    test('sem lançamentos, os totais vêm zerados (e não nulos)', async () => {
        mockDb.query
            .mockResolvedValueOnce({ rows: [{ count: '0', receitas: null, despesas: null, pendentes: null }] })
            .mockResolvedValueOnce({ rows: [] })

        const res = await request(app).get('/api/finance/transactions')

        expect(res.body.totals).toEqual({ receitas: 0, despesas: 0, pendentes: 0 })
        expect(res.body.totalCount).toBe(0)
    })
})
