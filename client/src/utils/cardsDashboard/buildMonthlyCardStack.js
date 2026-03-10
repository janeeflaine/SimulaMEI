/**
 * Builds stacked bar data for MonthlyCardStackChart.
 * Each month has { month, label, [cardName]: amount, ... }
 */
const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

export function buildMonthlyCardStack(monthlyTotals = [], cardBreakdown = []) {
    if (!Array.isArray(monthlyTotals) || !Array.isArray(cardBreakdown)) return { data: [], cardNames: [] }

    const cardNames = cardBreakdown.map(c => c.name || 'Sem nome')

    const data = Array.from({ length: 12 }, (_, i) => {
        const entry = { month: i + 1, label: MONTH_LABELS[i] }
        for (const name of cardNames) {
            entry[name] = 0
        }
        return entry
    })

    for (const m of monthlyTotals) {
        const month = parseInt(m.month) || 0
        if (month < 1 || month > 12) continue

        const byCard = m.byCard || {}
        for (const [cardName, amount] of Object.entries(byCard)) {
            if (data[month - 1][cardName] !== undefined) {
                data[month - 1][cardName] = Math.abs(parseFloat(amount) || 0)
            }
        }
    }

    return { data, cardNames }
}
