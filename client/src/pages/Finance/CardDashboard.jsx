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
    const { user } = useAuth()
    const [loading, setLoading] = useState(true)
    const [data, setData] = useState(null)
    const [year, setYear] = useState(new Date().getFullYear())
    const [selectedMonth, setSelectedMonth] = useState(null)
    const [items, setItems] = useState([])
    const [itemsLoading, setItemsLoading] = useState(false)

    // Edit and Category States
    const [categories, setCategories] = useState([])
    const [editingItemId, setEditingItemId] = useState(null)
    const [editForm, setEditForm] = useState({ description: '', amount: '', categoryName: '' })
    const [actionLoading, setActionLoading] = useState(null)
    const [showNewCatModal, setShowNewCatModal] = useState(false)
    const [newCatName, setNewCatName] = useState('')
    const [creatingCat, setCreatingCat] = useState(false)
    const [selectedItemIds, setSelectedItemIds] = useState(new Set())
    const [bulkDeleting, setBulkDeleting] = useState(false)

    const API = import.meta.env.VITE_API_URL || ''
    const token = localStorage.getItem('token')
    const hasCartoes = user?.planFeatures?.cartoes || user?.isInTrial || user?.role === 'ADMIN'
    const hasUploadFaturas = user?.planFeatures?.upload_faturas || user?.isInTrial || user?.role === 'ADMIN'

    // Upgrade promo modal
    const [showUpgradeModal, setShowUpgradeModal] = useState(false)

    // Manual item modal state
    const [showManualModal, setShowManualModal] = useState(false)
    const [manualForm, setManualForm] = useState({ description: '', amount: '', transactionDate: '', categoryName: '' })
    const [manualSaving, setManualSaving] = useState(false)
    const [manualError, setManualError] = useState('')

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

    // Fetch user PF categories
    const fetchCategories = useCallback(async () => {
        try {
            const res = await fetch(`${API}/api/finance/categories`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (res.ok) {
                const data = await res.json()
                const pfCategories = data.filter(c => c.type === 'DESPESA_PESSOAL')
                const uniqueNames = [...new Set(pfCategories.map(c => c.name))]
                setCategories(uniqueNames)
            }
        } catch { /* ignore */ }
    }, [API, token])

    useEffect(() => { fetchDashboard(); fetchCategories() }, [fetchDashboard, fetchCategories])
    useEffect(() => { fetchItems() }, [fetchItems])

    // Table Actions
    const handleEditClick = (item) => {
        setEditingItemId(item.id)
        setEditForm({
            description: item.description,
            amount: item.amount,
            categoryName: item.categoryName || item.aiCategory || 'Outros'
        })
    }

    const handleCancelEdit = () => {
        setEditingItemId(null)
        setEditForm({ description: '', amount: '', categoryName: '' })
    }

    const handleCategoryChange = (val, originalCategory) => {
        if (val === 'NEW_CATEGORY') {
            setShowNewCatModal(true)
            // Revert select back to previous value to prevent it showing "NEW_CATEGORY"
            setEditForm(prev => ({ ...prev, categoryName: originalCategory || 'Outros' }))
        } else {
            setEditForm(prev => ({ ...prev, categoryName: val }))
        }
    }

    const handleCreateCategory = async () => {
        if (!newCatName.trim()) return
        setCreatingCat(true)
        try {
            const res = await fetch(`${API}/api/finance/categories`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name: newCatName.trim(), type: 'DESPESA_PESSOAL' })
            })
            if (res.ok) {
                const newCat = await res.json()
                setCategories(prev => [...prev, newCat.name])
                setEditForm(prev => ({ ...prev, categoryName: newCat.name }))
                setShowNewCatModal(false)
                setNewCatName('')
            } else {
                alert('Erro ao criar categoria')
            }
        } catch (err) {
            alert('Erro de conexão ao criar categoria')
        } finally {
            setCreatingCat(false)
        }
    }

    const handleSaveEdit = async () => {
        if (!editForm.description || !editForm.amount) return
        setActionLoading(editingItemId)
        try {
            const res = await fetch(`${API}/api/finance/invoices/items/${editingItemId}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    description: editForm.description,
                    amount: parseFloat(editForm.amount),
                    categoryName: editForm.categoryName
                })
            })

            if (res.ok) {
                await fetchItems() // refresh items
                await fetchDashboard() // refresh dashboard totals
                handleCancelEdit()
            } else {
                alert('Erro ao atualizar item')
            }
        } catch (err) {
            alert('Erro de conexão')
        } finally {
            setActionLoading(null)
        }
    }

    const handleDelete = async (itemId) => {
        if (!window.confirm('Tem certeza que deseja excluir este item?')) return
        setActionLoading(itemId)
        try {
            const res = await fetch(`${API}/api/finance/invoices/items/${itemId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (res.ok) {
                await fetchItems()
                await fetchDashboard()
            } else {
                alert('Erro ao excluir item')
            }
        } catch (err) {
            alert('Erro de conexão')
        } finally {
            setActionLoading(null)
        }
    }

    // --- BULK SELECT & DELETE ---
    const toggleSelectItem = (id) => {
        setSelectedItemIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const toggleSelectAllItems = () => {
        if (selectedItemIds.size === items.length) {
            setSelectedItemIds(new Set())
        } else {
            setSelectedItemIds(new Set(items.map(i => i.id)))
        }
    }

    const handleBulkDelete = async () => {
        if (selectedItemIds.size === 0) return
        if (!window.confirm(`Tem certeza que deseja excluir ${selectedItemIds.size} item(ns)? Esta ação não pode ser desfeita.`)) return
        setBulkDeleting(true)
        try {
            const res = await fetch(`${API}/api/finance/invoices/items/bulk-delete`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ ids: Array.from(selectedItemIds) })
            })
            if (res.ok) {
                const data = await res.json()
                setSelectedItemIds(new Set())
                await fetchItems()
                await fetchDashboard()
                alert(data.message)
            } else {
                const data = await res.json()
                alert(data.message || 'Erro ao excluir itens')
            }
        } catch (err) {
            console.error(err)
            alert('Erro de conexão ao excluir itens.')
        } finally {
            setBulkDeleting(false)
        }
    }

    // --- ADD MANUAL ITEM ---
    const handleAddManualItem = async () => {
        if (!manualForm.description || !manualForm.amount) {
            setManualError('Descrição e valor são obrigatórios.')
            return
        }
        setManualSaving(true)
        setManualError('')
        try {
            // Find or create invoice for selected month
            const now = new Date()
            const refMonth = selectedMonth || (now.getMonth() + 1)
            const refYear = year

            // Find the card's dueDate to set invoice due date
            const dueDateDay = data?.card?.dueDate || 10
            const invoiceDueDate = `${refYear}-${String(refMonth).padStart(2,'0')}-${String(dueDateDay).padStart(2,'0')}`

            // Try to find existing invoice
            const listRes = await fetch(`${API}/api/finance/invoices?cardId=${cardId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const invoices = listRes.ok ? await listRes.json() : []
            let invoice = invoices.find(inv => inv.referenceMonth === refMonth && inv.referenceYear === refYear)

            if (!invoice) {
                // Create invoice for this month
                const createRes = await fetch(`${API}/api/finance/invoices`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ cardId, referenceMonth: refMonth, referenceYear: refYear, dueDate: invoiceDueDate })
                })
                if (!createRes.ok) throw new Error('Erro ao criar fatura')
                invoice = await createRes.json()
            }

            // Resolve categoryName to id
            let categoryId = null
            if (manualForm.categoryName) {
                const catMatch = (await fetch(`${API}/api/finance/categories`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                }).then(r => r.json()).catch(() => [])).find(c => c.name === manualForm.categoryName)
                if (catMatch) categoryId = catMatch.id
            }

            // Add item
            const itemRes = await fetch(`${API}/api/finance/invoices/${invoice.id}/items`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    description: manualForm.description,
                    amount: parseFloat(manualForm.amount),
                    transactionDate: manualForm.transactionDate || null,
                    categoryId,
                    isConfirmed: true
                })
            })
            if (!itemRes.ok) throw new Error('Erro ao adicionar item')

            setShowManualModal(false)
            setManualForm({ description: '', amount: '', transactionDate: '', categoryName: '' })
            await fetchDashboard()
            await fetchItems()
        } catch (err) {
            setManualError(err.message || 'Erro de conexão')
        } finally {
            setManualSaving(false)
        }
    }

    if (!hasCartoes) {
        return (
            <div className="container py-8">
                <FeatureLock
                    featureName="Dashboard do Cartão"
                    requiredPlan="Gratuito"
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
                        <div style={{ marginBottom: '0.75rem', marginTop: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => {
                                    setManualForm({ description: '', amount: '', transactionDate: new Date().toISOString().split('T')[0], categoryName: categories[0] || '' })
                                    setManualError('')
                                    setShowManualModal(true)
                                }}
                            >
                                ➕ Adicionar Item
                            </button>
                            {hasUploadFaturas ? (
                                <Link
                                    to={`/financas/cartoes/${cardId}/upload`}
                                    className="btn btn-primary btn-sm"
                                    style={{ textDecoration: 'none' }}
                                >
                                    📤 Upload de Fatura IA
                                </Link>
                            ) : (
                                <button
                                    className="btn btn-sm"
                                    style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.4)', color: '#a5b4fc', cursor: 'pointer' }}
                                    onClick={() => setShowUpgradeModal(true)}
                                >
                                    🔒 Cadastrar Fatura com IA
                                </button>
                            )}
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
                                <span className="meta-value">Dia {card.closingDay || '—'}</span>
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
                            <ResponsiveContainer width="100%" height={300} minHeight={300}>
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
                                    <ResponsiveContainer width="100%" height={220} minHeight={220}>
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
                                        onClick={() => {
                                            setSelectedMonth(m.referenceMonth)
                                            setSelectedItemIds(new Set()) // Clear selection on month change
                                        }}
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
                        <>
                            <div style={{ overflowX: 'auto' }}>
                                <table className="cd-items-table">
                                    <thead>
                                        <tr>
                                            <th style={{ width: '40px', textAlign: 'center' }}>
                                                <input
                                                    type="checkbox"
                                                    className="bulk-checkbox"
                                                    checked={items.length > 0 && selectedItemIds.size === items.length}
                                                    onChange={toggleSelectAllItems}
                                                    title="Selecionar todos"
                                                />
                                            </th>
                                            <th>Descrição</th>
                                            <th>Data</th>
                                            <th>Categoria</th>
                                            <th style={{ textAlign: 'right' }}>Valor</th>
                                            <th>Confiança IA</th>
                                            <th style={{ textAlign: 'center' }}>Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {items.map(item => {
                                            const conf = parseFloat(item.aiConfidence) || 0
                                            const confClass = conf >= 0.8 ? 'confidence-high' : conf >= 0.5 ? 'confidence-medium' : 'confidence-low'
                                            const isEditing = editingItemId === item.id
                                            const isDeleting = actionLoading === item.id

                                            return (
                                                <tr key={item.id} className={`${isEditing ? 'editing-row' : ''} ${selectedItemIds.has(item.id) ? 'row-selected' : ''}`}>
                                                    <td style={{ textAlign: 'center', width: '40px' }}>
                                                        <input
                                                            type="checkbox"
                                                            className="bulk-checkbox"
                                                            checked={selectedItemIds.has(item.id)}
                                                            onChange={() => toggleSelectItem(item.id)}
                                                        />
                                                    </td>
                                                    <td className="td-item-desc">
                                                        {isEditing ? (
                                                            <input
                                                                type="text"
                                                                className="cd-edit-input"
                                                                value={editForm.description}
                                                                onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                                                            />
                                                        ) : (
                                                            item.description
                                                        )}
                                                    </td>
                                                    <td className="td-item-date">
                                                        {item.transactionDate ? new Date(item.transactionDate).toLocaleDateString('pt-BR') : '—'}
                                                    </td>
                                                    <td>
                                                        {isEditing ? (
                                                            <select
                                                                className="cd-edit-select"
                                                                value={editForm.categoryName}
                                                                onChange={e => handleCategoryChange(e.target.value, item.categoryName || item.aiCategory)}
                                                            >
                                                                {categories.length > 0 ? (
                                                                    categories.map((cat, idx) => (
                                                                        <option key={`${cat}-${idx}`} value={cat}>{cat}</option>
                                                                    ))
                                                                ) : (
                                                                    <option value="Outros">Outros</option>
                                                                )}
                                                                <option disabled>──────</option>
                                                                <option value="NEW_CATEGORY">+ Nova Categoria...</option>
                                                            </select>
                                                        ) : (
                                                            <span className="td-item-category">
                                                                {item.categoryName || item.aiCategory || 'Sem categoria'}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="td-item-amount" style={{ textAlign: 'right' }}>
                                                        {isEditing ? (
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                className="cd-edit-input amount-input"
                                                                value={editForm.amount}
                                                                onChange={e => setEditForm({ ...editForm, amount: e.target.value })}
                                                            />
                                                        ) : (
                                                            formatBRL(item.amount)
                                                        )}
                                                    </td>
                                                    <td className={`td-item-confidence ${confClass}`}>
                                                        {conf > 0 ? `${(conf * 100).toFixed(0)}%` : '—'}
                                                    </td>
                                                    <td className="td-item-actions">
                                                        {isEditing ? (
                                                            <div className="cd-action-group">
                                                                <button className="btn-icon save-icon" onClick={handleSaveEdit} title="Salvar" disabled={actionLoading === item.id}>
                                                                    {actionLoading === item.id ? '⏳' : '✅'}
                                                                </button>
                                                                <button className="btn-icon cancel-icon" onClick={handleCancelEdit} title="Cancelar">❌</button>
                                                            </div>
                                                        ) : (
                                                            <div className="cd-action-group">
                                                                <button className="btn-icon edit-icon" onClick={() => handleEditClick(item)} title="Editar" disabled={!!editingItemId || isDeleting}>
                                                                    ✏️
                                                                </button>
                                                                <button className="btn-icon delete-icon" onClick={() => handleDelete(item.id)} title="Excluir" disabled={!!editingItemId || isDeleting}>
                                                                    {isDeleting ? '⏳' : '🗑️'}
                                                                </button>
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                                {/* New Category Modal (copied styles logic from InvoiceUpload) */}
                                {showNewCatModal && (
                                    <div className="modal-overlay" onClick={() => setShowNewCatModal(false)}>
                                        <div className="modal-content" onClick={e => e.stopPropagation()}>
                                            <h3>Nova Categoria</h3>
                                            <div className="form-group" style={{ marginTop: '1rem' }}>
                                                <label>Nome da Categoria</label>
                                                <input
                                                    type="text"
                                                    value={newCatName}
                                                    onChange={e => setNewCatName(e.target.value)}
                                                    placeholder="Ex: Assinaturas"
                                                    autoFocus
                                                />
                                                <small className="form-help">
                                                    Será criada automaticamente como categoria Pessoal (PF).
                                                </small>
                                            </div>
                                            <div className="modal-actions">
                                                <button className="btn-cancel" onClick={() => setShowNewCatModal(false)}>
                                                    Cancelar
                                                </button>
                                                <button
                                                    className="btn-save"
                                                    onClick={handleCreateCategory}
                                                    disabled={creatingCat || !newCatName.trim()}
                                                >
                                                    {creatingCat ? 'Criando...' : 'Criar Categoria'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* FLOATING BULK ACTION BAR */}
                            {selectedItemIds.size > 0 && (
                                <div className="cd-bulk-action-bar">
                                    <div className="cd-bulk-info">
                                        <span>☑️</span>
                                        <span><strong>{selectedItemIds.size}</strong> item(ns) selecionado(s)</span>
                                    </div>
                                    <div className="cd-bulk-actions">
                                        <button className="cd-bulk-btn cancel" onClick={() => setSelectedItemIds(new Set())}>
                                            Cancelar
                                        </button>
                                        <button
                                            className="cd-bulk-btn danger"
                                            onClick={handleBulkDelete}
                                            disabled={bulkDeleting}
                                        >
                                            {bulkDeleting ? '⏳ Excluindo...' : `🗑️ Excluir ${selectedItemIds.size}`}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>) : (
                        <div className="cd-empty">
                            <span className="empty-icon">🧾</span>
                            <h3>Nenhum item nesta fatura</h3>
                            <p>
                                Adicione itens manualmente ou{hasUploadFaturas ? ' faça upload da fatura para extração automática via IA.' : ' faça upgrade para o Prata para usar o Upload IA.'}
                            </p>
                            <button className="btn btn-primary btn-sm" style={{ marginTop: '1rem' }} onClick={() => {
                                setManualForm({ description: '', amount: '', transactionDate: new Date().toISOString().split('T')[0], categoryName: categories[0] || '' })
                                setManualError('')
                                setShowManualModal(true)
                            }}>
                                ➕ Adicionar Item Manualmente
                            </button>
                        </div>
                    )}
                </div>

            </div>

            {/* Manual Item Modal */}
            {showManualModal && (
                <div className="modal-overlay" onClick={() => setShowManualModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
                        <button className="close-x" onClick={() => setShowManualModal(false)}>×</button>
                        <h3>➕ Adicionar Item à Fatura</h3>
                        <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
                            O item será adicionado à fatura de <strong>{MONTH_FULL[selectedMonth || (new Date().getMonth() + 1)]}/{year}</strong>.
                        </p>

                        <div className="form-group">
                            <label>Descrição *</label>
                            <input
                                type="text"
                                autoFocus
                                required
                                value={manualForm.description}
                                onChange={e => setManualForm(p => ({ ...p, description: e.target.value }))}
                                placeholder="Ex: Netflix, Mercado, Posto de gasolina..."
                            />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div className="form-group">
                                <label>Valor (R$) *</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    required
                                    value={manualForm.amount}
                                    onChange={e => setManualForm(p => ({ ...p, amount: e.target.value }))}
                                    placeholder="0,00"
                                />
                            </div>
                            <div className="form-group">
                                <label>Data da Compra</label>
                                <input
                                    type="date"
                                    value={manualForm.transactionDate}
                                    onChange={e => setManualForm(p => ({ ...p, transactionDate: e.target.value }))}
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label>Categoria</label>
                            <select
                                value={manualForm.categoryName}
                                onChange={e => setManualForm(p => ({ ...p, categoryName: e.target.value }))}
                            >
                                <option value="">Sem categoria</option>
                                {categories.map((cat, i) => (
                                    <option key={i} value={cat}>{cat}</option>
                                ))}
                            </select>
                        </div>

                        {manualError && (
                            <div className="alert alert-warning" style={{ marginBottom: '1rem' }}>
                                <span>⚠️</span><span>{manualError}</span>
                            </div>
                        )}

                        <div className="modal-actions">
                            <button className="btn btn-secondary" onClick={() => setShowManualModal(false)}>Cancelar</button>
                            <button className="btn btn-primary" onClick={handleAddManualItem} disabled={manualSaving}>
                                {manualSaving ? 'Salvando...' : '💾 Salvar Item'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Upgrade Promo Modal — AI Invoice Upload */}
            {showUpgradeModal && (
                <div className="modal-overlay" onClick={() => setShowUpgradeModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ textAlign: 'center', maxWidth: '420px' }}>
                        <div style={{ fontSize: '3.5rem', marginBottom: '0.5rem' }}>🤖</div>
                        <h2 style={{ marginBottom: '0.5rem' }}>Cadastre Faturas com Inteligência Artificial</h2>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: '1.6' }}>
                            Com o plano <strong style={{ color: '#a78bfa' }}>Prata</strong> ou <strong style={{ color: '#fbbf24' }}>Ouro</strong>, você pode fazer upload do PDF ou imagem da sua fatura e a IA lê e importa todos os itens automaticamente — sem digitar nada.
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'rgba(99,102,241,0.08)', borderRadius: '8px', padding: '0.75rem 1rem' }}>
                                <span style={{ fontSize: '1.25rem' }}>⚡</span>
                                <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Importação automática de todos os itens da fatura</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'rgba(99,102,241,0.08)', borderRadius: '8px', padding: '0.75rem 1rem' }}>
                                <span style={{ fontSize: '1.25rem' }}>🏷️</span>
                                <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Categorização inteligente das despesas</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'rgba(99,102,241,0.08)', borderRadius: '8px', padding: '0.75rem 1rem' }}>
                                <span style={{ fontSize: '1.25rem' }}>⏱️</span>
                                <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Economize tempo — processe faturas em segundos</span>
                            </div>
                        </div>
                        <button className="btn btn-primary" style={{ width: '100%', marginBottom: '0.75rem' }} onClick={() => setShowUpgradeModal(false)}>
                            ✨ Fazer Upgrade para Prata
                        </button>
                        <button className="btn btn-secondary" style={{ width: '100%' }} onClick={() => setShowUpgradeModal(false)}>
                            Continuar no Gratuito
                        </button>
                    </div>
                </div>
            )}

        </div >
    )
}
