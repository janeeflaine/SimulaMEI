import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import FeatureLock from '../components/FeatureLock'
import FinanceQuickActionModal from '../components/FinanceQuickActionModal'
import './Dashboard.css'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export default function Dashboard() {

    const { user } = useAuth()
    const [simulations, setSimulations] = useState([])
    const [transactions, setTransactions] = useState([])
    const [loading, setLoading] = useState(true)
    const [stats, setStats] = useState({ totalSimulations: 0, avgRevenue: 0, limitStatus: 'success' })
    const [userPlan, setUserPlan] = useState(null)
    const [activeAlerts, setActiveAlerts] = useState([])
    const [isFinanceModalOpen, setIsFinanceModalOpen] = useState(false)

    // Pagination
    const [simPage, setSimPage] = useState(1)
    const [transPage, setTransPage] = useState(1)
    const rowsPerPage = 12

    // Fetch stats and plan on component mount
    useEffect(() => {
        const init = async () => {
            await fetchUserPlan()
            await fetchStats()
            await fetchActiveAlerts()
        }
        init()
    }, [])

    // Fetch simulations/transactions based on plan
    useEffect(() => {
        if (userPlan) {
            if (userPlan.features?.historico) fetchSimulations()
            if (userPlan.name === 'Ouro' || Number(userPlan.id) === 3) fetchTransactions()
            if (!userPlan.features?.historico) setLoading(false)
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
            setUserPlan({ name: 'Gratuito', features: {} })
        }
    }

    const fetchStats = async () => {
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/simulations/stats', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (res.ok) {
                const data = await res.json()
                setStats(data)
            }
        } catch (error) {
            console.error('Erro ao carregar estatísticas:', error)
        }
    }

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

    const fetchTransactions = async () => {
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/finance/transactions', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (res.ok) {
                const data = await res.json()
                setTransactions(data)
            }
        } catch (error) {
            console.error('Erro ao buscar transações:', error)
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

    const hasFeature = (featureKey) => {
        return userPlan?.features?.[featureKey] || false
    }

    // Pagination Helpers
    const paginate = (items, page) => {
        const start = (page - 1) * rowsPerPage
        return items.slice(start, start + rowsPerPage)
    }

    const PaginationControls = ({ current, total, onPageChange }) => {
        const totalPages = Math.ceil(total / rowsPerPage)
        if (totalPages <= 1) return null

        return (
            <div className="pagination-controls" style={{ display: 'flex', gap: '10px', marginTop: '15px', justifyContent: 'center', alignItems: 'center' }}>
                <button
                    className="btn btn-sm btn-outline"
                    disabled={current === 1}
                    onClick={() => onPageChange(current - 1)}
                >
                    ◀️ Anterior
                </button>
                <span className="text-secondary" style={{ fontSize: '14px' }}>
                    Página <strong>{current}</strong> de {totalPages}
                </span>
                <button
                    className="btn btn-sm btn-outline"
                    disabled={current === totalPages}
                    onClick={() => onPageChange(current + 1)}
                >
                    Próxima ▶️
                </button>
            </div>
        )
    }

    const generatePDF = () => {
        try {
            const doc = new jsPDF()
            doc.setFontSize(22)
            doc.setTextColor(16, 185, 129)
            doc.text('Relatório SimulaMEI', 14, 20)
            doc.setFontSize(10)
            doc.setTextColor(100)
            doc.text(`Gerado em: ${new Date().toLocaleDateString()} às ${new Date().toLocaleTimeString()}`, 14, 30)
            doc.text(`Usuário: ${user?.name || 'MEI'}`, 14, 36)
            doc.text(`Plano: ${userPlan?.name || 'Gratuito'}`, 14, 42)
            doc.setFillColor(245, 245, 245)
            doc.rect(14, 50, 182, 30, 'F')
            doc.setFontSize(14)
            doc.setTextColor(0)
            doc.text('Resumo Geral', 20, 60)
            doc.setFontSize(11)
            doc.text(`Simulações: ${stats.totalSimulations}`, 20, 70)
            doc.text(`Receita Média: R$ ${stats.avgRevenue?.toFixed(2) || '0.00'}`, 100, 70)

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
                    headStyles: { fillColor: [16, 185, 129] },
                })
            }
            doc.save('relatorio-simulamei.pdf')
        } catch (error) {
            console.error('Erro ao gerar PDF:', error)
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

                {/* Active Alerts */}
                {activeAlerts.length > 0 && (
                    <div className="active-alerts-section" style={{ marginBottom: '25px' }}>
                        {activeAlerts.map(alert => (
                            <div key={alert.id} className={`alert-banner alert-${alert.severity || 'warning'}`} style={{
                                backgroundColor: alert.severity === 'danger' ? '#fff5f5' : '#fffaf0',
                                border: `1px solid ${alert.severity === 'danger' ? '#feb2b2' : '#fbd38d'}`,
                                color: alert.severity === 'danger' ? '#c53030' : '#9c4221',
                                padding: '15px 20px', borderRadius: '12px', marginBottom: '10px',
                                display: 'flex', alignItems: 'center', gap: '15px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                            }}>
                                <span style={{ fontSize: '24px' }}>{alert.severity === 'danger' ? '🚨' : '⚠️'}</span>
                                <div style={{ flex: 1 }}>
                                    <strong style={{ display: 'block' }}>{alert.type === 'REVENUE_LIMIT' ? 'Alerta de Faturamento' : 'Lembrete Fiscal'}</strong>
                                    <span>{alert.message}</span>
                                </div>
                                {alert.type === 'REVENUE_LIMIT' && (
                                    <Link to="/alertas" className="btn btn-sm" style={{ backgroundColor: 'white', border: '1px solid currentColor', color: 'inherit' }}>
                                        Configurar
                                    </Link>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Stats Cards */}
                <div className="stats-grid">
                    <div className="stat-card">
                        <div className="stat-card-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--color-primary)' }}>📊</div>
                        <div className="stat-card-value">{stats.totalSimulations}</div>
                        <div className="stat-card-label">Simulações realizadas</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-card-icon" style={{ background: 'rgba(59, 130, 246, 0.1)', color: 'var(--color-secondary)' }}>💰</div>
                        <div className="stat-card-value">{formatCurrency(stats.avgRevenue)}</div>
                        <div className="stat-card-label">Faturamento médio</div>
                    </div>
                    {hasFeature('alertas') ? (
                        <div className="stat-card">
                            <div className="stat-card-icon" style={{ background: 'rgba(245, 158, 11, 0.1)', color: 'var(--color-warning)' }}>📈</div>
                            <div className="stat-card-value">
                                <span className={`badge badge-${stats.limitStatus}`}>
                                    {stats.limitStatus === 'success' ? 'Normal' : stats.limitStatus === 'warning' ? 'Atenção' : 'Risco'}
                                </span>
                            </div>
                            <div className="stat-card-label">Status do limite</div>
                        </div>
                    ) : (
                        <div className="stat-card stat-card-locked">
                            <div className="stat-card-icon" style={{ background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6' }}>🔔</div>
                            <div className="stat-card-value"><span className="badge badge-info">🔒 Bloqueado</span></div>
                            <div className="stat-card-label">Alertas de Limite</div>
                            <Link to="/planos" className="stat-upgrade-link">Plano Ouro →</Link>
                        </div>
                    )}
                </div>

                {/* Features Section */}
                <div className="features-section">
                    <h2>Funcionalidades</h2>
                    <div className="features-grid">
                        <div className="feature-card available">
                            <div className="feature-card-icon">📊</div>
                            <h3>Simulador</h3><p>Calcule seus impostos MEI</p>
                            <Link to="/simular" className="btn btn-primary btn-sm">Simular</Link>
                        </div>
                        {hasFeature('historico') ? (
                            <div className="feature-card available">
                                <div className="feature-card-icon">📋</div>
                                <h3>Histórico</h3><p>Veja suas simulações anteriores</p>
                                <span className="feature-available">✅ Disponível</span>
                            </div>
                        ) : (
                            <div className="feature-card locked">
                                <div className="feature-card-icon">📋</div>
                                <h3>Histórico de Simulações</h3><p>Salve e acompanhe suas simulações</p>
                                <div className="feature-plan-badge">💎 Plano Prata</div>
                                <Link to="/planos" className="btn btn-secondary btn-sm">Ver Planos</Link>
                            </div>
                        )}
                        {hasFeature('pdf') ? (
                            <div className="feature-card available">
                                <div className="feature-card-icon">📄</div>
                                <h3>Exportar PDF</h3><p>Baixe relatórios profissionais</p>
                                <button onClick={generatePDF} className="btn btn-primary btn-sm" style={{ width: '100%', marginTop: 'auto' }}>Baixar Relatório ⬇️</button>
                            </div>
                        ) : (
                            <div className="feature-card locked">
                                <div className="feature-card-icon">📄</div>
                                <h3>Exportar PDF</h3><p>Relatórios para seu contador</p>
                                <div className="feature-plan-badge">💎 Plano Prata</div>
                                <Link to="/planos" className="btn btn-secondary btn-sm">Ver Planos</Link>
                            </div>
                        )}
                        {hasFeature('comparativo') ? (
                            <div className="feature-card available">
                                <div className="feature-card-icon">⚖️</div>
                                <h3>Comparativo MEI x ME</h3><p>Compare custos e benefícios</p>
                                <Link to="/comparativo" className="btn btn-primary btn-sm">Ver Comparativo</Link>
                            </div>
                        ) : (
                            <div className="feature-card locked">
                                <div className="feature-card-icon">⚖️</div>
                                <h3>Comparativo MEI x ME</h3><p>Descubra quando migrar</p>
                                <div className="feature-plan-badge">💎 Plano Ouro</div>
                                <Link to="/planos" className="btn btn-secondary btn-sm">Ver Planos</Link>
                            </div>
                        )}
                        {hasFeature('alertas') ? (
                            <div className="feature-card available">
                                <div className="feature-card-icon">🔔</div>
                                <h3>Alertas Personalizados</h3><p>Notificações de limite</p>
                                <Link to="/alertas" className="btn btn-primary btn-sm">Abrir Alertas</Link>
                            </div>
                        ) : (
                            <div className="feature-card locked">
                                <div className="feature-card-icon">🔔</div>
                                <h3>Alertas Personalizados</h3><p>Evite ultrapassar o limite</p>
                                <div className="feature-plan-badge">💎 Plano Ouro</div>
                                <Link to="/planos" className="btn btn-secondary btn-sm">Ver Planos</Link>
                            </div>
                        )}
                        {hasFeature('alertas') ? (
                            <div className="feature-card available" style={{ border: '1px solid #10b981', background: 'rgba(16, 185, 129, 0.02)' }}>
                                <div className="feature-card-icon">💰</div>
                                <h3>Gestão Financeira</h3><p>Lançamento rápido de PF/PJ</p>
                                <button className="btn btn-primary btn-sm" onClick={() => setIsFinanceModalOpen(true)}>Abrir Finanças</button>
                            </div>
                        ) : (
                            <div className="feature-card locked">
                                <div className="feature-card-icon">💰</div>
                                <h3>Gestão Financeira</h3><p>Controle completo de caixa</p>
                                <div className="feature-plan-badge">💎 Plano Ouro</div>
                                <Link to="/planos" className="btn btn-secondary btn-sm">Ver Planos</Link>
                            </div>
                        )}
                    </div>
                </div>

                {/* Simulations History Section */}
                <div className="section">
                    <h2 className="section-title">Histórico de Simulações</h2>
                    {!hasFeature('historico') ? (
                        <FeatureLock featureName="Histórico de Simulações" requiredPlan="Prata" description="Salve todas as suas simulações e acompanhe a evolução do seu negócio ao longo do tempo." icon="📋" />
                    ) : loading ? (
                        <div className="flex items-center justify-center" style={{ padding: 'var(--spacing-8)' }}><div className="loader"></div></div>
                    ) : simulations.length === 0 ? (
                        <div className="empty-state">
                            <span className="empty-icon">📋</span><h3>Nenhuma simulação ainda</h3>
                            <p>Faça sua primeira simulação para começar a acompanhar seus impostos.</p>
                            <Link to="/simular" className="btn btn-primary">Simular Agora</Link>
                        </div>
                    ) : (
                        <>
                            <div className="table-container">
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Data</th><th>Atividade</th><th>Faturamento</th><th>DAS Mensal</th><th>% Limite</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginate(simulations, simPage).map((sim) => (
                                            <tr key={sim.id}>
                                                <td>{formatDate(sim.createdAt)}</td>
                                                <td className="text-capitalize">{sim.activityType}</td>
                                                <td>{formatCurrency(sim.revenue)}</td>
                                                <td>{formatCurrency(sim.dasMonthly)}</td>
                                                <td>
                                                    <span className={`badge badge-${sim.limitPercentage < 70 ? 'success' : sim.limitPercentage < 90 ? 'warning' : 'danger'}`}>
                                                        {sim.limitPercentage.toFixed(1)}%
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <PaginationControls current={simPage} total={simulations.length} onPageChange={setSimPage} />
                        </>
                    )}
                </div>

                {/* Transaction History Section - Only for Ouro users */}
                {(userPlan?.name === 'Ouro' || Number(userPlan?.id) === 3) && (
                    <div className="section" style={{ marginTop: '40px' }}>
                        <h2 className="section-title">Histórico de Transações</h2>
                        {transactions.length === 0 ? (
                            <div className="empty-state">
                                <span className="empty-icon">💰</span><h3>Nenhuma transação ainda</h3>
                                <p>Use o botão "Abrir Finanças" para registrar sua primeira movimentação.</p>
                            </div>
                        ) : (
                            <>
                                <div className="table-container">
                                    <table className="table">
                                        <thead>
                                            <tr>
                                                <th>Data</th><th>Tipo</th><th>Categoria</th><th>Valor</th><th>Destino</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {paginate(transactions, transPage).map((t) => (
                                                <tr key={t.id}>
                                                    <td>{formatDate(t.date)}</td>
                                                    <td>
                                                        <span className={`badge badge-${t.type === 'RECEITA' ? 'success' : 'danger'}`}>
                                                            {t.type === 'RECEITA' ? '⬇️ Receita' : '⬆️ Despesa'}
                                                        </span>
                                                    </td>
                                                    <td>{t.categoryName || 'Sem categoria'}</td>
                                                    <td style={{ fontWeight: 'bold', color: t.type === 'RECEITA' ? '#10b981' : '#ef4444' }}>
                                                        {t.type === 'RECEITA' ? '+' : '-'} {formatCurrency(t.amount)}
                                                    </td>
                                                    <td>
                                                        <span className="badge badge-info" style={{ backgroundColor: '#f1f5f9', color: '#475569' }}>
                                                            {t.target === 'BUSINESS' ? '🏢 PJ' : '👤 PF'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <PaginationControls current={transPage} total={transactions.length} onPageChange={setTransPage} />
                            </>
                        )}
                    </div>
                )}

                {/* Upgrade Banner */}
                {userPlan?.price === 0 && (
                    <div className="upgrade-banner">
                        <div className="upgrade-content">
                            <h3>🚀 Desbloqueie todos os recursos</h3>
                            <p>Histórico, PDFs, comparativos e alertas personalizados.</p>
                        </div>
                        <Link to="/planos" className="btn btn-primary">Ver Planos</Link>
                    </div>
                )}
            </div>

            {isFinanceModalOpen && (
                <FinanceQuickActionModal
                    onClose={() => setIsFinanceModalOpen(false)}
                    onSuccess={() => {
                        setIsFinanceModalOpen(false)
                        fetchTransactions() // Refresh data
                        fetchStats()
                    }}
                />
            )}
        </div>
    )
}
