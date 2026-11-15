/**
 * Admin > Usuários: edição de conta com dados conferidos, sem o admin definir
 * senha (manda link), sem tirar o próprio acesso nem deixar o site sem
 * administrador, sem trocar o plano de quem paga no Stripe e sem apagar conta
 * cuja assinatura não foi cancelada. Registros sem nome nem e-mail (LGPD).
 * (Também conferido num Postgres 16 de verdade, inclusive a corrida entre dois admins.)
 */
const mockDb = { query: jest.fn() }
const mockClient = { query: jest.fn(), release: jest.fn() }
jest.mock('../db', () => ({ db: mockDb, pool: { query: jest.fn(async () => ({ rows: [] })), connect: jest.fn(async () => mockClient) } }))
let mockActor = { id: 1, role: 'ADMIN' }
jest.mock('../middleware/auth', () => ({
    authMiddleware: (req, res, next) => { req.user = { ...mockActor }; next() },
    adminMiddleware: (req, res, next) => next()
}))
const mockAudit = { log: jest.fn(async () => {}) }
jest.mock('../utils/auditLogger', () => mockAudit)
const mockCancel = jest.fn(async () => ({ canceled: true }))
jest.mock('../utils/userDeletion', () => ({ deleteUserData: jest.fn(async () => {}), cancelStripeSubscriptionIfActive: (...a) => mockCancel(...a) }))
const mockSendReset = jest.fn(async () => ({ sent: true }))
jest.mock('../utils/email', () => ({ sendPasswordResetEmail: (...a) => mockSendReset(...a), sendTestEmail: jest.fn(), smtpConfigured: () => true, maskEmail: (e) => e, explainSmtpError: () => '' }))

const express = require('express')
const request = require('supertest')
const app = express()
app.use(express.json())
app.use('/api/admin', require('../routes/admin.routes'))

const norm = (sql) => sql.replace(/\s+/g, ' ').trim()
let users, otherAdmins, clientSql
const baseUsers = () => ({
    1: { id: 1, name: 'Ana Admin', email: 'ana@ex.com', role: 'ADMIN', isBlocked: 0, planId: 3, stripeSubscriptionId: null, subscriptionStatus: 'active' },
    2: { id: 2, name: 'Joana Silva', email: 'joana@ex.com', role: 'USER', isBlocked: 0, planId: 1, stripeSubscriptionId: null, subscriptionStatus: 'active' },
    3: { id: 3, name: 'Pedro Pago', email: 'pedro@ex.com', role: 'USER', isBlocked: 0, planId: 2, stripeSubscriptionId: 'sub_1', subscriptionStatus: 'active' },
    4: { id: 4, name: 'Bruno Admin', email: 'bruno@ex.com', role: 'ADMIN', isBlocked: 0, planId: 3, stripeSubscriptionId: null, subscriptionStatus: 'active' },
})
beforeEach(() => {
    jest.clearAllMocks()
    mockActor = { id: 1, role: 'ADMIN' }
    users = baseUsers()
    otherAdmins = 1
    clientSql = []
    mockClient.query.mockImplementation(async (raw, params = []) => {
        const q = norm(raw)
        clientSql.push({ q, params })
        if (q.includes('FROM users WHERE id = $1 AND "deletedAt" IS NULL FOR UPDATE')) return { rows: users[params[0]] ? [users[params[0]]] : [] }
        if (q.includes("WHERE role = 'ADMIN' AND \"isBlocked\" = 0")) return { rows: [{ n: otherAdmins }] }
        if (q.startsWith('SELECT id FROM plans WHERE id = $1')) return { rows: [1, 2, 3].includes(params[0]) ? [{ id: params[0] }] : [] }
        if (q.startsWith('SELECT 1 FROM users WHERE LOWER(email) = $1')) return { rows: Object.values(users).some(u => u.email.toLowerCase() === params[0] && u.id !== params[1]) ? [{}] : [] }
        return { rows: [], rowCount: 1 }
    })
    mockDb.query.mockImplementation(async (raw, params = []) => {
        const q = norm(raw)
        if (q.includes('FROM users WHERE id = $1 AND "deletedAt" IS NULL')) return { rows: users[params[0]] ? [users[params[0]]] : [] }
        return { rows: [], rowCount: 1 }
    })
    jest.spyOn(console, 'error').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => { console.error.mockRestore(); console.warn.mockRestore() })
const updates = () => clientSql.filter(s => s.q.startsWith('UPDATE users SET'))

test('o admin não define senha: newPassword é recusado e nada é gravado', async () => {
    const res = await request(app).put('/api/admin/users/2').send({ newPassword: 'qualquer-coisa-123' })
    expect(res.status).toBe(400)
    expect(res.body.reason).toBe('password_by_link')
    expect(updates()).toHaveLength(0)
})

test('admin não tira o próprio acesso nem bloqueia a própria conta', async () => {
    for (const body of [{ role: 'USER' }, { isBlocked: true }]) {
        const res = await request(app).put('/api/admin/users/1').send(body)
        expect(res.status).toBe(409)
        expect(res.body.reason).toBe('self')
    }
    expect(updates()).toHaveLength(0)
})

test('não deixa o site sem nenhum administrador ativo', async () => {
    otherAdmins = 0
    const res = await request(app).put('/api/admin/users/4').send({ role: 'USER' })
    expect(res.status).toBe(409)
    expect(res.body.reason).toBe('last_admin')
    expect(clientSql.some(s => s.q.includes('pg_advisory_xact_lock(7303)'))).toBe(true)
})

test('não troca o plano de quem paga assinatura no Stripe', async () => {
    const res = await request(app).put('/api/admin/users/3').send({ planId: 3 })
    expect(res.status).toBe(409)
    expect(res.body.reason).toBe('stripe')
})

test.each([
    [{ name: 'J' }, 400],
    [{ email: 'nao-e-email' }, 400],
    [{ isBlocked: 'true' }, 400],
    [{ role: 'ROOT' }, 400],
    [{ planId: 999 }, 400],
    [{ planId: 'abc' }, 400],
])('dado ruim %j: %i, sem gravar', async (body, status) => {
    const res = await request(app).put('/api/admin/users/2').send(body)
    expect(res.status).toBe(status)
    expect(updates()).toHaveLength(0)
})

test('e-mail de outra conta (com maiúsculas) dá 409', async () => {
    const res = await request(app).put('/api/admin/users/2').send({ email: 'PEDRO@ex.com' })
    expect(res.status).toBe(409)
    expect(res.body.reason).toBe('email_taken')
})

test('id que não é número dá 404 (antes "12abc" virava a conta 12)', async () => {
    expect((await request(app).put('/api/admin/users/2abc').send({ name: 'Nome Bom' })).status).toBe(404)
    expect((await request(app).delete('/api/admin/users/2abc')).status).toBe(404)
})

test('registro da edição sem nome nem e-mail (só "alterado")', async () => {
    const res = await request(app).put('/api/admin/users/2').send({ name: 'Joana Souza', email: 'joana.souza@ex.com' })
    expect(res.status).toBe(200)
    const logged = JSON.stringify(mockAudit.log.mock.calls) + JSON.stringify(clientSql.filter(s => s.q.includes('admin_logs')))
    expect(logged).not.toMatch(/Joana|joana/)
    expect(updates()[0].q).toContain('"resetPasswordToken" = NULL')
})

test('excluir: assinatura que não cancela no Stripe impede a exclusão', async () => {
    mockCancel.mockRejectedValueOnce(new Error('Stripe fora do ar'))
    const res = await request(app).delete('/api/admin/users/3')
    expect(res.status).toBe(409)
    expect(res.body.reason).toBe('stripe')
    expect(require('../utils/userDeletion').deleteUserData).not.toHaveBeenCalled()
})

test('excluir: registro sem nome nem e-mail de quem saiu', async () => {
    const res = await request(app).delete('/api/admin/users/2')
    expect(res.status).toBe(200)
    expect(JSON.stringify(mockAudit.log.mock.calls)).not.toMatch(/Joana|joana@/)
})

test('link de senha nova: manda e-mail; se o e-mail não sai, apaga o link e avisa', async () => {
    let res = await request(app).post('/api/admin/users/2/reset-link')
    expect(res.status).toBe(200)
    expect(mockSendReset).toHaveBeenCalledWith('joana@ex.com', expect.stringMatching(/^[0-9a-f]{64}$/))
    mockSendReset.mockResolvedValueOnce({ sent: false, message: 'SMTP não configurado.' })
    res = await request(app).post('/api/admin/users/2/reset-link')
    expect(res.status).toBe(502)
})
