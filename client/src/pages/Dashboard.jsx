import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import FeatureLock from '../components/FeatureLock'
import FinanceQuickActionModal from '../components/FinanceQuickActionModal'
import './Dashboard.css'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
    LayoutDashboard,
    PlusCircle,
    TrendingUp,
    TrendingDown,
    Wallet,
    PieChart as PieChartIcon,
    BarChart3,
    ArrowUpRight,
    ArrowDownRight,
    Calendar,
    Clock,
    AlertCircle,
    CheckCircle2,
    FileDown,
    ChevronRight,
    Search,
    History,
    CreditCard
} from 'lucide-react'
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    PieChart,
    Pie,
    Cell,
    BarChart,
    Bar,
    Legend
} from 'recharts'

export default function Dashboard() {
    const { user } = useAuth()
    const [simulations, setSimulations] = useState([])
    const [transactions, setTransactions] = useState([])
    const [loading, setLoading] = useState(true)
    const [stats, setStats] = useState({ totalSimulations: 0, avgRevenue: 0, limitStatus: 'success' })
    const [userPlan, setUserPlan] = useState(null)
    const [activeAlerts, setActiveAlerts] = useState([])
    const [isFinanceModalOpen, setIsFinanceModalOpen] = useState(false)
    const [cashFlowData, setCashFlowData] = useState([])

    // Pagination
    const [simPage, setSimPage] = useState(1)
    const [transPage, setTransPage] = useState(1)
    const rowsPerPage = 12

    // Bills due today
    const [dueTodayBills, setDueTodayBills] = useState([])
    const [showDueTodayAlert, setShowDueTodayAlert] = useState(false)

    // Fetch initial data
    useEffect(() => {
        const init = async () => {
            await fetchUserPlan()
            await fetchStats()
            await fetchActiveAlerts()
        }
        init()
    }, [])

    // Fetch plan-dependent data
    useEffect(() => {
        if (userPlan) {
            if (userPlan.features?.historico) fetchSimulations()
            if (userPlan.name === 'Ouro' || Number(userPlan.id) === 3 || user?.isInTrial) {
                fetchTransactions()
                fetchDueTodayBills()
                fetchCashFlowData()
            }
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

    const fetchCashFlowData = async () => {
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/finance/stats/cash-flow', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (res.ok) {
                const data = await res.json()
                setCashFlowData(data)
            }
        } catch (error) {
            console.error('Erro ao buscar fluxo de caixa:', error)
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

    const fetchDueTodayBills = async () => {
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/finance/transactions/due-today', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (res.ok) {
                const data = await res.json()
                if (data.length > 0) {
                    const snoozeUntil = localStorage.getItem('dueTodaySnooze')
                    if (!snoozeUntil || new Date() > new Date(snoozeUntil)) {
                        setDueTodayBills(data)
                        setShowDueTodayAlert(true)
                    }
                }
            }
        } catch (error) {
            console.error('Erro ao buscar contas do dia:', error)
        }
    }

    const hasFeature = (feature) => userPlan?.features?.[feature]

    const handleSnooze = () => {
        const snoozeDate = new Date()
        snoozeDate.setHours(snoozeDate.getHours() + 1)
        localStorage.setItem('dueTodaySnooze', snoozeDate.toISOString())
        setShowDueTodayAlert(false)
    }

    const handleConfirmBill = async (id) => {
        try {
            const token = localStorage.getItem('token')
            const res = await fetch(`/api/finance/transactions/${id}/confirm`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (res.ok) {
                setDueTodayBills(prev => prev.filter(b => b.id !== id))
                fetchTransactions()
                const updated = dueTodayBills.filter(b => b.id !== id)
                if (updated.length === 0) setShowDueTodayAlert(false)
            }
        } catch (err) {
            console.error(err)
        }
    }

    // Calculations for Summary
    const financialSummary = useMemo(() => {
        const paidTransactions = transactions.filter(t => t.status !== 'PENDING')
        const revenuePF = paidTransactions.filter(t => t.type === 'RECEITA' && t.target === 'PERSONAL').reduce((acc, t) => acc + t.amount, 0)
        const revenuePJ = paidTransactions.filter(t => t.type === 'RECEITA' && t.target === 'BUSINESS').reduce((acc, t) => acc + t.amount, 0)
        const expensePF = paidTransactions.filter(t => t.type === 'DESPESA' && t.target === 'PERSONAL').reduce((acc, t) => acc + t.amount, 0)
        const expensePJ = paidTransactions.filter(t => t.type === 'DESPESA' && t.target === 'BUSINESS').reduce((acc, t) => acc + t.amount, 0)

        return {
            totalRevenue: revenuePF + revenuePJ,
            totalExpense: expensePF + expensePJ,
            profitPJ: revenuePJ - expensePJ,
            balance: (revenuePF + revenuePJ) - (expensePF + expensePJ),
            revenuePF, revenuePJ, expensePF, expensePJ
        }
    }, [transactions])

    // Data for Charts
    const memoizedCashFlowData = useMemo(() => {
        if (cashFlowData && cashFlowData.length > 0) return cashFlowData

        // Fallback placeholder while loading or if no data exists
        return [
            { name: 'Jan', entrada: 0, saida: 0 },
            { name: 'Fev', entrada: 0, saida: 0 },
            { name: 'Mar', entrada: 0, saida: 0 },
            { name: 'Abr', entrada: 0, saida: 0 },
            { name: 'Mai', entrada: 0, saida: 0 },
            { name: 'Jun', entrada: 0, saida: 0 },
        ]
    }, [cashFlowData])

    const categoryData = useMemo(() => {
        const categories = {}
        transactions.filter(t => t.type === 'DESPESA').forEach(t => {
            const name = t.categoryName || 'Outros'
            categories[name] = (categories[name] || 0) + t.amount
        })
        return Object.entries(categories).map(([name, value]) => ({ name, value }))
    }, [transactions])

    const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#8b5cf6']

    const formatCurrency = (value) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(value)
    }

    const formatDate = (dateString) => {
        if (!dateString) return '-'
        // Handle YYYY-MM-DD key specifically to avoid timezone shifts
        if (typeof dateString === 'string' && dateString.length === 10 && dateString.includes('-')) {
            const [year, month, day] = dateString.split('-')
            return `${day}/${month}/${year}`
        }
        // Fallback for timestamps (simulations)
        return new Date(dateString).toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        })
    }

    const paginate = (items, page) => {
        const start = (page - 1) * rowsPerPage
        return items.slice(start, start + rowsPerPage)
    }

    const PaginationControls = ({ current, total, onPageChange }) => {
        const totalPages = Math.ceil(total / rowsPerPage)
        if (totalPages <= 1) return null

        return (
            <div className="pagination-controls">
                <button
                    className="btn-outline"
                    disabled={current === 1}
                    onClick={() => onPageChange(current - 1)}
                >
                    Anterior
                </button>
                <span>
                    Página <strong>{current}</strong> de {totalPages}
                </span>
                <button
                    className="btn-outline"
                    disabled={current === totalPages}
                    onClick={() => onPageChange(current + 1)}
                >
                    Próxima
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
            <div className="dashboard-container">

                {/* Header Section */}
                <div className="dashboard-header">
                    <div className="header-welcome">
                        <h1>Olá, {user?.name?.split(' ')[0]} 👋</h1>
                        <p>Bem-vindo à sua central de inteligência financeira.</p>
                    </div>
                    <div className="header-actions">
                        {(userPlan?.name === 'Ouro' || Number(userPlan?.id) === 3 || user?.isInTrial) && (
                            <button className="btn btn-secondary" onClick={() => setIsFinanceModalOpen(true)}>
                                <PlusCircle size={18} /> Novo Lançamento
                            </button>
                        )}
                        <Link to="/simular" className="btn btn-primary">
                            <LayoutDashboard size={18} /> Nova Simulação
                        </Link>
                    </div>
                </div>

                {/* Trial Expiration Alert */}
                {user?.trialExpired && user?.plan === 'Gratuito' && (
                    <div className="due-alert-banner trial-expired">
                        <div className="alert-icon-ring" style={{ background: '#fee2e2' }}>
                            <AlertCircle size={20} color="#ef4444" />
                        </div>
                        <div style={{ flex: 1 }}>
                            <strong style={{ display: 'block', color: '#991b1b' }}>Seu período de avaliação terminou</strong>
                            <span style={{ fontSize: '0.875rem', color: '#b91c1c' }}>
                                Para continuar usando os recursos premium (Finanças, Alertas e Gráficos), faça o upgrade para o plano Ouro.
                            </span>
                        </div>
                        <Link to="/planos" className="btn btn-primary btn-sm" style={{ background: '#ef4444', border: 'none' }}>
                            Fazer Upgrade
                        </Link>
                    </div>
                )}

                {/* Critical Notifications */}
                {showDueTodayAlert && dueTodayBills.length > 0 && (
                    <div className="due-alert-banner">
                        <div className="alert-icon-ring">
                            <Calendar size={20} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <strong style={{ display: 'block', color: '#92400e' }}>Pagamentos vencendo hoje</strong>
                            <span style={{ fontSize: '0.875rem', color: '#b45309' }}>
                                Você possui {dueTodayBills.length} conta(s) pendente(s) para hoje.
                            </span>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button onClick={handleSnooze} className="btn-snooze">Adiar 1h</button>
                            <Link to="/financas/contas" className="btn btn-primary btn-sm" style={{ background: '#b45309', boxShadow: 'none' }}>Ver Contas</Link>
                        </div>
                    </div>
                )}

                {/* Master Financial Summary */}
                {(userPlan?.name === 'Ouro' || Number(userPlan?.id) === 3 || user?.isInTrial) ? (
                    <div className="financial-summary-section">
                        <div className="summary-grid">
                            <div className="summary-card revenue">
                                <div className="card-header">
                                    <div className="card-icon"><TrendingUp size={20} /></div>
                                    <span className="card-label">Receita Bruta</span>
                                </div>
                                <div className="card-value">{formatCurrency(financialSummary.totalRevenue)}</div>
                                <div className="card-subtext">
                                    <span className="text-success"><ArrowUpRight size={14} /> +12%</span> em relação ao mês anterior
                                </div>
                            </div>
                            <div className="summary-card expense">
                                <div className="card-header">
                                    <div className="card-icon"><TrendingDown size={20} /></div>
                                    <span className="card-label">Despesas Totais</span>
                                </div>
                                <div className="card-value">{formatCurrency(financialSummary.totalExpense)}</div>
                                <div className="card-subtext">
                                    PF: {formatCurrency(financialSummary.expensePF)} | PJ: {formatCurrency(financialSummary.expensePJ)}
                                </div>
                            </div>
                            <div className="summary-card profit">
                                <div className="card-header">
                                    <div className="card-icon"><BarChart3 size={20} /></div>
                                    <span className="card-label">Lucro Empresa</span>
                                </div>
                                <div className="card-value">{formatCurrency(financialSummary.profitPJ)}</div>
                                <div className="card-subtext">Margem operacional de 45%</div>
                            </div>
                            <div className="summary-card balance">
                                <div className="card-header">
                                    <div className="card-icon"><Wallet size={20} /></div>
                                    <span className="card-label">Saldo Disponível</span>
                                </div>
                                <div className="card-value">{formatCurrency(financialSummary.balance)}</div>
                                <div className="card-subtext">Consolidado (PF + PJ)</div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="stats-grid" style={{ marginBottom: '40px' }}>
                        <div className="stat-card">
                            <div className="stat-card-label">Simulações</div>
                            <div className="stat-card-value">{stats.totalSimulations}</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-card-label">Faturamento Médio</div>
                            <div className="stat-card-value text-primary">{formatCurrency(stats.avgRevenue)}</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-card-label">Status do Limite</div>
                            <div className="stat-card-value">
                                <span className={`badge badge-${stats.limitStatus}`}>
                                    {stats.limitStatus === 'success' ? 'Normal' : 'Atenção'}
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Visual Analysis (Ouro) */}
                {(userPlan?.name === 'Ouro' || Number(userPlan?.id) === 3 || user?.isInTrial) && (
                    <div className="charts-grid">
                        <div className="chart-container">
                            <div className="chart-header">
                                <h3>Fluxo de Caixa Mensal</h3>
                                <Clock size={18} color="var(--color-slate-400)" />
                            </div>
                            <div style={{ width: '100%', height: 300 }}>
                                <ResponsiveContainer>
                                    <AreaChart data={memoizedCashFlowData}>
                                        <defs>
                                            <linearGradient id="colorEntrada" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.1} />
                                                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} dy={10} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                                        <Tooltip
                                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                                            formatter={(value) => formatCurrency(value)}
                                        />
                                        <Area type="monotone" dataKey="entrada" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorEntrada)" />
                                        <Area type="monotone" dataKey="saida" stroke="#ef4444" strokeWidth={3} fill="transparent" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div className="chart-container">
                            <div className="chart-header">
                                <h3>Gastos por Categoria</h3>
                                <PieChartIcon size={18} color="var(--color-slate-400)" />
                            </div>
                            <div style={{ width: '100%', height: 300 }}>
                                {categoryData.length > 0 ? (
                                    <ResponsiveContainer>
                                        <PieChart>
                                            <Pie
                                                data={categoryData}
                                                innerRadius={60}
                                                outerRadius={80}
                                                paddingAngle={5}
                                                dataKey="value"
                                            >
                                                {categoryData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip formatter={(value) => formatCurrency(value)} />
                                            <Legend verticalAlign="bottom" align="center" iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="empty-state">
                                        <p>Sem dados de despesas</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Bottom Section: History & Side Panel */}
                <div className="bottom-grid">
                    <div className="main-content-area">
                        {/* Transaction History */}
                        {(userPlan?.name === 'Ouro' || Number(userPlan?.id) === 3 || user?.isInTrial) ? (
                            <div className="dashboard-section">
                                <div className="section-header">
                                    <h2>Últimos Lançamentos</h2>
                                    <Link to="/financas/extrato" className="text-primary text-sm font-semibold flex items-center gap-1">
                                        Ver Tudo <ChevronRight size={14} />
                                    </Link>
                                </div>
                                {transactions.length === 0 ? (
                                    <div className="empty-state">
                                        <Clock size={40} className="text-slate-300" />
                                        <p>Nenhuma transação registrada ainda.</p>
                                    </div>
                                ) : (
                                    <div className="history-list">
                                        {paginate(transactions, transPage).map((t) => (
                                            <div key={t.id} className="history-item">
                                                <div className="item-date">{formatDate(t.date)}</div>
                                                <div className="item-info">
                                                    <span className="item-title">{t.categoryName || 'Transação'}</span>
                                                    <span className="item-subtitle">
                                                        {t.target === 'BUSINESS' ? '🏢 PJ' : '👤 PF'} • {t.description || (t.type === 'RECEITA' ? 'Recebimento' : 'Pagamento')}
                                                    </span>
                                                </div>
                                                <div className={`item-amount ${t.type === 'RECEITA' ? 'positive' : 'negative'}`}>
                                                    {t.type === 'RECEITA' ? '+' : '-'} {formatCurrency(t.amount)}
                                                </div>
                                                <div className="item-status">
                                                    <span className={`badge badge-${t.status === 'PAID' ? 'success' : 'warning'}`}>
                                                        {t.status === 'PAID' ? 'Pago' : 'Pendente'}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <PaginationControls current={transPage} total={transactions.length} onPageChange={setTransPage} />
                            </div>
                        ) : (
                            <div className="dashboard-section">
                                <div className="section-header">
                                    <h2>Histórico de Simulações</h2>
                                </div>
                                {!hasFeature('historico') ? (
                                    <div className="premium-lock-banner">
                                        <History size={40} style={{ marginBottom: '15px', opacity: 0.5 }} />
                                        <h3>Rastreie suas Simulações</h3>
                                        <p style={{ opacity: 0.7, marginBottom: '20px' }}>No plano Prata você pode salvar e comparar todas as suas simulações MEI.</p>
                                        <Link to="/planos" className="btn btn-primary">Fazer Upgrade</Link>
                                    </div>
                                ) : (
                                    <div className="history-list">
                                        {paginate(simulations, simPage).map((s) => (
                                            <div key={s.id} className="history-item" style={{ gridTemplateColumns: '80px 1fr 120px' }}>
                                                <div className="item-date">{formatDate(s.createdAt)}</div>
                                                <div className="item-info">
                                                    <span className="item-title text-capitalize">{s.activityType}</span>
                                                    <span className="item-subtitle">Faturamento: {formatCurrency(s.revenue)}</span>
                                                </div>
                                                <div className="item-amount">
                                                    <span className={`badge badge-${s.limitPercentage < 90 ? 'success' : 'danger'}`}>
                                                        {s.limitPercentage.toFixed(1)}% do Limite
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <PaginationControls current={simPage} total={simulations.length} onPageChange={setSimPage} />
                            </div>
                        )}
                    </div>

                    <div className="side-panel">
                        {/* Quick Actions / Shortcuts */}
                        <div className="dashboard-section">
                            <div className="section-header">
                                <h2>Acesso Rápido</h2>
                            </div>
                            <div className="quick-feature-grid">
                                <Link to="/simular" className="quick-feature-card">
                                    <div className="quick-icon"><LayoutDashboard size={18} /></div>
                                    <span className="quick-label">Simular</span>
                                </Link>
                                <Link to="/comparativo" className="quick-feature-card">
                                    <div className="quick-icon"><BarChart3 size={18} /></div>
                                    <span className="quick-label">MEI x ME</span>
                                </Link>
                                <Link to="/financas/cartoes" className="quick-feature-card">
                                    <div className="quick-icon"><CreditCard size={18} /></div>
                                    <span className="quick-label">Cartões</span>
                                </Link>
                                <button onClick={generatePDF} className="quick-feature-card">
                                    <div className="quick-icon"><FileDown size={18} /></div>
                                    <span className="quick-label">PDF</span>
                                </button>
                            </div>
                        </div>

                        {/* Plan Card */}
                        <div className="dashboard-section" style={{ background: 'linear-gradient(135deg, #10b981 0%, #3b82f6 100%)', color: 'white', border: 'none' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '15px' }}>
                                <AlertCircle size={24} />
                                <span style={{ background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: '4px', fontSize: '10px' }}>
                                    {userPlan?.name?.toUpperCase()}
                                </span>
                            </div>
                            <h3 style={{ fontSize: '1.1rem', marginBottom: '5px' }}>Plano {userPlan?.name}</h3>
                            <p style={{ fontSize: '0.8rem', opacity: 0.9, marginBottom: '20px' }}>
                                {userPlan?.price === 0 ? 'Mude para o Prata e salve seu histórico.' : 'Você tem acesso total aos recursos premium.'}
                            </p>
                            {userPlan?.price === 0 && (
                                <Link to="/planos" className="btn btn-sm" style={{ background: 'white', color: '#10b981', border: 'none', width: '100%' }}>Ver Planos</Link>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {isFinanceModalOpen && (
                <FinanceQuickActionModal
                    onClose={() => setIsFinanceModalOpen(false)}
                    onSuccess={() => {
                        setIsFinanceModalOpen(false)
                        fetchTransactions()
                        fetchStats()
                        fetchDueTodayBills()
                        fetchCashFlowData()
                    }}
                />
            )}
        </div>
    )
}
