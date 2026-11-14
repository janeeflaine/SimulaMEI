const { db } = require('../db')

/**
 * Limite anual de faturamento do MEI, por ano-calendário.
 *
 * Pela LC 238/2026 (publicada em 21/10/2026): R$ 81 mil até 2026, R$ 110 mil em
 * 2027 (regra transitória) e R$ 140 mil a partir de 2028 (condicionado ao
 * orçamento). O admin pode gravar outro valor para um ano em Admin > Limites MEI
 * (linha de mei_limits com "year"); sem linha do ano, vale o da lei.
 * As porcentagens de aviso (amarelo/vermelho do Simulador) são as da última gravação.
 */
const TZ = 'America/Sao_Paulo'
const lawLimit = (year) => (year >= 2028 ? 140000 : year === 2027 ? 110000 : 81000)
const currentYearBR = (now = new Date()) => Number(now.toLocaleDateString('sv-SE', { timeZone: TZ }).slice(0, 4))

async function getMeiLimits(year = currentYearBR(), q = db) {
    const { rows: [row] } = await q.query(
        'SELECT "annualLimit", "updatedAt" FROM mei_limits WHERE year = $1 ORDER BY id DESC LIMIT 1',
        [year]
    )
    const { rows: [latest] } = await q.query(
        'SELECT "warningPercentage", "dangerPercentage" FROM mei_limits ORDER BY id DESC LIMIT 1'
    )
    const custom = Number(row?.annualLimit) > 0
    return {
        year,
        annualLimit: custom ? Number(row.annualLimit) : lawLimit(year),
        warningPercentage: Number(latest?.warningPercentage) > 0 ? Number(latest.warningPercentage) : 70,
        dangerPercentage: Number(latest?.dangerPercentage) > 0 ? Number(latest.dangerPercentage) : 90,
        source: custom ? 'admin' : 'lei',
        lawLimit: lawLimit(year)
    }
}

module.exports = { getMeiLimits, lawLimit, currentYearBR }
