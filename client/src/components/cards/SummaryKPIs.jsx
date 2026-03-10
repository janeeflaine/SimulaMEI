import './CardsSummaryPanel.css'

function formatBRL(v) {
    return `R$ ${(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const MONTH_NAMES = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

export default function SummaryKPIs({ kpis }) {
    if (!kpis) return null

    const items = [
        { label: 'Total Gasto', value: formatBRL(kpis.totalSpent), icon: '💰', highlight: true },
        { label: 'Média Mensal', value: formatBRL(kpis.monthlyAverage), icon: '📊' },
        { label: 'Cartão Líder', value: kpis.topCard?.name || '—', icon: '💳', sub: kpis.topCardPercent > 0 ? `${kpis.topCardPercent}% do total` : null },
        { label: 'Categoria Líder', value: kpis.topCategory?.category || '—', icon: '🏷️' },
        { label: 'Mês Mais Caro', value: kpis.mostExpensiveMonth ? MONTH_NAMES[kpis.mostExpensiveMonth.month] || '—' : '—', icon: '📅', sub: kpis.mostExpensiveMonth ? formatBRL(kpis.mostExpensiveMonth.total) : null },
        { label: 'Cartões Ativos', value: kpis.activeCards, icon: '💳' },
        { label: 'Transações', value: kpis.totalTransactions, icon: '🔢' },
        { label: 'Concentração', value: `${kpis.topCardPercent}%`, icon: '🎯', sub: kpis.topCard?.name || null }
    ]

    return (
        <div className="csp-kpis-grid">
            {items.map((item, i) => (
                <div key={i} className={`csp-kpi-card${item.highlight ? ' csp-kpi-highlight' : ''}`}>
                    <span className="csp-kpi-icon">{item.icon}</span>
                    <div className="csp-kpi-content">
                        <span className="csp-kpi-label">{item.label}</span>
                        <span className="csp-kpi-value">{item.value}</span>
                        {item.sub && <span className="csp-kpi-sub">{item.sub}</span>}
                    </div>
                </div>
            ))}
        </div>
    )
}
