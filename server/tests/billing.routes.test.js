/**
 * Cobrança: troca de plano, cancelamento e proteção contra assinatura dupla.
 *
 * Regras do dono (12/11/2026):
 *  - cancelar: mantém o plano até o fim do período pago, sem nova cobrança;
 *  - trocar para mais caro: libera na hora e cobra a diferença agora;
 *  - trocar para mais barato: troca na hora e a diferença vira crédito.
 * Banco e Stripe são simulados.
 */
process.env.STRIPE_SECRET_KEY = 'sk_test_dummy'
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_dummy'
process.env.STRIPE_PRICE_SILVER = 'price_prata'
process.env.STRIPE_PRICE_GOLD = 'price_ouro'

const mockDb = { query: jest.fn() }
jest.mock('../db', () => ({ db: mockDb, pool: mockDb }))

let mockCurrentUser
jest.mock('../middleware/auth', () => ({
    authMiddleware: (req, res, next) => { req.user = { ...mockCurrentUser }; next() }
}))

const mockStripe = {
    subscriptions: { retrieve: jest.fn(), update: jest.fn(), cancel: jest.fn() },
    checkout: { sessions: { create: jest.fn() } },
    webhooks: { constructEvent: jest.fn() }
}
jest.mock('stripe', () => () => mockStripe)

const request = require('supertest')
const express = require('express')
const stripeRoutes = require('../routes/stripe.routes')
const planRoutes = require('../routes/plan.routes')

const app = express()
app.post('/api/stripe/webhook', express.raw({ type: '*/*' }), stripeRoutes.webhookHandler)
app.use(express.json())
app.use('/api/stripe', stripeRoutes.router)
app.use('/api/plans', planRoutes)

const PLANS = [
    { id: 1, name: 'Gratuito', price: 0, stripePriceId: null },
    { id: 2, name: 'Prata', price: 19.9, stripePriceId: null },
    { id: 3, name: 'Ouro', price: 39.9, stripePriceId: null }
]
const PERIOD_END = 1797000000 // segundos (Unix)

let state
const sub = (overrides = {}) => ({
    id: 'sub_1',
    status: 'active',
    cancel_at_period_end: false,
    metadata: { userId: '42', planId: String(state.user.planId) },
    items: { data: [{ id: 'si_1', price: { id: state.user.planId === 3 ? 'price_ouro' : 'price_prata' }, current_period_end: PERIOD_END }] },
    ...overrides
})

function route(sql, params = []) {
    const q = sql.replace(/\s+/g, ' ').trim()
    if (q.startsWith('SELECT id, name, price, "stripePriceId" FROM plans WHERE id')) {
        return { rows: PLANS.filter(p => p.id === Number(params[0])), rowCount: PLANS.filter(p => p.id === Number(params[0])).length }
    }
    if (q.startsWith('SELECT price FROM plans WHERE id')) return { rows: PLANS.filter(p => p.id === Number(params[0])) }
    if (q.startsWith('SELECT id, name, "stripePriceId" FROM plans WHERE price > 0')) return { rows: PLANS.filter(p => p.price > 0) }
    if (q.startsWith('SELECT id FROM plans WHERE price = 0')) return { rows: [PLANS[0]] }
    if (q.startsWith('SELECT "stripeSubscriptionId", "planId" FROM users')) return { rows: [{ stripeSubscriptionId: state.user.stripeSubscriptionId, planId: state.user.planId }] }
    if (q.startsWith('SELECT "stripeSubscriptionId" FROM users')) return { rows: [{ stripeSubscriptionId: state.user.stripeSubscriptionId }] }
    if (q.startsWith('UPDATE users')) {
        state.updates.push({ sql: q, params })
        return { rowCount: 1, rows: [] }
    }
    return { rows: [], rowCount: 0 }
}

beforeEach(() => {
    jest.clearAllMocks()
    state = { user: { id: 42, planId: 2, stripeSubscriptionId: 'sub_1' }, updates: [] }
    mockCurrentUser = { id: 42, role: 'USER', email: 'ana@teste.com', planId: 2 }
    mockDb.query.mockImplementation(async (sql, params) => route(sql, params))
    mockStripe.subscriptions.retrieve.mockImplementation(async () => sub())
    mockStripe.subscriptions.update.mockImplementation(async (id, data) => sub({ ...data, cancel_at: data.cancel_at_period_end ? PERIOD_END : null }))
    mockStripe.subscriptions.cancel.mockResolvedValue({ id: 'sub_1', status: 'canceled' })
    mockStripe.checkout.sessions.create.mockResolvedValue({ id: 'cs_1', url: 'https://checkout.stripe.test/cs_1' })
})

describe('Trocar de plano (POST /api/stripe/change-plan)', () => {
    test('Prata → Ouro: troca na mesma assinatura, cobra a diferença agora e libera na hora', async () => {
        const res = await request(app).post('/api/stripe/change-plan').send({ planId: 3 })
        expect(res.statusCode).toBe(200)
        expect(res.body).toMatchObject({ changed: true, upgrade: true, planId: 3 })

        const [id, data] = mockStripe.subscriptions.update.mock.calls[0]
        expect(id).toBe('sub_1')
        expect(data.items).toEqual([{ id: 'si_1', price: 'price_ouro' }])
        expect(data.proration_behavior).toBe('always_invoice')
        expect(data.payment_behavior).toBe('error_if_incomplete')
        expect(data.cancel_at_period_end).toBe(false)

        const update = state.updates.find(u => u.sql.includes('"planId" = $1'))
        expect(update.params).toEqual([3, 'price_ouro', 42])
        expect(mockStripe.checkout.sessions.create).not.toHaveBeenCalled()
    })

    test('Ouro → Prata: troca na hora e a diferença vira crédito (sem cobrança agora)', async () => {
        state.user.planId = 3
        const res = await request(app).post('/api/stripe/change-plan').send({ planId: 2 })
        expect(res.statusCode).toBe(200)
        expect(res.body.upgrade).toBe(false)
        const [, data] = mockStripe.subscriptions.update.mock.calls[0]
        expect(data.proration_behavior).toBe('create_prorations')
        expect(data.payment_behavior).toBeUndefined()
        expect(res.body.message).toContain('crédito')
    })

    test('Se a cobrança da diferença falhar, nada muda no plano (402)', async () => {
        mockStripe.subscriptions.update.mockRejectedValueOnce(Object.assign(new Error('declined'), { type: 'StripeCardError', code: 'card_declined' }))
        const res = await request(app).post('/api/stripe/change-plan').send({ planId: 3 })
        expect(res.statusCode).toBe(402)
        expect(state.updates).toHaveLength(0)
    })

    test('Sem assinatura ativa, pede para assinar pelo pagamento (409 NO_SUBSCRIPTION)', async () => {
        state.user.stripeSubscriptionId = null
        const res = await request(app).post('/api/stripe/change-plan').send({ planId: 3 })
        expect(res.statusCode).toBe(409)
        expect(res.body.code).toBe('NO_SUBSCRIPTION')
        expect(mockStripe.subscriptions.update).not.toHaveBeenCalled()
    })

    test('Assinatura já cancelada no Stripe também conta como sem assinatura', async () => {
        mockStripe.subscriptions.retrieve.mockResolvedValueOnce(sub({ status: 'canceled' }))
        const res = await request(app).post('/api/stripe/change-plan').send({ planId: 3 })
        expect(res.statusCode).toBe(409)
    })

    test('Gratuito não é troca de plano, é cancelamento (400)', async () => {
        const res = await request(app).post('/api/stripe/change-plan').send({ planId: 1 })
        expect(res.statusCode).toBe(400)
        expect(mockStripe.subscriptions.update).not.toHaveBeenCalled()
    })

    test('Assinatura marcada para cancelar volta a valer ao trocar de plano', async () => {
        mockStripe.subscriptions.retrieve.mockResolvedValueOnce(sub({ cancel_at_period_end: true }))
        const res = await request(app).post('/api/stripe/change-plan').send({ planId: 2 })
        expect(res.statusCode).toBe(200)
        expect(mockStripe.subscriptions.update.mock.calls[0][1].cancel_at_period_end).toBe(false)
    })
})

describe('Checkout não cria assinatura dupla', () => {
    test('Com assinatura ativa, recusa novo checkout (409 HAS_SUBSCRIPTION)', async () => {
        const res = await request(app).post('/api/stripe/create-checkout-session').send({ planId: 3 })
        expect(res.statusCode).toBe(409)
        expect(res.body.code).toBe('HAS_SUBSCRIPTION')
        expect(mockStripe.checkout.sessions.create).not.toHaveBeenCalled()
    })

    test('Sem assinatura, abre o checkout normalmente', async () => {
        state.user.stripeSubscriptionId = null
        const res = await request(app).post('/api/stripe/create-checkout-session').send({ planId: 3 })
        expect(res.statusCode).toBe(200)
        expect(res.body.url).toContain('checkout.stripe.test')
        expect(mockStripe.checkout.sessions.create.mock.calls[0][0].line_items[0].price).toBe('price_ouro')
    })

    test('Assinatura antiga que não existe mais no Stripe não bloqueia o checkout', async () => {
        mockStripe.subscriptions.retrieve.mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'resource_missing' }))
        const res = await request(app).post('/api/stripe/create-checkout-session').send({ planId: 2 })
        expect(res.statusCode).toBe(200)
    })
})

describe('Cancelar assinatura (POST /api/plans/downgrade)', () => {
    test('Assinatura paga: cancela no Stripe para o fim do período e mantém o plano até lá', async () => {
        const res = await request(app).post('/api/plans/downgrade')
        expect(res.statusCode).toBe(200)
        expect(mockStripe.subscriptions.update).toHaveBeenCalledWith('sub_1', { cancel_at_period_end: true })
        expect(mockStripe.subscriptions.cancel).not.toHaveBeenCalled()

        const update = state.updates[0]
        expect(update.sql).toContain(`"subscriptionStatus" = 'canceling'`)
        expect(update.params[0]).toEqual(new Date(PERIOD_END * 1000))
        expect(update.sql).not.toContain('"planId"') // continua no plano até a data
        expect(res.body.endsNow).toBe(false)
        expect(res.body.message).toContain('não haverá nova cobrança')
    })

    test('Assinatura que nunca foi paga: cancela no Stripe e volta ao gratuito na hora', async () => {
        mockStripe.subscriptions.retrieve.mockResolvedValueOnce(sub({ status: 'incomplete' }))
        const res = await request(app).post('/api/plans/downgrade')
        expect(res.statusCode).toBe(200)
        expect(mockStripe.subscriptions.cancel).toHaveBeenCalledWith('sub_1')
        expect(state.updates[0].params).toEqual([1, 42])
        expect(res.body.endsNow).toBe(true)
    })

    test('Sem assinatura no Stripe (plano dado pelo admin): volta ao gratuito na hora', async () => {
        state.user.stripeSubscriptionId = null
        const res = await request(app).post('/api/plans/downgrade')
        expect(res.statusCode).toBe(200)
        expect(mockStripe.subscriptions.retrieve).not.toHaveBeenCalled()
        expect(state.updates[0].params).toEqual([1, 42])
    })

    test('Se o Stripe falhar, nada muda no banco', async () => {
        const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
        mockStripe.subscriptions.update.mockRejectedValueOnce(new Error('Stripe fora do ar'))
        const res = await request(app).post('/api/plans/downgrade')
        errSpy.mockRestore()
        expect(res.statusCode).toBe(500)
        expect(state.updates).toHaveLength(0)
    })
})

describe('Webhook customer.subscription.updated', () => {
    const sendEvent = async (object) => {
        mockStripe.webhooks.constructEvent.mockReturnValue({
            type: 'customer.subscription.updated',
            created: Math.floor(Date.now() / 1000),
            data: { object }
        })
        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
        try {
            return await request(app).post('/api/stripe/webhook').set('stripe-signature', 't=1,v1=x').send('{}')
        } finally {
            logSpy.mockRestore()
        }
    }

    test('Troca feita no Stripe atualiza o plano pelo preço', async () => {
        const res = await sendEvent(sub({ items: { data: [{ id: 'si_1', price: { id: 'price_ouro' } }] } }))
        expect(res.statusCode).toBe(200)
        expect(state.updates[0].params).toEqual(['sub_1', 'active', null, 3, 'price_ouro'])
    })

    test('Cancelamento para o fim do período fica como "canceling" com a data final', async () => {
        await sendEvent(sub({ cancel_at_period_end: true, cancel_at: PERIOD_END }))
        const [subId, status, endsAt, planId] = state.updates[0].params
        expect(subId).toBe('sub_1')
        expect(status).toBe('canceling')
        expect(endsAt).toEqual(new Date(PERIOD_END * 1000))
        expect(planId).toBe(2)
    })

    test('Preço desconhecido não mexe no plano', async () => {
        await sendEvent(sub({ items: { data: [{ id: 'si_1', price: { id: 'price_desconhecido' } }] } }))
        const params = state.updates[0].params
        expect(params[3]).toBeNull()
        expect(params[4]).toBeNull()
    })
})
