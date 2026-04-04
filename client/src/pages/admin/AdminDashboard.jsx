import { useState, useEffect } from 'react'
import './AdminDashboard.css'

export default function AdminDashboard() {
    const [stats, setStats] = useState({
        totalUsers: 0,
        activeUsers: 0,
        monthlyRevenue: 0,
        totalSimulations: 0,
        usersByPlan: [],
        recentActivity: [],
        suspiciousCount: 0,
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <h2 style={{ margin: 0 }}>Atividade Recente</h2>
                        {stats.suspiciousCount > 0 && (
                            <a href="/admin/logs" style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                                background: 'rgba(245,158,11,0.15)', color: '#fcd34d',
                                border: '1px solid rgba(245,158,11,0.3)', textDecoration: 'none',
                            }}>
                                ⚠️ {stats.suspiciousCount} suspeito(s)
                            </a>
                        )}
                    </div>
                    <div className="activity-list">
                        {(!stats.recentActivity || stats.recentActivity.length === 0) ? (
                            <p className="text-muted text-center" style={{ padding: 'var(--spacing-4)' }}>
                                Nenhuma atividade recente
                            </p>
                        ) : (
                            stats.recentActivity.map((evt) => {
                                const icons = {
                                    USER_LOGIN_SUCCESS: '🔑',
                                    USER_LOGIN_FAILED: '🚫',
                                    USER_REGISTER: '👤',
                                    CONCURRENT_LOGIN_PREVENTED: '⚠️',
                                    USER_BLOCKED: '🔒',
                                    PLAN_UPDATED: '💎',
                                    RULES_UPDATED: '🧮',
                                    LIMITS_UPDATED: '📏',
                                    SETTINGS_UPDATED: '⚙️',
                                    PASSWORD_RESET_REQUESTED: '🔐',
                                }
                                const labels = {
                                    USER_LOGIN_SUCCESS: 'fez login',
                                    USER_LOGIN_FAILED: 'falha no login',
                                    USER_REGISTER: 'novo cadastro',
                                    CONCURRENT_LOGIN_PREVENTED: 'sessão duplicada detectada',
                                    USER_BLOCKED: 'usuário bloqueado',
                                    PLAN_UPDATED: 'plano atualizado',
                                    RULES_UPDATED: 'regras de cálculo alteradas',
                                    LIMITS_UPDATED: 'limites MEI alterados',
                                    SETTINGS_UPDATED: 'configuração alterada',
                                    PASSWORD_RESET_REQUESTED: 'reset de senha solicitado',
                                }
                                const isSuspicious = ['WARN', 'ERROR', 'CRITICAL'].includes(evt.level)
                                return (
                                    <div key={evt.id} className="activity-item" style={isSuspicious ? { background: 'rgba(245,158,11,0.05)', borderRadius: 8 } : {}}>
                                        <div className="activity-icon" style={isSuspicious ? { background: 'rgba(245,158,11,0.12)' } : {}}>
                                            {icons[evt.event_type] || '📋'}
                                        </div>
                                        <div className="activity-content">
                                            <span className="activity-text">
                                                <strong style={{ color: '#e2e8f0' }}>{evt.user_name || 'Sistema'}</strong>
                                                {' — '}{labels[evt.event_type] || evt.event_type}
                                                {evt.ip_address && <span style={{ color: '#64748b', fontSize: 11 }}> ({evt.ip_address})</span>}
                                            </span>
                                            <span className="activity-time">
                                                {new Date(evt.timestamp).toLocaleString('pt-BR')}
                                            </span>
                                        </div>
                                    </div>
                                )
                            })
                        )}
                    </div>
                    <div style={{ marginTop: 12, textAlign: 'right' }}>
                        <a href="/admin/logs" style={{ color: '#3b82f6', fontSize: 13, textDecoration: 'none' }}>
                            Ver todos os logs →
                        </a>
                    </div>
                </div>
            </div>
        </div>
    )
}
