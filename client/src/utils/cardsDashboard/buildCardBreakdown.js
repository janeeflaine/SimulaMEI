/**
 * Builds card breakdown data for the SpendingByCardChart.
 * Sorts by total descending. Handles negative values (estornos).
 */
export function buildCardBreakdown(cardBreakdown = []) {
    if (!Array.isArray(cardBreakdown) || cardBreakdown.length === 0) return []

    const totalAll = cardBreakdown.reduce((sum, c) => sum + Math.abs(parseFloat(c.total) || 0), 0)

    return cardBreakdown
        .map(c => ({
            cardId: c.cardId,
            name: c.name || 'Sem nome',
            total: Math.abs(parseFloat(c.total) || 0),
            percent: totalAll > 0
                ? Math.round((Math.abs(parseFloat(c.total) || 0) / totalAll) * 100)
                : 0
        }))
        .sort((a, b) => b.total - a.total)
}
