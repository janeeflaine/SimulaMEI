import { useState } from 'react'
import { useCardsDashboardSummary } from '../../hooks/useCardsDashboardSummary'
import DashboardSkeleton from './DashboardSkeleton'
import EmptyDashboardState from './EmptyDashboardState'
import SummaryKPIs from './SummaryKPIs'
import CardsInsightsPanel from './CardsInsightsPanel'
import CardsAnalyticsTable from './CardsAnalyticsTable'
import MonthlyTrendChart from './charts/MonthlyTrendChart'
import SpendingByCardChart from './charts/SpendingByCardChart'
import SpendingByCategoryChart from './charts/SpendingByCategoryChart'
import './CardsSummaryPanel.css'

/**
 * CardsSummaryPanel — Orchestrator for the consolidated dashboard.
 * Consumes useCardsDashboardSummary hook and composes all sub-components.
 * CreditCards.jsx only needs: <CardsSummaryPanel />
 */
export default function CardsSummaryPanel() {
    const [year, setYear] = useState(new Date().getFullYear())

    const {
        loading, error, cards, kpis,
        cardBreakdown, categoryBreakdown,
        monthlyTrend, insights, refetch
    } = useCardsDashboardSummary(year)

    if (loading) return <DashboardSkeleton />

    if (error) {
        return (
            <div className="csp-error">
                <p>⚠️ {error}</p>
                <button onClick={refetch}>Tentar novamente</button>
            </div>
        )
    }

    if (!cards || cards.length === 0) return <EmptyDashboardState />

    const hasData = kpis.totalSpent > 0

    return (
        <div className="csp-panel">
            <div className="csp-panel-header">
                <h2>📊 Dashboard Consolidado</h2>
                <div className="csp-year-selector">
                    <button className="csp-year-btn" onClick={() => setYear(y => y - 1)}>◀</button>
                    <span className="csp-year-label">{year}</span>
                    <button className="csp-year-btn" onClick={() => setYear(y => y + 1)}>▶</button>
                </div>
            </div>

            <SummaryKPIs kpis={kpis} />

            {hasData && (
                <>
                    <CardsInsightsPanel insights={insights} />

                    <div className="csp-charts-grid">
                        <div className="csp-chart-full">
                            <MonthlyTrendChart data={monthlyTrend} />
                        </div>
                        <SpendingByCardChart data={cardBreakdown} />
                        <SpendingByCategoryChart data={categoryBreakdown} />
                    </div>

                    <CardsAnalyticsTable cardBreakdown={cardBreakdown} monthlyTrend={monthlyTrend} />
                </>
            )}

            {!hasData && (
                <div className="csp-empty-state">
                    <span className="csp-empty-icon">📄</span>
                    <h3>Sem faturas em {year}</h3>
                    <p>Envie faturas dos seus cartões para visualizar o dashboard consolidado.</p>
                </div>
            )}
        </div>
    )
}
