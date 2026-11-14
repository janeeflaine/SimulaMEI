/**
 * Enviar fatura: arquivo conferido, limite de leituras por dia, categorias da
 * carteira certa, compras lidas pela IA conferidas, compras repetidas marcadas
 * e revisão (confirmar/descartar) de uma vez só, numa transação.
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
const mockParseInvoice = jest.fn()
jest.mock('../utils/geminiService', () => ({
    parseInvoice: (...args) => mockParseInvoice(...args),
    SUPPORTED_MIME_TYPES: ['application/pdf', 'image/png', 'image/jpeg', 'text/csv'],
    MAX_FILE_SIZE: 10 * 1024 * 1024
}))

const express = require('express')
const request = require('supertest')

const app = express()
app.use(express.json())
app.use('/api/finance/invoices', require('../routes/invoice.routes'))

const norm = (sql) => sql.replace(/\s+/g, ' ').trim()
const PDF = Buffer.from('%PDF-1.7\n fatura de exemplo')

let state
let sql
beforeEach(() => {
    jest.clearAllMocks()
    sql = []
    state = {
        walletType: 'PF',
        limitSetting: undefined,
        uploadsToday: 0,
        existingInvoice: null,
        confirmedInInvoice: [],
        reviewFound: null, // quantas compras a revisão acha (padrão: todas)
        categoriesOwned: null,
        itemsLeft: 3
    }
    mockClient.query.mockImplementation(async (rawSql, params = []) => {
        const q = norm(rawSql)
        sql.push({ q, params })
        if (q.includes('FROM credit_cards c') && q.includes('LEFT JOIN business_units')) {
            return { rows: params[0] === 7 ? [{ id: 7, name: 'Inter', lastFour: '4321', account_type: state.walletType }] : [] }
        }
        if (q.startsWith('SELECT value FROM system_settings WHERE key = $1')) {
            state.limitKey = params[0]
            return { rows: state.limitSetting === undefined ? [] : [{ value: state.limitSetting }] }
        }
        if (q.includes('FROM invoice_uploads') && q.includes('COUNT(*)')) return { rows: [{ total: state.uploadsToday }] }
        if (q.startsWith('SELECT name FROM finance_categories')) return { rows: [{ name: 'Mercado' }] }
        if (q.startsWith('INSERT INTO invoice_uploads')) return { rows: [{ id: 55 }] }
        if (q.startsWith('SELECT id FROM card_invoices')) return { rows: state.existingInvoice ? [{ id: state.existingInvoice }] : [] }
        if (q.startsWith('INSERT INTO card_invoices')) return { rows: [{ id: 300 }] }
        if (q.startsWith('SELECT description, amount, "transactionDate" FROM invoice_items')) return { rows: state.confirmedInInvoice }
        if (q.startsWith('INSERT INTO invoice_items')) {
            return { rows: [{ id: 900 + sql.filter(s => s.q.startsWith('INSERT INTO invoice_items')).length, description: params[2], amount: params[3], transactionDate: params[4], installment: params[7] }] }
        }
        if (q.startsWith('SELECT COALESCE(SUM(amount)')) return { rows: [{ totalAmount: 100 }] }
        // revisão
        if (q.includes('FROM card_invoices ci') && q.includes('WHERE ci.id = $1')) {
            return { rows: params[0] === 300 ? [{ id: 300, invoiceDueDate: '2026-11-10', cardId: 7, business_unit_id: 3, account_type: state.walletType }] : [] }
        }
        if (q.startsWith('SELECT id FROM invoice_items WHERE "invoiceId" = $1')) {
            const ids = params[2]
            return { rows: ids.slice(0, state.reviewFound ?? ids.length).map(id => ({ id })) }
        }
        if (q.startsWith('SELECT id FROM finance_categories WHERE "userId" = $1 AND id = ANY')) {
            const ids = params[1]
            return { rows: (state.categoriesOwned ?? ids).map(id => ({ id })) }
        }
        if (q.startsWith('SELECT id FROM finance_categories WHERE name = $1')) return { rows: params[0] === 'Mercado' ? [{ id: 12 }] : [] }
        if (q.startsWith('UPDATE invoice_items')) return { rows: [{ id: params[2], amount: 10, description: 'x', categoryId: params[0], isConfirmed: true }] }
        if (q.startsWith('SELECT id FROM finance_transactions')) return { rows: [] }
        if (q.startsWith('SELECT COUNT(*)::int AS total FROM invoice_items')) return { rows: [{ total: state.itemsLeft }] }
        return { rows: [], rowCount: 1 }
    })
    mockParseInvoice.mockResolvedValue({
        metadata: { dueDate: '2026-11-10', closingDate: '2026-11-03', totalAmount: 100, cardLastFour: '4321', referenceMonth: 10, referenceYear: 2026 },
        items: [
            { description: 'Mercado Bom Preço', amount: 80, transactionDate: '2026-10-05', category: 'Mercado', confidence: 0.9, installment: null },
            { description: 'Loja X', amount: 20, transactionDate: '2026-10-06', category: 'Outros', confidence: 0.4, installment: '2/10' }
        ]
    })
    jest.spyOn(console, 'error').mockImplementation(() => {})
    jest.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => { console.error.mockRestore(); console.log.mockRestore() })

const ran = (start) => sql.filter(s => s.q.startsWith(start))
const send = (buffer = PDF, type = 'application/pdf', name = 'fatura.pdf', cardId = '7') =>
    request(app).post('/api/finance/invoices/upload').field('cardId', cardId).attach('file', buffer, { filename: name, contentType: type })

describe('Enviar fatura: arquivo e limites', () => {
    test('arquivo que não é do tipo informado é recusado antes de abrir conexão', async () => {
        const res = await send(Buffer.from('MZ\x90\x00 programa'), 'application/pdf')
        expect(res.status).toBe(400)
        expect(mockPool.connect).not.toHaveBeenCalled()
        expect(mockParseInvoice).not.toHaveBeenCalled()
    })

    test('planilha binária enviada como CSV é recusada', async () => {
        const res = await send(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0x00, 0x00, 0x41]), 'text/csv', 'fatura.csv')
        expect(res.status).toBe(400)
    })

    test('cartão inválido dá 404 sem erro 500', async () => {
        expect((await send(PDF, 'application/pdf', 'f.pdf', 'abc')).status).toBe(404)
        expect(mockPool.connect).not.toHaveBeenCalled()
    })

    test('cartão de outra pessoa: 404 e a conexão é devolvida uma vez só', async () => {
        const res = await send(PDF, 'application/pdf', 'f.pdf', '8')
        expect(res.status).toBe(404)
        expect(mockClient.release).toHaveBeenCalledTimes(1)
    })

    test('passou do limite do dia: 429 e a IA nem é chamada', async () => {
        state.uploadsToday = 20
        const res = await send()
        expect(res.status).toBe(429)
        expect(mockParseInvoice).not.toHaveBeenCalled()
        expect(ran('INSERT INTO invoice_uploads')).toHaveLength(0)
    })

    test('limite configurado pelo admin para o plano vale; 0 = sem limite; valor estranho usa o padrão', async () => {
        state.limitSetting = '3'; state.uploadsToday = 3
        expect((await send()).status).toBe(429)
        expect(state.limitKey).toBe('invoice_upload_limit_2')
        state.limitSetting = 'abc'; state.uploadsToday = 19
        expect((await send()).status).toBe(201)
        state.uploadsToday = 20
        expect((await send()).status).toBe(429)
        state.limitSetting = '0'; state.uploadsToday = 999
        expect((await send()).status).toBe(201)
    })

    test('cartão MEI manda para a IA as categorias de despesa do MEI', async () => {
        state.walletType = 'PJ'
        await send()
        expect(ran('SELECT name FROM finance_categories')[0].params).toEqual([1, 'DESPESA_MEI'])
    })
})

describe('Enviar fatura: resposta da IA', () => {
    test('erro interno da IA não vai para a tela', async () => {
        mockParseInvoice.mockRejectedValueOnce(new Error('API key not valid: AIzaSECRETO'))
        const res = await send()
        expect(res.status).toBe(503)
        expect(JSON.stringify(res.body)).not.toContain('AIza')
        expect(mockClient.release).toHaveBeenCalledTimes(1)
    })

    test('erro pensado para a pessoa (PDF protegido) aparece com 422', async () => {
        mockParseInvoice.mockRejectedValueOnce(Object.assign(new Error('x'), { userMessage: 'O PDF tem proteção do banco.' }))
        const res = await send()
        expect(res.status).toBe(422)
        expect(res.body.message).toBe('O PDF tem proteção do banco.')
    })

    test('compras inválidas ficam de fora, estorno fica negativo, datas e parcelas conferidas', async () => {
        mockParseInvoice.mockResolvedValueOnce({
            metadata: { dueDate: '2026-02-31', totalAmount: 'abc' },
            items: [
                { description: 'Boa', amount: 50, transactionDate: '2026-10-05', category: 'Mercado', confidence: 3, installment: '1/3' },
                { description: 'Estorno loja', amount: -15, transactionDate: 'ontem', category: null, confidence: 0.5, installment: 'xx' },
                { description: '', amount: 10 },
                { description: 'Sem valor', amount: 'abc' },
                { description: 'Zero', amount: 0 },
                { description: 'Absurdo', amount: 1e12 }
            ]
        })
        const res = await send()
        expect(res.status).toBe(201)
        const inserts = ran('INSERT INTO invoice_items').map(s => s.params)
        expect(inserts).toHaveLength(2)
        expect(inserts[0].slice(2, 8)).toEqual(['Boa', 50, '2026-10-05', 'Mercado', 1, '1/3'])
        expect(inserts[1].slice(2, 8)).toEqual(['Estorno loja', -15, null, 'Outros', 0.5, null])
        // vencimento inválido não vai para o banco
        expect(ran('INSERT INTO card_invoices')[0].params[5]).toBeNull()
        expect(res.body.metadata.dueDate).toBeNull()
    })

    test('nenhuma compra válida: 422 e nenhuma fatura criada', async () => {
        mockParseInvoice.mockResolvedValueOnce({ metadata: {}, items: [{ description: '', amount: 0 }] })
        const res = await send()
        expect(res.status).toBe(422)
        expect(ran('INSERT INTO card_invoices')).toHaveLength(0)
    })

    test('fatura do mês do vencimento e dados do cartão na resposta', async () => {
        const res = await send()
        const inv = ran('INSERT INTO card_invoices')[0].params
        expect(inv.slice(2, 4)).toEqual([11, 2026])
        expect(res.body.card).toEqual({ id: 7, name: 'Inter', lastFour: '4321', walletType: 'PF' })
        expect(res.body.metadata).toMatchObject({ cardLastFour: '4321', totalAmount: 100, dueDate: '2026-11-10' })
    })

    test('compra repetida é reconhecida mesmo quando a IA escreve a parcela na descrição de um jeito diferente', async () => {
        state.existingInvoice = 300
        state.confirmedInInvoice = [
            { description: 'MERCADOLIVRE*PENSEPNE', amount: 110.23, transactionDate: '2025-12-11' },
            { description: 'POSTO MIRANTE', amount: 51.56, transactionDate: '2026-09-19' }
        ]
        mockParseInvoice.mockResolvedValueOnce({
            metadata: { dueDate: '2026-11-10' },
            items: [
                { description: 'MERCADOLIVRE*PENSEPNE (Parcela 11 de 12)', amount: 110.23, transactionDate: '2025-12-11', installment: '11/12' },
                { description: 'POSTO MIRANTE PARC 02/03', amount: 51.56, transactionDate: '2026-09-19', installment: '2/3' },
                { description: 'POSTO IPIRANGA', amount: 51.56, transactionDate: '2026-09-20' }
            ]
        })
        const res = await send()
        expect(res.body.items.map(i => i.alreadyInInvoice)).toEqual([true, true, false])
    })

    test('finais de todos os cartões da fatura (titular e adicionais) vão na resposta', async () => {
        mockParseInvoice.mockResolvedValueOnce({
            metadata: { dueDate: '2026-11-10', cardLastFour: '6741', cardsLastFour: ['4518', '6741', 'abc', 12] },
            items: [{ description: 'Loja', amount: 10 }]
        })
        const res = await send()
        expect(res.body.metadata.cardsLastFour).toEqual(['6741', '4518'])
    })

    test('fatura que já tinha compras lançadas: as repetidas vêm marcadas', async () => {
        state.existingInvoice = 300
        state.confirmedInInvoice = [{ description: 'MERCADO  bom preço', amount: 80, transactionDate: new Date('2026-10-05T00:00:00Z') }]
        const res = await send()
        expect(res.status).toBe(201)
        expect(res.body.alreadyConfirmedCount).toBe(1)
        expect(res.body.items.map(i => i.alreadyInInvoice)).toEqual([true, false])
        expect(ran('DELETE FROM invoice_items WHERE "invoiceId" = $1 AND "isConfirmed" = FALSE')).toHaveLength(1)
    })
})

describe('Revisão: confirmar e descartar de uma vez', () => {
    const review = (body, id = 300) => request(app).post(`/api/finance/invoices/${id}/review`).send(body)

    test('confirma com categoria, descarta o resto, lança no Extrato e refaz o total, numa transação', async () => {
        const res = await review({ confirm: [{ id: 901, categoryId: 12 }, { id: 902, categoryName: 'Mercado' }, { id: 903, categoryName: 'Nova' }], discard: [904] })
        expect(res.status).toBe(200)
        expect(res.body).toEqual({ confirmed: 3, discarded: 1, invoiceDeleted: false })
        const updates = ran('UPDATE invoice_items').map(s => s.params)
        expect(updates[0].slice(0, 3)).toEqual([12, null, 901])
        expect(updates[1].slice(0, 3)).toEqual([12, null, 902]) // nome achado na carteira certa
        expect(updates[2].slice(0, 3)).toEqual([null, 'Nova', 903]) // fica como sugestão
        expect(ran('INSERT INTO finance_transactions')).toHaveLength(3)
        expect(ran('DELETE FROM invoice_items')[0].params).toEqual([[904], 1])
        expect(ran('UPDATE card_invoices SET "totalAmount"')).toHaveLength(1)
        expect(ran('UPDATE invoice_uploads SET status')[0].params[0]).toBe('COMPLETED')
        expect(sql[0].q).toBe('BEGIN')
        expect(sql[sql.length - 1].q).toBe('COMMIT')
    })

    test('categoria pelo nome em cartão MEI procura despesas do MEI', async () => {
        state.walletType = 'PJ'
        await review({ confirm: [{ id: 901, categoryName: 'Mercado' }], discard: [] })
        expect(ran('SELECT id FROM finance_categories WHERE name = $1')[0].params).toEqual(['Mercado', 1, 'DESPESA_MEI'])
    })

    test('compra de outra fatura (ou já confirmada) faz desfazer tudo', async () => {
        state.reviewFound = 1
        const res = await review({ confirm: [{ id: 901 }], discard: [999] })
        expect(res.status).toBe(400)
        expect(ran('UPDATE invoice_items')).toHaveLength(0)
        expect(ran('ROLLBACK')).toHaveLength(1)
    })

    test('categoria de outra pessoa é recusada', async () => {
        state.categoriesOwned = []
        const res = await review({ confirm: [{ id: 901, categoryId: 77 }], discard: [] })
        expect(res.status).toBe(403)
        expect(ran('UPDATE invoice_items')).toHaveLength(0)
    })

    test('fatura de outra pessoa: 404', async () => {
        const res = await review({ confirm: [{ id: 901 }], discard: [] }, 301)
        expect(res.status).toBe(404)
        expect(res.body.message).toBe('Fatura não encontrada')
        expect(ran('ROLLBACK')).toHaveLength(1)
    })

    test.each([
        [{ confirm: [], discard: [] }],
        [{ confirm: [{ id: 'x' }], discard: [] }],
        [{ confirm: [{ id: 1 }], discard: [1] }],
        [{ confirm: [{ id: 1, categoryId: 'abc' }], discard: [] }],
        [{ confirm: 'tudo', discard: [] }]
    ])('pedido inválido %o é recusado sem abrir transação', async (body) => {
        const res = await review(body)
        expect(res.status).toBe(400)
        expect(mockPool.connect).not.toHaveBeenCalled()
    })

    test('descartar tudo apaga só as compras lidas e a fatura vazia (soltando os envios antes)', async () => {
        state.itemsLeft = 0
        const res = await review({ confirm: [], discard: [901, 902] })
        expect(res.status).toBe(200)
        expect(res.body.invoiceDeleted).toBe(true)
        const qs = sql.map(s => s.q)
        const delItems = qs.findIndex(q => q.startsWith('DELETE FROM invoice_items'))
        expect(qs[delItems]).toContain('"isConfirmed" = FALSE')
        const unlink = qs.findIndex(q => q.startsWith('UPDATE invoice_uploads SET "invoiceId" = NULL'))
        const delInvoice = qs.findIndex(q => q.startsWith('DELETE FROM card_invoices'))
        expect(unlink).toBeGreaterThan(delItems)
        expect(delInvoice).toBeGreaterThan(unlink)
        expect(ran('UPDATE invoice_uploads SET status')[0].params[0]).toBe('FAILED')
    })

    test('descartar uma releitura de fatura que já tinha compras não apaga a fatura', async () => {
        state.itemsLeft = 4
        const res = await review({ confirm: [], discard: [901] })
        expect(res.body.invoiceDeleted).toBe(false)
        expect(ran('DELETE FROM card_invoices')).toHaveLength(0)
    })
})

describe('Faturas lidas e não conferidas', () => {
    test('lista só as do cartão da própria pessoa', async () => {
        mockDb.query.mockResolvedValueOnce({ rows: [{ invoiceId: 300, referenceMonth: 11, referenceYear: 2026, pending: 12 }] })
        const res = await request(app).get('/api/finance/invoices/card/7/pending')
        expect(res.status).toBe(200)
        expect(res.body[0].pending).toBe(12)
        const [q, params] = mockDb.query.mock.calls[0]
        expect(norm(q)).toContain('"isConfirmed" = FALSE')
        expect(norm(q)).toContain('c."userId" = $2')
        expect(params).toEqual([7, 1])
    })

    test('cartão inválido dá 404', async () => {
        expect((await request(app).get('/api/finance/invoices/card/x/pending')).status).toBe(404)
    })
})
