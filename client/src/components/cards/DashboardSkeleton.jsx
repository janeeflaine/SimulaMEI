import './CardsSummaryPanel.css'

export default function DashboardSkeleton() {
    return (
        <div className="csp-skeleton">
            <div className="csp-skeleton-header">
                <div className="csp-skeleton-bar csp-sk-wide" />
                <div className="csp-skeleton-bar csp-sk-medium" />
            </div>
            <div className="csp-skeleton-kpis">
                {Array.from({ length: 8 }, (_, i) => (
                    <div key={i} className="csp-skeleton-kpi">
                        <div className="csp-skeleton-bar csp-sk-short" />
                        <div className="csp-skeleton-bar csp-sk-wide" />
                    </div>
                ))}
            </div>
            <div className="csp-skeleton-charts">
                <div className="csp-skeleton-chart" />
                <div className="csp-skeleton-chart" />
            </div>
        </div>
    )
}
