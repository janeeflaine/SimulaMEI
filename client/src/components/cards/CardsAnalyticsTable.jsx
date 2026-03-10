import './CardsSummaryPanel.css'

function formatBRL(v) {
    return `R$ ${(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const MONTH_NAMES = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

export default function CardsAnalyticsTable({ cardBreakdown, monthlyTrend }) {
    if (!cardBreakdown || cardBreakdown.length === 0) return null

    // Find the most expensive month per card (simplified: show global)
    const mostExpensiveMonth = monthlyTrend
        ? [...monthlyTrend].sort((a, b) => b.total - a.total)[0]
        : null

    return (
        <div className="csp-analytics-section">
            <h3 className="csp-section-title">📋 Tabela Analítica por Cartão</h3>
            <div className="csp-table-wrapper">
                <table className="csp-analytics-table">
                    <thead>
                        <tr>
                            <th>Cartão</th>
                            <th>Total Gasto</th>
                            <th>% do Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {cardBreakdown.map((card, i) => (
                            <tr key={i}>
                                <td className="csp-table-card-name">
                                    <span className="csp-table-rank">#{i + 1}</span>
                                    {card.name}
                                </td>
                                <td className="csp-table-amount">{formatBRL(card.total)}</td>
                                <td>
                                    <div className="csp-table-percent-bar">
                                        <div className="csp-table-percent-fill" style={{ width: `${card.percent}%` }} />
                                        <span>{card.percent}%</span>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
