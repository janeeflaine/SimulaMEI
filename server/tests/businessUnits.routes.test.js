/**
 * Carteiras: principal decidida pelo servidor, dados conferidos (nome, CPF/CNPJ,
 * foto), tipo travado quando há lançamentos ou cartões e exclusão que não deixa
 * lançamento órfão nem apaga a carteira principal.
 */
const mockDb = { query: jest.fn() }
const mockClient = { query: jest.fn(), release: jest.fn() }
const mockPool = { query: jest.fn(), connect: jest.fn(async () => mockClient) }
jest.mock('../db', () => ({ db: mockDb, pool: mockPool }))
jest.mock('../middleware/auth', () => ({
    authMiddleware: (req, res, next) => { req.user = { id: 1, role: 'USER', planId: 2, isInTrial: false }; next() }
}))
jest.mock('../middleware/planGuard', () => ({ featureGuard: () => (req, res, next) => next() }))
jest.mock('../middleware/walletSecurity', () => ({
    validateWalletOwnership: (req, res, next) => next(),
    validateReferenceOwnership: (req, res, next) => next()
}))

const express = require('express')
const request = require('supertest')
const { isValidCpf, isValidCnpj } = require('../utils/brDocument')
const app = express()
app.use(express.json({ limit: '10mb' }))
app.use('/api/finance', require('../routes/finance.routes'))

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const norm = (sql) => sql.replace(/\s+/g, ' ').trim()
let state
let sql
beforeEach(() => {
    jest.clearAllMocks()
    sql = []
    state = {
        current: { id: 4, name: 'Pessoal', account_type: 'PF', cnpj: '529.982.247-25', logo_url: null, isPrimary: false },
        exists: true,
        usage: { transactions: 0, cards: 0 },
        deleted: 1,
        limits: { total: 0, pf: 0, pj: 0 },
        counts: []
    }
    const handler = async (rawSql, params = []) => {
        const q = norm(rawSql)
        sql.push({ q, params })
        if (q.startsWith('INSERT INTO business_units') && state.raceOnce && params.length === 5 && q.includes('NOT EXISTS')) { state.raceOnce = false; const e = new Error('dup'); e.code = '23505'; throw e }
        if (q.startsWith('SELECT value FROM system_settings')) {
            const key = params[0]
            const v = key.startsWith('wallet_pf') ? state.limits.pf : key.startsWith('wallet_pj') ? state.limits.pj : state.limits.total
            return { rows: [{ value: String(v) }] }
        }
        if (q.startsWith('SELECT account_type, COUNT(*)')) return { rows: state.counts }
        if (q.startsWith('SELECT COUNT(*) as count FROM business_units')) return { rows: [{ count: '0' }] }
        if (q.startsWith('INSERT INTO business_units')) return { rows: [{ id: 10, ownerId: params[0], name: params[1], account_type: params[2], cnpj: params[3], logo_url: params[4], isPrimary: true }] }
        if (q.startsWith('SELECT * FROM business_units WHERE id = $1')) return { rows: state.exists ? [state.current] : [] }
        if (q.startsWith('SELECT id, "isPrimary" FROM business_units')) return { rows: state.exists ? [{ id: state.current.id, isPrimary: state.current.isPrimary }] : [] }
        if (q.startsWith('SELECT (SELECT COUNT(*) FROM finance_transactions')) return { rows: [state.usage] }
        if (q.startsWith('SELECT id FROM business_units WHERE id = $1 AND "ownerId" = $2 FOR UPDATE')) return { rows: state.exists ? [{ id: state.current.id }] : [] }
        if (q.startsWith('UPDATE business_units SET "isPrimary" = TRUE')) return { rows: [{ ...state.current, isPrimary: true }] }
        if (q.startsWith('UPDATE business_units SET "isPrimary" = FALSE')) return { rows: [], rowCount: 1 }
        if (q.startsWith('UPDATE business_units')) return { rows: [{ id: params[4], name: params[0], account_type: params[1], cnpj: params[2], logo_url: params[3] }] }
        if (q.startsWith('DELETE FROM business_units')) return { rowCount: state.deleted }
        if (q.startsWith('SELECT b.*')) return { rows: [{ id: 4, transactionsCount: 3, cardsCount: 1 }] }
        return { rows: [], rowCount: 0 }
    }
    mockDb.query.mockImplementation(handler)
    mockPool.query.mockImplementation(handler)
    mockClient.query.mockImplementation(handler)
    jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => console.error.mockRestore())

const ran = (start) => sql.filter(s => s.q.startsWith(start))

describe('CPF e CNPJ', () => {
    test.each([
        ['529.982.247-25', true], ['52998224725', true], ['529.982.247-26', false],
        ['111.111.111-11', false], ['5299822472', false], ['abc', false]
    ])('CPF %s → %s', (doc, ok) => expect(isValidCpf(doc)).toBe(ok))

    test.each([
        ['11.222.333/0001-81', true], ['11222333000181', true], ['11.222.333/0001-82', false],
        ['12.ABC.345/01DE-35', true],  // exemplo oficial da Receita (CNPJ alfanumérico)
        ['12abc34501de35', true], ['12.ABC.345/01DE-36', false], ['00.000.000/0000-00', false],
        ['12.ABC.345/01DE-3A', false]
    ])('CNPJ %s → %s', (doc, ok) => expect(isValidCnpj(doc)).toBe(ok))
})

describe('Criar carteira', () => {
    test('nome limpo, documento com máscara e principal decidida pelo servidor', async () => {
        const res = await request(app).post('/api/finance/business-units')
            .send({ name: '  Minha   empresa ', account_type: 'pj', cnpj: '12abc34501de35', photo_url: PNG, isPrimary: true })
        expect(res.status).toBe(200)
        const insert = ran('INSERT INTO business_units')[0]
        expect(insert.params).toEqual([1, 'Minha empresa', 'PJ', '12.ABC.345/01DE-35', PNG])
        // isPrimary do navegador não vai para o banco: só a primeira carteira da pessoa vira principal
        expect(insert.q).toContain('NOT EXISTS (SELECT 1 FROM business_units WHERE "ownerId" = $1))')
    })

    test('isPrimary: true do navegador não passa', async () => {
        await request(app).post('/api/finance/business-units').send({ name: 'Extra', account_type: 'PF', isPrimary: true })
        const insert = ran('INSERT INTO business_units')[0]
        expect(insert.params).not.toContain(true)
        expect(insert.params).toHaveLength(5)
    })

    test('documento e foto em branco ficam vazios', async () => {
        const res = await request(app).post('/api/finance/business-units').send({ name: 'Casa', account_type: 'PF', cnpj: '', photo_url: '' })
        expect(res.status).toBe(200)
        expect(ran('INSERT INTO business_units')[0].params).toEqual([1, 'Casa', 'PF', null, null])
    })

    test.each([
        [{ name: '', account_type: 'PF' }, 'nome'],
        [{ name: '   ', account_type: 'PF' }, 'nome'],
        [{ name: 'x'.repeat(61), account_type: 'PF' }, '60'],
        [{ name: 42, account_type: 'PF' }, 'nome'],
        [{ name: 'Casa', account_type: 'PF', cnpj: '123.456.789-00' }, 'CPF'],
        [{ name: 'Casa', account_type: 'PF', cnpj: '11.222.333/0001-81' }, 'CPF'],
        [{ name: 'MEI', account_type: 'PJ', cnpj: '529.982.247-25' }, 'CNPJ'],
        [{ name: 'MEI', account_type: 'PJ', cnpj: { $gt: '' } }, 'CNPJ'],
        [{ name: 'Casa', account_type: 'PF', photo_url: 'javascript:alert(1)' }, 'foto'],
        [{ name: 'Casa', account_type: 'PF', photo_url: 'http://exemplo.com/a.png' }, 'foto'],
        [{ name: 'Casa', account_type: 'PF', photo_url: 'data:image/svg+xml;base64,PHN2Zz4=' }, 'foto'],
        [{ name: 'Casa', account_type: 'PF', photo_url: 'data:image/png;base64,' + 'A'.repeat(3 * 1024 * 1024) }, 'foto']
    ])('dado inválido %#  é recusado', async (body, word) => {
        const res = await request(app).post('/api/finance/business-units').send(body)
        expect(res.status).toBe(400)
        expect(res.body.message).toMatch(new RegExp(word, 'i'))
        expect(ran('INSERT INTO business_units')).toHaveLength(0)
    })

    test('o limite do plano continua valendo (403)', async () => {
        state.limits = { total: 2, pf: 1, pj: 1 }
        state.counts = [{ account_type: 'PF', count: '1' }]
        const res = await request(app).post('/api/finance/business-units').send({ name: 'Outra', account_type: 'PF' })
        expect(res.status).toBe(403)
        expect(ran('INSERT INTO business_units')).toHaveLength(0)
    })
})

describe('Editar carteira', () => {
    test('não mexe em isPrimary (antes gravava null quando o navegador não mandava)', async () => {
        const res = await request(app).put('/api/finance/business-units/4')
            .send({ name: 'Pessoal 2', account_type: 'PF', cnpj: '529.982.247-25', photo_url: '' })
        expect(res.status).toBe(200)
        const upd = ran('UPDATE business_units')[0]
        expect(upd.q).not.toContain('isPrimary')
        expect(upd.params).toEqual(['Pessoal 2', 'PF', '529.982.247-25', null, 4, 1])
    })

    test('isPrimary mandado pelo navegador é ignorado', async () => {
        await request(app).put('/api/finance/business-units/4').send({ name: 'Pessoal', isPrimary: true })
        expect(ran('UPDATE business_units')[0].q).not.toContain('isPrimary')
    })

    test('campo que não veio fica como estava', async () => {
        state.current.logo_url = PNG
        await request(app).put('/api/finance/business-units/4').send({ name: 'Só o nome' })
        expect(ran('UPDATE business_units')[0].params).toEqual(['Só o nome', 'PF', '529.982.247-25', PNG, 4, 1])
    })

    test('documento antigo gravado fora do padrão não trava a troca de nome', async () => {
        state.current.cnpj = '123'
        const res = await request(app).put('/api/finance/business-units/4').send({ name: 'Novo nome', account_type: 'PF', cnpj: '123' })
        expect(res.status).toBe(200)
    })

    test('documento novo inválido é recusado', async () => {
        const res = await request(app).put('/api/finance/business-units/4').send({ name: 'Pessoal', account_type: 'PF', cnpj: '111.111.111-11' })
        expect(res.status).toBe(400)
        expect(ran('UPDATE business_units')).toHaveLength(0)
    })

    test('tipo não muda se a carteira tem lançamentos ou cartões (409)', async () => {
        state.usage = { transactions: 12, cards: 1 }
        const res = await request(app).put('/api/finance/business-units/4').send({ name: 'Pessoal', account_type: 'PJ', cnpj: '' })
        expect(res.status).toBe(409)
        expect(res.body.message).toMatch(/12 lançamentos e 1 cartão/)
        expect(res.body.usage).toEqual({ transactions: 12, cards: 1 })
        expect(ran('UPDATE business_units')).toHaveLength(0)
    })

    test('tipo muda se a carteira está vazia', async () => {
        const res = await request(app).put('/api/finance/business-units/4').send({ name: 'Empresa', account_type: 'PJ', cnpj: '11.222.333/0001-81' })
        expect(res.status).toBe(200)
        expect(ran('UPDATE business_units')[0].params.slice(0, 3)).toEqual(['Empresa', 'PJ', '11.222.333/0001-81'])
    })

    test('trocar o tipo sem trocar o documento confere o documento no tipo novo', async () => {
        // CPF que estava na PF não serve como CNPJ
        const res = await request(app).put('/api/finance/business-units/4').send({ name: 'Empresa', account_type: 'PJ', cnpj: '529.982.247-25' })
        expect(res.status).toBe(400)
        expect(res.body.message).toMatch(/CNPJ/)
    })

    test('carteira de outra pessoa ou id inválido: 404', async () => {
        state.exists = false
        expect((await request(app).put('/api/finance/business-units/4').send({ name: 'X' })).status).toBe(404)
        expect((await request(app).put('/api/finance/business-units/abc').send({ name: 'X' })).status).toBe(404)
        expect(ran('UPDATE business_units')).toHaveLength(0)
    })
})

describe('Excluir carteira', () => {
    test('carteira vazia sai', async () => {
        const res = await request(app).delete('/api/finance/business-units/4')
        expect(res.status).toBe(200)
        const del = ran('DELETE FROM business_units')[0]
        expect(del.params).toEqual([4, 1])
        expect(del.q).toContain('"isPrimary" IS NOT TRUE')
        expect(del.q).toContain('NOT EXISTS (SELECT 1 FROM finance_transactions')
    })

    test('a principal não sai (409)', async () => {
        state.current.isPrimary = true
        const res = await request(app).delete('/api/finance/business-units/4')
        expect(res.status).toBe(409)
        expect(res.body.reason).toBe('primary')
        expect(ran('DELETE FROM business_units')).toHaveLength(0)
    })

    test('com lançamentos ou cartões não sai e diz quantos (409)', async () => {
        state.usage = { transactions: 1, cards: 2 }
        const res = await request(app).delete('/api/finance/business-units/4')
        expect(res.status).toBe(409)
        expect(res.body.reason).toBe('in_use')
        expect(res.body.message).toMatch(/1 lançamento e 2 cartões/)
        expect(ran('DELETE FROM business_units')).toHaveLength(0)
    })

    test('se algo entrou entre a conta e a exclusão, nada sai (409)', async () => {
        state.deleted = 0
        const res = await request(app).delete('/api/finance/business-units/4')
        expect(res.status).toBe(409)
        expect(res.body.reason).toBe('changed')
    })

    test('carteira de outra pessoa ou id inválido: 404 sem excluir', async () => {
        state.exists = false
        expect((await request(app).delete('/api/finance/business-units/4')).status).toBe(404)
        expect((await request(app).delete('/api/finance/business-units/1.5')).status).toBe(404)
        expect(ran('DELETE FROM business_units')).toHaveLength(0)
    })
})

describe('Tornar principal', () => {
    test('tira a marca da atual e põe nesta, numa transação', async () => {
        const res = await request(app).patch('/api/finance/business-units/4/primary')
        expect(res.status).toBe(200)
        expect(res.body.isPrimary).toBe(true)
        const order = sql.map(s => s.q.split(' ').slice(0, 4).join(' '))
        const unset = sql.findIndex(s => s.q.startsWith('UPDATE business_units SET "isPrimary" = FALSE'))
        const set = sql.findIndex(s => s.q.startsWith('UPDATE business_units SET "isPrimary" = TRUE'))
        expect(order[0]).toBe('BEGIN')
        expect(unset).toBeGreaterThan(-1)
        expect(set).toBeGreaterThan(unset) // primeiro tira, senão o índice único recusa
        expect(sql[unset].params).toEqual([1, 4])
        expect(order[order.length - 1]).toBe('COMMIT')
        expect(mockClient.release).toHaveBeenCalled()
    })

    test('carteira de outra pessoa ou id inválido: 404 sem mudar nada', async () => {
        state.exists = false
        expect((await request(app).patch('/api/finance/business-units/4/primary')).status).toBe(404)
        expect((await request(app).patch('/api/finance/business-units/x/primary')).status).toBe(404)
        expect(ran('UPDATE business_units')).toHaveLength(0)
    })

    test('erro no meio desfaz tudo', async () => {
        mockClient.query.mockImplementation(async (q) => { if (/SET "isPrimary" = TRUE/.test(q)) throw new Error('falhou'); return { rows: [{ id: 4 }] } })
        const res = await request(app).patch('/api/finance/business-units/4/primary')
        expect(res.status).toBe(500)
        expect(mockClient.query.mock.calls.map(c => c[0])).toContain('ROLLBACK')
    })
})

describe('Criar carteira ao mesmo tempo', () => {
    test('se o banco recusar a segunda principal, a carteira entra sem ser principal', async () => {
        state.raceOnce = true
        const res = await request(app).post('/api/finance/business-units').send({ name: 'Casa', account_type: 'PF' })
        expect(res.status).toBe(200)
        const inserts = ran('INSERT INTO business_units')
        expect(inserts).toHaveLength(2)
        expect(inserts[1].q).toContain('$5, FALSE)')
    })
})

describe('Listar carteiras', () => {
    test('?uso=1 traz lançamentos e cartões de cada carteira', async () => {
        const res = await request(app).get('/api/finance/business-units?uso=1')
        expect(res.status).toBe(200)
        expect(res.body[0]).toMatchObject({ transactionsCount: 3, cardsCount: 1 })
        expect(ran('SELECT b.*')[0].params).toEqual([1])
    })
})
