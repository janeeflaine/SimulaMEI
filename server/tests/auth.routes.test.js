/**
 * Testes de Segurança e Funcionalidade para Rotas de Autenticação
 */

const mockDb = { query: jest.fn() }
jest.mock('../db', () => ({ db: mockDb }))

// Mock email service
const mockSendResetEmail = jest.fn()
jest.mock('../utils/email', () => ({
    sendPasswordResetEmail: (...args) => mockSendResetEmail(...args)
}))

const request = require('supertest')
const express = require('express')
const crypto = require('crypto')

const app = express()
app.use(express.json())
const authRoutes = require('../routes/auth.routes')
app.use('/api/auth', authRoutes)

describe('Authentication Routes - Recuperação de Conta', () => {

    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('POST /api/auth/forgot-password', () => {
        test('Deve retornar 400 se e-mail não for fornecido', async () => {
            const res = await request(app)
                .post('/api/auth/forgot-password')
                .send({})
            expect(res.statusCode).toBe(400)
        })

        test('Deve retornar 200 (Anti-Enumeração) mesmo se o e-mail não existir', async () => {
            mockDb.query.mockResolvedValueOnce({ rows: [] }) // Email not found

            const start = Date.now()
            const res = await request(app)
                .post('/api/auth/forgot-password')
                .send({ email: 'naoexiste@test.com' })
            const end = Date.now()

            expect(res.statusCode).toBe(200)
            expect(res.body.message).toContain('link de recuperação em breve')

            // Ensure delay was applied (anti-timing attack)
            expect(end - start).toBeGreaterThanOrEqual(400)
            expect(mockSendResetEmail).not.toHaveBeenCalled()
        })

        test('Deve gerar token, salvar hash no BD e enviar e-mail se usuário existir', async () => {
            mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'User Test' }] }) // User found
            mockDb.query.mockResolvedValueOnce({ rowCount: 1 }) // Update success

            const res = await request(app)
                .post('/api/auth/forgot-password')
                .send({ email: 'existe@test.com' })

            expect(res.statusCode).toBe(200)
            expect(mockDb.query).toHaveBeenCalledTimes(2)
            expect(mockSendResetEmail).toHaveBeenCalledWith('existe@test.com', expect.any(String))

            // Verify if DB update received a hash
            const updateCall = mockDb.query.mock.calls[1]
            expect(updateCall[0]).toContain('UPDATE users')
            expect(updateCall[1][0]).toHaveLength(64) // SHA-256 hex length
        })
    })

    describe('POST /api/auth/reset-password', () => {
        test('Deve retornar 400 se token ou senha faltarem', async () => {
            const res = await request(app).post('/api/auth/reset-password').send({ token: 'abc' })
            expect(res.statusCode).toBe(400)
        })

        test('Deve retornar erro se token for inválido ou expirado', async () => {
            mockDb.query.mockResolvedValueOnce({ rows: [] }) // Token not found

            const res = await request(app)
                .post('/api/auth/reset-password')
                .send({ token: 'falsotoken', newPassword: 'nova-senha-123' })

            expect(res.statusCode).toBe(400)
            expect(res.body.message).toContain('inválido ou expirado')
        })

        test('Deve redefinir a senha e apagar o token se for válido', async () => {
            // Mocking token lookup
            mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1 }] })
            // Mocking password update
            mockDb.query.mockResolvedValueOnce({ rowCount: 1 })

            const res = await request(app)
                .post('/api/auth/reset-password')
                .send({ token: 'token-valido', newPassword: 'nova-senha-123' })

            expect(res.statusCode).toBe(200)
            expect(res.body.message).toContain('redefinida com sucesso')

            // Verifying the second query was an UPDATE setting tokens to NULL
            const updateCall = mockDb.query.mock.calls[1]
            expect(updateCall[0]).toContain('UPDATE users')
            expect(updateCall[0]).toContain('"resetPasswordToken" = NULL')

            // The first parameter should be the new bcrypt hash
            expect(updateCall[1][0]).not.toBe('nova-senha-123') // Should be hashed!
            expect(updateCall[1][1]).toBe(1) // user id
        })
    })
})
