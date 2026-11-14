/**
 * Alertas do MEI: criados uma vez (com trava), configuração conferida, acesso pelo
 * recurso "alertas" do plano e datas no horário de Brasília.
 */
const mockDb = { query: jest.fn() }
const mockClient = { query: jest.fn(), release: jest.fn() }
const mockPool = { query: jest.fn(), connect: jest.fn(async () => mockClient) }
jest.mock('../db', () => ({ db: mockDb, pool: mockPool }))
let mockUser
jest.mock('../middleware/auth', () => ({
    authMiddleware: (req, res, next) => { req.user = { ...mockUser }; next() }
}))

const express = require('express')
const request = require('supertest')
const checker = require('../logic/alert-checker')
const app = express()
app.use(express.json())
app.use('/api/alerts', require('../routes/alert.routes'))

const norm = (sql) => sql.replace(/\s+/g, ' ').trim()
let state, sql
beforeEach(() => {
    jest.clearAllMocks()
    sql = []
    mockUser = { id: 1, role: 'USER', planId: 2, isInTrial: false, planFeatures: { alertas: true } }
    state = {
        alerts: [
            { id: 11, userId: 1, type: 'REVENUE_LIMIT', enabled: true, config: '{"trigger_at_percentage":80}' },
            { id: 12, userId: 1, type: 'DAS_EXPIRY', enabled: true, config: '{"days_before":5}' },
            { id: 13, userId: 1, type: 'ANNUAL_DECLARATION', enabled: true, config: '{}' }
        ],
        wallets: [{ id: 5, name: 'Loja', cnpj: '33.137.007/0001-09' }],
        sums: [{ walletId: 5, count: 2, total: 70000 }]
    }
    const handler = async (rawSql, params = []) => {
        const q = norm(rawSql)
        sql.push({ q, params })
        if (q.startsWith('SELECT * FROM user_alerts WHERE "userId" = $1')) return { rows: state.alerts }
        if (q.startsWith('INSERT INTO user_alerts')) {
            const row = { id: 100 + sql.length, userId: params[0], type: params[1], enabled: params[2], config: params[3] }
            state.alerts.push(row)
            return { rows: [row] }
        }
        if (q.startsWith('SELECT * FROM user_alerts WHERE id = $1')) return { rows: state.alerts.filter(a => a.id === params[0] && a.userId === params[1]) }
        if (q.startsWith('UPDATE user_alerts')) return { rows: [{ id: params[2], enabled: params[0], config: params[1] }] }
        if (q.startsWith('SELECT "annualLimit" FROM mei_limits')) return { rows: [{ annualLimit: 81000 }] }
        if (q.startsWith('SELECT id, name, cnpj FROM business_units')) return { rows: state.wallets }
        if (q.startsWith('SELECT t."business_unit_id" AS "walletId"')) return { rows: state.sums }
        if (q.startsWith('SELECT revenue, "revenueType" FROM simulations')) return { rows: state.simulation ? [state.simulation] : [] }
        return { rows: [], rowCount: 0 }
    }
    mockDb.query.mockImplementation(handler)
    mockClient.query.mockImplementation(handler)
    jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => console.error.mockRestore())
const ran = (start) => sql.filter(s => s.q.startsWith(start))

describe('Criar os alertas padrão', () => {
    test('conta nova: cria os três dentro da trava por pessoa', async () => {
        state.alerts = []
        const res = await request(app).get('/api/alerts')
        expect(res.status).toBe(200)
        expect(res.body.map(a => a.type)).toEqual(['REVENUE_LIMIT', 'DAS_EXPIRY', 'ANNUAL_DECLARATION'])
        const order = sql.map(s => s.q)
        expect(order.indexOf('SELECT pg_advisory_xact_lock($1, $2)')).toBeGreaterThan(order.indexOf('BEGIN'))
        expect(ran('INSERT INTO user_alerts')).toHaveLength(3)
        expect(ran('COMMIT')).toHaveLength(1)
    })

    test('alertas repetidos de antes da trava: só o primeiro de cada tipo aparece', async () => {
        state.alerts.push({ id: 14, userId: 1, type: 'DAS_EXPIRY', enabled: false, config: '{}' })
        const res = await request(app).get('/api/alerts')
        expect(res.body).toHaveLength(3)
        expect(res.body.find(a => a.type === 'DAS_EXPIRY').id).toBe(12)
        expect(ran('INSERT INTO user_alerts')).toHaveLength(0)
    })
})

describe('Editar um alerta', () => {
    test.each([
        ['abc', { enabled: false }, 404],
        ['11', { enabled: 'sim' }, 400],
        ['11', { config: [] }, 400],
        ['11', { config: { trigger_at_percentage: 30 } }, 400],
        ['11', { config: { trigger_at_percentage: '85' } }, 200],
        ['11', { config: { trigger_at_percentage: 85.5 } }, 400],
        ['11', { config: { outra_coisa: 1 } }, 400],
        ['12', { config: { days_before: 0 } }, 400],
        ['12', { config: { days_before: 16 } }, 400],
        ['13', { config: { days_before: 5 } }, 400],
        ['99', { enabled: true }, 404]
    ])('alerta %s com %o → %i', async (id, body, status) => {
        const res = await request(app).put(`/api/alerts/${id}`).send(body)
        expect(res.status).toBe(status)
        if (status !== 200) expect(ran('UPDATE user_alerts')).toHaveLength(0)
    })

    test('configuração salva junta com a que já existia, só com números', async () => {
        await request(app).put('/api/alerts/12').send({ config: { days_before: '7' } })
        const upd = ran('UPDATE user_alerts')[0]
        expect(JSON.parse(upd.params[1])).toEqual({ days_before: 7 })
        expect(upd.params.slice(2)).toEqual([12, 1])
    })
})

describe('Acesso pelo recurso do plano', () => {
    test('plano sem "alertas": 403 em todas as rotas', async () => {
        mockUser.planFeatures = { alertas: false }
        for (const [method, path] of [['get', '/api/alerts'], ['get', '/api/alerts/status'], ['get', '/api/alerts/check'], ['put', '/api/alerts/11']]) {
            const res = await request(app)[method](path).send({ enabled: false })
            expect(res.status).toBe(403)
        }
        expect(mockDb.query).not.toHaveBeenCalled()
    })
})

describe('Situação e datas', () => {
    test('/status traz faturamento do Extrato e avisos', async () => {
        const res = await request(app).get('/api/alerts/status')
        expect(res.status).toBe(200)
        expect(res.body.revenue).toMatchObject({ total: 70000, limit: 81000, source: 'extrato' })
        const revenueSql = ran('SELECT t."business_unit_id"')[0].q
        expect(revenueSql).toContain("t.type = 'RECEITA' AND t.status = 'PAID'")
        expect(revenueSql).toContain("(t.target = 'BUSINESS' OR b.\"account_type\" = 'PJ')")
        expect(revenueSql).toContain("<> 'Transferência'")
        // Carteira de outra pessoa nunca entra no grupo do MEI
        expect(revenueSql).toContain('b."ownerId" = t."userId"')
        expect(ran('SELECT id, name, cnpj FROM business_units')[0].params).toEqual([1])
        expect(res.body.triggered.some(t => t.type === 'REVENUE_LIMIT')).toBe(true)
    })

    test('"hoje" no horário de Brasília (22h30 do dia 14 ainda é dia 14)', () => {
        expect(checker.todayBR(new Date('2026-11-15T01:30:00Z'))).toEqual({ year: 2026, month: 11, day: 14 })
    })

    test.each([
        [{ year: 2026, month: 11, day: 14 }, '2026-11-20', 6, 'outubro'],
        [{ year: 2026, month: 11, day: 20 }, '2026-11-20', 0, 'outubro'],
        [{ year: 2026, month: 11, day: 21 }, '2026-12-20', 29, 'novembro'],
        [{ year: 2026, month: 12, day: 25 }, '2027-01-20', 26, 'dezembro']
    ])('DAS a partir de %o vence %s (faltam %i dias, DAS de %s)', (today, due, days, ref) => {
        expect(checker.dasStatus(today)).toEqual({ dueDate: due, daysLeft: days, referenceMonth: ref })
    })

    test('declaração anual: aviso só em abril e maio, prazo 31/05', () => {
        expect(checker.dasnStatus({ year: 2027, month: 4, day: 1 })).toMatchObject({ deadline: '2027-05-31', season: true, daysLeft: 60, referenceYear: 2026 })
        expect(checker.dasnStatus({ year: 2026, month: 11, day: 14 })).toMatchObject({ deadline: '2027-05-31', season: false })
        expect(checker.dasnStatus({ year: 2027, month: 6, day: 1 })).toMatchObject({ deadline: '2028-05-31', season: false })
    })
})

describe('Limite de faturamento é de cada MEI (dono, 14/11)', () => {
    const revenueOf = async () => (await request(app).get('/api/alerts/status')).body

    test('dois MEIs com CNPJ diferente: cada um com o seu limite, sem somar', async () => {
        state.wallets = [
            { id: 5, name: 'Espetinho', cnpj: '33.137.007/0001-09' },
            { id: 6, name: 'Miriam Doces', cnpj: '11.222.333/0001-81' }
        ]
        state.sums = [{ walletId: 5, count: 3, total: 50000 }, { walletId: 6, count: 4, total: 40000 }]
        const body = await revenueOf()
        expect(body.revenue.meis.map(m => [m.name, m.total])).toEqual([['Espetinho', 50000], ['Miriam Doces', 40000]])
        expect(body.revenue.total).toBe(50000) // o mais perto do limite, nunca a soma (90 mil)
        expect(body.triggered.some(t => t.type === 'REVENUE_LIMIT')).toBe(false)
    })

    test('cada MEI que passou do aviso dispara o seu, com o nome dele', async () => {
        state.wallets = [
            { id: 5, name: 'Espetinho', cnpj: '33.137.007/0001-09' },
            { id: 6, name: 'Miriam Doces', cnpj: '11.222.333/0001-81' }
        ]
        state.sums = [{ walletId: 5, count: 3, total: 70000 }, { walletId: 6, count: 4, total: 82000 }]
        const { triggered } = await revenueOf()
        const rev = triggered.filter(t => t.type === 'REVENUE_LIMIT')
        expect(rev).toHaveLength(2)
        expect(rev[0].title).toBe('Faturamento de Miriam Doces passou do limite de 2026')
        expect(rev[1].title).toMatch(/^Faturamento de Espetinho em 86,4% do limite$/)
        expect(new Set(rev.map(t => t.key)).size).toBe(2)
    })

    test('carteiras com o mesmo CNPJ (com ou sem máscara) somam juntas', async () => {
        state.wallets = [
            { id: 5, name: 'Loja (Nubank)', cnpj: '33.137.007/0001-09' },
            { id: 6, name: 'Loja (Caixa)', cnpj: '33137007000109' }
        ]
        state.sums = [{ walletId: 5, count: 1, total: 40000 }, { walletId: 6, count: 1, total: 30000 }]
        const { revenue, triggered } = await revenueOf()
        expect(revenue.meis).toHaveLength(1)
        expect(revenue.meis[0]).toMatchObject({ name: 'Loja (Nubank)', total: 70000, wallets: 2 })
        expect(triggered.find(t => t.type === 'REVENUE_LIMIT').title).toBe('Faturamento do MEI em 86,4% do limite')
    })

    test('carteiras PJ sem CNPJ contam cada uma sozinha', async () => {
        state.wallets = [{ id: 5, name: 'A', cnpj: null }, { id: 6, name: 'B', cnpj: '' }]
        state.sums = [{ walletId: 5, count: 1, total: 50000 }, { walletId: 6, count: 1, total: 50000 }]
        const { revenue, triggered } = await revenueOf()
        expect(revenue.meis).toHaveLength(2)
        expect(triggered.some(t => t.type === 'REVENUE_LIMIT')).toBe(false)
    })

    test('receita antiga sem carteira: com um MEI só, conta nele', async () => {
        state.sums = [{ walletId: 5, count: 1, total: 40000 }, { walletId: null, count: 2, total: 30000 }]
        const { revenue } = await revenueOf()
        expect(revenue.meis).toEqual([expect.objectContaining({ name: 'Loja', total: 70000, unassigned: false })])
    })

    test('receita sem carteira com vários MEIs: aparece à parte e não dispara aviso', async () => {
        state.wallets = [
            { id: 5, name: 'Espetinho', cnpj: '33.137.007/0001-09' },
            { id: 6, name: 'Miriam Doces', cnpj: '11.222.333/0001-81' }
        ]
        state.sums = [{ walletId: 5, count: 1, total: 10000 }, { walletId: null, count: 5, total: 90000 }, { walletId: 999, count: 1, total: 5000 }]
        const { revenue, triggered } = await revenueOf()
        expect(revenue.meis.map(m => [m.key, m.total, m.unassigned])).toEqual([
            ['c33137007000109', 10000, false], ['c11222333000181', 0, false], ['sem', 95000, true]
        ])
        expect(revenue.total).toBe(10000)
        expect(triggered.some(t => t.type === 'REVENUE_LIMIT')).toBe(false)
    })

    test('sem carteira PJ e sem receita: usa a última simulação (um MEI só)', async () => {
        state.wallets = []
        state.sums = []
        state.simulation = { revenue: 6000, revenueType: 'mensal' }
        const { revenue } = await revenueOf()
        expect(revenue).toMatchObject({ source: 'simulacao', total: 72000, monthly: 6000 })
        expect(revenue.meis).toHaveLength(1)
    })
})
