/**
 * Exclusão de conta pelo próprio titular — DELETE /api/auth/me
 */
process.env.JWT_SECRET = 'test-secret'
process.env.STRIPE_SECRET_KEY = 'sk_test_dummy'

const bcrypt = require('bcryptjs')

const mockDb = { query: jest.fn() }
const mockClient = { query: jest.fn(), release: jest.fn() }
const mockPool = { query: jest.fn(), connect: jest.fn() }
jest.mock('../db', () => ({ db: mockDb, pool: mockPool }))

let mockCurrentUser = { id: 10, role: 'USER', email: 'titular@teste.com' }
jest.mock('../middleware/auth', () => ({
    authMiddleware: (req, res, next) => { req.user = { ...mockCurrentUser }; next() },
    generateToken: jest.fn(() => 'token')
}))

jest.mock('../utils/email', () => ({ sendPasswordResetEmail: jest.fn() }))
const mockAuditLog = jest.fn().mockResolvedValue()
jest.mock('../utils/auditLogger', () => ({ log: (...args) => mockAuditLog(...args) }))

const mockStripe = { subscriptions: { retrieve: jest.fn(), cancel: jest.fn() } }
jest.mock('stripe', () => () => mockStripe)

const request = require('supertest')
const express = require('express')
const { USER_DATA_STATEMENTS } = require('../utils/userDeletion')

const app = express()
app.use(express.json())
app.use('/api/auth', require('../routes/auth.routes'))

const PASSWORD = 'senha-correta-123'
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4)

const dbUser = (overrides = {}) => ({
    id: 10, email: 'titular@teste.com', role: 'USER', password: PASSWORD_HASH, stripeSubscriptionId: null, ...overrides
})

const sendDelete = (body) => request(app).delete('/api/auth/me').send(body)

describe('DELETE /api/auth/me - Exclusão de conta pelo titular', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockCurrentUser = { id: 10, role: 'USER', email: 'titular@teste.com' }
        mockPool.connect.mockResolvedValue(mockClient)
        mockClient.query.mockResolvedValue({ rowCount: 1 })
    })

    test('Deve exigir a palavra de confirmação EXCLUIR (400)', async () => {
        const res = await sendDelete({ password: PASSWORD, confirmation: 'excluir' })
        expect(res.statusCode).toBe(400)
        expect(mockDb.query).not.toHaveBeenCalled()
    })

    test('Deve exigir a senha (400)', async () => {
        const res = await sendDelete({ confirmation: 'EXCLUIR' })
        expect(res.statusCode).toBe(400)
        expect(mockDb.query).not.toHaveBeenCalled()
    })

    test('Deve recusar senha incorreta sem apagar nada (401)', async () => {
        mockDb.query.mockResolvedValueOnce({ rows: [dbUser()] })
        const res = await sendDelete({ password: 'errada', confirmation: 'EXCLUIR' })
        expect(res.statusCode).toBe(401)
        expect(mockPool.connect).not.toHaveBeenCalled()
        expect(mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({ event_type: 'ACCOUNT_DELETE_FAILED' }))
    })

    test('Não deve permitir que um ADMIN se exclua por esta rota (403)', async () => {
        mockDb.query.mockResolvedValueOnce({ rows: [dbUser({ role: 'ADMIN' })] })
        const res = await sendDelete({ password: PASSWORD, confirmation: 'EXCLUIR' })
        expect(res.statusCode).toBe(403)
        expect(mockPool.connect).not.toHaveBeenCalled()
    })

    test('Se o cancelamento no Stripe falhar, não apaga nenhum dado (502)', async () => {
        mockDb.query.mockResolvedValueOnce({ rows: [dbUser({ stripeSubscriptionId: 'sub_123' })] })
        mockStripe.subscriptions.retrieve.mockResolvedValueOnce({ status: 'active' })
        mockStripe.subscriptions.cancel.mockRejectedValueOnce(new Error('Stripe indisponível'))

        const res = await sendDelete({ password: PASSWORD, confirmation: 'EXCLUIR' })
        expect(res.statusCode).toBe(502)
        expect(mockPool.connect).not.toHaveBeenCalled()
    })

    test('Cancela assinatura ativa e apaga todos os dados em transação (200)', async () => {
        mockDb.query.mockResolvedValueOnce({ rows: [dbUser({ stripeSubscriptionId: 'sub_123' })] })
        mockStripe.subscriptions.retrieve.mockResolvedValueOnce({ status: 'active' })
        mockStripe.subscriptions.cancel.mockResolvedValueOnce({ status: 'canceled' })

        const res = await sendDelete({ password: PASSWORD, confirmation: 'EXCLUIR' })
        expect(res.statusCode).toBe(200)
        expect(mockStripe.subscriptions.cancel).toHaveBeenCalledWith('sub_123')

        const statements = mockClient.query.mock.calls.map(c => c[0])
        expect(statements[0]).toBe('BEGIN')
        expect(statements.slice(1, -1)).toEqual(USER_DATA_STATEMENTS)
        expect(statements[statements.length - 1]).toBe('COMMIT')
        expect(mockClient.query.mock.calls[1][1]).toEqual([10])
        expect(mockClient.release).toHaveBeenCalledTimes(1)

        const audit = mockAuditLog.mock.calls.find(c => c[0].event_type === 'USER_SELF_DELETED')[0]
        expect(JSON.stringify(audit)).not.toContain('titular@teste.com')
    })

    test('Não chama o Stripe quando não há assinatura (200)', async () => {
        mockDb.query.mockResolvedValueOnce({ rows: [dbUser()] })
        const res = await sendDelete({ password: PASSWORD, confirmation: 'EXCLUIR' })
        expect(res.statusCode).toBe(200)
        expect(mockStripe.subscriptions.retrieve).not.toHaveBeenCalled()
    })

    test('Assinatura já cancelada no Stripe não bloqueia a exclusão (200)', async () => {
        mockDb.query.mockResolvedValueOnce({ rows: [dbUser({ stripeSubscriptionId: 'sub_old' })] })
        mockStripe.subscriptions.retrieve.mockResolvedValueOnce({ status: 'canceled' })
        const res = await sendDelete({ password: PASSWORD, confirmation: 'EXCLUIR' })
        expect(res.statusCode).toBe(200)
        expect(mockStripe.subscriptions.cancel).not.toHaveBeenCalled()
    })

    test('Faz ROLLBACK e libera a conexão uma vez se o banco falhar (500)', async () => {
        mockDb.query.mockResolvedValueOnce({ rows: [dbUser()] })
        mockClient.query.mockImplementation(async (sql) => {
            if (sql.startsWith('DELETE FROM credit_cards')) throw new Error('falha no banco')
            return { rowCount: 1 }
        })

        const res = await sendDelete({ password: PASSWORD, confirmation: 'EXCLUIR' })
        expect(res.statusCode).toBe(500)
        const statements = mockClient.query.mock.calls.map(c => c[0])
        expect(statements).toContain('ROLLBACK')
        expect(statements).not.toContain('COMMIT')
        expect(mockClient.release).toHaveBeenCalledTimes(1)
    })
})
