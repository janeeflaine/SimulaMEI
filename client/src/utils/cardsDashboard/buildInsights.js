/**
 * Generates automatic insights from consolidated dashboard data.
 * Returns an array of insight strings based on data patterns.
 */
const MONTH_NAMES = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

function formatBRL(v) {
    return `R$ ${(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function buildInsights(kpis, cardBreakdown = [], monthlyTrend = []) {
    if (!kpis || kpis.totalSpent === 0) return []

    const insights = []

    // Top card concentration
    if (kpis.topCard && kpis.topCardPercent > 0) {
        insights.push(`O cartão ${kpis.topCard.name} representa ${kpis.topCardPercent}% do total gasto.`)
    }

    // Top category
    if (kpis.topCategory) {
        insights.push(`A categoria "${kpis.topCategory.category}" foi a principal despesa do período.`)
    }

    // Most expensive month
    if (kpis.mostExpensiveMonth && kpis.mostExpensiveMonth.month) {
        const monthName = MONTH_NAMES[kpis.mostExpensiveMonth.month] || `Mês ${kpis.mostExpensiveMonth.month}`
        insights.push(`${monthName} foi o mês mais caro.`)
    }

    // Monthly average
    if (kpis.monthlyAverage > 0) {
        insights.push(`O gasto médio mensal consolidado foi de ${formatBRL(kpis.monthlyAverage)}.`)
    }

    // Month-over-month variation (last 2 months with data)
    const monthsWithData = monthlyTrend.filter(m => m.total > 0)
    if (monthsWithData.length >= 2) {
        const last = monthsWithData[monthsWithData.length - 1]
        const prev = monthsWithData[monthsWithData.length - 2]
        if (prev.total > 0) {
            const pctChange = Math.round(((last.total - prev.total) / prev.total) * 100)
            if (pctChange > 0) {
                insights.push(`Os gastos subiram ${pctChange}% em relação ao mês anterior.`)
            } else if (pctChange < 0) {
                insights.push(`Os gastos caíram ${Math.abs(pctChange)}% em relação ao mês anterior.`)
            }
        }
    }

    // Low utilization card
    if (cardBreakdown.length > 1) {
        const sorted = [...cardBreakdown].sort((a, b) => a.total - b.total)
        const lowest = sorted[0]
        if (lowest && lowest.percent < 15) {
            insights.push(`O cartão ${lowest.name} teve baixa utilização no período.`)
        }
    }

    return insights
}
