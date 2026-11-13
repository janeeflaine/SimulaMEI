/**
 * Segurança: ninguém grava nem lê dados de outra conta mandando o id de uma
 * carteira, categoria ou cartão que não é seu. Também cobre valores inválidos
 * e o limite de carteiras ao trocar o tipo (PF/PJ).
 * Usa o middleware de verdade (walletSecurity) com o banco simulado.
 */

const mockDb = { query: jest.fn() }
jest.mock('../db', () => ({ db: mockDb, pool: mockDb }))

let mockCurrentUser
jest.mock('../middleware/auth', () => ({
    authMiddleware: (req, res, next) => { req.user = { ...mockCurrentUser }; next() }
}))

jest.mock('../middleware/planGuard', () => ({
    featureGuard: () => (req, res, next) => next()
}))

const express = require('express')
const request = require('supertest')

const app = express()
app.use(express.json())
app.use('/api/finance', require('../routes/finance.routes'))
app.use('/api/finance/invoices', require('../routes/invoice.routes'))

// Usuário 1 é quem está logado; tudo com dono 2 é de outra pessoa
const DATA = {
    business_units: [
        { id: 1, ownerId: 1, account_type: 'PF' },
        { id: 2, ownerId: 1, account_type: 'PJ' },
        { id: 9, ownerId: 2, account_type: 'PJ' }
    ],
    finance_categories: [{ id: 1, userId: 1 }, { id: 9, userId: 2 }],
    credit_cards: [{ id: 1, userId: 1 }, { id: 9, userId: 2 }],
    card_invoices: [{ id: 5, userId: 1 }],
    invoice_items: [{ id: 7, userId: 1, invoiceId: 5 }]
}

let writes
let settings

function route(sql, params = []) {
    const q = sql.replace(/\s+/g, ' ').trim()

    if (q.startsWith('SELECT id FROM business_units WHERE "ownerId" = $1 AND id = ANY')) {
        const ids = params[1]
        return { rows: DATA.business_units.filter(b => b.ownerId === params[0] && ids.includes(b.id)).map(b => ({ id: b.id })) }
    }
    const ref = q.match(/^SELECT 1 FROM (finance_categories|credit_cards) WHERE id = \$1 AND "userId" = \$2/)
    if (ref) {
        return { rows: DATA[ref[1]].filter(r => r.id === params[0] && r.userId === params[1]).map(() => ({ '?column?': 1 })) }
    }
    if (q.startsWith('SELECT value FROM system_settings')) {
        const value = settings[params[0]]
        return { rows: value === undefined ? [] : [{ value }] }
    }
    if (q.startsWith('SELECT account_type FROM business_units WHERE id = $1 AND "ownerId" = $2')) {
        return { rows: DATA.business_units.filter(b => b.id === Number(params[0]) && b.ownerId === params[1]) }
    }
    if (q.startsWith('SELECT COUNT(*) as count FROM business_units WHERE "ownerId" = $1 AND account_type = $2')) {
        return { rows: [{ count: String(DATA.business_units.filter(b => b.ownerId === params[0] && b.account_type === params[1]).length) }] }
    }
    if (q.startsWith('SELECT COUNT(*) as count FROM finance_transactions')) return { rows: [{ count: '0' }] }
    if (q.startsWith('SELECT COUNT(*), COALESCE')) return { rows: [{ count: '0', receitas: 0, despesas: 0, pendentes: 0 }] }
    if (q.startsWith('SELECT id FROM card_invoices WHERE id = $1 AND "userId" = $2') || q.startsWith('SELECT * FROM card_invoices WHERE id = $1 AND "userId" = $2')) {
        return { rows: DATA.card_invoices.filter(i => i.id === Number(params[0]) && i.userId === params[1]) }
    }
    if (q.startsWith('SELECT * FROM invoice_items WHERE id = $1 AND "userId" = $2')) {
        return { rows: DATA.invoice_items.filter(i => i.id === Number(params[0]) && i.userId === params[1]) }
    }
    if (/^(INSERT|UPDATE|DELETE)/.test(q)) {
        writes.push({ sql: q, params })
        return { rows: [{ id: 100 }], rowCount: 1 }
    }
    return { rows: [], rowCount: 0 }
}

beforeEach(() => {
    jest.clearAllMocks()
    writes = []
    settings = {}
    mockCurrentUser = { id: 1, role: 'USER', planId: 2, isInTrial: false }
    mockDb.query.mockImplementation(async (sql, params) => route(sql, params))
    jest.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
    console.warn.mockRestore()
})

describe('Confirmar pagamento (Contas a pagar)', () => {
    test('recusa carteira de outra pessoa e não grava nada', async () => {
        const res = await request(app).patch('/api/finance/transactions/3/confirm').send({ business_unit_id: 9 })
        expect(res.status).toBe(403)
        expect(writes).toHaveLength(0)
    })

    test('aceita a própria carteira', async () => {
        const res = await request(app).patch('/api/finance/transactions/3/confirm').send({ business_unit_id: 2 })
        expect(res.status).toBe(200)
        expect(writes[0].sql).toMatch(/^UPDATE finance_transactions SET status = 'PAID'/)
        expect(writes[0].params).toEqual(['3', 1, 2])
    })
})

describe('Novo lançamento e edição', () => {
    const base = { type: 'DESPESA', target: 'BUSINESS', amount: 50, date: '2026-11-13', paymentMethod: 'Pix', business_unit_id: 2 }

    test('recusa categoria de outra pessoa', async () => {
        const res = await request(app).post('/api/finance/transactions').send({ ...base, categoryId: 9 })
        expect(res.status).toBe(403)
        expect(res.body.code).toBe('REFERENCE_OWNERSHIP_VIOLATION')
        expect(writes).toHaveLength(0)
    })

    test('recusa cartão de outra pessoa', async () => {
        const res = await request(app).post('/api/finance/transactions').send({ ...base, paymentMethod: 'Cartão de Crédito', cardId: 9 })
        expect(res.status).toBe(403)
        expect(writes).toHaveLength(0)
    })

    test('recusa id que não é número', async () => {
        const res = await request(app).post('/api/finance/transactions').send({ ...base, categoryId: '1 OR 1=1' })
        expect(res.status).toBe(403)
    })

    test('aceita categoria e cartão próprios', async () => {
        const res = await request(app).post('/api/finance/transactions').send({ ...base, categoryId: 1, paymentMethod: 'Cartão de Crédito', cardId: 1 })
        expect(res.status).toBe(200)
        expect(writes[0].sql).toMatch(/^INSERT INTO finance_transactions/)
    })

    test('campos vazios continuam permitidos (sem categoria, sem cartão)', async () => {
        const res = await request(app).post('/api/finance/transactions').send({ ...base, categoryId: '', cardId: '' })
        expect(res.status).toBe(200)
    })

    test.each([0, -10, 'abc', '', null])('recusa valor %p', async (amount) => {
        const res = await request(app).post('/api/finance/transactions').send({ ...base, amount })
        expect(res.status).toBe(400)
        expect(writes).toHaveLength(0)
    })

    test('edição recusa categoria de outra pessoa', async () => {
        const res = await request(app).patch('/api/finance/transactions/3').send({ categoryId: 9 })
        expect(res.status).toBe(403)
        expect(writes).toHaveLength(0)
    })

    test('edição recusa valor negativo', async () => {
        const res = await request(app).patch('/api/finance/transactions/3').send({ amount: -5 })
        expect(res.status).toBe(400)
    })

    test('filtro de categoria do extrato só olha categorias da própria conta', async () => {
        await request(app).get('/api/finance/transactions?categoryId=9')
        const [sql] = mockDb.query.mock.calls[0]
        expect(sql).toMatch(/FROM finance_categories WHERE "userId" = \$1 AND TRIM\(name\)/)
        expect(sql).toMatch(/WHERE id = \$\d+ AND "userId" = \$1\)\)/)
    })
})

describe('Cartões', () => {
    test('criar cartão em carteira de outra pessoa é recusado', async () => {
        const res = await request(app).post('/api/finance/cards').send({ name: 'Inter', business_unit_id: 9 })
        expect(res.status).toBe(403)
        expect(writes).toHaveLength(0)
    })

    test('mover cartão para carteira de outra pessoa é recusado', async () => {
        const res = await request(app).patch('/api/finance/cards/1').send({ business_unit_id: 9 })
        expect(res.status).toBe(403)
        expect(writes).toHaveLength(0)
    })
})

describe('Transferência entre carteiras', () => {
    const base = { sourceWalletId: 1, targetWalletId: 2, amount: 100, date: '2026-11-13' }

    beforeEach(() => {
        mockDb.connect = jest.fn()
    })

    test('recusa carteira de outra pessoa', async () => {
        const res = await request(app).post('/api/finance/transfers').send({ ...base, targetWalletId: 9 })
        expect(res.status).toBe(403)
    })

    test('recusa valor negativo', async () => {
        const res = await request(app).post('/api/finance/transfers').send({ ...base, amount: -100 })
        expect(res.status).toBe(400)
    })

    test('recusa a mesma carteira dos dois lados', async () => {
        const res = await request(app).post('/api/finance/transfers').send({ ...base, targetWalletId: 1 })
        expect(res.status).toBe(400)
    })
})

describe('Carteiras: tipo e limite do plano', () => {
    test('trocar PJ para PF além do limite de PF é recusado', async () => {
        settings = { wallet_pf_limit_2: '1', wallet_pj_limit_2: '1', wallet_limit_2: '2' }
        const res = await request(app).put('/api/finance/business-units/2').send({ name: 'Ateliê', account_type: 'PF' })
        expect(res.status).toBe(403)
        expect(writes).toHaveLength(0)
    })

    test('trocar o tipo dentro do limite funciona', async () => {
        settings = { wallet_pf_limit_2: '3', wallet_pj_limit_2: '3', wallet_limit_2: '6' }
        const res = await request(app).put('/api/finance/business-units/2').send({ name: 'Ateliê', account_type: 'pf' })
        expect(res.status).toBe(200)
        expect(writes[0].params[1]).toBe('PF')
    })

    test('editar sem trocar o tipo não consulta limite', async () => {
        settings = { wallet_pf_limit_2: '1' }
        const res = await request(app).put('/api/finance/business-units/1').send({ name: 'Nubank', account_type: 'PF' })
        expect(res.status).toBe(200)
    })

    test('carteira de outra pessoa não é encontrada', async () => {
        const res = await request(app).put('/api/finance/business-units/9').send({ name: 'x', account_type: 'PJ' })
        expect(res.status).toBe(404)
        expect(writes).toHaveLength(0)
    })

    test('tipo inválido é recusado ao criar e ao editar', async () => {
        mockCurrentUser.role = 'ADMIN'
        const created = await request(app).post('/api/finance/business-units').send({ name: 'x', account_type: 'XX' })
        expect(created.status).toBe(400)
        const edited = await request(app).put('/api/finance/business-units/1').send({ name: 'x', account_type: 'XX' })
        expect(edited.status).toBe(400)
        expect(writes).toHaveLength(0)
    })
})

describe('Itens de fatura do cartão', () => {
    test('adicionar item com categoria de outra pessoa é recusado', async () => {
        const res = await request(app).post('/api/finance/invoices/5/items').send({ description: 'x', amount: 10, categoryId: 9 })
        expect(res.status).toBe(403)
        expect(writes).toHaveLength(0)
    })

    test('editar item com categoria de outra pessoa é recusado', async () => {
        const res = await request(app).patch('/api/finance/invoices/items/7').send({ categoryId: 9 })
        expect(res.status).toBe(403)
        expect(writes).toHaveLength(0)
    })
})

describe('Extrato do plano Gratuito: só os últimos 30 dias, travado no servidor', () => {
    const dateParams = () => mockDb.query.mock.calls[0][1].filter(v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v))
    const daysAgo = (n) => new Date(Date.now() - n * 86400000).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })

    beforeEach(() => {
        mockCurrentUser = { id: 1, role: 'USER', planId: 1, isInTrial: false }
    })

    test('sem data de início, começa 31 dias atrás', async () => {
        const res = await request(app).get('/api/finance/transactions')
        expect(res.status).toBe(200)
        expect(dateParams()).toEqual([daysAgo(31)])
    })

    test('data antiga mandada na chamada é trocada pelo limite', async () => {
        await request(app).get('/api/finance/transactions?startDate=2020-01-01&endDate=2020-12-31')
        expect(dateParams()).toEqual([daysAgo(31), '2020-12-31'])
    })

    test('data em formato estranho também cai no limite', async () => {
        await request(app).get(`/api/finance/transactions?startDate=${encodeURIComponent("2020-01-01' OR 1=1")}`)
        expect(dateParams()).toEqual([daysAgo(31)])
    })

    test('"Últimos 30 dias" do Extrato passa sem mudança', async () => {
        await request(app).get(`/api/finance/transactions?startDate=${daysAgo(30)}`)
        expect(dateParams()).toEqual([daysAgo(30)])
    })

    test('Prata, teste grátis e admin veem tudo', async () => {
        for (const user of [{ planId: 2 }, { planId: 1, isInTrial: true }, { planId: 1, role: 'ADMIN' }]) {
            mockDb.query.mockClear()
            mockCurrentUser = { id: 1, role: 'USER', isInTrial: false, ...user }
            await request(app).get('/api/finance/transactions?startDate=2020-01-01')
            expect(dateParams()).toEqual(['2020-01-01'])
        }
    })
})
