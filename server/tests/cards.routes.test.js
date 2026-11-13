/**
 * Cartões: dados conferidos no servidor e exclusão que não falha quando o
 * cartão tem compras lançadas (as compras ficam no Extrato, sem o cartão).
 */

const mockDb = { query: jest.fn() }
const mockClient = { query: jest.fn(), release: jest.fn() }
const mockPool = { query: jest.fn(), connect: jest.fn(async () => mockClient) }
jest.mock('../db', () => ({ db: mockDb, pool: mockPool }))

jest.mock('../middleware/auth', () => ({
    authMiddleware: (req, res, next) => { req.user = { id: 1, role: 'USER', planId: 2, isInTrial: false }; next() }
}))
jest.mock('../middleware/planGuard', () => ({
    featureGuard: () => (req, res, next) => next()
}))
jest.mock('../middleware/walletSecurity', () => ({
    validateWalletOwnership: (req, res, next) => next(),
    validateReferenceOwnership: (req, res, next) => next()
}))

const express = require('express')
const request = require('supertest')

const app = express()
app.use(express.json({ limit: '10mb' }))
app.use('/api/finance', require('../routes/finance.routes'))

const valid = { name: 'Nubank', lastFour: '1234', brand: 'Visa', closingDay: 5, dueDate: 12, imageUrl: '', business_unit_id: '' }

let clientSql
beforeEach(() => {
    jest.clearAllMocks()
    clientSql = []
    mockDb.query.mockResolvedValue({ rows: [{ id: 9, ...valid }] })
    mockClient.query.mockImplementation(async (sql, params) => {
        const q = sql.replace(/\s+/g, ' ').trim()
        clientSql.push(q)
        if (q.startsWith('SELECT id FROM credit_cards')) return { rows: params[0] === 3 ? [{ id: 3 }] : [] }
        if (q.startsWith('UPDATE finance_transactions')) return { rowCount: 4 }
        return { rows: [], rowCount: 1 }
    })
    jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => console.error.mockRestore())

describe('Criar e editar cartão: dados conferidos no servidor', () => {
    test('cartão válido é criado com os dias como número', async () => {
        const res = await request(app).post('/api/finance/cards').send({ ...valid, closingDay: '5', dueDate: '12' })
        expect(res.status).toBe(200)
        const params = mockDb.query.mock.calls[0][1]
        expect(params.slice(0, 6)).toEqual([1, 'Nubank', '1234', 'Visa', 5, 12])
    })

    test.each([
        [{ name: '   ' }, 'nome'],
        [{ closingDay: 0 }, 'fechamento'],
        [{ closingDay: 32 }, 'fechamento'],
        [{ dueDate: 'abc' }, 'vencimento'],
        [{ dueDate: '' }, 'vencimento'],
        [{ lastFour: '12a4' }, 'final'],
        [{ lastFour: '12345' }, 'final'],
        [{ imageUrl: 'javascript:alert(1)' }, 'Imagem'],
        [{ imageUrl: 'https://x.com/a.png") ; background:url(http://evil' }, 'Imagem'],
        [{ imageUrl: 'data:text/html;base64,PHNjcmlwdD4=' }, 'Imagem'],
        [{ creditLimit: -1 }, 'limite'],
        [{ creditLimit: 'abc' }, 'limite'],
        [{ creditLimit: 1e12 }, 'limite'],
        [{ creditLimit: true }, 'limite']
    ])('recusa %p', async (patch, word) => {
        const res = await request(app).post('/api/finance/cards').send({ ...valid, ...patch })
        expect(res.status).toBe(400)
        expect(res.body.message).toMatch(new RegExp(word, 'i'))
        expect(mockDb.query).not.toHaveBeenCalled()
    })

    test('imagem PNG em base64 é aceita', async () => {
        const res = await request(app).post('/api/finance/cards').send({ ...valid, imageUrl: 'data:image/png;base64,iVBORw0KGgo=' })
        expect(res.status).toBe(200)
    })

    test('limite do cartão é gravado ao criar (vazio = sem limite)', async () => {
        await request(app).post('/api/finance/cards').send({ ...valid, creditLimit: '6000.5' })
        expect(mockDb.query.mock.calls[0][1][8]).toBe(6000.5)
        mockDb.query.mockClear()
        await request(app).post('/api/finance/cards').send({ ...valid, creditLimit: '' })
        expect(mockDb.query.mock.calls[0][1][8]).toBe(0)
    })

    test('limite na edição: muda quando vem, fica como está quando não vem', async () => {
        await request(app).patch('/api/finance/cards/3').send({ creditLimit: 2500 })
        expect(mockDb.query.mock.calls[0][0]).toContain('"creditLimit" = COALESCE($10, "creditLimit")')
        expect(mockDb.query.mock.calls[0][1][9]).toBe(2500)
        mockDb.query.mockClear()
        await request(app).patch('/api/finance/cards/3').send({ name: 'Inter' })
        expect(mockDb.query.mock.calls[0][1][9]).toBeNull()
    })

    test('edição confere só o que veio', async () => {
        const ok = await request(app).patch('/api/finance/cards/3').send({ business_unit_id: 2 })
        expect(ok.status).toBe(200)
        const bad = await request(app).patch('/api/finance/cards/3').send({ dueDate: 40 })
        expect(bad.status).toBe(400)
    })
})

describe('Excluir cartão', () => {
    test('mantém as compras no Extrato sem o cartão, apaga envios e o cartão, tudo numa transação', async () => {
        const res = await request(app).delete('/api/finance/cards/3')
        expect(res.status).toBe(200)
        expect(res.body.keptPurchases).toBe(4)
        expect(clientSql[0]).toBe('BEGIN')
        expect(clientSql[1]).toMatch(/^SELECT id FROM credit_cards WHERE id = \$1 AND "userId" = \$2 FOR UPDATE/)
        expect(clientSql[2]).toMatch(/^UPDATE finance_transactions SET "cardId" = NULL, invoice_item_id = NULL/)
        expect(clientSql[3]).toMatch(/^DELETE FROM invoice_uploads WHERE "cardId" = \$1 AND "userId" = \$2/)
        expect(clientSql[4]).toMatch(/^DELETE FROM credit_cards WHERE id = \$1 AND "userId" = \$2/)
        expect(clientSql[5]).toBe('COMMIT')
        expect(mockClient.release).toHaveBeenCalled()
    })

    test('cartão de outra pessoa (ou que não existe) não é encontrado e nada muda', async () => {
        const res = await request(app).delete('/api/finance/cards/7')
        expect(res.status).toBe(404)
        expect(clientSql).toEqual(['BEGIN', expect.stringMatching(/^SELECT id FROM credit_cards/), 'ROLLBACK'])
    })

    test('se algo falhar no meio, desfaz tudo e avisa', async () => {
        mockClient.query.mockImplementation(async (sql) => {
            const q = sql.replace(/\s+/g, ' ').trim()
            clientSql.push(q)
            if (q.startsWith('SELECT id FROM credit_cards')) return { rows: [{ id: 3 }] }
            if (q.startsWith('DELETE FROM credit_cards')) throw new Error('falha')
            return { rows: [], rowCount: 0 }
        })
        const res = await request(app).delete('/api/finance/cards/3')
        expect(res.status).toBe(500)
        expect(res.body.message).toMatch(/Nada foi apagado/)
        expect(clientSql[clientSql.length - 1]).toBe('ROLLBACK')
        expect(mockClient.release).toHaveBeenCalled()
    })
})
