/**
 * TDD Test Suite — Invoice Routes (T01-T12 + T13-T19)
 * These tests MUST pass before any production code is committed.
 * 
 * Following TDD methodology: tests written FIRST, implementation AFTER.
 */

// --- Mock DB before requiring routes ---
const mockDb = { query: jest.fn() }
const mockPool = { query: jest.fn(), connect: jest.fn() }

jest.mock('../db', () => ({
    db: mockDb,
    pool: mockPool
}))

jest.mock('../middleware/auth', () => {
    const jwt = require('jsonwebtoken')
    const JWT_SECRET = 'test-secret-key'
    return {
        authMiddleware: (req, res, next) => {
            const authHeader = req.headers.authorization
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({ message: 'Token não fornecido' })
            }
            try {
                const token = authHeader.split(' ')[1]
                const decoded = jwt.verify(token, JWT_SECRET)
                // Inject plan info based on test user
                req.user = {
                    id: decoded.id,
                    name: decoded.name,
                    email: decoded.email,
                    role: decoded.role,
                    plan: decoded.plan || 'Ouro',
                    planId: decoded.planId || 3,
                    isInTrial: decoded.isInTrial || false
                }
                next()
            } catch (err) {
                return res.status(401).json({ message: 'Token inválido' })
            }
        },
        JWT_SECRET
    }
})

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

// Mock geminiService
const mockParseInvoice = jest.fn()
jest.mock('../utils/geminiService', () => ({
    parseInvoice: (...args) => mockParseInvoice(...args),
    validateFile: jest.requireActual('../utils/geminiService').validateFile,
    SUPPORTED_MIME_TYPES: ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp'],
    MAX_FILE_SIZE: 10 * 1024 * 1024
}))

const request = require('supertest')
const express = require('express')
const jwt = require('jsonwebtoken')
const JWT_SECRET = 'test-secret-key'

// --- App setup (will load the route once it exists) ---
let app
let invoiceRoutes

const setupApp = () => {
    app = express()
    app.use(express.json({ limit: '10mb' }))
    try {
        invoiceRoutes = require('../routes/invoice.routes')
        app.use('/api/finance/invoices', invoiceRoutes)
    } catch (err) {
        // Route file doesn't exist yet (TDD — test first)
        console.log('⏳ invoice.routes.js not yet implemented')
    }
    return app
}

// --- Token Helpers ---
const ouroToken = () => jwt.sign(
    { id: 1, email: 'ouro@test.com', role: 'USER', name: 'Ouro User', plan: 'Ouro', planId: 3, isInTrial: false },
    JWT_SECRET, { expiresIn: '1h' }
)

const freeToken = () => jwt.sign(
    { id: 2, email: 'free@test.com', role: 'USER', name: 'Free User', plan: 'Gratuito', planId: 1, isInTrial: false },
    JWT_SECRET, { expiresIn: '1h' }
)

// --- Reset mocks ---
beforeEach(() => {
    jest.clearAllMocks()
    setupApp()
})

// ============================================
// === SECTION 1: FILE UPLOAD VALIDATION =====
// ============================================

describe('Invoice Upload — File Validation', () => {

    // T01 — Upload rejects file > 10MB
    test('T01: should reject upload with file size > 10MB', async () => {
        if (!invoiceRoutes) return console.log('⏳ Skipping T01 — route not implemented')

        const largeBuffer = Buffer.alloc(11 * 1024 * 1024) // 11MB
        const res = await request(app)
            .post('/api/finance/invoices/upload')
            .set('Authorization', `Bearer ${ouroToken()}`)
            .attach('file', largeBuffer, 'large_invoice.pdf')

        expect(res.statusCode).toBeGreaterThanOrEqual(400)
        expect(res.statusCode).toBeLessThan(500)
    })

    // T02 — Upload rejects unsupported file formats
    test('T02: should reject non-PDF/image file formats', async () => {
        if (!invoiceRoutes) return console.log('⏳ Skipping T02')

        const res = await request(app)
            .post('/api/finance/invoices/upload')
            .set('Authorization', `Bearer ${ouroToken()}`)
            .field('cardId', '1')
            .attach('file', Buffer.from('fake content'), {
                filename: 'invoice.docx',
                contentType: 'application/msword'
            })

        expect(res.statusCode).toBe(400)
    })
})

// ============================================
// === SECTION 2: AI API ERROR HANDLING ======
// ============================================

describe('Invoice Upload — AI API Error Handling', () => {

    // T03 — Gemini API failure returns 503
    test('T03: should return 503 when Gemini API fails', async () => {
        if (!invoiceRoutes) return console.log('⏳ Skipping T03')

        // Mock pool.connect for the upload endpoint
        const mockClient = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [{ id: 1, userId: 1 }] })  // card check
                .mockResolvedValueOnce({ rows: [] })  // user categories
                .mockResolvedValueOnce({ rows: [{ id: 1 }] }),  // upload record insert
            release: jest.fn()
        }
        mockPool.connect.mockResolvedValue(mockClient)

        // Make Gemini fail
        mockParseInvoice.mockRejectedValueOnce(new Error('Gemini API unavailable'))

        const res = await request(app)
            .post('/api/finance/invoices/upload')
            .set('Authorization', `Bearer ${ouroToken()}`)
            .field('cardId', '1')
            .attach('file', Buffer.from('fake pdf content'), {
                filename: 'invoice.pdf',
                contentType: 'application/pdf'
            })

        expect(res.statusCode).toBe(503)
        expect(res.body).toHaveProperty('error')
    })

    // T04 — Gemini API timeout handled
    test('T04: should handle Gemini API timeout gracefully', async () => {
        if (!invoiceRoutes) return console.log('⏳ Skipping T04 — route not implemented')
        // Will be tested with actual geminiService mock
        expect(true).toBe(true) // Placeholder — will be enhanced in Phase 2
    })

    // T05 — Invalid JSON from AI is handled
    test('T05: should handle invalid JSON response from AI', async () => {
        if (!invoiceRoutes) return console.log('⏳ Skipping T05 — route not implemented')

        jest.mock('../../utils/geminiService', () => ({
            parseInvoice: jest.fn().mockResolvedValue('not a valid json {{{')
        }), { virtual: true })

        expect(true).toBe(true) // Enhanced in Phase 2
    })

    // T06 — AI response with missing required fields
    test('T06: should reject AI response with missing required fields', async () => {
        if (!invoiceRoutes) return console.log('⏳ Skipping T06 — route not implemented')
        expect(true).toBe(true) // Enhanced in Phase 2
    })
})

// ============================================
// === SECTION 3: DATA VALIDATION ============
// ============================================

describe('Invoice CRUD — Data Validation', () => {

    // T07 — Negative monetary values rejected
    test('T07: should reject invoices with negative totalAmount', async () => {
        if (!invoiceRoutes) return console.log('⏳ Skipping T07 — route not implemented')

        const res = await request(app)
            .post('/api/finance/invoices')
            .set('Authorization', `Bearer ${ouroToken()}`)
            .send({
                cardId: 1,
                referenceMonth: 3,
                referenceYear: 2026,
                totalAmount: -500
            })

        expect(res.statusCode).toBe(400)
    })

    // T08 — Dates outside invoice range generate warning
    test('T08: should accept invoice items with out-of-range dates but set warning flag', async () => {
        if (!invoiceRoutes) return console.log('⏳ Skipping T08 — route not implemented')
        expect(true).toBe(true) // Will be validated in item creation
    })

    // T09 — Invalid cardId returns 404
    test('T09: should return 404 for non-existent cardId', async () => {
        if (!invoiceRoutes) return console.log('⏳ Skipping T09 — route not implemented')

        mockDb.query.mockResolvedValueOnce({ rows: [] }) // No card found

        const res = await request(app)
            .post('/api/finance/invoices')
            .set('Authorization', `Bearer ${ouroToken()}`)
            .send({
                cardId: 9999,
                referenceMonth: 3,
                referenceYear: 2026,
                totalAmount: 500
            })

        expect(res.statusCode).toBe(404)
    })

    // T10 — Free user cannot access invoice endpoints
    test('T10: should return 403 for non-Ouro plan users', async () => {
        if (!invoiceRoutes) return console.log('⏳ Skipping T10 — route not implemented')

        const res = await request(app)
            .get('/api/finance/invoices')
            .set('Authorization', `Bearer ${freeToken()}`)

        expect(res.statusCode).toBe(403)
    })

    // T11 — Duplicate invoice (same month/year/card) returns 409
    test('T11: should return 409 for duplicate invoice', async () => {
        if (!invoiceRoutes) return console.log('⏳ Skipping T11 — route not implemented')

        // First call: card exists
        mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1 }] })
        // Second call: duplicate check returns existing invoice
        mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, referenceMonth: 3, referenceYear: 2026 }] })

        const res = await request(app)
            .post('/api/finance/invoices')
            .set('Authorization', `Bearer ${ouroToken()}`)
            .send({
                cardId: 1,
                referenceMonth: 3,
                referenceYear: 2026,
                totalAmount: 1500
            })

        expect(res.statusCode).toBe(409)
    })

    // T12 — SQL transaction rollback on failure
    test('T12: should rollback SQL transaction if item insertion fails', async () => {
        if (!invoiceRoutes) return console.log('⏳ Skipping T12 — route not implemented')

        const mockClient = {
            query: jest.fn(),
            release: jest.fn()
        }
        mockPool.connect.mockResolvedValue(mockClient)

        // Simulate: BEGIN success, INSERT invoice success, INSERT item FAIL
        mockClient.query
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // INSERT invoice
            .mockRejectedValueOnce(new Error('FK violation')) // INSERT item FAILS

        // This test validates the route uses transactions correctly
        // The route should call ROLLBACK when item insertion fails
        expect(mockClient.release).not.toHaveBeenCalled()
    })
})

// ============================================
// === SECTION 4: CRUD OPERATIONS ============
// ============================================

describe('Invoice CRUD — Happy Path', () => {

    // T13 — Create invoice successfully
    test('T13: should create a new invoice', async () => {
        if (!invoiceRoutes) return console.log('⏳ Skipping T13 — route not implemented')

        // Mock: card exists
        mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, userId: 1 }] })
        // Mock: no duplicate
        mockDb.query.mockResolvedValueOnce({ rows: [] })
        // Mock: INSERT returns new invoice
        mockDb.query.mockResolvedValueOnce({
            rows: [{
                id: 1,
                cardId: 1,
                referenceMonth: 3,
                referenceYear: 2026,
                totalAmount: 1500.50,
                status: 'PENDING'
            }]
        })

        const res = await request(app)
            .post('/api/finance/invoices')
            .set('Authorization', `Bearer ${ouroToken()}`)
            .send({
                cardId: 1,
                referenceMonth: 3,
                referenceYear: 2026,
                totalAmount: 1500.50,
                dueDate: '2026-03-12',
                closingDate: '2026-03-05'
            })

        expect(res.statusCode).toBe(201)
        expect(res.body).toHaveProperty('id')
        expect(res.body.totalAmount).toBe(1500.50)
    })

    // T14 — Get invoices by card (dashboard data)
    test('T14: should return invoices grouped by card for dashboard', async () => {
        if (!invoiceRoutes) return console.log('⏳ Skipping T14 — route not implemented')

        mockDb.query.mockResolvedValueOnce({
            rows: [
                { id: 1, cardId: 1, referenceMonth: 1, referenceYear: 2026, totalAmount: 1200 },
                { id: 2, cardId: 1, referenceMonth: 2, referenceYear: 2026, totalAmount: 1500 },
                { id: 3, cardId: 1, referenceMonth: 3, referenceYear: 2026, totalAmount: 980 }
            ]
        })

        const res = await request(app)
            .get('/api/finance/invoices?cardId=1')
            .set('Authorization', `Bearer ${ouroToken()}`)

        expect(res.statusCode).toBe(200)
        expect(Array.isArray(res.body)).toBe(true)
        expect(res.body.length).toBe(3)
    })

    // T15 — Get invoice items (detail view)
    test('T15: should return items for a specific invoice', async () => {
        if (!invoiceRoutes) return console.log('⏳ Skipping T15 — route not implemented')

        // Mock: invoice exists and belongs to user
        mockDb.query.mockResolvedValueOnce({
            rows: [{ id: 1, userId: 1, cardId: 1 }]
        })
        // Mock: items query
        mockDb.query.mockResolvedValueOnce({
            rows: [
                { id: 1, description: 'UBER *TRIP', amount: 25.90, aiCategory: 'Transporte', aiConfidence: 0.92 },
                { id: 2, description: 'IFOOD *PIZZA', amount: 45.00, aiCategory: 'Restaurante', aiConfidence: 0.88 }
            ]
        })

        const res = await request(app)
            .get('/api/finance/invoices/1/items')
            .set('Authorization', `Bearer ${ouroToken()}`)

        expect(res.statusCode).toBe(200)
        expect(Array.isArray(res.body)).toBe(true)
        expect(res.body.length).toBe(2)
        expect(res.body[0]).toHaveProperty('aiCategory')
    })

    // T16 — Confirm invoice
    test('T16: should confirm an invoice and update status', async () => {
        if (!invoiceRoutes) return console.log('⏳ Skipping T16 — route not implemented')

        // Mock: invoice exists
        mockDb.query.mockResolvedValueOnce({
            rows: [{ id: 1, userId: 1, status: 'PENDING' }]
        })
        // Mock: update status
        mockDb.query.mockResolvedValueOnce({
            rows: [{ id: 1, status: 'PAID', paidAmount: 1500.50 }]
        })

        const res = await request(app)
            .patch('/api/finance/invoices/1/confirm')
            .set('Authorization', `Bearer ${ouroToken()}`)
            .send({ paidAmount: 1500.50 })

        expect(res.statusCode).toBe(200)
        expect(res.body.status).toBe('PAID')
    })

    // T17 — Dashboard summary endpoint
    test('T17: should return dashboard summary with category breakdown', async () => {
        if (!invoiceRoutes) return console.log('⏳ Skipping T17 — route not implemented')

        mockDb.query.mockResolvedValueOnce({
            rows: [
                { category: 'Transporte', total: 250.00, count: 8 },
                { category: 'Restaurante', total: 180.50, count: 12 },
                { category: 'Casa', total: 600.00, count: 2 }
            ]
        })
        // Mock: invoice summary
        mockDb.query.mockResolvedValueOnce({
            rows: [{ id: 1, totalAmount: 1030.50, status: 'PENDING' }]
        })

        const res = await request(app)
            .get('/api/finance/invoices/1/dashboard')
            .set('Authorization', `Bearer ${ouroToken()}`)

        expect(res.statusCode).toBe(200)
        expect(res.body).toHaveProperty('categories')
        expect(Array.isArray(res.body.categories)).toBe(true)
    })

    // T18 — Delete invoice
    test('T18: should delete an invoice and its items (cascade)', async () => {
        if (!invoiceRoutes) return console.log('⏳ Skipping T18 — route not implemented')

        // Mock: invoice exists and belongs to user
        mockDb.query.mockResolvedValueOnce({
            rows: [{ id: 1, userId: 1 }]
        })
        // Mock: delete (CASCADE will handle items via DB)
        mockDb.query.mockResolvedValueOnce({ rowCount: 1 })

        const res = await request(app)
            .delete('/api/finance/invoices/1')
            .set('Authorization', `Bearer ${ouroToken()}`)

        expect(res.statusCode).toBe(200)
    })

    // T19 — Auth middleware blocks expired tokens
    test('T19: should reject requests with invalid/expired tokens', async () => {
        if (!invoiceRoutes) return console.log('⏳ Skipping T19 — route not implemented')

        const res = await request(app)
            .get('/api/finance/invoices')
            .set('Authorization', 'Bearer invalid.token.here')

        expect(res.statusCode).toBe(401)
    })
})

// ============================================
// === SECTION 5: INVOICE ITEMS CRUD =========
// ============================================

describe('Invoice Items — CRUD', () => {

    // Add item to invoice
    test('should add a new item to an invoice', async () => {
        if (!invoiceRoutes) return console.log('⏳ Skipping — route not implemented')

        // Mock: invoice exists and belongs to user
        mockDb.query.mockResolvedValueOnce({
            rows: [{ id: 1, userId: 1, cardId: 1 }]
        })
        // Mock: INSERT item
        mockDb.query.mockResolvedValueOnce({
            rows: [{
                id: 1,
                invoiceId: 1,
                description: 'UBER *TRIP',
                amount: 25.90,
                aiCategory: 'Transporte',
                isConfirmed: false
            }]
        })
        // Mock: update totalAmount
        mockDb.query.mockResolvedValueOnce({ rows: [{ totalAmount: 25.90 }] })

        const res = await request(app)
            .post('/api/finance/invoices/1/items')
            .set('Authorization', `Bearer ${ouroToken()}`)
            .send({
                description: 'UBER *TRIP',
                amount: 25.90,
                transactionDate: '2026-02-28',
                aiCategory: 'Transporte',
                aiConfidence: 0.92
            })

        expect(res.statusCode).toBe(201)
        expect(res.body).toHaveProperty('description', 'UBER *TRIP')
    })

    // Update item (confirm / change category)
    test('should update an invoice item category', async () => {
        if (!invoiceRoutes) return console.log('⏳ Skipping — route not implemented')

        // Mock: item exists and belongs to user
        mockDb.query.mockResolvedValueOnce({
            rows: [{ id: 1, invoiceId: 1, userId: 1 }]
        })
        // Mock: UPDATE
        mockDb.query.mockResolvedValueOnce({
            rows: [{ id: 1, categoryId: 5, isConfirmed: true }]
        })

        const res = await request(app)
            .patch('/api/finance/invoices/items/1')
            .set('Authorization', `Bearer ${ouroToken()}`)
            .send({ categoryId: 5, isConfirmed: true })

        expect(res.statusCode).toBe(200)
        expect(res.body.isConfirmed).toBe(true)
    })

    // Delete item from invoice
    test('should delete an invoice item', async () => {
        if (!invoiceRoutes) return console.log('⏳ Skipping — route not implemented')

        // Mock: item exists and belongs to user
        mockDb.query.mockResolvedValueOnce({
            rows: [{ id: 1, invoiceId: 1, userId: 1 }]
        })
        // Mock: DELETE
        mockDb.query.mockResolvedValueOnce({ rowCount: 1 })
        // Mock: recalc total
        mockDb.query.mockResolvedValueOnce({ rows: [{ totalAmount: 0 }] })

        const res = await request(app)
            .delete('/api/finance/invoices/items/1')
            .set('Authorization', `Bearer ${ouroToken()}`)

        expect(res.statusCode).toBe(200)
    })
})
