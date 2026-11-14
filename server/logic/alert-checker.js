const { db } = require('../db')
const { getMeiLimits } = require('../utils/meiLimits')

/**
 * Alertas do MEI: limite de faturamento, vencimento do DAS e declaração anual.
 *
 * - "Hoje" é sempre o dia no horário de Brasília (o servidor roda em UTC: antes,
 *   depois das 21h o alerta do DAS já contava o dia seguinte).
 * - Faturamento: receitas da carteira do MEI recebidas no ano, sem transferências
 *   entre carteiras (decisão do dono, 14/11/2026), separadas por MEI (o limite é de
 *   cada CNPJ, não da soma). Sem nenhuma, usa a última simulação.
 * - O DAS do mês vence no dia 20; a DASN-SIMEI do ano anterior, em 31 de maio.
 */

const TZ = 'America/Sao_Paulo'
const TYPES = ['REVENUE_LIMIT', 'DAS_EXPIRY', 'ANNUAL_DECLARATION']
const DEFAULT_CONFIG = {
    REVENUE_LIMIT: { trigger_at_percentage: 80 },
    DAS_EXPIRY: { days_before: 5 },
    ANNUAL_DECLARATION: {}
}
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

const pad = (n) => String(n).padStart(2, '0')
const brl = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

// Dia de hoje no Brasil
const todayBR = (now = new Date()) => {
    const [year, month, day] = now.toLocaleDateString('sv-SE', { timeZone: TZ }).split('-').map(Number)
    return { year, month, day }
}

// Dias entre duas datas de calendário (sem hora)
const daysBetween = (a, b) => Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86400000)

const parseConfig = (raw) => {
    if (raw && typeof raw === 'object') return raw
    try {
        const parsed = JSON.parse(raw || '{}')
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
        return {}
    }
}

const configOf = (alert) => ({ ...DEFAULT_CONFIG[alert.type], ...parseConfig(alert.config) })

// Documento sem máscara, para juntar carteiras do mesmo MEI (CNPJ pode ter letras)
const docKey = (doc) => String(doc || '').toUpperCase().replace(/[^0-9A-Z]/g, '')

/**
 * Faturamento de cada MEI no ano e limite anual.
 *
 * O limite é por CNPJ: cada MEI tem o seu. Carteiras PJ com o mesmo CNPJ somam
 * juntas; carteira PJ sem CNPJ conta sozinha. Receita do MEI sem carteira PJ
 * (lançamento antigo) vai para o único MEI, se houver um só; com vários, aparece
 * à parte ("sem carteira") e não dispara aviso, porque não dá para saber de qual é.
 */
async function revenueStatus(userId, year) {
    // Limite do ano do faturamento (2026: 81 mil; 2027: 110 mil; 2028 em diante: 140 mil)
    const { annualLimit: limit } = await getMeiLimits(year)

    const { rows: wallets } = await db.query(
        `SELECT id, name, cnpj FROM business_units
         WHERE "ownerId" = $1 AND "account_type" = 'PJ'
         ORDER BY "isPrimary" DESC NULLS LAST, "createdAt" ASC NULLS LAST, id ASC`,
        [userId]
    )
    const { rows: sums } = await db.query(
        `SELECT t."business_unit_id" AS "walletId", COUNT(*)::int AS count, COALESCE(SUM(t.amount), 0)::float AS total
         FROM finance_transactions t
         LEFT JOIN business_units b ON b.id = t."business_unit_id" AND b."ownerId" = t."userId"
         WHERE t."userId" = $1 AND t.type = 'RECEITA' AND t.status = 'PAID'
           AND (t.target = 'BUSINESS' OR b."account_type" = 'PJ')
           AND COALESCE(t."paymentMethod", '') <> 'Transferência'
           AND t.date >= make_date($2::int, 1, 1) AND t.date < make_date($2::int + 1, 1, 1)
         GROUP BY t."business_unit_id"`,
        [userId, year]
    )

    // Um grupo por MEI
    const groups = new Map()
    const groupOfWallet = new Map()
    for (const w of wallets) {
        const doc = docKey(w.cnpj)
        const key = doc ? `c${doc}` : `w${w.id}`
        if (!groups.has(key)) groups.set(key, { key, name: w.name, document: w.cnpj || null, wallets: 0, count: 0, total: 0 })
        groups.get(key).wallets++
        groupOfWallet.set(Number(w.id), key)
    }

    let loose = { count: 0, total: 0 }
    for (const s of sums) {
        const key = s.walletId != null ? groupOfWallet.get(Number(s.walletId)) : null
        const target = key ? groups.get(key) : loose
        target.count += Number(s.count) || 0
        target.total += Number(s.total) || 0
    }
    if (loose.count) {
        if (groups.size === 1) {
            const only = [...groups.values()][0]
            only.count += loose.count
            only.total += loose.total
        } else if (groups.size === 0) {
            groups.set('mei', { key: 'mei', name: null, document: null, wallets: 0, ...loose })
        } else {
            groups.set('sem', { key: 'sem', name: null, document: null, wallets: 0, unassigned: true, ...loose })
        }
    }

    let meis = [...groups.values()]
    const fromExtrato = meis.some(m => m.count > 0)
    let source = fromExtrato ? 'extrato' : null
    let monthly = null

    if (!source) {
        const { rows: [sim] } = await db.query(
            'SELECT revenue, "revenueType" FROM simulations WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT 1',
            [userId]
        )
        if (sim && Number(sim.revenue) > 0) {
            const isMonthly = sim.revenueType !== 'anual' // igual ao Simulador
            monthly = isMonthly ? Number(sim.revenue) : null
            source = 'simulacao'
            // A simulação é de um MEI só: não dá para dividir entre vários
            meis = [{ key: 'sim', name: null, document: null, wallets: 0, count: 0, total: isMonthly ? Number(sim.revenue) * 12 : Number(sim.revenue) }]
        }
    }

    meis = meis
        .map(m => ({ ...m, total: Math.round(m.total * 100) / 100, percent: limit ? (m.total / limit) * 100 : 0, unassigned: !!m.unassigned }))
        .sort((a, b) => (a.unassigned - b.unassigned) || (b.total - a.total))

    // Resumo: o MEI mais perto do limite (nunca a soma de MEIs diferentes)
    const top = meis.filter(m => !m.unassigned)[0] || null
    return {
        year, limit, source, monthly, meis,
        total: top ? top.total : 0,
        percent: top ? top.percent : 0
    }
}

/** Próximo DAS (dia 20) a partir de hoje. */
function dasStatus(today) {
    let { year, month } = today
    if (today.day > 20) {
        month += 1
        if (month > 12) { month = 1; year += 1 }
    }
    const due = { year, month, day: 20 }
    // O DAS que vence no dia 20 é o do mês anterior
    const ref = month === 1 ? 12 : month - 1
    return { dueDate: `${year}-${pad(month)}-20`, daysLeft: daysBetween(today, due), referenceMonth: MONTHS[ref - 1] }
}

/** Declaração anual (DASN-SIMEI): prazo em 31 de maio, aviso em abril e maio. */
function dasnStatus(today) {
    const deadlineYear = today.month > 5 ? today.year + 1 : today.year
    const deadline = { year: deadlineYear, month: 5, day: 31 }
    return {
        deadline: `${deadlineYear}-05-31`,
        referenceYear: deadlineYear - 1,
        daysLeft: daysBetween(today, deadline),
        season: today.month === 4 || today.month === 5
    }
}

/** Avisos disparados pelos alertas ligados. */
function triggeredFrom(alerts, status) {
    const out = []
    for (const alert of alerts) {
        if (!alert.enabled) continue
        const config = configOf(alert)

        if (alert.type === 'REVENUE_LIMIT' && status.revenue.source) {
            const { meis, limit, year, source } = status.revenue
            const trigger = Number(config.trigger_at_percentage) || 80
            const named = meis.filter(m => !m.unassigned).length > 1
            for (const mei of meis) {
                if (mei.unassigned || mei.percent < trigger) continue
                const { percent, total } = mei
                const over = percent >= 100
                out.push({
                    id: alert.id,
                    key: `${alert.type}-${mei.key}`,
                    mei: mei.key,
                    type: alert.type,
                    severity: over || percent >= 95 ? 'danger' : 'warning',
                    title: over
                        ? `Faturamento ${named && mei.name ? `de ${mei.name}` : 'do MEI'} passou do limite de ${year}`
                        : `Faturamento ${named && mei.name ? `de ${mei.name}` : 'do MEI'} em ${percent.toFixed(1).replace('.', ',')}% do limite`,
                    message: source === 'extrato'
                        ? `${brl(total)} recebidos em ${year}, de ${brl(limit)} por ano.`
                        : `Pela sua última simulação, ${brl(total)} no ano, de ${brl(limit)}.`,
                    usage: percent
                })
            }
        }

        if (alert.type === 'DAS_EXPIRY') {
            const { daysLeft, dueDate, referenceMonth } = status.das
            const before = Number(config.days_before) || 5
            if (daysLeft >= 0 && daysLeft <= before) {
                const [y, m, d] = dueDate.split('-')
                out.push({
                    id: alert.id,
                    key: alert.type,
                    type: alert.type,
                    severity: daysLeft <= 2 ? 'danger' : 'warning',
                    title: daysLeft === 0 ? 'O DAS vence hoje' : `O DAS vence em ${plural(daysLeft, 'dia', 'dias')}`,
                    message: `O DAS de ${referenceMonth} vence em ${d}/${m}/${y}.`,
                    day: daysLeft
                })
            }
        }

        if (alert.type === 'ANNUAL_DECLARATION' && status.dasn.season) {
            const { daysLeft, referenceYear, deadline } = status.dasn
            const [y] = deadline.split('-')
            out.push({
                id: alert.id,
                key: alert.type,
                type: alert.type,
                severity: daysLeft <= 15 ? 'danger' : 'warning',
                title: daysLeft === 0
                    ? 'A declaração anual do MEI vence hoje'
                    : `Declaração anual do MEI: ${daysLeft === 1 ? 'falta 1 dia' : `faltam ${daysLeft} dias`}`,
                message: `A DASN-SIMEI de ${referenceYear} deve ser entregue até 31/05/${y}.`
            })
        }
    }
    return out
}

/** Situação completa: faturamento, DAS, declaração e avisos disparados. */
async function alertStatus(userId, alerts, now = new Date()) {
    const today = todayBR(now)
    const status = {
        today: `${today.year}-${pad(today.month)}-${pad(today.day)}`,
        revenue: await revenueStatus(userId, today.year),
        das: dasStatus(today),
        dasn: dasnStatus(today)
    }
    status.triggered = triggeredFrom(alerts, status)
    return status
}

/** Avisos disparados (usado pelo Painel). */
async function checkUserAlerts(userId, now = new Date()) {
    try {
        const { rows: alerts } = await db.query(
            'SELECT * FROM user_alerts WHERE "userId" = $1 AND enabled = TRUE ORDER BY id ASC',
            [userId]
        )
        // Linhas repetidas do mesmo tipo (de antes da trava): vale a primeira
        const seen = new Set()
        const unique = alerts.filter(a => TYPES.includes(a.type) && !seen.has(a.type) && seen.add(a.type))
        if (!unique.length) return []
        return (await alertStatus(userId, unique, now)).triggered
    } catch (err) {
        console.error('Error checking alerts logic:', err)
        return []
    }
}

module.exports = { checkUserAlerts, alertStatus, revenueStatus, todayBR, dasStatus, dasnStatus, configOf, TYPES, DEFAULT_CONFIG }
