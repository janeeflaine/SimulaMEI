import './CardsSummaryPanel.css'

export default function EmptyDashboardState() {
    return (
        <div className="csp-empty-state">
            <span className="csp-empty-icon">📊</span>
            <h3>Sem dados para o dashboard</h3>
            <p>Cadastre cartões e envie faturas para visualizar o painel consolidado de gastos.</p>
        </div>
    )
}
