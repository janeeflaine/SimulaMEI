/**
 * Builds card share data for the CardShareDonutChart.
 * Percentages always sum to 100%.
 */
export function buildCardShare(cardBreakdown = []) {
    if (!Array.isArray(cardBreakdown) || cardBreakdown.length === 0) return []

    const totalAll = cardBreakdown.reduce((sum, c) => sum + Math.abs(parseFloat(c.total) || 0), 0)
    if (totalAll === 0) return []

    return cardBreakdown
        .map(c => ({
            name: c.name || 'Sem nome',
            total: Math.abs(parseFloat(c.total) || 0),
            percent: Math.round((Math.abs(parseFloat(c.total) || 0) / totalAll) * 100)
        }))
        .sort((a, b) => b.total - a.total)
}
