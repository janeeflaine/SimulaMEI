/**
 * Calculates KPI metrics from consolidated dashboard data.
 * Pure function — no side effects, fully testable.
 *
 * @param {object} consolidated - normalized consolidated data
 * @param {object[]} cards - array of card objects
 * @returns {object} KPI metrics
 */
export function calculateKPIs(consolidated, cards = []) {
    if (!consolidated) {
        return {
            totalSpent: 0,
            monthlyAverage: 0,
            topCard: null,
            topCategory: null,
            mostExpensiveMonth: null,
            activeCards: 0,
            totalTransactions: 0,
            topCardPercent: 0
        }
    }

    const { totalSpent = 0, monthlyTotals = [], categoryBreakdown = [], cardBreakdown = [] } = consolidated

    // Monthly average (only months with data)
    const monthsWithData = monthlyTotals.filter(m => (parseFloat(m.total) || 0) > 0)
    const monthlyAverage = monthsWithData.length > 0 ? totalSpent / monthsWithData.length : 0

    // Top card
    const sortedCards = [...cardBreakdown]
        .map(c => ({ ...c, total: Math.abs(parseFloat(c.total) || 0) }))
        .sort((a, b) => b.total - a.total)
    const topCard = sortedCards[0] || null
    const topCardPercent = topCard && totalSpent > 0
        ? Math.round((topCard.total / totalSpent) * 100)
        : 0

    // Top category
    const sortedCategories = [...categoryBreakdown]
        .map(c => ({ ...c, total: Math.abs(parseFloat(c.total) || 0) }))
        .sort((a, b) => b.total - a.total)
    const topCategory = sortedCategories[0] || null

    // Most expensive month
    const sortedMonths = [...monthlyTotals]
        .map(m => ({ ...m, total: parseFloat(m.total) || 0 }))
        .sort((a, b) => b.total - a.total)
    const mostExpensiveMonth = sortedMonths[0] || null

    // Total transactions (sum of counts from category breakdown)
    const totalTransactions = categoryBreakdown.reduce((sum, c) => sum + (parseInt(c.count) || 0), 0)

    return {
        totalSpent,
        monthlyAverage: Math.round(monthlyAverage * 100) / 100,
        topCard,
        topCategory,
        mostExpensiveMonth,
        activeCards: cards.length,
        totalTransactions,
        topCardPercent
    }
}
