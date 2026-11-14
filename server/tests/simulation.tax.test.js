/**
 * Simulador e Comparativo: DAS com o salário mínimo do ano, validação do que chega,
 * excesso de faturamento e o imposto da Microempresa pelas tabelas do Simples.
 */
const mockDb = { query: jest.fn() }
jest.mock('../db', () => ({ db: mockDb, pool: { query: jest.fn() } }))
let mockUser = null
jest.mock('../middleware/auth', () => ({
    authMiddleware: (req, res, next) => { if (!mockUser) return res.status(401).json({ message: 'login' }); req.user = mockUser; next() },
    optionalAuth: (req, res, next) => { if (mockUser) req.user = mockUser; next() }
}))
jest.mock('../utils/meiLimits', () => ({
    currentYearBR: () => 2026,
    getMeiLimits: async (year = 2026) => ({ year, annualLimit: year >= 2027 ? 110000 : 81000, warningPercentage: 70, dangerPercentage: 90 })
}))
const express = require('express')
const request = require('supertest')
const tax = require('../logic/meiTax')
const app = express()
app.use(express.json())
app.use('/api/simulate', require('../routes/simulation.routes'))

let rules, inserts
beforeEach(() => {
    mockUser = null
    inserts = []
    rules = { inssPercentage: 5, icmsValue: 1, issValue: 5, employeeCost: 1412, minimumWage: null }
    mockDb.query.mockReset()
    mockDb.query.mockImplementation(async (sql, params) => {
        if (sql.includes('FROM calculation_rules')) return { rows: [rules] }
        if (sql.includes('INSERT INTO simulations')) { inserts.push(params); return { rows: [] } }
        return { rows: [] }
    })
    jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => console.error.mockRestore())

const simulate = (body) => request(app).post('/api/simulate').send(body)

describe('DAS de 2026 (salário mínimo R$ 1.621)', () => {
    test.each([['comercio', 82.05], ['servico', 86.05], ['ambos', 87.05]])('%s: R$ %d', async (activityType, das) => {
        const res = await simulate({ activityType, revenue: 5000, revenueType: 'mensal' })
        expect(res.status).toBe(200)
        expect(res.body.dasMonthly).toBe(das)
        expect(res.body.dasAnnual).toBe(Math.round(das * 12 * 100) / 100)
        expect(res.body.breakdown).toMatchObject({ inss: 81.05, minimumWage: 1621 })
    })

    test('funcionário: salário mínimo + 8% de FGTS + 3% de INSS; 1 permitido em 2026', async () => {
        const res = await simulate({ activityType: 'comercio', revenue: 5000, hasEmployee: true })
        expect(res.body.employeeCost).toBe(1799.31)
        expect(res.body.employeesAllowed).toBe(1)
        const sem = await simulate({ activityType: 'comercio', revenue: 5000, hasEmployee: false })
        expect(sem.body.employeeCost).toBe(0)
    })

    test('salário gravado pelo admin maior que o da lei passa a valer; menor, não', async () => {
        rules.minimumWage = 1700
        expect((await simulate({ activityType: 'comercio', revenue: 1000 })).body.dasMonthly).toBe(86)
        rules.minimumWage = 1000
        expect((await simulate({ activityType: 'comercio', revenue: 1000 })).body.dasMonthly).toBe(82.05)
    })

    test('ano sem salário na tabela usa o último conhecido', () => {
        expect(tax.lawMinimumWage(2031)).toBe(1621)
        expect(tax.lawMinimumWage(2025)).toBe(1518)
    })
})

describe('Faturamento, limite e excesso', () => {
    test('"por ano": usa o valor como anual e grava o do mês no histórico', async () => {
        mockUser = { id: 7 }
        const res = await simulate({ activityType: 'servico', revenue: 84000, revenueType: 'anual' })
        expect(res.body).toMatchObject({ annualRevenue: 84000, monthlyRevenue: 7000 })
        expect(inserts).toHaveLength(1)
        expect(inserts[0][0]).toBe(7)
        expect(inserts[0][2]).toBe(7000)
        expect(inserts[0][3]).toBe('anual')
    })

    test.each([
        [6000, 'none', 0],
        [7200, 'ate20', 5400],
        [8100, 'ate20', 16200],
        [8200, 'acima20', 17400]
    ])('R$ %i por mês: %s (excesso R$ %i)', async (revenue, kind, amount) => {
        const res = await simulate({ activityType: 'comercio', revenue })
        expect(res.body.excess).toEqual({ kind, amount })
    })

    test('mostra o limite do ano seguinte (R$ 110 mil em 2027)', async () => {
        const res = await simulate({ activityType: 'comercio', revenue: 7200 })
        expect(res.body.next).toMatchObject({ year: 2027, annualLimit: 110000 })
        expect(res.body.next.limitPercentage).toBeCloseTo(78.545, 2)
    })
})

describe('Dado ruim: 400 com mensagem, nada gravado', () => {
    test.each([
        [{ revenue: 5000 }],
        [{ activityType: 'industria', revenue: 5000 }],
        [{ activityType: 'comercio' }],
        [{ activityType: 'comercio', revenue: 'abc' }],
        [{ activityType: 'comercio', revenue: -10 }],
        [{ activityType: 'comercio', revenue: '' }],
        [{ activityType: 'comercio', revenue: { $gt: 0 } }],
        [{ activityType: 'comercio', revenue: [5000] }],
        [{ activityType: 'comercio', revenue: 9e9, revenueType: 'mensal' }]
    ])('%j', async (body) => {
        mockUser = { id: 7 }
        const res = await simulate(body)
        expect(res.status).toBe(400)
        expect(typeof res.body.message).toBe('string')
        expect(inserts).toHaveLength(0)
    })

    test('faturamento em texto com número ("6000") é aceito', async () => {
        const res = await simulate({ activityType: 'comercio', revenue: '6000' })
        expect(res.status).toBe(200)
        expect(res.body.annualRevenue).toBe(72000)
    })

    test('tipo de faturamento estranho conta como mensal', async () => {
        const res = await simulate({ activityType: 'comercio', revenue: 1000, revenueType: 'semanal' })
        expect(res.body.annualRevenue).toBe(12000)
    })

    test('sem login não grava histórico', async () => {
        await simulate({ activityType: 'comercio', revenue: 1000 })
        expect(inserts).toHaveLength(0)
    })
})

describe('GET /info (público)', () => {
    test('DAS de cada atividade e limite do ano e do próximo', async () => {
        const res = await request(app).get('/api/simulate/info')
        expect(res.status).toBe(200)
        expect(res.body).toEqual({
            year: 2026,
            das: { minimumWage: 1621, inss: 81.05, icms: 1, iss: 5, comercio: 82.05, servico: 86.05, ambos: 87.05 },
            employeeCost: 1799.31,
            employeesAllowed: 1,
            limits: { annualLimit: 81000, nextYear: 2027, nextAnnualLimit: 110000 }
        })
    })
})

describe('Comparativo MEI x Microempresa', () => {
    const compare = (body) => request(app).post('/api/simulate/comparison').send(body)

    test('precisa de login', async () => {
        expect((await compare({ annualRevenue: 60000 })).status).toBe(401)
    })

    test('comércio: DAS do ano x Simples anexo I (4% até R$ 180 mil)', async () => {
        mockUser = { id: 7 }
        const res = await compare({ annualRevenue: 60000, activityType: 'comercio' })
        expect(res.status).toBe(200)
        expect(res.body.mei).toMatchObject({ monthlyTax: 82.05, annualTax: 984.6, limit: 81000 })
        expect(res.body.me).toMatchObject({ annex: 'I', rate: 0.04, annualTax: 2400, monthlyTax: 200 })
        expect(res.body).toMatchObject({ recommendation: 'mei', overLimit: false })
    })

    test('serviço acima do limite: anexo III, faixa 2 com parcela a deduzir', async () => {
        mockUser = { id: 7 }
        const res = await compare({ annualRevenue: 200000, activityType: 'servico' })
        // (200.000 x 11,2% - 9.360) / 200.000 = 6,52%
        expect(res.body.me).toMatchObject({ annex: 'III', rate: 0.0652, annualTax: 13040 })
        expect(res.body.mei.monthlyTax).toBe(86.05)
        expect(res.body).toMatchObject({ recommendation: 'me', overLimit: true })
    })

    test('perto do limite (acima de 80%): recomenda planejar', async () => {
        mockUser = { id: 7 }
        const res = await compare({ annualRevenue: 70000, activityType: 'comercio' })
        expect(res.body).toMatchObject({ recommendation: 'me', overLimit: false })
    })

    test('chamada antiga sem atividade: comércio', async () => {
        mockUser = { id: 7 }
        const res = await compare({ annualRevenue: 60000 })
        expect(res.body.me.annex).toBe('I')
    })

    test.each([[{}], [{ annualRevenue: 'x' }], [{ annualRevenue: 0 }], [{ annualRevenue: -5 }], [{ annualRevenue: 5000000 }]])('dado ruim %j: 400', async (body) => {
        mockUser = { id: 7 }
        const res = await compare(body)
        expect(res.status).toBe(400)
        expect(typeof res.body.message).toBe('string')
    })
})
