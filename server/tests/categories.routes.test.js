/**
 * Categorias: nome e tipo conferidos, sem repetidas, tipo travado quando a
 * categoria já tem lançamentos e exclusão que não falha quando está em uso.
 */
const mockDb = { query: jest.fn() }
const mockClient = { query: jest.fn(), release: jest.fn() }
const mockPool = { query: jest.fn(), connect: jest.fn(async () => mockClient) }
jest.mock('../db', () => ({ db: mockDb, pool: mockPool }))
jest.mock('../middleware/auth', () => ({
    authMiddleware: (req, res, next) => { req.user = { id: 1, role: 'USER', planId: 2, isInTrial: false }; next() }
}))
jest.mock('../middleware/planGuard', () => ({ featureGuard: () => (req, res, next) => next() }))
jest.mock('../middleware/walletSecurity', () => ({
    validateWalletOwnership: (req, res, next) => next(),
    validateReferenceOwnership: (req, res, next) => next()
}))

const express = require('express')
const request = require('supertest')
const app = express()
app.use(express.json())
app.use('/api/finance', require('../routes/finance.routes'))

const norm = (sql) => sql.replace(/\s+/g, ' ').trim()
let state
let sql
beforeEach(() => {
    jest.clearAllMocks()
    sql = []
    state = { duplicate: false, current: { id: 4, name: 'Mercado', type: 'DESPESA_PESSOAL' }, used: 0, exists: true }
    const handler = async (rawSql, params = []) => {
        const q = norm(rawSql)
        sql.push({ q, params })
        if (q.startsWith('SELECT id FROM finance_categories WHERE "userId" = $1 AND type = $2')) return { rows: state.duplicate ? [{ id: 9 }] : [] }
        if (q.startsWith('SELECT * FROM finance_categories WHERE id = $1')) return { rows: state.exists ? [state.current] : [] }
        if (q.startsWith('SELECT (SELECT COUNT(*)')) return { rows: [{ total: state.used }] }
        if (q.startsWith('INSERT INTO finance_categories')) return { rows: [{ id: 10, name: params[1], type: params[2] }] }
        if (q.startsWith('UPDATE finance_categories')) return { rows: [{ id: params[2], name: params[0], type: params[1] }] }
        if (q.startsWith('SELECT id FROM finance_categories WHERE id = $1')) return { rows: state.exists ? [{ id: 4 }] : [] }
        if (q.startsWith('UPDATE finance_transactions')) return { rowCount: 12 }
        if (q.startsWith('UPDATE invoice_items')) return { rowCount: 3 }
        if (q.startsWith('SELECT c.*')) return { rows: [{ id: 4, name: 'Mercado', transactionsCount: 12, yearTotal: 300 }] }
        if (q.startsWith('SELECT COUNT(*)::int AS count FROM finance_transactions')) return { rows: [{ count: 5 }] }
        return { rows: [], rowCount: 1 }
    }
    mockDb.query.mockImplementation(handler)
    mockClient.query.mockImplementation(handler)
    jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => console.error.mockRestore())

const ran = (start) => sql.filter(s => s.q.startsWith(start))

describe('Criar categoria', () => {
    test('nome limpo (espaços) e tipo válido', async () => {
        const res = await request(app).post('/api/finance/categories').send({ name: '  Matéria   prima ', type: 'DESPESA_MEI' })
        expect(res.status).toBe(200)
        expect(ran('INSERT INTO finance_categories')[0].params).toEqual([1, 'Matéria prima', 'DESPESA_MEI'])
    })

    test.each([
        [{ name: '', type: 'RECEITA' }, 'nome'],
        [{ name: '   ', type: 'RECEITA' }, 'nome'],
        [{ name: 'x'.repeat(61), type: 'RECEITA' }, '60'],
        [{ name: 'Vendas', type: 'DESPESA' }, 'receita'],
        [{ name: 'Vendas' }, 'receita'],
        [{ name: 123, type: 'RECEITA' }, 'nome']
    ])('dado inválido %o é recusado', async (body, word) => {
        const res = await request(app).post('/api/finance/categories').send(body)
        expect(res.status).toBe(400)
        expect(res.body.message).toMatch(new RegExp(word, 'i'))
        expect(mockDb.query).not.toHaveBeenCalled()
    })

    test('mesmo nome no mesmo tipo: 409 com o id da que já existe', async () => {
        state.duplicate = true
        const res = await request(app).post('/api/finance/categories').send({ name: 'mercado', type: 'DESPESA_PESSOAL' })
        expect(res.status).toBe(409)
        expect(res.body.id).toBe(9)
        expect(ran('INSERT INTO finance_categories')).toHaveLength(0)
    })
})

describe('Editar categoria', () => {
    test('renomear funciona', async () => {
        const res = await request(app).patch('/api/finance/categories/4').send({ name: 'Supermercado', type: 'DESPESA_PESSOAL' })
        expect(res.status).toBe(200)
        expect(ran('UPDATE finance_categories')[0].params).toEqual(['Supermercado', 'DESPESA_PESSOAL', 4, 1])
    })

    test('trocar o tipo de categoria em uso é recusado', async () => {
        state.used = 3
        const res = await request(app).patch('/api/finance/categories/4').send({ name: 'Mercado', type: 'RECEITA' })
        expect(res.status).toBe(409)
        expect(ran('UPDATE finance_categories')).toHaveLength(0)
    })

    test('trocar o tipo de categoria sem uso é aceito', async () => {
        const res = await request(app).patch('/api/finance/categories/4').send({ name: 'Mercado', type: 'DESPESA_MEI' })
        expect(res.status).toBe(200)
    })

    test('categoria de outra pessoa (ou que não existe): 404, antes respondia 200 vazio', async () => {
        state.exists = false
        const res = await request(app).patch('/api/finance/categories/4').send({ name: 'X', type: 'RECEITA' })
        expect(res.status).toBe(404)
    })

    test('id que não é número: 404 sem ir ao banco', async () => {
        const res = await request(app).patch('/api/finance/categories/abc').send({ name: 'X', type: 'RECEITA' })
        expect(res.status).toBe(404)
        expect(mockDb.query).not.toHaveBeenCalled()
    })

    test('nome repetido em outra categoria do mesmo tipo: 409', async () => {
        state.duplicate = true
        const res = await request(app).patch('/api/finance/categories/4').send({ name: 'Feira', type: 'DESPESA_PESSOAL' })
        expect(res.status).toBe(409)
    })
})

describe('Excluir categoria', () => {
    test('em uso: lançamentos e compras ficam sem categoria e a categoria sai, numa transação', async () => {
        const res = await request(app).delete('/api/finance/categories/4')
        expect(res.status).toBe(200)
        expect(res.body.uncategorized).toEqual({ transactions: 12, invoiceItems: 3 })
        const qs = sql.map(s => s.q)
        expect(qs[0]).toBe('BEGIN')
        expect(qs.findIndex(q => q.startsWith('DELETE FROM finance_categories'))).toBeGreaterThan(qs.findIndex(q => q.startsWith('UPDATE invoice_items')))
        expect(qs[qs.length - 1]).toBe('COMMIT')
        expect(ran('UPDATE finance_transactions')[0].params).toEqual([4, 1])
    })

    test('de outra pessoa: 404 e nada muda', async () => {
        state.exists = false
        const res = await request(app).delete('/api/finance/categories/4')
        expect(res.status).toBe(404)
        expect(ran('UPDATE finance_transactions')).toHaveLength(0)
        expect(ran('ROLLBACK')).toHaveLength(1)
    })
})

describe('Lista com uso', () => {
    test('?uso=1 traz contagem e total do ano, e quantos lançamentos do ano estão sem categoria', async () => {
        const res = await request(app).get('/api/finance/categories?uso=1')
        expect(res.status).toBe(200)
        expect(res.body[0].transactionsCount).toBe(12)
        expect(res.headers['x-uncategorized-year']).toBe('5')
    })
})
