/**
 * Banco novo: as migrações dos planos precisam rodar em ordem (v2 → v6).
 * Antes rodavam de trás para frente e a v2, a mais antiga, apagava cartões,
 * categorias e contas a pagar de todos os planos.
 */
const fs = require('fs')
const path = require('path')

// Banco simulado: só o que as migrações dos planos usam
function fakeDb() {
    const plans = { Gratuito: {}, Prata: {}, Ouro: {} }
    const settings = new Set()
    const query = async (rawSql, params = []) => {
        const sql = rawSql.replace(/\s+/g, ' ')
        let m
        if ((m = sql.match(/SELECT \* FROM system_settings WHERE key = '(\w+)'/))) return { rows: settings.has(m[1]) ? [{}] : [] }
        if ((m = sql.match(/INSERT INTO system_settings \(key, value\) VALUES \('(\w+)'/))) { settings.add(m[1]); return { rows: [] } }
        if ((m = sql.match(/UPDATE plans SET features = \$1 WHERE name = '(\w+)'/))) { plans[m[1]] = JSON.parse(params[0]); return { rows: [] } }
        if (/SELECT features FROM plans WHERE name = 'Gratuito'/.test(sql)) return { rows: [{ features: JSON.stringify(plans.Gratuito) }] }
        if (/SELECT id, name, features FROM plans/.test(sql)) return { rows: Object.keys(plans).map(n => ({ id: n, name: n, features: JSON.stringify(plans[n]) })) }
        if (/UPDATE plans SET features = \$1 WHERE id = \$2/.test(sql)) { plans[params[1]] = JSON.parse(params[0]); return { rows: [] } }
        return { rows: [] }
    }
    return { plans, pool: { query } }
}

test('banco novo termina com os recursos certos em cada plano', async () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'db.js'), 'utf8')
    const start = src.indexOf('// As migrações rodam em ordem')
    const end = src.indexOf('} catch (e) {', start)
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)

    const { plans, pool } = fakeDb()
    jest.spyOn(console, 'log').mockImplementation(() => {})
    // eslint-disable-next-line no-new-func
    await new Function('pool', `return (async () => { ${src.slice(start, end)} })()`)(pool)
    console.log.mockRestore()

    expect(plans.Gratuito).toMatchObject({ cartoes: true, categorias: true, comparativo: true, alertas: true, upload_faturas: false, contas_pagar: false })
    expect(plans.Prata).toMatchObject({ cartoes: true, upload_faturas: true, contas_pagar: true, multi_carteiras: true, whatsapp: true })
    expect(plans.Ouro).toMatchObject({ cartoes: true, upload_faturas: true, contas_pagar: true, whatsapp_midia: true })
})
