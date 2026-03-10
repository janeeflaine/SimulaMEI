import { useState, useEffect, useMemo, useCallback } from 'react'
import { normalizeDashboardSummary } from '../utils/cardsDashboard/normalizeDashboardSummary'
import { calculateKPIs } from '../utils/cardsDashboard/calculateKPIs'
import { buildCardBreakdown } from '../utils/cardsDashboard/buildCardBreakdown'
import { buildCategoryBreakdown } from '../utils/cardsDashboard/buildCategoryBreakdown'
import { buildMonthlyTrend } from '../utils/cardsDashboard/buildMonthlyTrend'
import { buildMonthlyCardStack } from '../utils/cardsDashboard/buildMonthlyCardStack'
import { buildCardShare } from '../utils/cardsDashboard/buildCardShare'
import { buildHeatmapData } from '../utils/cardsDashboard/buildHeatmapData'
import { buildInsights } from '../utils/cardsDashboard/buildInsights'

const TIMEOUT_MS = 15000 // 15s timeout to avoid infinite loading

/**
 * Custom hook for the consolidated cards dashboard.
 * Single request, memoized transformations, timeout-safe.
 */
export function useCardsDashboardSummary(year) {
    const [raw, setRaw] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    const API = import.meta.env.VITE_API_URL || ''
    const token = localStorage.getItem('token')

    const fetchData = useCallback(async () => {
        setLoading(true)
        setError(null)

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

        try {
            const res = await fetch(
                `${API}/api/finance/invoices/dashboard-summary?consolidated=true&year=${year}`,
                {
                    headers: { 'Authorization': `Bearer ${token}` },
                    signal: controller.signal
                }
            )
            clearTimeout(timeoutId)

            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const data = await res.json()
            setRaw(data)
        } catch (err) {
            clearTimeout(timeoutId)
            if (err.name === 'AbortError') {
                setError('Timeout: a requisição demorou demais. Tente novamente.')
            } else {
                setError(err.message || 'Erro ao carregar dados')
            }
        } finally {
            setLoading(false)
        }
    }, [API, token, year])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    // Memoized transformations — same input = same reference
    const normalized = useMemo(() => normalizeDashboardSummary(raw), [raw])
    const consolidated = normalized.consolidated

    const kpis = useMemo(() => calculateKPIs(consolidated, normalized.cards), [consolidated, normalized.cards])
    const cardBreakdown = useMemo(() => buildCardBreakdown(consolidated?.cardBreakdown), [consolidated])
    const categoryBreakdown = useMemo(() => buildCategoryBreakdown(consolidated?.categoryBreakdown), [consolidated])
    const monthlyTrend = useMemo(() => buildMonthlyTrend(consolidated?.monthlyTotals), [consolidated])
    const monthlyCardStack = useMemo(() => buildMonthlyCardStack(consolidated?.monthlyTotals, consolidated?.cardBreakdown), [consolidated])
    const cardShare = useMemo(() => buildCardShare(consolidated?.cardBreakdown), [consolidated])
    const heatmapData = useMemo(() => buildHeatmapData(consolidated?.monthlyTotals), [consolidated])
    const insights = useMemo(() => buildInsights(kpis, cardBreakdown, monthlyTrend), [kpis, cardBreakdown, monthlyTrend])

    return {
        loading,
        error,
        cards: normalized.cards,
        kpis,
        cardBreakdown,
        categoryBreakdown,
        monthlyTrend,
        monthlyCardStack,
        cardShare,
        heatmapData,
        insights,
        year: consolidated?.year || year,
        refetch: fetchData
    }
}
