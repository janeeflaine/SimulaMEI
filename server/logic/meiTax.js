/**
 * Contas do MEI: DAS do ano, custo de um funcionário, excesso de faturamento e o
 * imposto de uma Microempresa no Simples Nacional, para o Simulador e o Comparativo.
 *
 * - DAS = 5% do salário mínimo (INSS) + R$ 1 de ICMS (comércio/indústria) e/ou
 *   R$ 5 de ISS (serviços). O salário mínimo muda todo ano: vale o da tabela abaixo
 *   ou o gravado pelo admin em Regras de Cálculo, o que for maior (o mínimo nunca
 *   baixa; um ano sem valor na tabela usa o último conhecido até o admin gravar).
 * - Funcionário: o MEI pode ter 1 com salário mínimo (ou o piso da categoria) e
 *   paga 3% de INSS patronal e 8% de FGTS sobre o salário. A partir de 2027 pode
 *   ter 2 (LC 238/2026).
 * - Passou do limite: até 20% acima, paga imposto sobre o excesso numa guia própria
 *   e vira Microempresa em janeiro do ano seguinte; mais de 20%, sai do MEI desde
 *   janeiro do mesmo ano (LC 123/2006, art. 18-A, § 7º, III).
 * - Microempresa: Simples Nacional, alíquota efetiva = (RBT12 × alíquota − parcela a
 *   deduzir) / RBT12 (LC 123/2006, anexos I e III, na redação da LC 155/2016).
 */

// Salário mínimo nacional (2026: Decreto 12.797/2025)
const MIN_WAGE = { 2024: 1412, 2025: 1518, 2026: 1621 }
const KNOWN_YEARS = Object.keys(MIN_WAGE).map(Number).sort((a, b) => a - b)

const lawMinimumWage = (year) => {
    if (MIN_WAGE[year]) return MIN_WAGE[year]
    const before = KNOWN_YEARS.filter(y => y <= year)
    return MIN_WAGE[before.length ? before[before.length - 1] : KNOWN_YEARS[0]]
}

const ACTIVITIES = ['comercio', 'servico', 'ambos']
const EMPLOYEE_CHARGES = 0.08 + 0.03 // FGTS + INSS patronal do MEI
const EXCESS_TOLERANCE = 0.2

const cents = (v) => Math.round(v * 100) / 100
const num = (v, fallback) => {
    const n = Number(v)
    return Number.isFinite(n) && n >= 0 ? n : fallback
}

// Regras gravadas pelo admin (linha de calculation_rules) + ano
function rulesFor(rules = {}, year) {
    const r = rules || {}
    const saved = num(r.minimumWage, 0)
    return {
        year,
        minimumWage: Math.max(saved, lawMinimumWage(year)),
        inssPercentage: num(r.inssPercentage, 5),
        icmsValue: num(r.icmsValue, 1),
        issValue: num(r.issValue, 5)
    }
}

function dasFor(activityType, r) {
    const inss = cents(r.minimumWage * r.inssPercentage / 100)
    const icms = activityType === 'comercio' || activityType === 'ambos' ? r.icmsValue : 0
    const iss = activityType === 'servico' || activityType === 'ambos' ? r.issValue : 0
    return { inss, icms, iss, total: cents(inss + icms + iss) }
}

// Os três valores do ano, para o quadro "Como o DAS é calculado"
function dasTable(r) {
    const inss = cents(r.minimumWage * r.inssPercentage / 100)
    return {
        minimumWage: r.minimumWage,
        inss,
        icms: r.icmsValue,
        iss: r.issValue,
        comercio: dasFor('comercio', r).total,
        servico: dasFor('servico', r).total,
        ambos: dasFor('ambos', r).total
    }
}

const employeeCost = (r) => cents(r.minimumWage * (1 + EMPLOYEE_CHARGES))
const employeesAllowed = (year) => (year >= 2027 ? 2 : 1)

function excessFor(annualRevenue, limit) {
    if (!(limit > 0) || annualRevenue <= limit) return { kind: 'none', amount: 0 }
    return {
        kind: annualRevenue <= limit * (1 + EXCESS_TOLERANCE) ? 'ate20' : 'acima20',
        amount: cents(annualRevenue - limit)
    }
}

// Simples Nacional: [receita bruta em 12 meses até, alíquota nominal, parcela a deduzir]
const SIMPLES = {
    I: [[180000, 0.04, 0], [360000, 0.073, 5940], [720000, 0.095, 13860], [1800000, 0.107, 22500], [3600000, 0.143, 87300], [4800000, 0.19, 378000]],
    III: [[180000, 0.06, 0], [360000, 0.112, 9360], [720000, 0.135, 17640], [1800000, 0.16, 35640], [3600000, 0.21, 125640], [4800000, 0.33, 648000]]
}
const SIMPLES_LIMIT = 4800000

// Comércio no anexo I; serviços no III. Quem faz os dois: estimativa pelo III (a tela avisa)
const annexFor = (activityType) => (activityType === 'comercio' ? 'I' : 'III')

function simplesTax(annualRevenue, annex) {
    const table = SIMPLES[annex]
    const row = table.find(t => annualRevenue <= t[0]) || table[table.length - 1]
    const rate = annualRevenue > 0 ? Math.max(0, (annualRevenue * row[1] - row[2]) / annualRevenue) : row[1]
    const annual = cents(annualRevenue * rate)
    return { annex, rate: Math.round(rate * 1e6) / 1e6, annualTax: annual, monthlyTax: cents(annual / 12) }
}

module.exports = {
    ACTIVITIES, SIMPLES_LIMIT,
    lawMinimumWage, rulesFor, dasFor, dasTable, employeeCost, employeesAllowed,
    excessFor, annexFor, simplesTax
}
