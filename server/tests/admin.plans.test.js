/**
 * Admin > Planos: o preço que o site mostra tem de ser o que o Stripe cobra,
 * plano pago precisa do código do preço, o Gratuito não some nem vira pago,
 * dados conferidos e recursos só da lista conhecida.
 * (Também conferido num Postgres 16 de verdade.)
 */
const mockDb = { query: jest.fn() }
const mockClient = { query: jest.fn(), release: jest.fn() }
jest.mock('../db', () => ({ db: mockDb, pool: { query: jest.fn(), connect: jest.fn(async () => mockClient) } }))
jest.mock('../middleware/auth', () => ({
    authMiddleware: (req, res, next) => { req.user = { id: 1, role: 'ADMIN' }; next() },
    adminMiddleware: (req, res, next) => next()
}))
jest.mock('../utils/auditLogger', () => ({ log: jest.fn(async () => {}) }))
jest.mock('../utils/userDeletion', () => ({ deleteUserData: jest.fn(), cancelStripeSubscriptionIfActive: jest.fn() }))
const PRICES = { price_prata1990: [1990, 'month'], price_prata2490: [2490, 'month'], price_anual12345: [19900, 'year'] }
const mockStripe = { prices: { retrieve: jest.fn(async (id) => {
    if (!PRICES[id]) { const e = new Error('no'); e.code = 'resource_missing'; throw e }
    return { id, unit_amount: PRICES[id][0], currency: 'brl', active: true, recurring: { interval: PRICES[id][1], interval_count: 1 } }
}) } }
jest.mock('../utils/billing', () => {
    const real = jest.requireActual('../utils/billing')
    return { ...real, getStripe: () => mockStripe }
})

const express = require('express')
const request = require('supertest')
const app = express()
app.use(express.json())
app.use('/api/admin', require('../routes/admin.routes'))

const norm = (sql) => sql.replace(/\s+/g, ' ').trim()
let plans, paying, writes
beforeEach(() => {
    jest.clearAllMocks()
    plans = {
        1: { id: 1, name: 'Gratuito', price: 0, isActive: 1, features: '{"alertas":true}', stripePriceId: null },
        2: { id: 2, name: 'Prata', price: 19.9, isActive: 1, features: '{"alertas":true,"pdf":true,"recurso_antigo":true}', stripePriceId: 'price_prata1990' },
    }
    paying = 0
    writes = []
    mockClient.query.mockImplementation(async (raw, params = []) => {
        const q = norm(raw)
        if (q.startsWith('SELECT * FROM plans WHERE id = $1 FOR UPDATE')) return { rows: plans[params[0]] ? [plans[params[0]]] : [] }
        if (q.startsWith('SELECT id, name, price FROM plans WHERE id <> $1')) return { rows: Object.values(plans).filter(p => p.id !== params[0]) }
        if (q.includes('FROM users WHERE "planId" = $1')) return { rows: [{ n: paying }] }
        if (q.startsWith('UPDATE plans') || q.startsWith('INSERT INTO plans')) { writes.push({ q, params }); return { rows: [{ id: 9 }] } }
        return { rows: [] }
    })
    jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => console.error.mockRestore())

test('mudar só o preço no site, sem mudar no Stripe, é recusado (o cliente pagaria outro valor)', async () => {
    const res = await request(app).put('/api/admin/plans/2').send({ price: 24.9 })
    expect(res.status).toBe(409)
    expect(res.body.message).toMatch(/R\$ 19,90/)
    expect(writes).toHaveLength(0)
})

test('preço novo com o código do preço novo do Stripe: grava os dois', async () => {
    const res = await request(app).put('/api/admin/plans/2').send({ price: 24.9, stripePriceId: 'price_prata2490' })
    expect(res.status).toBe(200)
    expect(writes[0].params.slice(1, 2)).toEqual([24.9])
    expect(writes[0].params[4]).toBe('price_prata2490')
})

test('preço do Stripe que não é mensal é recusado', async () => {
    const res = await request(app).put('/api/admin/plans/2').send({ price: 199, stripePriceId: 'price_anual12345' })
    expect(res.status).toBe(409)
    expect(res.body.message).toMatch(/mensal/)
})

test('plano pago novo sem código do Stripe é recusado', async () => {
    const res = await request(app).post('/api/admin/plans').send({ name: 'Bronze', price: 9.9 })
    expect(res.status).toBe(409)
    expect(res.body.field).toBe('stripePriceId')
})

test('o Gratuito não é desativado, não vira pago e não ganha um segundo', async () => {
    expect((await request(app).put('/api/admin/plans/1').send({ isActive: false })).status).toBe(409)
    expect((await request(app).put('/api/admin/plans/1').send({ price: 5 })).status).toBe(409)
    expect((await request(app).post('/api/admin/plans').send({ name: 'Grátis 2', price: 0 })).status).toBe(409)
    expect(writes).toHaveLength(0)
})

test('plano com assinaturas pagando não vira gratuito', async () => {
    delete plans[1]
    paying = 3
    const res = await request(app).put('/api/admin/plans/2').send({ price: 0 })
    expect(res.status).toBe(409)
})

test.each([
    [{ name: '' }], [{ name: 'x'.repeat(31) }], [{ price: -1 }], [{ price: 'abc' }], [{ isActive: 'sim' }],
    [{ features: { admin_total: true } }], [{ features: { pdf: 'sim' } }], [{ stripePriceId: 'prod_123456' }],
])('dado ruim %j: 400, sem gravar', async (body) => {
    const res = await request(app).put('/api/admin/plans/2').send(body)
    expect(res.status).toBe(400)
    expect(writes).toHaveLength(0)
})

test('nome repetido (sem diferença de maiúsculas) dá 409', async () => {
    const res = await request(app).put('/api/admin/plans/2').send({ name: 'GRATUITO' })
    expect(res.status).toBe(409)
})

test('edição parcial mantém o resto, inclusive recursos que o painel não conhece', async () => {
    const res = await request(app).put('/api/admin/plans/2').send({ features: { whatsapp: true } })
    expect(res.status).toBe(200)
    expect(JSON.parse(writes[0].params[2])).toEqual({ alertas: true, pdf: true, recurso_antigo: true, whatsapp: true })
    expect(writes[0].params[0]).toBe('Prata')
})

test('Funcionalidades manda o plano inteiro de volta: recurso antigo igual passa e o Stripe não é consultado', async () => {
    plans[2].stripePriceId = 'price_naoexiste99'   // preço antigo fora do ar no Stripe não trava ligar um recurso
    const res = await request(app).put('/api/admin/plans/2').send({
        id: 2, name: 'Prata', price: 19.9, isActive: true, accounts: 26, stripe: { status: 'ok' },
        features: { alertas: true, pdf: true, recurso_antigo: true, whatsapp: true },
    })
    expect(res.status).toBe(200)
    expect(mockStripe.prices.retrieve).not.toHaveBeenCalled()
})

test('recurso fora da lista que não estava no plano é recusado', async () => {
    const res = await request(app).put('/api/admin/plans/2').send({ features: { recurso_antigo: false } })
    expect(res.status).toBe(400)
})

test('id que não é número dá 404', async () => {
    expect((await request(app).put('/api/admin/plans/2x').send({ isActive: true })).status).toBe(404)
})
