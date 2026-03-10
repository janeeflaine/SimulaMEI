/**
 * Builds heatmap data for MonthlyHeatmapChart (V1.1).
 * Returns 12 cells with intensity 0-4 based on spending distribution.
 */
const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

export function buildHeatmapData(monthlyTotals = []) {
    if (!Array.isArray(monthlyTotals)) return []

    const map = new Map()
    let maxTotal = 0

    for (const m of monthlyTotals) {
        const month = parseInt(m.month) || 0
        const total = Math.abs(parseFloat(m.total) || 0)
        if (month >= 1 && month <= 12) {
            map.set(month, total)
            if (total > maxTotal) maxTotal = total
        }
    }

    return Array.from({ length: 12 }, (_, i) => {
        const total = map.get(i + 1) || 0
        const intensity = maxTotal > 0 ? Math.ceil((total / maxTotal) * 4) : 0
        return {
            month: i + 1,
            label: MONTH_LABELS[i],
            total,
            intensity: Math.min(intensity, 4)
        }
    })
}
