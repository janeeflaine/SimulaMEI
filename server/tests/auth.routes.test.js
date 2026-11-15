/**
 * Acesso: cadastro, entrar, esqueci a senha e senha nova.
 * Os de segurança falham no código antigo (e-mail com maiúscula, cadastro repetido
 * ao mesmo tempo, dado de tipo errado, senha fraca na redefinição, conta bloqueada
 * revelada com senha errada, tentativas sem limite por e-mail).
 */
process.env.JWT_SECRET = 'test-secret'
const mockDb = { query: jest.fn() }
jest.mock('../db', () => ({ db: mockDb, pool: mockDb }))

const mockSendResetEmail = jest.fn()
jest.mock('../utils/email', () => ({
    sendPasswordResetEmail: (...args) => mockSendResetEmail(...args)
}))
jest.mock('../utils/auditLogger', () => ({
    log: jest.fn().mockResolvedValue()
}))

const request = require('supertest')
const express = require('express')
const bcrypt = require('bcryptjs')

// O limite por IP (20 a cada 15 min) é da instância: um app novo por teste
const makeApp = () => {
    let router
    jest.isolateModules(() => { router = require('../routes/auth.routes') })
    const app = express()
    app.use(express.json())
    app.use('/api/auth', router)
    return app
}

// Com o req.context (IP e aparelho), como no api/index.js
const makeAppWithContext = () => {
    let router
    jest.isolateModules(() => { router = require('../routes/auth.routes') })
    const a = express()
    a.use(express.json())
    a.use(require('../middleware/requestContext'))
    a.use('/api/auth', router)
    return a
}

const norm = (sql) => sql.replace(/\s+/g, ' ').trim()
const HASH = bcrypt.hashSync('senha-certa-1', 4)
let state, sql, app

beforeEach(() => {
    jest.clearAllMocks()
    sql = []
    state = {
        users: [{ id: 7, name: 'Joana', email: 'Joana@Teste.com', password: HASH, role: 'USER', planId: 1, isBlocked: 0, subscriptionStatus: 'active', sessionVersion: 1 }],
        plans: [{ id: 1, name: 'Gratuito', price: 0 }, { id: 2, name: 'Prata', price: 19.9 }],
        attempts: {},
        preset: {},
        settings: {},
        lastSession: null,
        resetUser: null,
        insertError: null
    }
    mockDb.query.mockImplementation(async (rawSql, params = []) => {
        const q = norm(rawSql)
        sql.push({ q, params })
        if (q.startsWith('INSERT INTO auth_attempts')) {
            const k = `${params[0]}|${params[1]}`
            state.attempts[k] = (state.attempts[k] || 0) + 1
            return { rowCount: 1, rows: [{ id: Object.keys(state.attempts).length }] }
        }
        if (q.startsWith('SELECT COUNT(*)::int AS n FROM auth_attempts')) return { rows: [{ n: (state.attempts[`${params[0]}|${params[1]}`] || 0) + (state.preset[params[0]] || 0) }] }
        if (q.startsWith('DELETE FROM auth_attempts WHERE kind = $1')) { delete state.attempts[`${params[0]}|${params[1]}`]; delete state.preset[params[0]]; return { rowCount: 1 } }
        if (q.startsWith('SELECT GREATEST(0, CEIL(EXTRACT(EPOCH')) return { rows: [{ s: state.waitSeconds ?? 900 }] }
        if (q.startsWith('SELECT value FROM system_settings WHERE key = $1')) return { rows: state.settings[params[0]] != null ? [{ value: state.settings[params[0]] }] : [] }
        if (q.startsWith('SELECT ip_address, device_fingerprint FROM user_sessions')) return { rows: state.lastSession ? [state.lastSession] : [] }
        if (q.startsWith('SELECT id FROM users WHERE LOWER(email) = $1')) return { rows: state.users.filter(u => u.email.toLowerCase() === params[0]) }
        if (q.startsWith("SELECT id, name, price FROM plans WHERE price = 0")) return { rows: [state.plans[0]] }
        if (q.startsWith('SELECT id, name, price FROM plans WHERE id = $1')) return { rows: state.plans.filter(p => p.id === params[0]) }
        if (q.startsWith('INSERT INTO users')) {
            if (state.insertError) throw state.insertError
            return { rows: [{ id: 99 }] }
        }
        if (q.includes('FROM users u LEFT JOIN plans p ON u."planId" = p.id WHERE u.id = $1')) {
            const plan = state.plans.find(p => p.id === state.lastPlan) || state.plans[0]
            return { rows: [{ id: 99, name: 'Novo', email: state.lastEmail, role: 'USER', planId: plan.id, subscriptionStatus: plan.price > 0 ? 'pending_payment' : 'active', sessionVersion: 1, planName: plan.name, planFeatures: '{}', planExpiresAt: null }] }
        }
        if (q.includes('WHERE LOWER(u.email) = $1 AND u."deletedAt" IS NULL')) return { rows: state.users.filter(u => u.email.toLowerCase() === params[0]) }
        if (q.startsWith('SELECT id, name, email FROM users WHERE LOWER(email) = $1')) return { rows: state.users.filter(u => u.email.toLowerCase() === params[0]) }
        if (q.startsWith('UPDATE users SET password = $1')) return { rows: state.resetUser ? [state.resetUser] : [] }
        if (q.startsWith('SELECT "sessionVersion" FROM users')) return { rows: [{ sessionVersion: 1 }] }
        return { rows: [], rowCount: 1 }
    })
    global.fetch = jest.fn(async () => ({ ok: true, text: async () => '0000000000000000000000000000000000A:0' }))
    app = makeApp()
    jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => console.error.mockRestore())

const ran = (start) => sql.filter(s => s.q.startsWith(start))
const register = (body) => request(app).post('/api/auth/register').send({ acceptedTermsVersion: '2026-11-12', name: 'Novo Cliente', password: 'password123', ...body })
const login = (body) => request(app).post('/api/auth/login').send(body)

describe('Cadastro', () => {
    test('plano pago: pending_payment e requiresPayment', async () => {
        state.lastPlan = 2; state.lastEmail = 'cliente@teste.com'
        const res = await register({ email: 'cliente@teste.com', planId: 2 })
        expect(res.statusCode).toBe(201)
        expect(res.body.user).toMatchObject({ planId: 2, subscriptionStatus: 'pending_payment', requiresPayment: true })
        expect(res.body.token).toBeDefined()
    })

    test('plano gratuito: active e requiresPayment false', async () => {
        state.lastPlan = 1; state.lastEmail = 'free@teste.com'
        const res = await register({ email: 'free@teste.com', planId: 1 })
        expect(res.statusCode).toBe(201)
        expect(res.body.user).toMatchObject({ planId: 1, subscriptionStatus: 'active', requiresPayment: false })
    })

    test('sem aceite dos Termos e da Política: 400 sem tocar no banco', async () => {
        const res = await request(app).post('/api/auth/register').send({ name: 'Sem Aceite', email: 'semaceite@teste.com', password: 'password123' })
        expect(res.statusCode).toBe(400)
        expect(res.body.message).toMatch(/Termos de Serviço/)
        expect(mockDb.query).not.toHaveBeenCalled()
    })

    test('e-mail gravado sem espaços e em minúsculas', async () => {
        await register({ email: '  Maria@Teste.COM ' })
        expect(ran('INSERT INTO users')[0].params[1]).toBe('maria@teste.com')
    })

    test('e-mail de conta antiga com maiúsculas: 409 (antes criava outra conta)', async () => {
        const res = await register({ email: 'joana@teste.com' })
        expect(res.statusCode).toBe(409)
        expect(ran('INSERT INTO users')).toHaveLength(0)
    })

    test('dois cadastros iguais ao mesmo tempo: o banco recusa o segundo e vira 409 (antes 500)', async () => {
        state.insertError = Object.assign(new Error('duplicate key'), { code: '23505' })
        const res = await register({ email: 'corrida@teste.com' })
        expect(res.statusCode).toBe(409)
    })

    test.each([
        [{ password: { a: 1 } }],
        [{ password: 12345678 }],
        [{ password: 'curta' }],
        [{ password: 'á'.repeat(40) }],
        [{ email: ['a@b.com'] }],
        [{ email: 'nao-e-email' }],
        [{ name: 'X'.repeat(500) }],
        [{ name: { $ne: 1 } }]
    ])('dado ruim %j: 400 e nada gravado', async (body) => {
        const res = await register({ email: 'novo@teste.com', ...body })
        expect(res.statusCode).toBe(400)
        expect(ran('INSERT INTO users')).toHaveLength(0)
    })

    test('senha que apareceu em vazamentos: 400 e só os 5 primeiros caracteres do hash saem', async () => {
        const crypto = require('crypto')
        const sha1 = crypto.createHash('sha1').update('password123').digest('hex').toUpperCase()
        global.fetch = jest.fn(async () => ({ ok: true, text: async () => `${sha1.slice(5)}:251682\r\nAAAA:1` }))
        const res = await register({ email: 'vazada@teste.com', password: 'password123' })
        expect(res.statusCode).toBe(400)
        expect(res.body.reason).toBe('pwned')
        expect(global.fetch.mock.calls[0][0]).toBe(`https://api.pwnedpasswords.com/range/${sha1.slice(0, 5)}`)
        expect(JSON.stringify(global.fetch.mock.calls)).not.toContain('password123')
        expect(ran('INSERT INTO users')).toHaveLength(0)
    })

    test('serviço de senhas vazadas fora do ar: o cadastro segue', async () => {
        global.fetch = jest.fn(async () => { throw new Error('timeout') })
        state.lastEmail = 'fora@teste.com'
        expect((await register({ email: 'fora@teste.com' })).statusCode).toBe(201)
    })

    test('senha igual ao e-mail ou ao nome: 400', async () => {
        expect((await register({ email: 'mariasilva@teste.com', password: 'mariasilva' })).statusCode).toBe(400)
        expect((await register({ email: 'x@teste.com', name: 'Maria Silva Souza', password: 'mariasilvasouza' })).statusCode).toBe(400)
    })

    test('plano que não é número: cria no Gratuito (antes ia ao banco e dava 500)', async () => {
        state.lastEmail = 'p@teste.com'
        const res = await register({ email: 'p@teste.com', planId: 'abc' })
        expect(res.statusCode).toBe(201)
        expect(ran('SELECT id, name, price FROM plans WHERE id = $1')).toHaveLength(0)
    })
})

describe('Entrar', () => {
    test('e-mail com letras diferentes da conta: entra', async () => {
        const res = await login({ email: ' JOANA@teste.com ', password: 'senha-certa-1' })
        expect(res.statusCode).toBe(200)
        expect(res.body.token).toBeDefined()
        expect(sql.find(s => s.q.includes('WHERE LOWER(u.email) = $1')).params[0]).toBe('joana@teste.com')
    })

    test('senha errada e e-mail sem conta: mesma resposta', async () => {
        const a = await login({ email: 'joana@teste.com', password: 'errada' })
        const b = await login({ email: 'ninguem@teste.com', password: 'errada' })
        expect([a.statusCode, b.statusCode]).toEqual([401, 401])
        expect(a.body.message).toBe(b.body.message)
    })

    test('conta bloqueada: com senha errada não diz que existe (antes 403); com a certa, 403', async () => {
        state.users[0].isBlocked = 1
        expect((await login({ email: 'joana@teste.com', password: 'errada' })).statusCode).toBe(401)
        expect((await login({ email: 'joana@teste.com', password: 'senha-certa-1' })).statusCode).toBe(403)
    })

    test('sexto erro no mesmo e-mail e IP em 15 min: 429, sem conferir a senha', async () => {
        state.preset.login = 5
        const res = await login({ email: 'joana@teste.com', password: 'senha-certa-1' })
        expect(res.statusCode).toBe(429)
        expect(res.body.message).toMatch(/Esqueci a senha/)
        expect(sql.some(s => s.q.includes('WHERE LOWER(u.email) = $1'))).toBe(false)
    })

    test('travado: diz quanto falta (9 min e 1 s viram "10 minutos") e esta tentativa não aumenta a espera', async () => {
        state.preset.login = 5
        state.waitSeconds = 541
        const res = await login({ email: 'joana@teste.com', password: 'qualquer1' })
        expect(res.statusCode).toBe(429)
        expect(res.body.message).toContain('Tente de novo em 10 minutos')
        expect(res.body.retryAfter).toBe(541)
        expect(res.headers['retry-after']).toBe('541')
        expect(sql.some(s => s.q.startsWith('DELETE FROM auth_attempts WHERE id = ANY'))).toBe(true)
    })

    test('travado com menos de um minuto para sair: "1 minuto"', async () => {
        state.preset.login = 5
        state.waitSeconds = 20
        const res = await login({ email: 'joana@teste.com', password: 'qualquer1' })
        expect(res.body.message).toContain('Tente de novo em 1 minuto ')
        expect(res.body.retryAfter).toBe(60)
    })

    test('décimo primeiro erro no e-mail em 15 min, vindo de outro IP (Wi-Fi, 4G, IPv6): 429', async () => {
        state.preset['login-email'] = 10
        const res = await login({ email: 'joana@teste.com', password: 'senha-certa-1' })
        expect(res.statusCode).toBe(429)
        expect(res.body.message).toMatch(/este e-mail/)
    })

    test('vigésimo primeiro erro no e-mail vindo de vários IPs, em 1 hora: 429', async () => {
        state.preset['login-email'] = 20
        expect((await login({ email: 'joana@teste.com', password: 'senha-certa-1' })).statusCode).toBe(429)
    })

    test('muitos erros do mesmo IP em contas diferentes: 429 com aviso da rede', async () => {
        state.preset['login-ip'] = 30
        const res = await login({ email: 'outra@teste.com', password: 'x12345678' })
        expect(res.statusCode).toBe(429)
        expect(res.body.message).toMatch(/rede/)
    })

    test('entrou: zera as tentativas do e-mail e não conta este pedido no IP', async () => {
        state.preset['login-email'] = 3
        const res = await login({ email: 'joana@teste.com', password: 'senha-certa-1' })
        expect(res.statusCode).toBe(200)
        expect(sql.some(s => s.q.startsWith('DELETE FROM auth_attempts WHERE id = ANY'))).toBe(true)
        expect(sql.some(s => s.q.startsWith('DELETE FROM auth_attempts WHERE kind = $1') && s.params[0] === 'login-email' && s.params[1] === 'joana@teste.com')).toBe(true)
    })

    test('um aparelho por vez desligado (padrão): entrar em outro aparelho não derruba o primeiro', async () => {
        state.lastSession = { ip_address: '1.1.1.1', device_fingerprint: 'celular' }
        await request(makeAppWithContext()).post('/api/auth/login').set('X-Device-Fingerprint', 'computador').send({ email: 'joana@teste.com', password: 'senha-certa-1' })
        expect(sql.some(s => s.q.includes('SET "sessionVersion" = COALESCE("sessionVersion", 1) + 1'))).toBe(false)
    })

    test('um aparelho por vez ligado no plano: outro aparelho derruba os tokens antigos', async () => {
        state.settings.single_device_1 = 'true'
        state.lastSession = { ip_address: '1.1.1.1', device_fingerprint: 'celular' }
        const r = makeAppWithContext()
        await request(r).post('/api/auth/login').set('X-Device-Fingerprint', 'computador').send({ email: 'joana@teste.com', password: 'senha-certa-1' })
        expect(sql.some(s => s.q.includes('SET "sessionVersion" = COALESCE("sessionVersion", 1) + 1'))).toBe(true)
    })

    test('um aparelho por vez ligado: entrar de novo no mesmo aparelho não derruba nada', async () => {
        state.settings.single_device_1 = 'true'
        state.lastSession = { ip_address: '1.1.1.1', device_fingerprint: 'celular' }
        const r = makeAppWithContext()
        await request(r).post('/api/auth/login').set('X-Device-Fingerprint', 'celular').send({ email: 'joana@teste.com', password: 'senha-certa-1' })
        expect(sql.some(s => s.q.includes('SET "sessionVersion" = COALESCE("sessionVersion", 1) + 1'))).toBe(false)
    })

    test('entrada do admin com conta de cliente: 403 sem token, sem mexer na sessão e sem contar erro', async () => {
        state.settings.single_device_1 = 'true'
        state.lastSession = { ip_address: '1.1.1.1', device_fingerprint: 'celular' }
        const res = await request(makeAppWithContext()).post('/api/auth/login').set('X-Device-Fingerprint', 'computador')
            .send({ email: 'joana@teste.com', password: 'senha-certa-1', scope: 'admin' })
        expect(res.statusCode).toBe(403)
        expect(res.body.reason).toBe('not_admin')
        expect(res.body.token).toBeUndefined()
        expect(sql.some(s => s.q.includes('SET "sessionVersion" = COALESCE("sessionVersion", 1) + 1'))).toBe(false)
        expect(sql.some(s => s.q.startsWith('INSERT INTO user_sessions'))).toBe(false)
        expect(sql.some(s => s.q.startsWith('DELETE FROM auth_attempts WHERE id = ANY'))).toBe(true)
    })

    test('entrada do admin com senha errada: mesma resposta do Entrar (não diz se é admin)', async () => {
        const res = await login({ email: 'joana@teste.com', password: 'errada', scope: 'admin' })
        expect(res.statusCode).toBe(401)
    })

    test('entrada do admin com conta de administrador: entra', async () => {
        state.users[0].role = 'ADMIN'
        const res = await login({ email: 'joana@teste.com', password: 'senha-certa-1', scope: 'admin' })
        expect(res.statusCode).toBe(200)
        expect(res.body.token).toBeDefined()
        expect(res.body.user.role).toBe('ADMIN')
    })

    test.each([[{ email: 'joana@teste.com', password: { a: 1 } }], [{ email: { $ne: '' }, password: 'x' }], [{}]])('dado ruim %j: 400', async (body) => {
        expect((await login(body)).statusCode).toBe(400)
    })
})

describe('Esqueci a senha', () => {
    test('sem e-mail: 400', async () => {
        expect((await request(app).post('/api/auth/forgot-password').send({})).statusCode).toBe(400)
    })

    test('e-mail sem conta: 200 com a mesma frase, depois de ~500 ms, e nada enviado', async () => {
        const start = Date.now()
        const res = await request(app).post('/api/auth/forgot-password').send({ email: 'naoexiste@test.com' })
        expect(res.statusCode).toBe(200)
        expect(res.body.message).toContain('link de recuperação em breve')
        expect(Date.now() - start).toBeGreaterThanOrEqual(400)
        expect(mockSendResetEmail).not.toHaveBeenCalled()
    })

    test('conta existe: grava o hash do link e manda para o e-mail da conta', async () => {
        const res = await request(app).post('/api/auth/forgot-password').send({ email: 'JOANA@teste.com' })
        expect(res.statusCode).toBe(200)
        expect(mockSendResetEmail).toHaveBeenCalledWith('Joana@Teste.com', expect.stringMatching(/^[a-f0-9]{64}$/))
        const update = ran('UPDATE users SET "resetPasswordToken" = $1')[0]
        expect(update.params[0]).toHaveLength(64)
        expect(update.params[0]).not.toBe(mockSendResetEmail.mock.calls[0][1])
    })

    test('quarto pedido na mesma hora: mesma resposta, sem e-mail', async () => {
        state.attempts['reset|joana@teste.com'] = 3
        const res = await request(app).post('/api/auth/forgot-password').send({ email: 'joana@teste.com' })
        expect(res.statusCode).toBe(200)
        expect(mockSendResetEmail).not.toHaveBeenCalled()
    })

    test('não altera a tabela a cada pedido (colunas vêm do ensureSchema)', async () => {
        await request(app).post('/api/auth/forgot-password').send({ email: 'joana@teste.com' })
        expect(sql.some(s => s.q.startsWith('ALTER TABLE'))).toBe(false)
    })
})

describe('Senha nova', () => {
    const TOKEN = 'a'.repeat(64)

    test('link que não tem o formato certo: 400 com reason, sem tocar no banco', async () => {
        for (const token of ['abc', ['x'], { $ne: null }, undefined]) {
            const res = await request(app).post('/api/auth/reset-password').send({ token, newPassword: 'nova-senha-123' })
            expect(res.statusCode).toBe(400)
            expect(res.body.reason).toBe('invalid_token')
        }
        expect(mockDb.query).not.toHaveBeenCalled()
    })

    test('senha nova fraca: 400 (antes "1" era aceita)', async () => {
        const res = await request(app).post('/api/auth/reset-password').send({ token: TOKEN, newPassword: '1' })
        expect(res.statusCode).toBe(400)
        expect(ran('UPDATE users')).toHaveLength(0)
    })

    test('link vencido ou já usado: 400 invalid_token', async () => {
        const res = await request(app).post('/api/auth/reset-password').send({ token: TOKEN, newPassword: 'nova-senha-123' })
        expect(res.statusCode).toBe(400)
        expect(res.body).toMatchObject({ reason: 'invalid_token' })
        expect(res.body.message).toContain('inválido ou expirado')
    })

    test('link certo: troca a senha e apaga o link na mesma instrução, sai dos aparelhos e libera a trava', async () => {
        state.resetUser = { id: 7, email: 'Joana@Teste.com' }
        const res = await request(app).post('/api/auth/reset-password').send({ token: TOKEN, newPassword: 'nova-senha-123' })
        expect(res.statusCode).toBe(200)
        const update = ran('UPDATE users SET password = $1')[0]
        expect(update.q).toContain('"resetPasswordToken" = NULL')
        expect(update.q).toContain('WHERE "resetPasswordToken" = $2')
        expect(update.params[0]).not.toBe('nova-senha-123')
        expect(await bcrypt.compare('nova-senha-123', update.params[0])).toBe(true)
        expect(ran('UPDATE user_sessions SET is_active = 0')).toHaveLength(1)
        expect(sql.some(s => s.q.startsWith("DELETE FROM auth_attempts WHERE kind = 'login' AND key LIKE $1") && s.params[0] === 'joana@teste.com|%')).toBe(true)
        expect(sql.some(s => s.q.startsWith('DELETE FROM auth_attempts WHERE kind = $1') && s.params[0] === 'login-email')).toBe(true)
    })

    test('senha nova vazada: 400 sem trocar', async () => {
        const crypto = require('crypto')
        const sha1 = crypto.createHash('sha1').update('nova-senha-123').digest('hex').toUpperCase()
        global.fetch = jest.fn(async () => ({ ok: true, text: async () => `${sha1.slice(5)}:3` }))
        const res = await request(app).post('/api/auth/reset-password').send({ token: TOKEN, newPassword: 'nova-senha-123' })
        expect(res.statusCode).toBe(400)
        expect(ran('UPDATE users')).toHaveLength(0)
    })
})

describe('IP de quem pede', () => {
    const { getClientIp } = require('../middleware/requestContext')
    const req = (headers, remote = '10.9.9.9') => ({ headers, socket: { remoteAddress: remote } })
    const env = { ...process.env }
    afterEach(() => { process.env = { ...env } })

    test('na Vercel pelo cabeçalho x-vercel-id, mesmo sem a variável VERCEL', () => {
        delete process.env.VERCEL; delete process.env.VERCEL_ENV
        expect(getClientIp(req({ 'x-vercel-id': 'gru1::abc', 'x-vercel-forwarded-for': '189.10.20.30' }))).toBe('189.10.20.30')
    })

    test('fora da Vercel, cabeçalho inventado não vale', () => {
        delete process.env.VERCEL; delete process.env.VERCEL_ENV
        expect(getClientIp(req({ 'x-forwarded-for': '1.2.3.4' }))).toBe('10.9.9.9')
    })

    test('IPv4 dentro de IPv6 vira IPv4', () => {
        delete process.env.VERCEL; delete process.env.VERCEL_ENV
        expect(getClientIp(req({}, '::ffff:127.0.0.1'))).toBe('127.0.0.1')
    })
})
