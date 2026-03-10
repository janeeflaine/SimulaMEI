/**
 * Builds category breakdown for SpendingByCategoryChart.
 * Limits to MAX_CATEGORIES, groups the rest under "Outros".
 * Handles negative values (estornos).
 */
const MAX_CATEGORIES = 8

export function buildCategoryBreakdown(categoryBreakdown = []) {
    if (!Array.isArray(categoryBreakdown) || categoryBreakdown.length === 0) return []

    const sorted = categoryBreakdown
        .map(c => ({
            category: c.category || 'Sem Categoria',
            total: Math.abs(parseFloat(c.total) || 0),
            count: parseInt(c.count) || 0
        }))
        .sort((a, b) => b.total - a.total)

    if (sorted.length <= MAX_CATEGORIES) return sorted

    const top = sorted.slice(0, MAX_CATEGORIES)
    const rest = sorted.slice(MAX_CATEGORIES)
    const othersTotal = rest.reduce((sum, c) => sum + c.total, 0)
    const othersCount = rest.reduce((sum, c) => sum + c.count, 0)

    top.push({
        category: 'Outros',
        total: Math.round(othersTotal * 100) / 100,
        count: othersCount
    })

    return top
}
