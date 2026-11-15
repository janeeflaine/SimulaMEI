/**
 * api/index.js (o servidor da Vercel): erro nunca devolve detalhe interno e o
 * req.context (IP, navegador, aparelho) existe em todas as rotas.
 */
const mockQuery = jest.fn(async () => ({ rows: [], rowCount: 0 }))
jest.mock('../db', () => ({
    db: { query: mockQuery },
    pool: { query: mockQuery, connect: jest.fn() },
    init: jest.fn(async () => {}),
    ensureSchema: jest.fn(async () => {})
}))
jest.mock('../utils/auditLogger', () => ({ log: jest.fn().mockResolvedValue() }))
const request = require('supertest')

let app
beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {})
    app = require('../../api/index')
})
beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}))
afterEach(() => console.error.mockRestore())

test('JSON quebrado: 400 sem o texto do erro (antes 500 com err.message)', async () => {
    const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"email": "a@b.com", "password":')
    expect(res.status).toBe(400)
    expect(res.body.error).toBeUndefined()
    expect(JSON.stringify(res.body)).not.toMatch(/JSON|position|token/i)
})

test('corpo grande demais: 413', async () => {
    const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send(JSON.stringify({ email: 'a@b.com', password: 'x'.repeat(11 * 1024 * 1024) }))
    expect(res.status).toBe(413)
    expect(res.body.error).toBeUndefined()
})

test('as rotas recebem o req.context (o login grava a sessão com o aparelho)', async () => {
    const { log } = require('../utils/auditLogger')
    await request(app).post('/api/auth/login').set('X-Device-Fingerprint', 'celular-1').send({ email: 'ninguem@teste.com', password: 'qualquer1' })
    const failed = log.mock.calls.map(c => c[0]).find(e => e.event_type === 'USER_LOGIN_FAILED')
    expect(failed.context.device_fingerprint).toBe('celular-1')
})
