import { useState, useEffect } from 'react'
import './AdminPages.css'

export default function AdminReports() {
    const [stats, setStats] = useState({
        revenueByPeriod: [],
        usersByPlan: [],
        simulationsByMonth: []
    })
    const [loading, setLoading] = useState(true)
    const [period, setPeriod] = useState('month')

    useEffect(() => {
        fetchReports()
    }, [period])

    const fetchReports = async () => {
        try {
            const token = localStorage.getItem('token')
            const res = await fetch(`/api/admin/reports?period=${period}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await res.json()
            setStats(data)
        } catch (error) {
            console.error('Erro ao carregar relatórios:', error)
        } finally {
            setLoading(false)
        }
    }

    const exportCSV = (type) => {
        let data = []
        let filename = ''

        switch (type) {
            case 'users':
                data = stats.usersByPlan
                filename = 'usuarios_por_plano.csv'
                break
            case 'revenue':
                data = stats.revenueByPeriod
                filename = 'receita_por_periodo.csv'
                break
            default:
                return
        }

        if (data.length === 0) {
            alert('Sem dados para exportar')
            return
        }

        const headers = Object.keys(data[0]).join(',')
        const rows = data.map(row => Object.values(row).join(',')).join('\n')
        const csv = `${headers}\n${rows}`

        const blob = new Blob([csv], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
    }

    const formatCurrency = (value) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(value)
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center" style={{ minHeight: '50vh' }}>
                <div className="loader"></div>
            </div>
        )
    }

    return (
        <div className="admin-page">
            <div className="page-header">
                <div>
                    <h1>Relatórios</h1>
                    <p className="text-secondary">Visualize métricas e exporte dados</p>
                </div>
                <div className="flex gap-2">
                    <select
                        value={period}
                        onChange={(e) => setPeriod(e.target.value)}
                        className="form-select"
                    >
                        <option value="week">Última Semana</option>
                        <option value="month">Último Mês</option>
                        <option value="year">Último Ano</option>
                    </select>
                </div>
            </div>

            <div className="dashboard-grid">
                {/* Revenue Report */}
                <div className="admin-card">
                    <div className="flex justify-between items-center mb-4">
                        <h2 style={{ margin: 0 }}>Receita por Período</h2>
                        <button
                            className="btn btn-sm btn-secondary export-btn"
                            onClick={() => exportCSV('revenue')}
                        >
                            📥 Exportar CSV
                        </button>
                    </div>

                    {stats.revenueByPeriod.length === 0 ? (
                        <div className="chart-placeholder">
                            <span>📊</span>
                            <p>Sem dados de receita no período</p>
                        </div>
                    ) : (
                        <div className="table-container">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Período</th>
                                        <th>Receita</th>
                                        <th>Assinaturas</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {stats.revenueByPeriod.map((row, index) => (
                                        <tr key={index}>
                                            <td>{row.period}</td>
                                            <td>{formatCurrency(row.revenue)}</td>
                                            <td>{row.subscriptions}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Users by Plan */}
                <div className="admin-card">
                    <div className="flex justify-between items-center mb-4">
                        <h2 style={{ margin: 0 }}>Usuários por Plano</h2>
                        <button
                            className="btn btn-sm btn-secondary export-btn"
                            onClick={() => exportCSV('users')}
                        >
                            📥 Exportar CSV
                        </button>
                    </div>

                    {stats.usersByPlan.length === 0 ? (
                        <div className="chart-placeholder">
                            <span>👥</span>
                            <p>Sem dados de usuários</p>
                        </div>
                    ) : (
                        <div className="plan-bars">
                            {stats.usersByPlan.map((plan) => (
                                <div key={plan.name} className="plan-bar-item">
                                    <div className="plan-bar-header">
                                        <span>{plan.name}</span>
                                        <span className="plan-count">{plan.count} usuários</span>
                                    </div>
                                    <div className="progress-bar">
                                        <div
                                            className="progress-bar-fill success"
                                            style={{ width: `${(plan.count / Math.max(...stats.usersByPlan.map(p => p.count))) * 100}%` }}
                                        ></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Summary Stats */}
            <div className="admin-card" style={{ marginTop: 'var(--spacing-6)' }}>
                <h2>Resumo do Período</h2>
                <div className="stats-grid">
                    <div className="stat-card">
                        <div className="stat-card-value">{formatCurrency(stats.totalRevenue || 0)}</div>
                        <div className="stat-card-label">Receita Total</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-card-value">{stats.newUsers || 0}</div>
                        <div className="stat-card-label">Novos Usuários</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-card-value">{stats.totalSimulations || 0}</div>
                        <div className="stat-card-label">Simulações</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-card-value">{((stats.conversionRate || 0) * 100).toFixed(1)}%</div>
                        <div className="stat-card-label">Taxa de Conversão</div>
                    </div>
                </div>
            </div>
        </div>
    )
}
