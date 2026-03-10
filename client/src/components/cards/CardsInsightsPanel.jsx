import './CardsSummaryPanel.css'

export default function CardsInsightsPanel({ insights }) {
    if (!insights || insights.length === 0) return null

    return (
        <div className="csp-insights-panel">
            <h3 className="csp-section-title">💡 Insights Automáticos</h3>
            <div className="csp-insights-list">
                {insights.map((insight, i) => (
                    <div key={i} className="csp-insight-item">
                        <span className="csp-insight-bullet">•</span>
                        <span>{insight}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}
