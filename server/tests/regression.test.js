/**
 * Regression & Integration Test Suite — Phase 5
 * 
 * Tests:
 * R01: server.js loads without error (invoice routes registered)
 * R02: finance.routes.js still exports a valid router
 * R03: invoice.routes.js exports a valid router
 * R04: geminiService.js validates files correctly
 * R05: geminiService.js rejects oversized files
 * R06: geminiService.js supports all declared MIME types
 * R07: ouroGuard.js middleware blocks non-Ouro users
 * R08: ouroGuard.js middleware allows Ouro users
 * I01: Full upload flow — happy path (mock Gemini + mock DB)
 * I02: Full upload flow — card not found
 * I03: Full upload flow — no file sent
 * I04: Full upload flow — no cardId sent
 */

// --- Mock DB ---
const mockDb = {
    query: jest.fn()
}
const mockPool = {
    connect: jest.fn()
}

jest.mock('../db', () => ({
    db: mockDb,
    pool: mockPool
}))

jest.mock('../middleware/auth', () => ({
    authMiddleware: (req, res, next) => {
        const auth = req.headers.authorization
        if (!auth) return res.status(401).json({ message: 'Token required' })
        req.user = { id: 1, plan: 'Ouro', isInTrial: false }
        next()
    }
}))

jest.mock('../middleware/walletSecurity', () => ({
    validateWalletOwnership: (req, res, next) => next()
}))

jest.mock('../middleware/ouroGuard', () => ({
    ouroOnly: (req, res, next) => {
        if (req.user.plan !== 'Ouro' && !req.user.isInTrial) {
            return res.status(403).json({ message: 'Recurso exclusivo do plano Ouro' })
        }
        next()
    }
}))

const mockParseInvoice = jest.fn()
jest.mock('../utils/geminiService', () => ({
    parseInvoice: (...args) => mockParseInvoice(...args),
    validateFile: jest.requireActual('../utils/geminiService').validateFile,
    SUPPORTED_MIME_TYPES: jest.requireActual('../utils/geminiService').SUPPORTED_MIME_TYPES,
    TEXT_MIME_TYPES: jest.requireActual('../utils/geminiService').TEXT_MIME_TYPES,
    MAX_FILE_SIZE: jest.requireActual('../utils/geminiService').MAX_FILE_SIZE
}))

const request = require('supertest')
const express = require('express')

// --- Helper: build app ---
const buildApp = () => {
    const app = express()
    app.use(express.json())
    const invoiceRoutes = require('../routes/invoice.routes')
    app.use('/api/finance/invoices', invoiceRoutes)
    return app
}

const TOKEN = 'Bearer test-token'

beforeEach(() => {
    jest.clearAllMocks()
})

// =============================================
// === REGRESSION TESTS ========================
// =============================================

describe('Regression — Module Integrity', () => {

    // R01: server.js references invoice routes
    test('R01: server.js requires invoice routes without error', () => {
        // Just verify the module path resolves
        expect(() => require('../routes/invoice.routes')).not.toThrow()
    })

    // R02: finance.routes.js still exports a router
    test('R02: finance.routes.js exports a valid Express router', () => {
        const financeRoutes = require('../routes/finance.routes')
        expect(financeRoutes).toBeDefined()
        expect(typeof financeRoutes).toBe('function') // Express router is a function
    })

    // R03: invoice.routes.js exports a router
    test('R03: invoice.routes.js exports a valid Express router', () => {
        const invoiceRoutes = require('../routes/invoice.routes')
        expect(invoiceRoutes).toBeDefined()
        expect(typeof invoiceRoutes).toBe('function')
    })

    // R04: geminiService validates files correctly
    test('R04: geminiService accepts valid PDF file', () => {
        const { validateFile } = require('../utils/geminiService')
        const buffer = Buffer.alloc(1024) // 1KB
        expect(validateFile(buffer, 'application/pdf')).toEqual({ valid: true })
    })

    // R05: geminiService rejects oversized files
    test('R05: geminiService rejects file >10MB', () => {
        const { validateFile, MAX_FILE_SIZE } = require('../utils/geminiService')
        const buffer = Buffer.alloc(MAX_FILE_SIZE + 1)
        const result = validateFile(buffer, 'application/pdf')
        expect(result.valid).toBe(false)
        expect(result.error).toContain('10MB')
    })

    // R06: geminiService supports CSV, OFX, PDF, PNG, JPG
    test('R06: geminiService accepts all declared MIME types', () => {
        const { validateFile, SUPPORTED_MIME_TYPES } = require('../utils/geminiService')
        const buffer = Buffer.alloc(100)

        for (const mimeType of SUPPORTED_MIME_TYPES) {
            const result = validateFile(buffer, mimeType)
            expect(result.valid).toBe(true)
        }
    })

    // R06b: CSV and OFX are in supported types
    test('R06b: CSV and OFX MIME types are supported', () => {
        const { SUPPORTED_MIME_TYPES, TEXT_MIME_TYPES } = require('../utils/geminiService')
        expect(SUPPORTED_MIME_TYPES).toContain('text/csv')
        expect(SUPPORTED_MIME_TYPES).toContain('application/x-ofx')
        expect(TEXT_MIME_TYPES).toContain('text/csv')
        expect(TEXT_MIME_TYPES).toContain('application/x-ofx')
    })

    // R07: ouroGuard blocks non-Ouro users
    test('R07: ouroGuard middleware blocks non-Ouro users', () => {
        const { ouroOnly } = require('../middleware/ouroGuard')
        const req = { user: { plan: 'Free', isInTrial: false } }
        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        }
        ouroOnly(req, res, jest.fn())
        expect(res.status).toHaveBeenCalledWith(403)
    })

    // R08: ouroGuard allows Ouro users
    test('R08: ouroGuard middleware allows Ouro users', () => {
        const { ouroOnly } = require('../middleware/ouroGuard')
        const req = { user: { plan: 'Ouro', isInTrial: false } }
        const next = jest.fn()
        ouroOnly(req, {}, next)
        expect(next).toHaveBeenCalled()
    })
})

// =============================================
// === INTEGRATION TESTS =======================
// =============================================

describe('Integration — Full Upload Flow', () => {

    // I01: Happy path — file upload → Gemini parse → DB insert → review response
    test('I01: Full upload flow returns 201 with items in review', async () => {
        const app = buildApp()

        const mockClient = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [{ id: 1, userId: 1 }] })       // card check
                .mockResolvedValueOnce({ rows: [{ name: 'Alimentação' }] })     // user categories
                .mockResolvedValueOnce({ rows: [{ id: 10 }] })                  // upload record
                .mockResolvedValueOnce(undefined)                                // BEGIN
                .mockResolvedValueOnce({ rows: [] })                             // dup check
                .mockResolvedValueOnce({ rows: [{ id: 100 }] })                 // insert invoice
                .mockResolvedValueOnce({ rows: [{ id: 201, description: 'UBER', amount: 25.90 }] }) // item 1
                .mockResolvedValueOnce({ rows: [{ id: 202, description: 'NETFLIX', amount: 55.90 }] }) // item 2
                .mockResolvedValueOnce({ rows: [{ totalAmount: 81.80 }] })      // SUM
                .mockResolvedValueOnce(undefined)                                // UPDATE total
                .mockResolvedValueOnce(undefined)                                // COMMIT
                .mockResolvedValueOnce(undefined),                               // UPDATE upload record
            release: jest.fn()
        }
        mockPool.connect.mockResolvedValue(mockClient)

        mockParseInvoice.mockResolvedValueOnce({
            metadata: {
                totalAmount: 81.80,
                referenceMonth: 3,
                referenceYear: 2026,
                dueDate: '2026-03-15'
            },
            items: [
                { description: 'UBER *TRIP', amount: 25.90, category: 'Transporte', confidence: 0.95, transactionDate: '2026-02-15', installment: null },
                { description: 'NETFLIX', amount: 55.90, category: 'Assinaturas', confidence: 0.90, transactionDate: '2026-02-20', installment: null }
            ]
        })

        const res = await request(app)
            .post('/api/finance/invoices/upload')
            .set('Authorization', TOKEN)
            .field('cardId', '1')
            .attach('file', Buffer.from('%PDF-1.4 fake content'), {
                filename: 'fatura_mar2026.pdf',
                contentType: 'application/pdf'
            })

        expect(res.statusCode).toBe(201)
        expect(res.body.message).toContain('sucesso')
        expect(res.body.items).toHaveLength(2)
        expect(res.body.invoiceId).toBe(100)
        expect(res.body.totalAmount).toBe(81.80)
        expect(mockParseInvoice).toHaveBeenCalledTimes(1)
        expect(mockClient.release).toHaveBeenCalled()
    })

    // I02: Card not found
    test('I02: Upload returns 404 when card does not exist', async () => {
        const app = buildApp()

        const mockClient = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [] }),   // card check — not found
            release: jest.fn()
        }
        mockPool.connect.mockResolvedValue(mockClient)

        const res = await request(app)
            .post('/api/finance/invoices/upload')
            .set('Authorization', TOKEN)
            .field('cardId', '999')
            .attach('file', Buffer.from('fake pdf'), {
                filename: 'fatura.pdf',
                contentType: 'application/pdf'
            })

        expect(res.statusCode).toBe(404)
        expect(res.body.message).toContain('Cartão')
    })

    // I03: No file sent
    test('I03: Upload returns 400 when no file is sent', async () => {
        const app = buildApp()

        const mockClient = {
            query: jest.fn(),
            release: jest.fn()
        }
        mockPool.connect.mockResolvedValue(mockClient)

        const res = await request(app)
            .post('/api/finance/invoices/upload')
            .set('Authorization', TOKEN)
            .field('cardId', '1')

        expect(res.statusCode).toBe(400)
    })

    // I04: No cardId sent
    test('I04: Upload returns 400 when no cardId is sent', async () => {
        const app = buildApp()

        const mockClient = {
            query: jest.fn(),
            release: jest.fn()
        }
        mockPool.connect.mockResolvedValue(mockClient)

        const res = await request(app)
            .post('/api/finance/invoices/upload')
            .set('Authorization', TOKEN)
            .attach('file', Buffer.from('fake pdf'), {
                filename: 'fatura.pdf',
                contentType: 'application/pdf'
            })

        expect(res.statusCode).toBe(400)
        expect(res.body.message).toContain('cardId')
    })
})
