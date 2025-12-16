import { useState, useEffect } from 'react'
import './AdminDashboard.css'

export default function AdminDashboard() {
    const [stats, setStats] = useState({
        totalUsers: 0,
        activeUsers: 0,
        monthlyRevenue: 0,
        totalSimulations: 0,
        usersByPlan: [],
        recentSimulations: []
    })
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchStats()
    }, [])

    const fetchStats = async () => {
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/admin/stats', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await res.json()
            setStats(data)
        } catch (error) {
            console.error('Erro ao carregar estatísticas:', error)
        } finally {
            setLoading(false)
        }
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
        <div className="admin-dashboard">
            <div className="page-header">
                <h1>Dashboard</h1>
                <p className="text-secondary">Visão geral do sistema</p>
            </div>

            {/* Stats Grid */}
            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-card-icon" style={{ background: 'rgba(59, 130, 246, 0.15)', color: 'var(--color-secondary)' }}>
                        👥
                    </div>
                    <div className="stat-card-value">{stats.totalUsers}</div>
                    <div className="stat-card-label">Total de Usuários</div>
                </div>

                <div className="stat-card">
                    <div className="stat-card-icon" style={{ background: 'rgba(16, 185, 129, 0.15)', color: 'var(--color-primary)' }}>
                        ✅
                    </div>
                    <div className="stat-card-value">{stats.activeUsers}</div>
                    <div className="stat-card-label">Usuários Ativos</div>
                </div>

                <div className="stat-card">
                    <div className="stat-card-icon" style={{ background: 'rgba(245, 158, 11, 0.15)', color: 'var(--color-warning)' }}>
                        💰
                    </div>
                    <div className="stat-card-value">{formatCurrency(stats.monthlyRevenue)}</div>
                    <div className="stat-card-label">Receita Mensal</div>
                </div>

                <div className="stat-card">
                    <div className="stat-card-icon" style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6' }}>
                        📊
                    </div>
                    <div className="stat-card-value">{stats.totalSimulations}</div>
                    <div className="stat-card-label">Simulações Realizadas</div>
                </div>
            </div>

            <div className="dashboard-grid">
                {/* Users by Plan */}
                <div className="dashboard-card">
                    <h2>Usuários por Plano</h2>
                    <div className="plan-bars">
                        {stats.usersByPlan.map((plan) => (
                            <div key={plan.name} className="plan-bar-item">
                                <div className="plan-bar-header">
                                    <span>{plan.name}</span>
                                    <span className="plan-count">{plan.count}</span>
                                </div>
                                <div className="progress-bar">
                                    <div
                                        className="progress-bar-fill success"
                                        style={{ width: `${(plan.count / stats.totalUsers) * 100}%` }}
                                    ></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Recent Activity */}
                <div className="dashboard-card">
                    <h2>Atividade Recente</h2>
                    <div className="activity-list">
                        {stats.recentSimulations.length === 0 ? (
                            <p className="text-muted text-center" style={{ padding: 'var(--spacing-4)' }}>
                                Nenhuma atividade recente
                            </p>
                        ) : (
                            stats.recentSimulations.map((sim, index) => (
                                <div key={index} className="activity-item">
                                    <div className="activity-icon">📊</div>
                                    <div className="activity-content">
                                        <span className="activity-text">
                                            {sim.userName || 'Visitante'} fez uma simulação
                                        </span>
                                        <span className="activity-time">
                                            {new Date(sim.createdAt).toLocaleString('pt-BR')}
                                        </span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
