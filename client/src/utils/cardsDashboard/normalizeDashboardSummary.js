/**
 * Normalizes the dashboard-summary API response to guarantee safe defaults.
 * Handles null, undefined, partial, or malformed payloads.
 */
export function normalizeDashboardSummary(raw) {
    if (!raw || typeof raw !== 'object') {
        return {
            totalCurrentMonth: 0,
            totalNextMonth: 0,
            cards: [],
            consolidated: null
        }
    }

    const result = {
        totalCurrentMonth: parseFloat(raw.totalCurrentMonth) || 0,
        totalNextMonth: parseFloat(raw.totalNextMonth) || 0,
        cards: Array.isArray(raw.cards) ? raw.cards : [],
        consolidated: null
    }

    if (raw.consolidated && typeof raw.consolidated === 'object') {
        const c = raw.consolidated
        result.consolidated = {
            year: parseInt(c.year) || new Date().getFullYear(),
            totalSpent: parseFloat(c.totalSpent) || 0,
            monthlyTotals: Array.isArray(c.monthlyTotals) ? c.monthlyTotals : [],
            categoryBreakdown: Array.isArray(c.categoryBreakdown) ? c.categoryBreakdown : [],
            cardBreakdown: Array.isArray(c.cardBreakdown) ? c.cardBreakdown : []
        }
    }

    return result
}
