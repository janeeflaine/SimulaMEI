/**
 * Painel do cartão: itens da fatura conferidos no servidor, total da fatura
 * sempre certo, item lançado à mão indo para o Extrato e gravações por inteiro.
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
jest.mock('../utils/geminiService', () => ({
    parseInvoice: jest.fn(),
    validateFile: jest.fn(),
    SUPPORTED_MIME_TYPES: ['application/pdf'],
    MAX_FILE_SIZE: 10 * 1024 * 1024
}))

const express = require('express')
const request = require('supertest')

const app = express()
app.use(express.json())
app.use('/api/finance/invoices', require('../routes/invoice.routes'))

const norm = (sql) => sql.replace(/\s+/g, ' ').trim()

// Cartão numa carteira (para o Extrato) e tipo da carteira
let walletType
let clientSql
let failOn

beforeEach(() => {
    jest.clearAllMocks()
    walletType = 'PF'
    failOn = null
    clientSql = []
    mockDb.query.mockResolvedValue({ rows: [], rowCount: 1 })
    mockClient.query.mockImplementation(async (sql, params) => {
        const q = norm(sql)
        clientSql.push({ q, params })
        if (failOn && q.startsWith(failOn)) throw new Error('falha simulada')
        if (q.includes('FROM card_invoices ci') && q.includes('WHERE ci.id = $1')) {
            return { rows: params[0] === 1 ? [{ id: 1, invoiceDueDate: '2026-03-10', cardId: 7, business_unit_id: 3, account_type: walletType }] : [] }
        }
        if (q.startsWith('SELECT ii.*')) {
            return { rows: params[0] === 5 ? [{ id: 5, invoiceId: 1, userId: 1, amount: 10, isConfirmed: true, invoiceDueDate: '2026-03-10', cardId: 7, business_unit_id: 3, account_type: walletType }] : [] }
        }
        if (q.startsWith('SELECT * FROM invoice_items')) return { rows: params[0] === 5 ? [{ id: 5, invoiceId: 1 }] : [] }
        if (q.startsWith('INSERT INTO invoice_items')) {
            return { rows: [{ id: 9, invoiceId: 1, description: params[2], amount: params[3], transactionDate: params[4], categoryId: params[5], isConfirmed: params[9] }] }
        }
        if (q.startsWith('UPDATE invoice_items')) return { rows: [{ id: 5, invoiceId: 1, description: 'Mercado', amount: 80, categoryId: 4, isConfirmed: true }] }
        if (q.startsWith('SELECT id FROM finance_categories')) return { rows: [{ id: 4 }] }
        if (q.startsWith('SELECT id FROM finance_transactions')) return { rows: [] }
        if (q.startsWith('SELECT COALESCE(SUM(amount)')) return { rows: [{ totalAmount: 123.45 }] }
        if (q.startsWith('SELECT DISTINCT "invoiceId"')) return { rows: [{ invoiceId: 1 }] }
        return { rows: [], rowCount: 2 }
    })
    jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => console.error.mockRestore())

const ran = (start) => clientSql.filter(c => c.q.startsWith(start))

describe('Adicionar item à mão', () => {
    test('item confirmado vai para o Extrato e o total da fatura é refeito, tudo numa transação', async () => {
        const res = await request(app).post('/api/finance/invoices/1/items')
            .send({ description: '  Mercado  ', amount: 80, transactionDate: '2026-03-02', categoryId: 4, isConfirmed: true })
        expect(res.status).toBe(201)
        expect(ran('INSERT INTO invoice_items')[0].params[2]).toBe('Mercado')
        expect(ran('INSERT INTO invoice_items')[0].params[9]).toBe(true)
        const tx = ran('INSERT INTO finance_transactions')
        expect(tx).toHaveLength(1)
        expect(tx[0].params).toEqual(expect.arrayContaining([1, 'PERSONAL', 80, 7, 'Mercado', 3, 9, '2026-03-10']))
        expect(ran('UPDATE card_invoices SET "totalAmount"')[0].params).toEqual([123.45, 1])
        expect(clientSql[0].q).toBe('BEGIN')
        expect(clientSql[clientSql.length - 1].q).toBe('COMMIT')
        expect(mockClient.release).toHaveBeenCalled()
    })

    test('cartão de carteira PJ lança no Extrato como despesa da empresa', async () => {
        walletType = 'PJ'
        await request(app).post('/api/finance/invoices/1/items').send({ description: 'Gráfica', amount: 50, isConfirmed: true })
        expect(ran('INSERT INTO finance_transactions')[0].params[1]).toBe('BUSINESS')
    })

    test('estorno (valor negativo) é aceito', async () => {
        const res = await request(app).post('/api/finance/invoices/1/items').send({ description: 'Estorno loja', amount: -30 })
        expect(res.status).toBe(201)
    })

    test.each([
        [{ description: '   ', amount: 10 }, 'descrição'],
        [{ description: 'x'.repeat(201), amount: 10 }, 'descrição'],
        [{ description: 'Mercado', amount: 0 }, 'valor'],
        [{ description: 'Mercado', amount: 'abc' }, 'valor'],
        [{ description: 'Mercado', amount: '' }, 'valor'],
        [{ description: 'Mercado', amount: 1e12 }, 'valor'],
        [{ description: 'Mercado', amount: 10, transactionDate: '2026-02-31' }, 'data'],
        [{ description: 'Mercado', amount: 10, isConfirmed: 'sim' }, 'confirmação'],
        [{ description: 'Mercado', amount: 10, categoryId: 'abc' }, 'Categoria']
    ])('dado inválido %o é recusado (%s)', async (body, word) => {
        const res = await request(app).post('/api/finance/invoices/1/items').send(body)
        expect(res.status).toBe(400)
        expect(res.body.message).toMatch(new RegExp(word, 'i'))
        expect(mockPool.connect).not.toHaveBeenCalled()
    })

    test('fatura de outra pessoa: 404 e nada gravado', async () => {
        const res = await request(app).post('/api/finance/invoices/2/items').send({ description: 'Mercado', amount: 10 })
        expect(res.status).toBe(404)
        expect(ran('INSERT INTO invoice_items')).toHaveLength(0)
        expect(ran('ROLLBACK')).toHaveLength(1)
    })

    test('se uma etapa falha, nada fica pela metade (ROLLBACK)', async () => {
        failOn = 'UPDATE card_invoices'
        const res = await request(app).post('/api/finance/invoices/1/items').send({ description: 'Mercado', amount: 10, isConfirmed: true })
        expect(res.status).toBe(500)
        expect(ran('ROLLBACK')).toHaveLength(1)
        expect(ran('COMMIT')).toHaveLength(0)
        expect(mockClient.release).toHaveBeenCalled()
    })
})

describe('Editar item', () => {
    test('mudar o valor refaz o total da fatura e atualiza o Extrato', async () => {
        const res = await request(app).patch('/api/finance/invoices/items/5').send({ description: 'Mercado', amount: '80' })
        expect(res.status).toBe(200)
        expect(ran('UPDATE invoice_items')[0].params).toEqual(['Mercado', 80, 5, 1])
        expect(ran('UPDATE card_invoices SET "totalAmount"')[0].params).toEqual([123.45, 1])
        expect(ran('INSERT INTO finance_transactions')).toHaveLength(1)
    })

    test('dá para corrigir a data da compra (e data inválida é recusada)', async () => {
        const ok = await request(app).patch('/api/finance/invoices/items/5').send({ transactionDate: '2026-03-04' })
        expect(ok.status).toBe(200)
        expect(ran('UPDATE invoice_items')[0].q).toContain('"transactionDate" = $1')
        expect(ran('UPDATE invoice_items')[0].params).toEqual(['2026-03-04', 5, 1])
        const bad = await request(app).patch('/api/finance/invoices/items/5').send({ transactionDate: '04/03/2026' })
        expect(bad.status).toBe(400)
    })

    test('categoria pelo nome segue o tipo da carteira do cartão (PJ = despesa do MEI)', async () => {
        walletType = 'PJ'
        await request(app).patch('/api/finance/invoices/items/5').send({ categoryName: 'Material' })
        expect(ran('SELECT id FROM finance_categories')[0].params).toEqual(['Material', 1, 'DESPESA_MEI'])
    })

    test('categoria pelo nome em cartão PF usa despesa pessoal', async () => {
        await request(app).patch('/api/finance/invoices/items/5').send({ categoryName: 'Mercado' })
        expect(ran('SELECT id FROM finance_categories')[0].params).toEqual(['Mercado', 1, 'DESPESA_PESSOAL'])
    })

    test.each([
        [{ amount: 0 }],
        [{ amount: 'x' }],
        [{ description: '' }],
        [{ isConfirmed: 1 }]
    ])('dado inválido %o é recusado', async (body) => {
        const res = await request(app).patch('/api/finance/invoices/items/5').send(body)
        expect(res.status).toBe(400)
        expect(ran('UPDATE invoice_items')).toHaveLength(0)
    })

    test('id que não é número dá 404, não erro 500', async () => {
        const res = await request(app).patch('/api/finance/invoices/items/abc').send({ amount: 5 })
        expect(res.status).toBe(404)
        expect(mockDb.query).not.toHaveBeenCalled()
        expect(mockPool.connect).not.toHaveBeenCalled()
    })
})

describe('Excluir itens', () => {
    test('excluir um item tira a compra do Extrato e refaz o total', async () => {
        const res = await request(app).delete('/api/finance/invoices/items/5')
        expect(res.status).toBe(200)
        expect(ran('DELETE FROM finance_transactions')[0].params).toEqual([5, 1])
        expect(ran('UPDATE card_invoices SET "totalAmount"')).toHaveLength(1)
    })

    test.each([
        [['abc']],
        [[1, 2.5]],
        [[-1]],
        [Array.from({ length: 501 }, (_, i) => i + 1)]
    ])('lista de ids inválida é recusada', async (ids) => {
        const res = await request(app).post('/api/finance/invoices/items/bulk-delete').send({ ids })
        expect(res.status).toBe(400)
        expect(mockPool.connect).not.toHaveBeenCalled()
    })

    test('exclusão em lote só com ids limpos, sem repetidos, numa transação', async () => {
        const res = await request(app).post('/api/finance/invoices/items/bulk-delete').send({ ids: ['3', 3, 4] })
        expect(res.status).toBe(200)
        expect(ran('DELETE FROM invoice_items')[0].params).toEqual([[3, 4], 1])
        expect(ran('COMMIT')).toHaveLength(1)
    })
})

describe('Faturas', () => {
    test.each([
        [{ cardId: 1, referenceMonth: 13, referenceYear: 2026 }],
        [{ cardId: 1, referenceMonth: 0, referenceYear: 2026 }],
        [{ cardId: 1, referenceMonth: 3, referenceYear: 'x' }],
        [{ cardId: 1, referenceMonth: 3, referenceYear: 2026, dueDate: '2026-13-01' }],
        [{ cardId: 1, referenceMonth: 3, referenceYear: 2026, totalAmount: 'abc' }]
    ])('fatura com dado inválido %o é recusada', async (body) => {
        const res = await request(app).post('/api/finance/invoices').send(body)
        expect(res.status).toBe(400)
        expect(mockDb.query).not.toHaveBeenCalled()
    })

    test('duas criações ao mesmo tempo: a segunda recebe 409, não erro 500', async () => {
        mockDb.query
            .mockResolvedValueOnce({ rows: [{ id: 1 }] })
            .mockResolvedValueOnce({ rows: [] })
            .mockRejectedValueOnce(Object.assign(new Error('duplicate key'), { code: '23505' }))
        const res = await request(app).post('/api/finance/invoices').send({ cardId: 1, referenceMonth: 3, referenceYear: 2026 })
        expect(res.status).toBe(409)
    })

    test.each([[-5], ['abc'], [''], [true]])('valor pago inválido (%p) é recusado', async (paidAmount) => {
        const res = await request(app).patch('/api/finance/invoices/1/confirm').send({ paidAmount })
        expect(res.status).toBe(400)
        expect(mockDb.query).not.toHaveBeenCalled()
    })

    test('excluir fatura confere o dono no DELETE e solta os envios antes (senão o banco recusava)', async () => {
        mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1 }] })
        const res = await request(app).delete('/api/finance/invoices/1')
        expect(res.status).toBe(200)
        const qs = clientSql.map(c => c.q)
        const unlink = qs.findIndex(q => q.startsWith('UPDATE invoice_uploads SET "invoiceId" = NULL'))
        const del = qs.findIndex(q => q.startsWith('DELETE FROM card_invoices'))
        expect(unlink).toBeGreaterThan(-1)
        expect(del).toBeGreaterThan(unlink)
        expect(clientSql[del].params).toEqual(['1', 1])
        expect(qs).toContain('COMMIT')
    })

    test('lista com cartão ou ano inválido dá 400, não erro 500', async () => {
        expect((await request(app).get('/api/finance/invoices?cardId=abc')).status).toBe(400)
        expect((await request(app).get('/api/finance/invoices?year=20x6')).status).toBe(400)
    })
})

describe('Resumo do cartão', () => {
    test('ano inválido dá 400 e cartão inválido dá 404', async () => {
        expect((await request(app).get('/api/finance/invoices/card/1/summary?year=abc')).status).toBe(400)
        expect((await request(app).get('/api/finance/invoices/card/abc/summary')).status).toBe(404)
        expect(mockDb.query).not.toHaveBeenCalled()
    })

    test('traz o tipo da carteira e o uso do limite pela média dos meses com fatura', async () => {
        mockDb.query
            .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Nubank', creditLimit: 1000, walletType: 'PJ' }] })
            .mockResolvedValueOnce({ rows: [{ referenceMonth: 1, totalAmount: 200 }, { referenceMonth: 2, totalAmount: 400 }] })
            .mockResolvedValueOnce({ rows: [] })
        const res = await request(app).get('/api/finance/invoices/card/1/summary?year=2026')
        expect(res.status).toBe(200)
        expect(res.body.card.walletType).toBe('PJ')
        expect(res.body.utilizationPercent).toBe(30)
    })
})
