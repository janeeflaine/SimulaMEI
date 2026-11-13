/**
 * Segurança da conta e da cobrança:
 *  - token de conta bloqueada ou excluída para de valer;
 *  - cadastro com plano pago ainda sem pagamento só tem o acesso do Gratuito;
 *  - o "pagamento de teste" (Pix falso) não existe em produção;
 *  - confirmar checkout só vale para a própria sessão e com assinatura valendo;
 *  - falha de pagamento no Stripe acha a assinatura certa e só rebaixa quando ela acabou.
 * Banco e Stripe são simulados.
 */
process.env.JWT_SECRET = 'test-secret'
process.env.STRIPE_SECRET_KEY = 'sk_test_dummy'
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_dummy'
process.env.STRIPE_PRICE_SILVER = 'price_prata'
process.env.STRIPE_PRICE_GOLD = 'price_ouro'

const mockDb = { query: jest.fn() }
jest.mock('../db', () => ({ db: mockDb, pool: mockDb }))
jest.mock('../utils/auditLogger', () => ({ log: jest.fn().mockResolvedValue() }))
jest.mock('../utils/email', () => ({ sendPasswordResetEmail: jest.fn() }))

const mockStripe = {
    subscriptions: { retrieve: jest.fn(), update: jest.fn(), cancel: jest.fn() },
    checkout: { sessions: { create: jest.fn(), retrieve: jest.fn() } },
    invoices: { createPreview: jest.fn() },
    webhooks: { constructEvent: jest.fn() }
}
jest.mock('stripe', () => () => mockStripe)

const express = require('express')
const request = require('supertest')
const { generateToken } = require('../middleware/auth')

const app = express()
app.post('/api/stripe/webhook', express.raw({ type: '*/*' }), require('../routes/stripe.routes').webhookHandler)
app.use(express.json())
app.use('/api/auth', require('../routes/auth.routes'))
app.use('/api/payments', require('../routes/payment.routes'))
app.use('/api/stripe', require('../routes/stripe.routes').router)
app.use('/api/finance', require('../routes/finance.routes'))

const PLANS = [
    { id: 1, name: 'Gratuito', price: 0, features: { contas_pagar: false } },
    { id: 2, name: 'Prata', price: 19.9, features: { contas_pagar: true } },
    { id: 3, name: 'Ouro', price: 39.9, features: { contas_pagar: true } }
]

let dbUser
let updates
let payments

function route(sql, params = []) {
    const q = sql.replace(/\s+/g, ' ').trim()
    if (q.startsWith('SELECT u.*, p.name as "planName", p.features as "planFeatures" FROM users u')) {
        if (!dbUser) return { rows: [] }
        const plan = PLANS.find(p => p.id === dbUser.planId)
        return { rows: [{ ...dbUser, planName: plan?.name, planFeatures: plan?.features }] }
    }
    if (q.startsWith('SELECT id, name, features FROM plans WHERE price = 0')) return { rows: [PLANS[0]] }
    if (q.startsWith('SELECT id FROM plans WHERE price = 0')) return { rows: [PLANS[0]] }
    if (q.startsWith('SELECT name FROM plans WHERE id')) return { rows: PLANS.filter(p => p.id === Number(params[0])) }
    if (q.startsWith('SELECT * FROM plans WHERE id')) return { rows: PLANS.filter(p => p.id === Number(params[0])) }
    if (q.startsWith("SELECT value, \"isEncrypted\" FROM system_settings WHERE key = 'MERCADOPAGO_ACCESS_TOKEN'")) return { rows: [] }
    if (q.startsWith('SELECT * FROM payments WHERE id = $1 AND "userId" = $2')) {
        return { rows: payments.filter(p => p.id === Number(params[0]) && p.userId === params[1] && p.status === 'pending') }
    }
    if (/^(INSERT|UPDATE|DELETE)/.test(q)) {
        updates.push({ sql: q, params })
        return { rows: [{ id: 1 }], rowCount: 1 }
    }
    return { rows: [], rowCount: 0 }
}

const tokenFor = (id = 42) => `Bearer ${generateToken({ id, email: 'ana@teste.com', role: 'USER', name: 'Ana', sessionVersion: 1 })}`

let logSpy
let errSpy
let warnSpy
beforeEach(() => {
    jest.clearAllMocks()
    updates = []
    payments = [{ id: 8, userId: 42, status: 'pending', externalId: 'mock_1', planId: 3 }]
    dbUser = { id: 42, name: 'Ana', email: 'ana@teste.com', role: 'USER', planId: 2, subscriptionStatus: 'active', sessionVersion: 1, isBlocked: 0, deletedAt: null, stripeSubscriptionId: 'sub_1' }
    mockDb.query.mockImplementation(async (sql, params) => route(sql, params))
    delete process.env.ALLOW_MOCK_PAYMENTS
    delete process.env.MERCADOPAGO_ACCESS_TOKEN
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
    logSpy.mockRestore()
    errSpy.mockRestore()
    warnSpy.mockRestore()
})

describe('Token de conta bloqueada ou excluída', () => {
    test('conta bloqueada pelo admin perde o acesso na hora', async () => {
        dbUser.isBlocked = 1
        const res = await request(app).get('/api/auth/me').set('Authorization', tokenFor())
        expect(res.status).toBe(403)
        expect(res.body.code).toBe('ACCOUNT_BLOCKED')
    })

    test('conta excluída perde o acesso na hora', async () => {
        dbUser.deletedAt = new Date().toISOString()
        const res = await request(app).get('/api/auth/me').set('Authorization', tokenFor())
        expect(res.status).toBe(401)
    })

    test('conta normal continua entrando', async () => {
        const res = await request(app).get('/api/auth/me').set('Authorization', tokenFor())
        expect(res.status).toBe(200)
        expect(res.body.planId).toBe(2)
    })
})

describe('Cadastro com plano pago ainda sem pagamento', () => {
    beforeEach(() => {
        dbUser.planId = 3
        dbUser.subscriptionStatus = 'pending_payment'
        dbUser.stripeSubscriptionId = null
    })

    test('o servidor libera só o que o Gratuito libera', async () => {
        const open = await request(app).get('/api/finance/transactions/due-today').set('Authorization', tokenFor())
        expect(open.status).toBe(200) // rota aberta a todos os planos
        const paid = await request(app).post('/api/finance/categories').set('Authorization', tokenFor())
            .send({ name: 'Viagens', type: 'DESPESA' })
        expect(paid.status).toBe(403) // categorias próprias: Prata em diante
        expect(updates).toHaveLength(0)
    })

    test('/me mostra o plano escolhido (para cobrar) com os recursos do Gratuito', async () => {
        const res = await request(app).get('/api/auth/me').set('Authorization', tokenFor())
        expect(res.status).toBe(200)
        expect(res.body.planId).toBe(3)
        expect(res.body.plan).toBe('Ouro')
        expect(res.body.subscriptionStatus).toBe('pending_payment')
        expect(res.body.planFeatures).toEqual(PLANS[0].features)
    })
})

describe('Pagamento de teste (Pix falso)', () => {
    test('não existe em produção nem sem a variável ALLOW_MOCK_PAYMENTS', async () => {
        const res = await request(app).post('/api/payments/8/mock-pay').set('Authorization', tokenFor())
        expect(res.status).toBe(404)
        expect(updates).toHaveLength(0)
    })

    test('criar pagamento sem Mercado Pago configurado não cria Pix falso', async () => {
        const res = await request(app).post('/api/payments/create').set('Authorization', tokenFor()).send({ planId: 3 })
        expect(res.status).toBe(503)
        expect(updates).toHaveLength(0)
    })

    test('em desenvolvimento, só o dono do pagamento consegue usar', async () => {
        process.env.ALLOW_MOCK_PAYMENTS = 'true'
        dbUser.id = 7
        const other = await request(app).post('/api/payments/8/mock-pay').set('Authorization', tokenFor(7))
        expect(other.status).toBe(404)
        expect(updates).toHaveLength(0)

        dbUser.id = 42
        const own = await request(app).post('/api/payments/8/mock-pay').set('Authorization', tokenFor(42))
        expect(own.status).toBe(200)
    })
})

describe('Confirmar checkout (GET /api/stripe/verify-session)', () => {
    const session = (overrides = {}) => ({
        id: 'cs_1', mode: 'subscription', status: 'complete', payment_status: 'paid',
        client_reference_id: '42', customer: 'cus_1', subscription: 'sub_new',
        metadata: { userId: '42', planId: '3' }, ...overrides
    })

    test('sessão de outra pessoa não ativa nada', async () => {
        mockStripe.checkout.sessions.retrieve.mockResolvedValue(session({ client_reference_id: '7', metadata: { userId: '7', planId: '3' } }))
        const res = await request(app).get('/api/stripe/verify-session?session_id=cs_1').set('Authorization', tokenFor())
        expect(res.status).toBe(404)
        expect(updates).toHaveLength(0)
    })

    test('link de pagamento antigo, com a assinatura já cancelada, não reativa o plano', async () => {
        mockStripe.checkout.sessions.retrieve.mockResolvedValue(session())
        mockStripe.subscriptions.retrieve.mockResolvedValue({ id: 'sub_new', status: 'canceled' })
        const res = await request(app).get('/api/stripe/verify-session?session_id=cs_1').set('Authorization', tokenFor())
        expect(res.status).toBe(200)
        expect(res.body.verified).toBe(false)
        expect(updates).toHaveLength(0)
    })

    test('boleto ainda não pago não ativa o plano', async () => {
        mockStripe.checkout.sessions.retrieve.mockResolvedValue(session({ payment_status: 'unpaid' }))
        mockStripe.subscriptions.retrieve.mockResolvedValue({ id: 'sub_new', status: 'incomplete' })
        const res = await request(app).get('/api/stripe/verify-session?session_id=cs_1').set('Authorization', tokenFor())
        expect(res.body.verified).toBe(false)
        expect(updates).toHaveLength(0)
    })

    test('pagamento da própria pessoa, com assinatura valendo, ativa o plano', async () => {
        mockStripe.checkout.sessions.retrieve.mockResolvedValue(session())
        mockStripe.subscriptions.retrieve.mockResolvedValue({ id: 'sub_new', status: 'active' })
        const res = await request(app).get('/api/stripe/verify-session?session_id=cs_1').set('Authorization', tokenFor())
        expect(res.body.verified).toBe(true)
        expect(updates[0].params).toEqual(['cus_1', 'sub_new', '3', 42])
    })
})

describe('Webhook do Stripe: falha de pagamento', () => {
    const send = (type, object) => {
        mockStripe.webhooks.constructEvent.mockReturnValue({ type, created: Math.floor(Date.now() / 1000), data: { object } })
        return request(app).post('/api/stripe/webhook').set('stripe-signature', 't=1,v1=x').send('{}')
    }

    test('fatura recusada usa o id da assinatura, não o da fatura', async () => {
        mockStripe.subscriptions.retrieve.mockResolvedValue({ id: 'sub_1', status: 'unpaid' })
        const res = await send('invoice.payment_failed', { id: 'in_123', subscription: 'sub_1' })
        expect(res.status).toBe(200)
        expect(mockStripe.subscriptions.retrieve).toHaveBeenCalledWith('sub_1')
        expect(updates[0].params).toEqual([1, 'sub_1'])
    })

    test('versão nova da API (assinatura dentro de parent) também funciona', async () => {
        mockStripe.subscriptions.retrieve.mockResolvedValue({ id: 'sub_1', status: 'canceled' })
        await send('invoice.payment_failed', { id: 'in_123', parent: { subscription_details: { subscription: 'sub_1' } } })
        expect(updates[0].params).toEqual([1, 'sub_1'])
    })

    test('enquanto o Stripe tenta cobrar de novo (past_due), o plano continua', async () => {
        mockStripe.subscriptions.retrieve.mockResolvedValue({ id: 'sub_1', status: 'past_due' })
        await send('invoice.payment_failed', { id: 'in_123', subscription: 'sub_1' })
        expect(updates).toHaveLength(0)
    })

    test('troca de plano recusada (assinatura segue ativa) não rebaixa', async () => {
        mockStripe.subscriptions.retrieve.mockResolvedValue({ id: 'sub_1', status: 'active' })
        await send('invoice.payment_failed', { id: 'in_456', subscription: 'sub_1' })
        expect(updates).toHaveLength(0)
    })

    test('assinatura que virou "unpaid" rebaixa para o Gratuito', async () => {
        await send('customer.subscription.updated', { id: 'sub_1', status: 'unpaid', items: { data: [] } })
        expect(updates[0].sql).toMatch(/"subscriptionStatus" = 'expired'/)
        expect(updates[0].params).toEqual([1, 'sub_1'])
    })

    test('assinatura cancelada rebaixa para o Gratuito', async () => {
        await send('customer.subscription.deleted', { id: 'sub_1', status: 'canceled' })
        expect(updates[0].params).toEqual([1, 'sub_1'])
    })
})
