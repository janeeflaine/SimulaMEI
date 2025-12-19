import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import FeatureLock from '../components/FeatureLock'
import './Dashboard.css'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export default function Dashboard() {

    const { user } = useAuth()
    const [simulations, setSimulations] = useState([])
    const [loading, setLoading] = useState(true)
    const [stats, setStats] = useState({ totalSimulations: 0, avgRevenue: 0, limitStatus: 'success' })
    const [userPlan, setUserPlan] = useState(null)
    const [activeAlerts, setActiveAlerts] = useState([])

    // Fetch stats and plan on component mount
    useEffect(() => {
        const init = async () => {
            await fetchUserPlan()
            await fetchStats()
            await fetchActiveAlerts()
        }
        init()
    }, [])

    // Fetch simulations only if user has historico feature
    useEffect(() => {
        if (userPlan?.features?.historico) {
            fetchSimulations()
        } else if (userPlan !== null) {
            setLoading(false)
        }
    }, [userPlan])

    const fetchUserPlan = async () => {
        try {
            const res = await fetch('/api/plans')
            const plans = await res.json()
            const currentPlan = plans.find(p => Number(p.id) === Number(user?.planId))
                || plans.find(p => p.name === user?.plan)
                || plans.find(p => Number(p.price) === 0)
            setUserPlan(currentPlan)
        } catch (error) {
            console.error('Erro ao carregar plano:', error)
            setUserPlan({ features: {} })
        }
    }

    // Fetch stats for ALL users - independent of plan
    const fetchStats = async () => {
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/simulations/stats', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (res.ok) {
                const data = await res.json()
                setStats(data)
            } else {
                console.error('Stats API error:', res.status)
            }
        } catch (error) {
            console.error('Erro ao carregar estatísticas:', error)
        }
    }

    // Fetch full simulations list (only for users with historico feature)
    const fetchSimulations = async () => {
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/simulations', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await res.json()
            setSimulations(data.simulations || [])
        } catch (error) {
            console.error('Erro ao carregar simulações:', error)
        } finally {
            setLoading(false)
        }
    }

    const fetchActiveAlerts = async () => {
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/alerts/check', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (res.ok) {
                const data = await res.json()
                setActiveAlerts(data)
            }
        } catch (error) {
            console.error('Erro ao buscar alertas ativos:', error)
        }
    }

    const formatCurrency = (value) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(value)
    }

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        })
    }

    // Check if feature is available
    const hasFeature = (featureKey) => {
        return userPlan?.features?.[featureKey] || false
    }

    const generatePDF = () => {
        try {
            const doc = new jsPDF()

            // Header
            doc.setFontSize(22)
            doc.setTextColor(16, 185, 129) // Primary green
            doc.text('Relatório SimulaMEI', 14, 20)

            // Info
            doc.setFontSize(10)
            doc.setTextColor(100)
            doc.text(`Gerado em: ${new Date().toLocaleDateString()} às ${new Date().toLocaleTimeString()}`, 14, 30)
            doc.text(`Usuário: ${user?.name || 'MEI'}`, 14, 36)
            doc.text(`Plano: ${userPlan?.name || 'Gratuito'}`, 14, 42)

            // Stats Summary
            doc.setFillColor(245, 245, 245)
            doc.rect(14, 50, 182, 30, 'F')

            doc.setFontSize(14)
            doc.setTextColor(0)
            doc.text('Resumo Geral', 20, 60)

            doc.setFontSize(11)
            doc.text(`Simulações: ${stats.totalSimulations}`, 20, 70)
            doc.text(`Receita Média: R$ ${stats.avgRevenue?.toFixed(2) || '0.00'}`, 100, 70)

            // Simulations Table
            if (simulations.length > 0) {
                autoTable(doc, {
                    startY: 90,
                    head: [['Data', 'Atividade', 'Faturamento (R$)', 'Imposto Mensal (R$)', 'Anual (R$)']],
                    body: simulations.map(s => [
                        new Date(s.createdAt).toLocaleDateString(),
                        s.activityType.toUpperCase(),
                        s.revenue.toFixed(2),
                        s.dasMonthly.toFixed(2),
                        s.dasAnnual.toFixed(2)
                    ]),
                    styles: { fontSize: 9 },
                    headStyles: { fillColor: [16, 185, 129] }, // Green header
                })
            } else {
                doc.text('Nenhuma simulação registrada neste período.', 14, 90)
            }

            doc.save('relatorio-simulamei.pdf')
        } catch (error) {
            console.error('Erro ao gerar PDF:', error)
            alert('Não foi possível gerar o PDF. Verifique o console para mais detalhes.')
        }
    }

    return (
        <div className="dashboard-page">
            <div className="container">
                <div className="dashboard-header">
                    <div>
                        <h1>Olá, {user?.name?.split(' ')[0]} 👋</h1>
                        <p className="text-secondary">
                            Plano atual: <span className="plan-badge">{userPlan?.name || 'Gratuito'}</span>
                        </p>
                    </div>
                    <Link to="/simular" className="btn btn-primary">
                        ➕ Nova Simulação
                    </Link>
                </div>

                {/* Active Alerts - Only for Ouro users */}
                {activeAlerts.length > 0 && (
                    <div className="active-alerts-section" style={{ marginBottom: '25px' }}>
                        {activeAlerts.map(alert => (
                            <div key={alert.id} className={`alert-banner alert-${alert.severity || 'warning'}`} style={{
                                backgroundColor: alert.severity === 'danger' ? '#fff5f5' : '#fffaf0',
                                border: `1px solid ${alert.severity === 'danger' ? '#feb2b2' : '#fbd38d'}`,
                                color: alert.severity === 'danger' ? '#c53030' : '#9c4221',
                                padding: '15px 20px',
                                borderRadius: '12px',
                                marginBottom: '10px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '15px',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                            }}>
                                <span style={{ fontSize: '24px' }}>
                                    {alert.severity === 'danger' ? '🚨' : '⚠️'}
                                </span>
                                <div style={{ flex: 1 }}>
                                    <strong style={{ display: 'block' }}>{alert.type === 'REVENUE_LIMIT' ? 'Alerta de Faturamento' : 'Lembrete Fiscal'}</strong>
                                    <span>{alert.message}</span>
                                </div>
                                {alert.type === 'REVENUE_LIMIT' && (
                                    <Link to="/alertas" className="btn btn-sm" style={{
                                        backgroundColor: 'white',
                                        border: '1px solid currentColor',
                                        color: 'inherit'
                                    }}>
                                        Configurar
                                    </Link>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Stats Cards - Always visible */}
                <div className="stats-grid">
                    <div className="stat-card">
                        <div className="stat-card-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--color-primary)' }}>
                            📊
                        </div>
                        <div className="stat-card-value">{stats.totalSimulations}</div>
                        <div className="stat-card-label">Simulações realizadas</div>
                    </div>

                    <div className="stat-card">
                        <div className="stat-card-icon" style={{ background: 'rgba(59, 130, 246, 0.1)', color: 'var(--color-secondary)' }}>
                            💰
                        </div>
                        <div className="stat-card-value">{formatCurrency(stats.avgRevenue)}</div>
                        <div className="stat-card-label">Faturamento médio</div>
                    </div>

                    {/* Alerts - Feature gated */}
                    {hasFeature('alertas') ? (
                        <div className="stat-card">
                            <div className="stat-card-icon" style={{ background: 'rgba(245, 158, 11, 0.1)', color: 'var(--color-warning)' }}>
                                📈
                            </div>
                            <div className="stat-card-value">
                                <span className={`badge badge-${stats.limitStatus}`}>
                                    {stats.limitStatus === 'success' ? 'Normal' : stats.limitStatus === 'warning' ? 'Atenção' : 'Risco'}
                                </span>
                            </div>
                            <div className="stat-card-label">Status do limite</div>
                        </div>
                    ) : (
                        <div className="stat-card stat-card-locked">
                            <div className="stat-card-icon" style={{ background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6' }}>
                                🔔
                            </div>
                            <div className="stat-card-value">
                                <span className="badge badge-info">🔒 Bloqueado</span>
                            </div>
                            <div className="stat-card-label">Alertas de Limite</div>
                            <Link to="/planos" className="stat-upgrade-link">Plano Ouro →</Link>
                        </div>
                    )}
                </div>

                {/* Feature Cards Grid */}
                <div className="features-section">
                    <h2>Funcionalidades</h2>
                    <div className="features-grid">
                        {/* Simular - Always available */}
                        <div className="feature-card available">
                            <div className="feature-card-icon">📊</div>
                            <h3>Simulador</h3>
                            <p>Calcule seus impostos MEI</p>
                            <Link to="/simular" className="btn btn-primary btn-sm">Simular</Link>
                        </div>

                        {/* Histórico */}
                        {hasFeature('historico') ? (
                            <div className="feature-card available">
                                <div className="feature-card-icon">📋</div>
                                <h3>Histórico</h3>
                                <p>Veja suas simulações anteriores</p>
                                <span className="feature-available">✅ Disponível</span>
                            </div>
                        ) : (
                            <div className="feature-card locked">
                                <div className="feature-card-icon">📋</div>
                                <h3>Histórico de Simulações</h3>
                                <p>Salve e acompanhe suas simulações</p>
                                <div className="feature-plan-badge">💎 Plano Prata</div>
                                <Link to="/planos" className="btn btn-secondary btn-sm">Ver Planos</Link>
                            </div>
                        )}

                        {/* PDF Export */}
                        {hasFeature('pdf') ? (
                            <div className="feature-card available">
                                <div className="feature-card-icon">📄</div>
                                <h3>Exportar PDF</h3>
                                <p>Baixe relatórios profissionais</p>
                                <button
                                    onClick={generatePDF}
                                    className="btn btn-primary btn-sm"
                                    style={{ width: '100%', marginTop: 'auto' }}
                                >
                                    Baixar Relatório ⬇️
                                </button>
                            </div>
                        ) : (
                            <div className="feature-card locked">
                                <div className="feature-card-icon">📄</div>
                                <h3>Exportar PDF</h3>
                                <p>Relatórios para seu contador</p>
                                <div className="feature-plan-badge">💎 Plano Prata</div>
                                <Link to="/planos" className="btn btn-secondary btn-sm">Ver Planos</Link>
                            </div>
                        )}

                        {/* Comparativo */}
                        {hasFeature('comparativo') ? (
                            <div className="feature-card available">
                                <div className="feature-card-icon">⚖️</div>
                                <h3>Comparativo MEI x ME</h3>
                                <p>Compare custos e benefícios</p>
                                <Link to="/comparativo" className="btn btn-primary btn-sm">Ver Comparativo</Link>
                            </div>
                        ) : (
                            <div className="feature-card locked">
                                <div className="feature-card-icon">⚖️</div>
                                <h3>Comparativo MEI x ME</h3>
                                <p>Descubra quando migrar</p>
                                <div className="feature-plan-badge">💎 Plano Ouro</div>
                                <Link to="/planos" className="btn btn-secondary btn-sm">Ver Planos</Link>
                            </div>
                        )}

                        {/* Alertas */}
                        {hasFeature('alertas') ? (
                            <div className="feature-card available">
                                <div className="feature-card-icon">🔔</div>
                                <h3>Alertas Personalizados</h3>
                                <p>Notificações de limite</p>
                                <Link to="/alertas" className="btn btn-primary btn-sm">Abrir Alertas</Link>
                            </div>
                        ) : (
                            <div className="feature-card locked">
                                <div className="feature-card-icon">🔔</div>
                                <h3>Alertas Personalizados</h3>
                                <p>Evite ultrapassar o limite</p>
                                <div className="feature-plan-badge">💎 Plano Ouro</div>
                                <Link to="/planos" className="btn btn-secondary btn-sm">Ver Planos</Link>
                            </div>
                        )}
                    </div>
                </div>

                {/* Simulations History - Feature gated */}
                <div className="section">
                    <h2 className="section-title">Histórico de Simulações</h2>

                    {!hasFeature('historico') ? (
                        <FeatureLock
                            featureName="Histórico de Simulações"
                            requiredPlan="Prata"
                            description="Salve todas as suas simulações e acompanhe a evolução do seu negócio ao longo do tempo."
                            icon="📋"
                        />
                    ) : loading ? (
                        <div className="flex items-center justify-center" style={{ padding: 'var(--spacing-8)' }}>
                            <div className="loader"></div>
                        </div>
                    ) : simulations.length === 0 ? (
                        <div className="empty-state">
                            <span className="empty-icon">📋</span>
                            <h3>Nenhuma simulação ainda</h3>
                            <p>Faça sua primeira simulação para começar a acompanhar seus impostos.</p>
                            <Link to="/simular" className="btn btn-primary">
                                Simular Agora
                            </Link>
                        </div>
                    ) : (
                        <div className="table-container">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Data</th>
                                        <th>Atividade</th>
                                        <th>Faturamento</th>
                                        <th>DAS Mensal</th>
                                        <th>% Limite</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {simulations.map((sim) => (
                                        <tr key={sim.id}>
                                            <td>{formatDate(sim.createdAt)}</td>
                                            <td className="text-capitalize">{sim.activityType}</td>
                                            <td>{formatCurrency(sim.revenue)}</td>
                                            <td>{formatCurrency(sim.dasMonthly)}</td>
                                            <td>
                                                <span className={`badge badge-${sim.limitPercentage < 70 ? 'success' :
                                                    sim.limitPercentage < 90 ? 'warning' : 'danger'
                                                    }`}>
                                                    {sim.limitPercentage.toFixed(1)}%
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Upgrade Banner */}
                {userPlan?.price === 0 && (
                    <div className="upgrade-banner">
                        <div className="upgrade-content">
                            <h3>🚀 Desbloqueie todos os recursos</h3>
                            <p>Histórico, PDFs, comparativos e alertas personalizados.</p>
                        </div>
                        <Link to="/planos" className="btn btn-primary">
                            Ver Planos
                        </Link>
                    </div>
                )}
            </div>
        </div>
    )
}
