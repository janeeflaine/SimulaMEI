import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend
} from 'recharts'
import FeatureLock from '../../components/FeatureLock'
import './CardDashboard.css'

const COLORS = ['#10b981', '#6366f1', '#f59e0b', '#ef4444', '#06b6d4', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#84cc16']
const MONTH_NAMES = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const MONTH_FULL = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

const formatBRL = (value) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0)
}

export default function CardDashboard() {
    const { id: cardId } = useParams()
    const navigate = useNavigate()
    const { token, user } = useAuth()
    const [loading, setLoading] = useState(true)
    const [data, setData] = useState(null)
    const [year, setYear] = useState(new Date().getFullYear())
    const [selectedMonth, setSelectedMonth] = useState(null)
    const [items, setItems] = useState([])
    const [itemsLoading, setItemsLoading] = useState(false)

    const API = import.meta.env.VITE_API_URL || ''
    const isOuro = user?.plan === 'Ouro' || user?.isInTrial

    // Fetch card dashboard data
    const fetchDashboard = useCallback(async () => {
        try {
            setLoading(true)
            const res = await fetch(`${API}/api/finance/invoices/card/${cardId}/summary?year=${year}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (!res.ok) throw new Error('Erro ao carregar dados')
            const result = await res.json()
            setData(result)

            // Auto-select current month or last with data
            if (result.monthlyTotals?.length > 0) {
                const currentMonth = new Date().getMonth() + 1
                const hasCurrentMonth = result.monthlyTotals.find(m => m.referenceMonth === currentMonth)
                setSelectedMonth(hasCurrentMonth ? currentMonth : result.monthlyTotals[result.monthlyTotals.length - 1].referenceMonth)
            }
        } catch (err) {
            console.error('Dashboard error:', err)
        } finally {
            setLoading(false)
        }
    }, [cardId, year, token, API])

    // Fetch items for selected month
    const fetchItems = useCallback(async () => {
        if (!selectedMonth || !data?.monthlyTotals) return

        const invoice = data.monthlyTotals.find(m => m.referenceMonth === selectedMonth)
        if (!invoice) {
            setItems([])
            return
        }

        // We need the invoice ID — fetch invoices list
        try {
            setItemsLoading(true)
            const res = await fetch(`${API}/api/finance/invoices?cardId=${cardId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (!res.ok) return

            const invoices = await res.json()
            const target = invoices.find(inv =>
                inv.referenceMonth === selectedMonth && inv.referenceYear === year
            )

            if (target) {
                const itemsRes = await fetch(`${API}/api/finance/invoices/${target.id}/items`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                })
                if (itemsRes.ok) {
                    setItems(await itemsRes.json())
                }
            } else {
                setItems([])
            }
        } catch (err) {
            console.error('Items error:', err)
        } finally {
            setItemsLoading(false)
        }
    }, [selectedMonth, data, cardId, year, token, API])

    useEffect(() => { fetchDashboard() }, [fetchDashboard])
    useEffect(() => { fetchItems() }, [fetchItems])

    if (!isOuro) {
        return (
            <div className="container py-8">
                <FeatureLock
                    featureName="Dashboard do Cartão"
                    requiredPlan="Ouro"
                    description="Visualize gráficos detalhados de gastos e categorias por cartão."
                    icon="📊"
                />
            </div>
        )
    }

    if (loading) {
        return (
            <div className="card-dashboard-page">
                <div className="card-dashboard-container">
                    <div className="cd-loading">
                        <div className="loader"></div>
                        <p>Carregando dashboard...</p>
                    </div>
                </div>
            </div>
        )
    }

    if (!data?.card) {
        return (
            <div className="card-dashboard-page">
                <div className="card-dashboard-container">
                    <div className="cd-empty">
                        <span className="empty-icon">❌</span>
                        <h3>Cartão não encontrado</h3>
                        <p>Este cartão não existe ou não pertence à sua conta.</p>
                        <Link to="/financas/cartoes" className="btn btn-primary">← Voltar aos Cartões</Link>
                    </div>
                </div>
            </div>
        )
    }

    const card = data.card
    const monthlyData = (data.monthlyTotals || []).map(m => ({
        ...m,
        name: MONTH_NAMES[m.referenceMonth],
        total: parseFloat(m.totalAmount) || 0
    }))

    const categoryData = (data.categoryBreakdown || []).map((c, i) => ({
        name: c.category,
        value: parseFloat(c.total) || 0,
        count: parseInt(c.count),
        fill: COLORS[i % COLORS.length]
    }))

    const totalSpent = data.totalSpent || 0
    const creditLimit = data.creditLimit || 0
    const utilizationPercent = data.utilizationPercent || 0
    const avgMonthly = monthlyData.length > 0 ? totalSpent / monthlyData.length : 0
    const maxMonth = monthlyData.length > 0 ? Math.max(...monthlyData.map(m => m.total)) : 0

    const getUtilClass = (pct) => {
        if (pct >= 80) return 'danger'
        if (pct >= 50) return 'warn'
        return 'safe'
    }

    // Custom tooltip for bar chart
    const BarTooltip = ({ active, payload }) => {
        if (active && payload && payload.length) {
            return (
                <div style={{
                    background: 'white', padding: '0.75rem 1rem', borderRadius: '0.75rem',
                    border: '1px solid #e2e8f0', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)'
                }}>
                    <p style={{ fontWeight: 700, color: '#0f172a', marginBottom: '0.25rem' }}>
                        {payload[0].payload.name} / {year}
                    </p>
                    <p style={{ color: '#10b981', fontWeight: 600 }}>{formatBRL(payload[0].value)}</p>
                </div>
            )
        }
        return null
    }

    // Custom tooltip for pie chart
    const PieTooltip = ({ active, payload }) => {
        if (active && payload && payload.length) {
            const total = categoryData.reduce((s, c) => s + c.value, 0)
            const pct = total > 0 ? ((payload[0].value / total) * 100).toFixed(1) : 0
            return (
                <div style={{
                    background: 'white', padding: '0.75rem 1rem', borderRadius: '0.75rem',
                    border: '1px solid #e2e8f0', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)'
                }}>
                    <p style={{ fontWeight: 700, color: '#0f172a' }}>{payload[0].name}</p>
                    <p style={{ color: payload[0].payload.fill, fontWeight: 600 }}>{formatBRL(payload[0].value)} ({pct}%)</p>
                </div>
            )
        }
        return null
    }

    return (
        <div className="card-dashboard-page">
            <div className="card-dashboard-container">

                {/* Back Link */}
                <Link to="/financas/cartoes" className="dashboard-back-link">
                    ← Voltar aos Cartões
                </Link>

                {/* Card Hero */}
                <div className="card-hero">
                    <div className="card-hero-visual" style={{
                        backgroundImage: card.imageUrl ? `url(${card.imageUrl})` : undefined
                    }}>
                        <div className="hero-brand">{card.brand || 'CARTÃO'}</div>
                        <div className="hero-number">•••• •••• •••• {card.lastFour || '0000'}</div>
                        <div className="hero-holder">{card.name || 'TITULAR'}</div>
                    </div>
                    <div className="card-hero-info">
                        <h1>{card.name}</h1>
                        <p>Dashboard de gastos e análises do cartão</p>
                        <div style={{ marginBottom: '0.75rem', marginTop: '0.5rem' }}>
                            <Link
                                to={`/financas/cartoes/${cardId}/upload`}
                                className="btn btn-primary btn-sm"
                                style={{ textDecoration: 'none' }}
                            >
                                📤 Upload de Fatura
                            </Link>
                        </div>
                        <div className="hero-meta">
                            <div className="hero-meta-item">
                                <span className="meta-label">Bandeira</span>
                                <span className="meta-value">{card.brand || '—'}</span>
                            </div>
                            <div className="hero-meta-item">
                                <span className="meta-label">Vencimento</span>
                                <span className="meta-value">Dia {card.dueDate || '—'}</span>
                            </div>
                            <div className="hero-meta-item">
                                <span className="meta-label">Fechamento</span>
                                <span className="meta-value">Dia {card.closingDate || '—'}</span>
                            </div>
                            {creditLimit > 0 && (
                                <div className="hero-meta-item">
                                    <span className="meta-label">Limite</span>
                                    <span className="meta-value">{formatBRL(creditLimit)}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Year Selector */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.5rem' }}>
                    <div className="year-selector">
                        <button className="year-nav-btn" onClick={() => setYear(y => y - 1)}>‹</button>
                        <span className="year-label">{year}</span>
                        <button className="year-nav-btn" onClick={() => setYear(y => y + 1)} disabled={year >= new Date().getFullYear()}>›</button>
                    </div>
                </div>

                {/* Summary Stats */}
                <div className="dashboard-stats-grid">
                    <div className="dash-stat-card">
                        <div className="stat-icon red">💳</div>
                        <div className="stat-label">Total Gasto ({year})</div>
                        <div className="stat-value">{formatBRL(totalSpent)}</div>
                        <div className="stat-sub">{monthlyData.length} faturas no ano</div>
                    </div>
                    <div className="dash-stat-card">
                        <div className="stat-icon blue">📊</div>
                        <div className="stat-label">Média Mensal</div>
                        <div className="stat-value">{formatBRL(avgMonthly)}</div>
                        <div className="stat-sub">Baseado em {monthlyData.length} meses</div>
                    </div>
                    <div className="dash-stat-card">
                        <div className="stat-icon amber">🔥</div>
                        <div className="stat-label">Mês Mais Caro</div>
                        <div className="stat-value">{formatBRL(maxMonth)}</div>
                        <div className="stat-sub">{monthlyData.find(m => m.total === maxMonth)?.name || '—'}</div>
                    </div>
                    <div className="dash-stat-card">
                        <div className="stat-icon green">📁</div>
                        <div className="stat-label">Categorias</div>
                        <div className="stat-value">{categoryData.length}</div>
                        <div className="stat-sub">categorias identificadas</div>
                    </div>
                </div>

                {/* Limit Usage Bar */}
                {creditLimit > 0 && (
                    <div className="limit-usage-section">
                        <div className="limit-card">
                            <div className="limit-info">
                                <div className="limit-title">Uso do Limite (Média)</div>
                                <div className="limit-value">{formatBRL(avgMonthly)}</div>
                                <div className="limit-sub">de {formatBRL(creditLimit)} disponível</div>
                            </div>
                            <div className="limit-progress-wrapper">
                                <div className="limit-bar-bg">
                                    <div
                                        className={`limit-bar-fill ${getUtilClass(utilizationPercent)}`}
                                        style={{ width: `${Math.min(100, utilizationPercent)}%` }}
                                    ></div>
                                </div>
                                <div className="limit-bar-labels">
                                    <span>0%</span>
                                    <span>50%</span>
                                    <span>100%</span>
                                </div>
                            </div>
                            <div className={`limit-percent ${getUtilClass(utilizationPercent)}`}>
                                {utilizationPercent}%
                            </div>
                        </div>
                    </div>
                )}

                {/* Charts */}
                {monthlyData.length > 0 ? (
                    <div className="cd-charts-grid">
                        {/* Bar Chart — Monthly History */}
                        <div className="cd-chart-card">
                            <div className="cd-chart-header">
                                <h3>📈 Histórico de Faturas</h3>
                                <span className="chart-badge">{year}</span>
                            </div>
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={monthlyData} barCategoryGap="20%">
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                                    <YAxis
                                        tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`}
                                        tick={{ fill: '#94a3b8', fontSize: 12 }}
                                        axisLine={false} tickLine={false}
                                    />
                                    <Tooltip content={<BarTooltip />} />
                                    <Bar
                                        dataKey="total"
                                        fill="#10b981"
                                        radius={[6, 6, 0, 0]}
                                        cursor="pointer"
                                        onClick={(data) => setSelectedMonth(data.referenceMonth)}
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Donut Chart — Category Breakdown */}
                        <div className="cd-chart-card">
                            <div className="cd-chart-header">
                                <h3>🍩 Gastos por Categoria</h3>
                                <span className="chart-badge">{categoryData.length} itens</span>
                            </div>
                            {categoryData.length > 0 ? (
                                <>
                                    <ResponsiveContainer width="100%" height={220}>
                                        <PieChart>
                                            <Pie
                                                data={categoryData}
                                                innerRadius={55}
                                                outerRadius={90}
                                                paddingAngle={3}
                                                dataKey="value"
                                            >
                                                {categoryData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.fill} />
                                                ))}
                                            </Pie>
                                            <Tooltip content={<PieTooltip />} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div className="donut-legend">
                                        {categoryData.slice(0, 6).map((cat, i) => (
                                            <div key={i} className="legend-item">
                                                <div className="legend-left">
                                                    <div className="legend-dot" style={{ background: cat.fill }}></div>
                                                    <span className="legend-name">{cat.name}</span>
                                                </div>
                                                <span className="legend-value">{formatBRL(cat.value)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <div className="cd-empty" style={{ padding: '2rem' }}>
                                    <p>Sem dados de categorias</p>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="cd-chart-card" style={{ marginBottom: '2rem' }}>
                        <div className="cd-empty">
                            <span className="empty-icon">📊</span>
                            <h3>Sem dados para {year}</h3>
                            <p>Nenhuma fatura encontrada para este ano. Faça upload de uma fatura ou crie manualmente.</p>
                        </div>
                    </div>
                )}

                {/* Invoice Items Table */}
                <div className="cd-items-section">
                    <div className="cd-items-header">
                        <h3>🧾 Itens da Fatura {selectedMonth ? `— ${MONTH_FULL[selectedMonth]}` : ''}</h3>
                        {monthlyData.length > 0 && (
                            <div className="cd-month-selector">
                                {monthlyData.map(m => (
                                    <button
                                        key={m.referenceMonth}
                                        className={`cd-month-btn ${selectedMonth === m.referenceMonth ? 'active' : ''}`}
                                        onClick={() => setSelectedMonth(m.referenceMonth)}
                                    >
                                        {MONTH_NAMES[m.referenceMonth]}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {itemsLoading ? (
                        <div className="cd-loading" style={{ padding: '3rem' }}>
                            <div className="loader"></div>
                        </div>
                    ) : items.length > 0 ? (
                        <div style={{ overflowX: 'auto' }}>
                            <table className="cd-items-table">
                                <thead>
                                    <tr>
                                        <th>Descrição</th>
                                        <th>Data</th>
                                        <th>Categoria</th>
                                        <th style={{ textAlign: 'right' }}>Valor</th>
                                        <th>Confiança IA</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map(item => {
                                        const conf = parseFloat(item.aiConfidence) || 0
                                        const confClass = conf >= 0.8 ? 'confidence-high' : conf >= 0.5 ? 'confidence-medium' : 'confidence-low'
                                        return (
                                            <tr key={item.id}>
                                                <td className="td-item-desc">{item.description}</td>
                                                <td className="td-item-date">
                                                    {item.transactionDate ? new Date(item.transactionDate).toLocaleDateString('pt-BR') : '—'}
                                                </td>
                                                <td>
                                                    <span className="td-item-category">
                                                        {item.categoryName || item.aiCategory || 'Sem categoria'}
                                                    </span>
                                                </td>
                                                <td className="td-item-amount">{formatBRL(item.amount)}</td>
                                                <td className={`td-item-confidence ${confClass}`}>
                                                    {conf > 0 ? `${(conf * 100).toFixed(0)}%` : '—'}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="cd-empty">
                            <span className="empty-icon">🧾</span>
                            <h3>Nenhum item nesta fatura</h3>
                            <p>Faça upload de um PDF/imagem da fatura para que a IA extraia os itens automaticamente.</p>
                        </div>
                    )}
                </div>

            </div>
        </div>
    )
}
