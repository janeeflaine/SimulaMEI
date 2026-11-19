/**
 * Teste grátis com e-mail confirmado, apelidos de e-mail e um teste por aparelho
 * (utils/trial.js, POST /register, /verify-email e /resend-verification).
 * Antes: o teste começava no cadastro, sem confirmar o e-mail; qualquer e-mail
 * inventado, ou apelido do mesmo e-mail (ana+1@, a.na@gmail), ganhava outro teste.
 */
process.env.JWT_SECRET = 'test-secret'
const crypto = require('crypto')
const sha = (v) => crypto.createHash('sha256').update(String(v)).digest('hex')
const norm = (sql) => sql.replace(/\s+/g, ' ').trim()

let state
const snapshot = () => JSON.parse(JSON.stringify({ ...state, claimed: [...state.claimed], devices: [...state.devices] }))
const restore = (snap) => {
    Object.assign(state, snap)
    state.claimed = new Set(snap.claimed)
    state.devices = new Set(snap.devices)
}

const PLANS = [
    { id: 1, name: 'Gratuito', price: 0, isActive: 1 },
    { id: 3, name: 'Ouro', price: 39.9, isActive: 1 }
]

function route(raw, params = []) {
    const q = norm(raw)
    state.sql.push({ q, params })
    const u = state.users[state.current] // conta da vez (cadastro) ou a buscada pelo link
    if (q.startsWith('SELECT key, value FROM system_settings WHERE key = ANY')) {
        return { rows: params[0].filter(k => state.settings[k] != null).map(k => ({ key: k, value: state.settings[k] })) }
    }
    if (q.startsWith('SELECT id, name, price FROM plans WHERE "isActive" = 1 AND price > 0')) return { rows: [PLANS[1]] }
    if (q.startsWith('SELECT id, name, price FROM plans WHERE price = 0')) return { rows: [PLANS[0]] }
    if (q.startsWith('SELECT id FROM users WHERE LOWER(email) = $1')) return { rows: [] }
    if (q.startsWith('INSERT INTO users')) {
        const id = 50 + Object.keys(state.users).length
        state.users[id] = { id, email: params[1], planId: params[3], status: params[4], stripeSub: null, tokenHash: null, expires: null, device: null, verified: false }
        state.current = id
        return { rows: [{ id }] }
    }
    if (q.includes('FROM users u LEFT JOIN plans p ON u."planId" = p.id WHERE u.id = $1')) {
        const plan = PLANS.find(p => p.id === u.planId)
        return { rows: [{ id: u.id, name: 'Novo', email: u.email, role: 'USER', planId: u.planId, subscriptionStatus: u.status, sessionVersion: 1, planName: plan.name, planFeatures: '{}', planExpiresAt: null }] }
    }
    if (q.startsWith('SELECT "sessionVersion" FROM users')) return { rows: [{ sessionVersion: 1 }] }
    if (q.startsWith('SELECT 1 FROM trial_claims WHERE email_hash = ANY')) return { rows: params[0].some(h => state.claimed.has(h)) ? [{}] : [] }
    if (q.startsWith('SELECT 1 FROM trial_device_claims')) return { rows: state.devices.has(params[0]) ? [{}] : [] }
    if (q.startsWith('UPDATE users SET "emailVerifyTokenHash" = $2')) {
        const t = state.users[params[0]]
        t.tokenHash = params[1]; t.expires = params[2]; t.device = t.device || params[3]
        return { rows: [], rowCount: 1 }
    }
    if (q.startsWith('UPDATE users SET "emailVerifiedAt"')) {
        const t = Object.values(state.users).find(x => x.tokenHash === params[0] && new Date(x.expires) > new Date())
        if (!t) return { rows: [] }
        t.tokenHash = null; t.expires = null; t.verified = true
        state.current = t.id
        return { rows: [{ id: t.id, email: t.email, trialDeviceHash: t.device }] }
    }
    if (q.startsWith('INSERT INTO trial_claims')) {
        if (state.claimed.has(params[0])) return { rows: [] }
        state.claimed.add(params[0]); return { rows: [{}] }
    }
    if (q.startsWith('INSERT INTO trial_device_claims')) {
        if (state.devices.has(params[0])) return { rows: [] }
        state.devices.add(params[0]); return { rows: [{}] }
    }
    if (q.startsWith('UPDATE users SET "planId" = $2, "subscriptionStatus" = \'trialing\'')) {
        const t = state.users[params[0]]
        if (!(t.status === 'active' && !t.stripeSub && t.planId === 1)) return { rows: [] }
        t.planId = params[1]; t.status = 'trialing'
        return { rows: [{ planExpiresAt: new Date(Date.now() + params[2] * 86400000) }] }
    }
    if (q.startsWith('SELECT id, email, "emailVerifyTokenHash", "trialDeviceHash" FROM users')) {
        const t = state.users[params[0]]
        return { rows: t ? [{ id: t.id, email: t.email, emailVerifyTokenHash: t.tokenHash, trialDeviceHash: t.device }] : [] }
    }
    if (q.startsWith('INSERT INTO auth_attempts')) { state.attempts += 1; return { rows: [{ id: state.attempts }] } }
    if (q.startsWith('SELECT COUNT(*)::int AS n FROM auth_attempts')) return { rows: [{ n: state.attempts }] }
    return { rows: [], rowCount: 0 }
}

// Transação de mentira: BEGIN/SAVEPOINT guardam o estado; ROLLBACK volta
const mockClient = {
    query: jest.fn(async (raw, params) => {
        const q = norm(raw)
        if (q === 'BEGIN') { state.tx = snapshot(); return {} }
        if (q === 'COMMIT') { state.tx = null; state.commits += 1; return {} }
        if (q === 'ROLLBACK') { if (state.tx) restore(state.tx); state.tx = null; return {} }
        if (q === 'SAVEPOINT trial') { state.sp = snapshot(); return {} }
        if (q === 'ROLLBACK TO SAVEPOINT trial') { restore({ ...state.sp, tx: state.tx, sql: state.sql }); return {} }
        return route(raw, params)
    }),
    release: jest.fn()
}
const mockDb = { query: jest.fn(async (raw, params) => route(raw, params)), connect: jest.fn(async () => mockClient) }
jest.mock('../db', () => ({ db: mockDb, pool: mockDb }))
const mockSend = jest.fn(async () => ({ sent: true }))
jest.mock('../utils/email', () => ({ sendPasswordResetEmail: jest.fn(), sendTrialConfirmEmail: (...a) => mockSend(...a) }))
jest.mock('../utils/auditLogger', () => ({ log: jest.fn().mockResolvedValue() }))
let mockUserId = 50
jest.mock('../middleware/auth', () => {
    const real = jest.requireActual('../middleware/auth')
    return { ...real, authMiddleware: (req, res, next) => { req.user = { id: mockUserId, role: 'USER' }; next() } }
})

const request = require('supertest')
const express = require('express')
const { normalizeTrialEmail, deviceHash } = require('../utils/trial')

// App novo a cada teste: o limite de tentativas por IP da rota fica na memória do módulo
let app
const makeApp = () => {
    const a = express()
    a.use(express.json())
    a.use(require('../middleware/requestContext'))
    jest.isolateModules(() => { a.use('/api/auth', require('../routes/auth.routes')) })
    return a
}

const DEVICE = '1a2b3c4d-abc123'
const register = (email = 'novo@teste.com', device = DEVICE) => {
    const r = request(app).post('/api/auth/register')
    if (device) r.set('X-Device-Fingerprint', device)
    return r.send({ acceptedTermsVersion: '2026-11-19', name: 'Novo Cliente', email, password: 'senha-boa-123' })
}
const lastToken = () => mockSend.mock.calls[mockSend.mock.calls.length - 1][1]
const verify = (token) => request(app).post('/api/auth/verify-email').send({ token })

beforeEach(() => {
    jest.clearAllMocks()
    app = makeApp()
    state = { settings: { trial_enabled: 'true', trial_days: '7' }, claimed: new Set(), devices: new Set(), users: {}, current: null, sql: [], attempts: 0, commits: 0, tx: null, sp: null }
    global.fetch = jest.fn(async () => ({ ok: true, text: async () => 'AAAA:1' }))
    jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => console.error.mockRestore())

describe('cadastro: o teste não começa sem confirmar o e-mail', () => {
    test('conta fica no Gratuito e recebe o link; nada é reservado ainda', async () => {
        const res = await register()
        expect(res.statusCode).toBe(201)
        expect(res.body.user).toMatchObject({ planId: 1, subscriptionStatus: 'active', isInTrial: false })
        expect(res.body.trial).toMatchObject({ status: 'pending', days: 7, planName: 'Ouro', emailSent: true })
        expect(mockSend).toHaveBeenCalledWith('novo@teste.com', expect.stringMatching(/^[a-f0-9]{64}$/), expect.objectContaining({ days: 7 }))
        const user = state.users[50]
        expect(user.tokenHash).toBe(sha(lastToken())) // só o SHA-256 do link vai para o banco
        expect(user.device).toBe(deviceHash(DEVICE))
        expect(state.claimed.size + state.devices.size).toBe(0)
    })

    test('apelidos do mesmo e-mail não ganham outro teste', async () => {
        state.claimed.add(sha('novo@gmail.com'))
        for (const email of ['novo+promo@gmail.com', 'n.o.v.o@gmail.com', 'NOVO@googlemail.com']) {
            const res = await register(email, `aaaaaaaa-${email.length}x${'0'.repeat(4)}`.slice(0, 15))
            expect(res.body.trial).toMatchObject({ status: 'email_used' })
        }
        expect(mockSend).not.toHaveBeenCalled()
    })

    test('código antigo do e-mail (antes da normalização) também conta', async () => {
        state.claimed.add(sha('a.na@gmail.com'))
        expect((await register('A.na@gmail.com')).body.trial.status).toBe('email_used')
    })

    test('aparelho que já usou o teste: conta no Gratuito, sem link', async () => {
        state.devices.add(deviceHash(DEVICE))
        const res = await register('outra@teste.com')
        expect(res.body.trial).toMatchObject({ status: 'device_used' })
        expect(res.body.user.planId).toBe(1)
        expect(mockSend).not.toHaveBeenCalled()
    })

    test.each([[null], ['fallback-abc12345'], ['<script>'], ['x'.repeat(65)]])('sem identificador de aparelho válido (%s): sem teste', async (device) => {
        expect((await register('sem@teste.com', device)).body.trial.status).toBe('no_device')
        expect(mockSend).not.toHaveBeenCalled()
    })
})

describe('link do e-mail', () => {
    test('abre: e-mail confirmado, teste começa e e-mail + aparelho ficam reservados', async () => {
        await register('Ana+1@Gmail.com')
        const res = await verify(lastToken())
        expect(res.statusCode).toBe(200)
        expect(res.body).toMatchObject({ verified: true, trialStarted: true, planName: 'Ouro', days: 7 })
        expect(state.users[50]).toMatchObject({ planId: 3, status: 'trialing', verified: true, tokenHash: null })
        expect(state.claimed.has(sha('ana@gmail.com'))).toBe(true)
        expect(state.devices.has(deviceHash(DEVICE))).toBe(true)
    })

    test('o link vale uma vez', async () => {
        await register()
        const token = lastToken()
        expect((await verify(token)).body.trialStarted).toBe(true)
        const again = await verify(token)
        expect(again.statusCode).toBe(400)
        expect(again.body.reason).toBe('invalid_token')
    })

    test.each([['abc'], [''], [123], ['g'.repeat(64)]])('link inválido (%j): 400, nada muda', async (token) => {
        await register()
        const res = await verify(token)
        expect(res.statusCode).toBe(400)
        expect(state.users[50].verified).toBe(false)
    })

    test('link vencido (48 horas): 400', async () => {
        await register()
        state.users[50].expires = new Date(Date.now() - 1000).toISOString()
        expect((await verify(lastToken())).statusCode).toBe(400)
        expect(state.users[50].status).toBe('active')
    })

    test('duas contas no mesmo aparelho: só a primeira a confirmar ganha; a segunda não gasta o e-mail', async () => {
        await register('primeira@teste.com')
        const first = lastToken()
        await register('segunda@teste.com')
        const second = lastToken()
        expect((await verify(first)).body.trialStarted).toBe(true)
        const res = await verify(second)
        expect(res.body).toMatchObject({ verified: true, trialStarted: false, reason: 'device_used' })
        expect(state.users[51]).toMatchObject({ planId: 1, status: 'active', verified: true })
        // A reserva do e-mail da segunda conta voltou junto (só o aparelho estava usado)
        expect(state.claimed.has(sha('segunda@teste.com'))).toBe(false)
    })

    test('quem assinou enquanto o link esperava não perde o plano pago', async () => {
        await register()
        Object.assign(state.users[50], { planId: 3, stripeSub: 'sub_1' })
        const res = await verify(lastToken())
        expect(res.body).toMatchObject({ verified: true, trialStarted: false, reason: 'not_free' })
        expect(state.users[50]).toMatchObject({ planId: 3, status: 'active' })
        expect(state.claimed.size + state.devices.size).toBe(0)
    })

    test('teste desligado depois do cadastro: só confirma o e-mail', async () => {
        await register()
        state.settings.trial_enabled = 'false'
        const res = await verify(lastToken())
        expect(res.body).toMatchObject({ verified: true, trialStarted: false, reason: 'trial_off' })
        expect(state.users[50].planId).toBe(1)
    })
})

describe('mandar outro link', () => {
    test('manda um link novo e o antigo deixa de valer', async () => {
        await register()
        const old = lastToken()
        const res = await request(app).post('/api/auth/resend-verification')
        expect(res.statusCode).toBe(200)
        expect(lastToken()).not.toBe(old)
        expect((await verify(old)).statusCode).toBe(400)
        expect((await verify(lastToken())).body.trialStarted).toBe(true)
    })

    test('no máximo 3 por hora', async () => {
        await register()
        for (let i = 0; i < 3; i++) expect((await request(app).post('/api/auth/resend-verification')).statusCode).toBe(200)
        expect((await request(app).post('/api/auth/resend-verification')).statusCode).toBe(429)
    })

    test('conta sem confirmação pendente: 400', async () => {
        await register('x@teste.com', null) // sem aparelho: nenhum link foi mandado
        expect((await request(app).post('/api/auth/resend-verification')).statusCode).toBe(400)
    })
})

test('normalizeTrialEmail', () => {
    expect(normalizeTrialEmail(' A.Na+Loja@GMAIL.com ')).toBe('ana@gmail.com')
    expect(normalizeTrialEmail('ana@googlemail.com')).toBe('ana@gmail.com')
    expect(normalizeTrialEmail('a.na+x@outlook.com')).toBe('a.na@outlook.com')
    expect(normalizeTrialEmail('+só@exemplo.com')).toBe('+só@exemplo.com')
})
