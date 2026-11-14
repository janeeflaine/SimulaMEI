/**
 * Transferência entre carteiras: os dois lados ligados (transferId), excluir um
 * apaga o par, lado de transferência não se edita, "Transferência" só pela janela
 * Transferir, valor em centavos com teto e id de carteira inválido = 400.
 */
const mockDb = { query: jest.fn() }
const mockClient = { query: jest.fn(), release: jest.fn() }
const mockPool = { query: jest.fn(), connect: jest.fn(async () => mockClient) }
jest.mock('../db', () => ({ db: mockDb, pool: mockPool }))
jest.mock('../middleware/auth', () => ({
    authMiddleware: (req, res, next) => { req.user = { id: 1, role: 'USER', planId: 2, isInTrial: false }; next() }
}))
jest.mock('../middleware/planGuard', () => ({ featureGuard: () => (req, res, next) => next() }))

const express = require('express')
const request = require('supertest')
const app = express()
app.use(express.json())
app.use('/api/finance', require('../routes/finance.routes'))

const norm = (sql) => sql.replace(/\s+/g, ' ').trim()
let state, sql
beforeEach(() => {
    jest.clearAllMocks()
    sql = []
    state = {
        owned: [4, 5],
        wallets: [{ id: 4, name: 'Oficina', account_type: 'PJ' }, { id: 5, name: 'Casa', account_type: 'PF' }],
        current: { id: 30, paymentMethod: 'Transferência', transferId: 'abc' },
        deleted: [{ id: 30, transferId: 'abc' }, { id: 31, transferId: 'abc' }]
    }
    const handler = async (rawSql, params = []) => {
        const q = norm(rawSql)
        sql.push({ q, params })
        if (q.startsWith('SELECT id FROM business_units WHERE "ownerId" = $1 AND id = ANY')) return { rows: params[1].filter(id => state.owned.includes(id)).map(id => ({ id })) }
        if (q.startsWith('SELECT id, name, account_type FROM business_units')) return { rows: state.wallets.filter(w => params[1].includes(w.id)) }
        if (q.startsWith('SELECT id, "paymentMethod", "transferId" FROM finance_transactions')) return { rows: state.current ? [state.current] : [] }
        if (q.startsWith('DELETE FROM finance_transactions')) return { rows: state.deleted, rowCount: state.deleted.length }
        if (q.startsWith('UPDATE finance_transactions')) return { rows: [{ id: params[params.length - 2], description: 'x' }] }
        if (q.startsWith('INSERT INTO finance_transactions')) return { rows: [{ id: 99 }], rowCount: 1 }
        return { rows: [], rowCount: 0 }
    }
    mockDb.query.mockImplementation(handler)
    mockPool.query.mockImplementation(handler)
    mockClient.query.mockImplementation(handler)
    jest.spyOn(console, 'error').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => { console.error.mockRestore(); console.warn.mockRestore() })
const ran = (start) => sql.filter(s => s.q.startsWith(start))
const base = { sourceWalletId: 4, targetWalletId: 5, amount: 150, date: '2026-11-10', description: '' }

describe('Fazer a transferência', () => {
    test('os dois lados com o mesmo transferId', async () => {
        const res = await request(app).post('/api/finance/transfers').send(base)
        expect(res.status).toBe(200)
        const [out, inc] = ran('INSERT INTO finance_transactions')
        expect(out.q).toContain('"transferId"')
        expect(out.params[6]).toMatch(/^[0-9a-f-]{36}$/)
        expect(inc.params[6]).toBe(out.params[6])
        expect(res.body.transferId).toBe(out.params[6])
    })

    test('valor arredondado aos centavos', async () => {
        await request(app).post('/api/finance/transfers').send({ ...base, amount: '10.555' })
        expect(ran('INSERT INTO finance_transactions').map(i => i.params[1])).toEqual([10.56, 10.56])
    })

    test.each([['100000000.01'], [0.004], ['1e12']])('valor %s é recusado', async (amount) => {
        const res = await request(app).post('/api/finance/transfers').send({ ...base, amount })
        expect(res.status).toBe(400)
        expect(ran('INSERT INTO finance_transactions')).toHaveLength(0)
    })

    test.each([['abc'], [1.5], [-4], ['4; DROP']])('carteira %p: 400 sem chegar ao banco (antes erro 500)', async (sourceWalletId) => {
        const res = await request(app).post('/api/finance/transfers').send({ ...base, sourceWalletId })
        expect(res.status).toBe(400)
        expect(ran('SELECT id FROM business_units')).toHaveLength(0)
        expect(ran('INSERT INTO finance_transactions')).toHaveLength(0)
    })

    test('carteira de outra pessoa: 403', async () => {
        state.owned = [4]
        const res = await request(app).post('/api/finance/transfers').send(base)
        expect(res.status).toBe(403)
    })
})

describe('Excluir', () => {
    test('excluir um lado apaga o par inteiro, numa instrução, só da própria pessoa', async () => {
        const res = await request(app).delete('/api/finance/transactions/30')
        expect(res.status).toBe(200)
        expect(res.body.deletedIds).toEqual([30, 31])
        const del = ran('DELETE FROM finance_transactions')[0]
        expect(del.q).toContain('"transferId" IN ( SELECT "transferId" FROM finance_transactions WHERE id = ANY($1::int[]) AND "userId" = $2')
        expect(del.params).toEqual([[30], 1])
    })

    test('id que não é número: 404 sem ir ao banco', async () => {
        const res = await request(app).delete('/api/finance/transactions/abc')
        expect(res.status).toBe(404)
        expect(ran('DELETE')).toHaveLength(0)
    })

    test('em lote: ids conferidos e pares junto', async () => {
        let res = await request(app).post('/api/finance/transactions/bulk-delete').send({ ids: [30, 'x'] })
        expect(res.status).toBe(400)
        res = await request(app).post('/api/finance/transactions/bulk-delete').send({ ids: Array.from({ length: 501 }, (_, i) => i + 1) })
        expect(res.status).toBe(400)
        expect(ran('DELETE')).toHaveLength(0)
        res = await request(app).post('/api/finance/transactions/bulk-delete').send({ ids: [30, 30] })
        expect(res.status).toBe(200)
        expect(res.body).toMatchObject({ deletedCount: 2, deletedIds: [30, 31] })
        expect(ran('DELETE')[0].params).toEqual([[30], 1])
    })
})

describe('Editar', () => {
    test.each([
        [{ amount: 200 }], [{ business_unit_id: 5 }], [{ date: '2026-11-11' }], [{ paymentMethod: 'PIX' }], [{ type: 'DESPESA' }]
    ])('lado de transferência não muda %o (409)', async (body) => {
        const res = await request(app).patch('/api/finance/transactions/30').send(body)
        expect(res.status).toBe(409)
        expect(res.body.reason).toBe('transfer')
        expect(ran('UPDATE finance_transactions')).toHaveLength(0)
    })

    test('lado de transferência: descrição e categoria podem mudar', async () => {
        const res = await request(app).patch('/api/finance/transactions/30').send({ description: 'Pró-labore', categoryId: null })
        expect(res.status).toBe(200)
        expect(ran('UPDATE finance_transactions')).toHaveLength(1)
    })

    test('lançamento comum não vira "Transferência" (sairia do faturamento do MEI)', async () => {
        state.current = { id: 40, paymentMethod: 'PIX', transferId: null }
        const res = await request(app).patch('/api/finance/transactions/40').send({ paymentMethod: 'Transferência' })
        expect(res.status).toBe(400)
        expect(ran('UPDATE finance_transactions')).toHaveLength(0)
    })

    test('criar lançamento com "Transferência" por fora da janela: 400', async () => {
        const res = await request(app).post('/api/finance/transactions').send({ type: 'RECEITA', target: 'BUSINESS', amount: 50, date: '2026-11-10', paymentMethod: 'Transferência' })
        expect(res.status).toBe(400)
        expect(ran('INSERT INTO finance_transactions')).toHaveLength(0)
    })
})
