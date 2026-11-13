/**
 * Destaques do ano nos cartões, em frases curtas.
 */
const MONTH_NAMES = ['', 'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

export function buildInsights(kpis, cardBreakdown = [], monthlyTrend = []) {
    if (!kpis || kpis.totalSpent === 0) return []

    const insights = []

    // Cartão com a maior parte dos gastos
    if (kpis.topCard && kpis.topCardPercent > 0 && cardBreakdown.length > 1) {
        insights.push(`O ${kpis.topCard.name} concentra ${kpis.topCardPercent}% de tudo o que foi gasto nos cartões.`)
    }

    // Categoria com mais gastos
    if (kpis.topCategory && kpis.topCategory.category !== 'Sem Categoria') {
        insights.push(`${kpis.topCategory.category} foi a categoria com mais gastos.`)
    }

    // Variação entre os dois últimos meses com gasto
    const monthsWithData = monthlyTrend.filter(m => m.total > 0)
    if (monthsWithData.length >= 2) {
        const last = monthsWithData[monthsWithData.length - 1]
        const prev = monthsWithData[monthsWithData.length - 2]
        if (prev.total > 0) {
            const pctChange = Math.round(((last.total - prev.total) / prev.total) * 100)
            const lastName = MONTH_NAMES[last.month] || `mês ${last.month}`
            const prevName = MONTH_NAMES[prev.month] || `mês ${prev.month}`
            if (pctChange > 0) {
                insights.push(`Em ${lastName}, os cartões somaram ${pctChange}% a mais que em ${prevName}.`)
            } else if (pctChange < 0) {
                insights.push(`Em ${lastName}, os cartões somaram ${Math.abs(pctChange)}% a menos que em ${prevName}.`)
            }
        }
    }

    // Cartão quase sem uso
    if (cardBreakdown.length > 1) {
        const sorted = [...cardBreakdown].sort((a, b) => a.total - b.total)
        const lowest = sorted[0]
        if (lowest && lowest.percent < 15) {
            insights.push(lowest.total > 0
                ? `O ${lowest.name} quase não foi usado: ${lowest.percent}% do total.`
                : `O ${lowest.name} não teve gastos nas faturas do ano.`)
        }
    }

    return insights
}
