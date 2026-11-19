/**
 * Teste grátis para contas novas (utils/trial.js, cadastro, /api/plans/trial e
 * Admin > Funcionalidades). Antes: trial_enabled e trial_days eram gravados mas
 * ninguém lia; o cadastro nunca começava um teste.
 */
process.env.JWT_SECRET = 'test-secret'
const mockDb = { query: jest.fn() }
jest.mock('../db', () => ({ db: mockDb, pool: mockDb }))
jest.mock('../utils/email', () => ({ sendPasswordResetEmail: jest.fn(), sendTrialConfirmEmail: jest.fn(async () => ({ sent: true })) }))
jest.mock('../utils/auditLogger', () => ({ log: jest.fn().mockResolvedValue() }))
jest.mock('../utils/encryption', () => ({ encrypt: (v) => `enc(${v})` }))
jest.mock('../middleware/auth', () => {
    const real = jest.requireActual('../middleware/auth')
    return {
        ...real,
        authMiddleware: (req, res, next) => { req.user = { id: 1, role: 'ADMIN' }; next() },
        adminMiddleware: (req, res, next) => next()
    }
})

const request = require('supertest')
const express = require('express')
const { getTrialOffer } = require('../utils/trial')

const norm = (sql) => sql.replace(/\s+/g, ' ').trim()
const PLANS = [
    { id: 1, name: 'Gratuito', price: 0, isActive: 1 },
    { id: 2, name: 'Prata', price: 19.9, isActive: 1 },
    { id: 3, name: 'Ouro', price: 39.9, isActive: 1 },
    { id: 4, name: 'Antigo', price: 99, isActive: 0 }
]
let state, sql

const paidActive = () => PLANS.filter(p => p.isActive === 1 && p.price > 0).sort((a, b) => b.price - a.price)

beforeEach(() => {
    jest.clearAllMocks()
    sql = []
    state = { settings: { trial_enabled: 'true', trial_days: '7' }, claimed: new Set(), userPlan: 1, userStatus: 'active', expires: null }
    mockDb.query.mockImplementation(async (rawSql, params = []) => {
        const q = norm(rawSql)
        sql.push({ q, params })
        if (q.startsWith('SELECT key, value FROM system_settings WHERE key = ANY')) {
            return { rows: params[0].filter(k => state.settings[k] != null).map(k => ({ key: k, value: state.settings[k] })) }
        }
        if (q.startsWith('SELECT id, name, price FROM plans WHERE "isActive" = 1 AND price > 0')) return { rows: paidActive() }
        if (q.startsWith('SELECT id FROM plans WHERE id = $1 AND "isActive" = 1 AND price > 0')) return { rows: paidActive().filter(p => p.id === params[0]) }
        if (q.startsWith('WITH claim AS')) {
            if (state.claimed.has(params[1])) return { rows: [] }
            state.claimed.add(params[1])
            state.userPlan = params[2]; state.userStatus = 'trialing'
            state.expires = new Date(Date.now() + params[3] * 86400000)
            return { rows: [{ planExpiresAt: state.expires }] }
        }
        // Cadastro
        if (q.startsWith('SELECT id FROM users WHERE LOWER(email) = $1')) return { rows: [] }
        if (q.startsWith('SELECT id, name, price FROM plans WHERE price = 0')) return { rows: [PLANS[0]] }
        if (q.startsWith('SELECT id, name, price FROM plans WHERE id = $1')) return { rows: PLANS.filter(p => p.id === params[0]) }
        if (q.startsWith('INSERT INTO users')) { state.userPlan = params[3]; state.userStatus = params[4]; return { rows: [{ id: 50 }] } }
        if (q.includes('FROM users u LEFT JOIN plans p ON u."planId" = p.id WHERE u.id = $1')) {
            const plan = PLANS.find(p => p.id === state.userPlan)
            return { rows: [{ id: 50, name: 'Novo', email: 'novo@teste.com', role: 'USER', planId: plan.id, subscriptionStatus: state.userStatus, sessionVersion: 1, planName: plan.name, planFeatures: '{"whatsapp":true}', planExpiresAt: state.expires }] }
        }
        if (q.startsWith('SELECT "sessionVersion" FROM users')) return { rows: [{ sessionVersion: 1 }] }
        if (q.startsWith('SELECT value FROM system_settings WHERE key = $1')) return { rows: [] }
        if (q.startsWith('SELECT value, "isEncrypted" FROM system_settings')) return { rows: [] }
        return { rows: [], rowCount: 1 }
    })
    global.fetch = jest.fn(async () => ({ ok: true, text: async () => 'AAAA:1' }))
    jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => console.error.mockRestore())

const makeApp = () => {
    const app = express()
    app.use(express.json())
    jest.isolateModules(() => {
        app.use('/api/auth', require('../routes/auth.routes'))
        app.use('/api/plans', require('../routes/plan.routes'))
        app.use('/api/settings', require('../routes/settings.routes'))
    })
    return app
}
const register = (app, body = {}) => request(app).post('/api/auth/register')
    .send({ acceptedTermsVersion: '2026-11-15', name: 'Novo Cliente', email: 'Novo@Teste.com', password: 'senha-boa-123', ...body })

describe('Oferta de teste grátis', () => {
    test('ligada: plano pago mais caro e os dias', async () => {
        expect(await getTrialOffer(mockDb)).toEqual({ enabled: true, days: 7, planId: 3, planName: 'Ouro' })
    })
    test('plano escolhido no admin vale se for pago e ativo', async () => {
        state.settings.trial_plan_id = '2'
        expect((await getTrialOffer(mockDb)).planId).toBe(2)
    })
    test.each([['1'], ['4'], ['abc'], ['999']])('plano %s (gratuito, inativo ou inexistente): usa o mais caro ativo', async (id) => {
        state.settings.trial_plan_id = id
        expect((await getTrialOffer(mockDb)).planId).toBe(3)
    })
    test.each([
        [{ trial_enabled: 'false' }],
        [{ trial_enabled: 'TRUE' }],
        [{ trial_days: '0' }],
        [{ trial_days: '91' }],
        [{ trial_days: '2.5' }],
        [{ trial_days: 'sete' }]
    ])('%j: desligada', async (change) => {
        Object.assign(state.settings, change)
        expect((await getTrialOffer(mockDb)).enabled).toBe(false)
    })
    test('GET /api/plans/trial é público e mostra só a oferta', async () => {
        const res = await request(makeApp()).get('/api/plans/trial')
        expect(res.statusCode).toBe(200)
        expect(res.body).toEqual({ enabled: true, days: 7, planId: 3, planName: 'Ouro' })
        state.settings.trial_enabled = 'false'
        expect((await request(makeApp()).get('/api/plans/trial')).body).toEqual({ enabled: false })
    })
})

describe('Cadastro com teste grátis', () => {
    // O teste agora só começa com o e-mail confirmado: tests/trial.confirm.test.js
    test('cadastro nunca começa o teste direto (antes: começava sem confirmar o e-mail)', async () => {
        const res = await register(makeApp())
        expect(res.statusCode).toBe(201)
        expect(res.body.user).toMatchObject({ planId: 1, subscriptionStatus: 'active', isInTrial: false, planExpiresAt: null })
        expect(sql.some(s => /^UPDATE users SET "planId"/.test(s.q))).toBe(false)
    })

    test('quem escolhe plano pago vai para o pagamento, sem teste', async () => {
        const res = await register(makeApp(), { planId: 2 })
        expect(res.body.user).toMatchObject({ planId: 2, subscriptionStatus: 'pending_payment', requiresPayment: true, isInTrial: false })
        expect(res.body.trial).toBeNull()
    })

    test('teste desligado: Gratuito, como antes', async () => {
        state.settings.trial_enabled = 'false'
        const res = await register(makeApp())
        expect(res.body.user).toMatchObject({ planId: 1, subscriptionStatus: 'active', isInTrial: false })
        expect(res.body.trial).toBeNull()
    })

    test('erro ao oferecer o teste não impede o cadastro', async () => {
        const base = mockDb.query.getMockImplementation()
        mockDb.query.mockImplementation(async (raw, params) => {
            if (norm(raw).startsWith('SELECT key, value FROM system_settings')) throw new Error('relation "system_settings" does not exist')
            return base(raw, params)
        })
        const res = await register(makeApp())
        expect(res.statusCode).toBe(201)
        expect(res.body.user).toMatchObject({ planId: 1, isInTrial: false })
        expect(res.body.trial).toBeNull()
    })
})

describe('Admin: configuração do teste', () => {
    const put = (key, value) => request(makeApp()).put('/api/settings').send({ key, value })
    test.each([['7', '7'], [30, '30'], ['0', '0'], [' 14 ', '14']])('dias %j: grava %s', async (value, stored) => {
        const res = await put('trial_days', value)
        expect(res.statusCode).toBe(200)
        expect(sql.find(s => s.q.startsWith('INSERT INTO system_settings')).params[1]).toBe(stored)
    })
    test.each([['91'], ['-1'], ['3.5'], ['abc'], [''], [true]])('dias %j: 400', async (value) => {
        expect((await put('trial_days', value)).statusCode).toBe(400)
        expect(sql.some(s => s.q.startsWith('INSERT INTO system_settings'))).toBe(false)
    })
    test('plano do teste: pago e ativo grava; vazio volta ao automático', async () => {
        expect((await put('trial_plan_id', '2')).statusCode).toBe(200)
        expect((await put('trial_plan_id', '')).statusCode).toBe(200)
        const stored = sql.filter(s => s.q.startsWith('INSERT INTO system_settings')).map(s => s.params[1])
        expect(stored).toEqual(['2', ''])
    })
    test.each([['1'], ['4'], ['abc'], ['999']])('plano do teste %s (gratuito, inativo, inválido): 400', async (value) => {
        expect((await put('trial_plan_id', value)).statusCode).toBe(400)
    })
})
