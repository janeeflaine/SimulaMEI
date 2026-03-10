/**
 * Builds monthly trend data for the MonthlyTrendChart.
 * Fills in missing months (1-12) with zero values.
 */
const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

export function buildMonthlyTrend(monthlyTotals = []) {
    if (!Array.isArray(monthlyTotals)) return []

    const map = new Map()
    for (const m of monthlyTotals) {
        const month = parseInt(m.month) || 0
        if (month >= 1 && month <= 12) {
            map.set(month, Math.abs(parseFloat(m.total) || 0))
        }
    }

    return Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        label: MONTH_LABELS[i],
        total: map.get(i + 1) || 0
    }))
}
