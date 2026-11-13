import { useState, useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
    Plus,
    FileText,
    Search,
    Trash2,
    ArrowDownLeft,
    ArrowUpRight,
    Pencil,
    ArrowLeftRight,
    Building2,
    User,
    Calendar,
    ChevronDown,
    SlidersHorizontal,
    X
} from 'lucide-react'
import FinanceQuickActionModal from '../../components/FinanceQuickActionModal'
import TransferModal from '../../components/TransferModal'
import { useConfirmDialog } from '../../components/ui/ConfirmDialog'
import Select from '../../components/ui/Select'
import { showToast } from '../../utils/toast'
import './FinancialStatement.css'

// Data local no formato do servidor (YYYY-MM-DD), sem o desvio de fuso do toISOString
const ymd = (d) => d.toLocaleDateString('sv-SE')

const PERIOD_LABELS = {
    all: 'Todo o período',
    thisMonth: 'Este mês',
    lastMonth: 'Mês passado',
    last30: 'Últimos 30 dias',
    thisYear: 'Este ano',
    custom: 'Outro período'
}

const getDateRange = (preset) => {
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth()
    switch (preset) {
        case 'thisMonth': return { dateStart: ymd(new Date(y, m, 1)), dateEnd: ymd(new Date(y, m + 1, 0)) }
        case 'lastMonth': return { dateStart: ymd(new Date(y, m - 1, 1)), dateEnd: ymd(new Date(y, m, 0)) }
        case 'last30': {
            const start = new Date(); start.setDate(start.getDate() - 30)
            return { dateStart: ymd(start), dateEnd: ymd(now) }
        }
        case 'thisYear': return { dateStart: ymd(new Date(y, 0, 1)), dateEnd: ymd(new Date(y, 11, 31)) }
        default: return { dateStart: '', dateEnd: '' }
    }
}

// Nome da forma de pagamento como a pessoa fala
const METHOD_LABELS = {
    PIX: 'Pix',
    'Cartão de Crédito': 'Cartão de crédito',
    'Cartão de Débito': 'Cartão de débito'
}

/** "1 lançamento" / "2 lançamentos" */
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

export default function FinancialStatement() {
    const { user } = useAuth()
    const { confirm, notify, dialog } = useConfirmDialog()
    const [transactions, setTransactions] = useState([])
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(1)
    const [hasMore, setHasMore] = useState(true)
    const [totalCount, setTotalCount] = useState(0) // New state for total records
    // Totais do filtro inteiro, calculados pelo servidor (não só dos 15 carregados)
    const [serverTotals, setServerTotals] = useState(null)
    const [isEditModalOpen, setIsEditModalOpen] = useState(false)
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
    const [editingTransaction, setEditingTransaction] = useState(null)
    const [selectedIds, setSelectedIds] = useState(new Set())
    const [bulkDeleting, setBulkDeleting] = useState(false)

    // Grátis: extrato limitado aos últimos 30 dias
    const isGratuito = !user?.isInTrial && (Number(user?.planId) === 1 || (!user?.planId && user?.plan !== 'Prata' && user?.plan !== 'Ouro'))
    const isPrataPlus = user?.planFeatures?.transferencias || user?.isInTrial || user?.role === 'ADMIN'
    const defaultPeriod = isGratuito ? 'last30' : 'all'
    const defaultRange = getDateRange(defaultPeriod)

    const [filters, setFilters] = useState({
        search: '',
        type: 'ALL',
        walletId: 'ALL',
        categoryId: 'ALL',
        dateStart: defaultRange.dateStart,
        dateEnd: defaultRange.dateEnd
    })
    const [period, setPeriod] = useState(defaultPeriod)
    const [isPeriodOpen, setIsPeriodOpen] = useState(false)
    const [isFiltersOpen, setIsFiltersOpen] = useState(false) // celular: painel de filtros
    const periodRef = useRef(null)

    // Debounce for search
    const [debouncedSearch, setDebouncedSearch] = useState('')

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(filters.search)
        }, 500)
        return () => clearTimeout(timer)
    }, [filters.search])

    const loadMoreRef = useRef(null)
    const [editingWalletTransactionId, setEditingWalletTransactionId] = useState(null)

    const [wallets, setWallets] = useState([])
    const [categories, setCategories] = useState([])
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false)

    useEffect(() => {
        setPage(1)
        setHasMore(true)
        setTransactions([]) // Clear list on filter change
        setTotalCount(0)
        setLoading(true)
        setSelectedIds(new Set())
    }, [debouncedSearch, filters.type, filters.walletId, filters.categoryId, filters.dateStart, filters.dateEnd])

    useEffect(() => {
        fetchTransactions()
    }, [page, debouncedSearch, filters.type, filters.walletId, filters.categoryId, filters.dateStart, filters.dateEnd])

    useEffect(() => {
        fetchWallets()
        fetchCategories()
    }, [])

    // Menu de período: fecha ao clicar fora ou com Esc
    useEffect(() => {
        if (!isPeriodOpen) return
        const onDown = (e) => { if (periodRef.current && !periodRef.current.contains(e.target)) setIsPeriodOpen(false) }
        const onKey = (e) => { if (e.key === 'Escape') setIsPeriodOpen(false) }
        document.addEventListener('mousedown', onDown)
        document.addEventListener('keydown', onKey)
        return () => {
            document.removeEventListener('mousedown', onDown)
            document.removeEventListener('keydown', onKey)
        }
    }, [isPeriodOpen])

    const fetchWallets = async () => {
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/finance/business-units', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (res.ok) {
                const data = await res.json()
                setWallets(data)
            }
        } catch (error) {
            console.error('Erro ao buscar carteiras:', error)
        }
    }

    const fetchCategories = async () => {
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/finance/categories', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (res.ok) {
                const data = await res.json()
                setCategories(data)
            }
        } catch (error) {
            console.error('Erro ao buscar categorias:', error)
        }
    }

    const handleQuickWalletChange = async (transactionId, newWalletId) => {
        if (!newWalletId) return
        try {
            const token = localStorage.getItem('token')
            // Optimistic Update
            const updatedTransactions = transactions.map(t =>
                t.id === transactionId ? { ...t, business_unit_id: Number(newWalletId) } : t
            )
            setTransactions(updatedTransactions)
            setEditingWalletTransactionId(null)

            const res = await fetch(`/api/finance/transactions/${transactionId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ business_unit_id: newWalletId })
            })

            if (!res.ok) {
                // Revert on failure
                fetchTransactions()
                notify({ title: 'Não foi possível trocar a carteira', message: 'O lançamento continua na carteira de antes. Tente de novo.', tone: 'error' })
            }
        } catch (err) {
            console.error(err)
            fetchTransactions()
            notify({ title: 'Sem conexão', message: 'Não foi possível trocar a carteira. Tente de novo.', tone: 'error' })
        }
    }

    const fetchTransactions = async () => {
        try {
            const token = localStorage.getItem('token')
            const params = new URLSearchParams({
                page,
                limit: 15,
                walletId: filters.walletId,
                categoryId: filters.categoryId,
                type: filters.type,
                search: debouncedSearch,
                startDate: filters.dateStart,
                endDate: filters.dateEnd
            })

            const res = await fetch(`/api/finance/transactions?${params}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })
            if (res.ok) {
                const { data, totalPages, totalCount, totals } = await res.json()
                setServerTotals(totals || null)

                setTransactions(prev => {
                    if (page === 1) return data
                    // Avoid duplicates if race conditions occur
                    const newIds = new Set(data.map(d => d.id))
                    return [...(Array.isArray(prev) ? prev : []).filter(p => !newIds.has(p.id)), ...data]
                })
                setHasMore(page < totalPages)
                setTotalCount(totalCount)
            }
        } catch (error) {
            console.error('Erro ao buscar transações:', error)
        } finally {
            setLoading(false)
        }
    }

    // Tira os excluídos dos totais do servidor, sem precisar buscar de novo
    const subtractFromTotals = (removed) => {
        setServerTotals(prev => {
            if (!prev) return prev
            const sum = (f) => removed.filter(f).reduce((acc, t) => acc + (Number(t.amount) || 0), 0)
            return {
                receitas: (Number(prev.receitas) || 0) - sum(t => t.type === 'RECEITA'),
                despesas: (Number(prev.despesas) || 0) - sum(t => t.type === 'DESPESA'),
                pendentes: (Number(prev.pendentes) || 0) - sum(t => t.type === 'DESPESA' && t.status === 'PENDING')
            }
        })
    }

    const handleDelete = async (t) => {
        const ok = await confirm({
            title: 'Excluir este lançamento?',
            message: 'Não dá para desfazer.',
            details: [
                { label: t.description || t.categoryName || 'Lançamento', value: signedAmount(t), strong: true },
                { label: 'Data', value: formatDate(t.date) }
            ],
            confirmLabel: 'Excluir lançamento',
            tone: 'danger'
        })
        if (!ok) return

        try {
            const token = localStorage.getItem('token')
            const res = await fetch(`/api/finance/transactions/${t.id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })
            if (res.ok) {
                setTransactions(prev => prev.filter(item => item.id !== t.id))
                setTotalCount(prev => Math.max(0, prev - 1))
                subtractFromTotals([t])
                setSelectedIds(prev => { const next = new Set(prev); next.delete(t.id); return next })
            } else {
                const data = await res.json().catch(() => ({}))
                notify({ title: 'Não foi possível excluir', message: data.message || 'Tente de novo em instantes.', tone: 'error' })
            }
        } catch (error) {
            console.error('Erro ao excluir:', error)
            notify({ title: 'Sem conexão', message: 'Não foi possível excluir o lançamento. Tente de novo.', tone: 'error' })
        }
    }

    // --- BULK DELETE ---
    const toggleSelectId = (id) => {
        setSelectedIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const toggleSelectAll = () => {
        if (selectedIds.size === transactions.length) {
            setSelectedIds(new Set())
        } else {
            setSelectedIds(new Set(transactions.map(t => t.id)))
        }
    }

    const handleBulkDelete = async () => {
        if (selectedIds.size === 0) return
        const count = selectedIds.size
        const ok = await confirm({
            title: `Excluir ${plural(count, 'lançamento', 'lançamentos')}?`,
            message: 'Não dá para desfazer.',
            confirmLabel: `Excluir ${plural(count, 'lançamento', 'lançamentos')}`,
            tone: 'danger'
        })
        if (!ok) return
        setBulkDeleting(true)
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/finance/transactions/bulk-delete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ ids: Array.from(selectedIds) })
            })
            if (res.ok) {
                subtractFromTotals(transactions.filter(t => selectedIds.has(t.id)))
                setTransactions(prev => prev.filter(t => !selectedIds.has(t.id)))
                setTotalCount(prev => Math.max(0, prev - count))
                setSelectedIds(new Set())
                showToast(`${plural(count, 'lançamento excluído', 'lançamentos excluídos')}.`, 'success')
            } else {
                const data = await res.json().catch(() => ({}))
                notify({ title: 'Não foi possível excluir', message: data.message || 'Tente de novo em instantes.', tone: 'error' })
            }
        } catch (err) {
            console.error(err)
            notify({ title: 'Sem conexão', message: 'Não foi possível excluir os lançamentos. Tente de novo.', tone: 'error' })
        } finally {
            setBulkDeleting(false)
        }
    }

    // Infinite Scroll Observer
    useEffect(() => {
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && hasMore && !loading) {
                setPage(prev => prev + 1)
            }
        }, { threshold: 1.0 })

        if (loadMoreRef.current) {
            observer.observe(loadMoreRef.current)
        }

        return () => {
            if (loadMoreRef.current) {
                observer.unobserve(loadMoreRef.current)
            }
        }
    }, [hasMore, loading])

    // Resumo: totais do servidor (filtro inteiro); sem eles, soma o que já foi carregado
    const financialTotals = useMemo(() => {
        if (serverTotals) {
            const totalReceitas = Number(serverTotals.receitas) || 0
            const totalDespesas = Number(serverTotals.despesas) || 0
            return { totalReceitas, totalDespesas, saldo: totalReceitas - totalDespesas, pendentes: Number(serverTotals.pendentes) || 0, complete: true }
        }
        const safeTransactions = Array.isArray(transactions) ? transactions : []
        const totalReceitas = safeTransactions
            .filter(t => t.type === 'RECEITA')
            .reduce((sum, t) => sum + (t.amount || 0), 0)
        const totalDespesas = safeTransactions
            .filter(t => t.type === 'DESPESA')
            .reduce((sum, t) => sum + (t.amount || 0), 0)
        const saldo = totalReceitas - totalDespesas
        return { totalReceitas, totalDespesas, saldo, pendentes: 0, complete: !hasMore }
    }, [transactions, serverTotals, hasMore])

    const resultTone = financialTotals.saldo > 0.004 ? 'is-pos' : financialTotals.saldo < -0.004 ? 'is-neg' : 'is-zero'
    const flowTotal = financialTotals.totalReceitas + financialTotals.totalDespesas
    const inShare = flowTotal > 0 ? Math.round((financialTotals.totalReceitas / flowTotal) * 100) : 50

    const formatCurrency = (value) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(value)
    }

    const formatDate = (dateString) => {
        if (!dateString) return '-'
        if (typeof dateString === 'string' && dateString.length === 10) {
            const [year, month, day] = dateString.split('-')
            return `${day}/${month}/${year}`
        }
        return new Date(dateString).toLocaleDateString('pt-BR')
    }

    const shortDate = (dateString) => formatDate(dateString).slice(0, 5)

    function signedAmount(t) {
        return `${t.type === 'RECEITA' ? '+' : '−'}\u00a0${formatCurrency(t.amount)}`
    }

    // ── Carteiras e filtros ──────────────────────────────────────────────
    const safeWallets = Array.isArray(wallets) ? wallets : []
    const walletsById = useMemo(() => new Map(safeWallets.map(w => [w.id, w])), [wallets])
    const pjWallets = safeWallets.filter(w => w.account_type === 'PJ')
    const pfWallets = safeWallets.filter(w => w.account_type === 'PF')

    // Carteiras agrupadas (MEI / Pessoal) para as listas de escolha
    const walletGroups = [
        ...(pjWallets.length > 0 ? [{ group: 'MEI', options: pjWallets.map(w => ({ value: String(w.id), label: w.name })) }] : []),
        ...(pfWallets.length > 0 ? [{ group: 'Pessoal', options: pfWallets.map(w => ({ value: String(w.id), label: w.name })) }] : [])
    ]

    const uniqueCategories = useMemo(() => Object.values(
        categories.reduce((acc, c) => {
            const key = c.name.trim().toLowerCase()
            if (!acc[key]) acc[key] = c
            return acc
        }, {})
    ).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [categories])

    const setFilter = (field, value) => setFilters(prev => ({ ...prev, [field]: value }))

    const applyPeriod = (preset) => {
        setPeriod(preset)
        if (preset !== 'custom') {
            const range = getDateRange(preset)
            setFilters(prev => ({ ...prev, ...range }))
            setIsPeriodOpen(false)
        }
    }

    const periodLabel = period === 'custom'
        ? (filters.dateStart || filters.dateEnd
            ? `${filters.dateStart ? shortDate(filters.dateStart) : '…'} a ${filters.dateEnd ? shortDate(filters.dateEnd) : '…'}`
            : PERIOD_LABELS.custom)
        : PERIOD_LABELS[period]

    // Filtros em uso, em texto, cada um com o próprio "tirar"
    const activeFilters = [
        filters.search.trim() && { key: 'search', label: `Busca: "${filters.search.trim()}"`, clear: () => setFilter('search', '') },
        filters.walletId !== 'ALL' && { key: 'wallet', label: walletsById.get(Number(filters.walletId))?.name || 'Carteira', clear: () => setFilter('walletId', 'ALL') },
        filters.categoryId !== 'ALL' && { key: 'category', label: uniqueCategories.find(c => String(c.id) === String(filters.categoryId))?.name || 'Categoria', clear: () => setFilter('categoryId', 'ALL') },
        filters.type !== 'ALL' && { key: 'type', label: filters.type === 'RECEITA' ? 'Só entradas' : 'Só saídas', clear: () => setFilter('type', 'ALL') },
        !isGratuito && period !== 'all' && { key: 'period', label: periodLabel, clear: () => applyPeriod('all') },
    ].filter(Boolean)

    const clearFilters = () => {
        setFilters({ search: '', type: 'ALL', walletId: 'ALL', categoryId: 'ALL', ...getDateRange(defaultPeriod) })
        setPeriod(defaultPeriod)
    }

    // Quantos filtros do painel (sem a busca) estão ligados: aparece no botão "Filtros" do celular
    const panelFilterCount = activeFilters.filter(f => f.key !== 'search').length

    const allSelected = transactions.length > 0 && selectedIds.size === transactions.length

    return (
        <div className="financial-statement-page extrato">
            <div className="ext-container">
                <header className="ext-head">
                    <div>
                        <h1 className="ext-title">Extrato</h1>
                        <p className="ext-sub">Tudo o que entrou e saiu nas suas carteiras, pessoais e do MEI.</p>
                    </div>
                    <div className="ext-actions">
                        {isPrataPlus && (
                            <button
                                type="button"
                                className="ext-btn ext-btn--ghost"
                                onClick={() => setIsTransferModalOpen(true)}
                                title="Registra a saída numa carteira e a entrada na outra"
                            >
                                <ArrowLeftRight size={18} aria-hidden="true" /> Transferir entre carteiras
                            </button>
                        )}
                        <button type="button" className="ext-btn ext-btn--primary" onClick={() => setIsCreateModalOpen(true)}>
                            <Plus size={18} aria-hidden="true" /> Novo lançamento
                        </button>
                    </div>
                </header>

                {isGratuito && (
                    <div className="ext-notice">
                        <span>No plano Gratuito o extrato mostra os últimos 30 dias.</span>
                        <Link to="/planos" className="ext-link">Ver planos</Link>
                    </div>
                )}

                {/* ── Filtros ── */}
                <section className="ext-filters" aria-label="Filtros">
                    <div className="ext-filters__top">
                        <label className="ext-search">
                            <span className="ext-sr">Buscar</span>
                            <Search size={18} aria-hidden="true" />
                            <input
                                type="search"
                                placeholder="Descrição ou categoria"
                                value={filters.search}
                                onChange={(e) => setFilter('search', e.target.value)}
                            />
                        </label>
                        <button
                            type="button"
                            className={`ext-btn ext-btn--ghost ext-filters__toggle ${isFiltersOpen ? 'is-on' : ''}`}
                            aria-expanded={isFiltersOpen}
                            aria-controls="ext-filters-more"
                            onClick={() => setIsFiltersOpen(!isFiltersOpen)}
                        >
                            <SlidersHorizontal size={18} aria-hidden="true" />
                            Filtros
                            {panelFilterCount > 0 && <span className="ext-count">{panelFilterCount}</span>}
                        </button>
                    </div>

                    <div id="ext-filters-more" className={`ext-filters__more ${isFiltersOpen ? 'is-open' : ''}`}>
                        <div className="ext-select">
                            <Select
                                variant="pill"
                                ariaLabel="Carteira"
                                value={filters.walletId}
                                active={filters.walletId !== 'ALL'}
                                onChange={(v) => setFilter('walletId', String(v))}
                                options={[
                                    { value: 'ALL', label: 'Todas as carteiras' },
                                    ...walletGroups
                                ]}
                            />
                        </div>

                        <div className="ext-select">
                            <Select
                                variant="pill"
                                ariaLabel="Categoria"
                                value={filters.categoryId}
                                active={filters.categoryId !== 'ALL'}
                                onChange={(v) => setFilter('categoryId', String(v))}
                                options={[
                                    { value: 'ALL', label: 'Todas as categorias' },
                                    ...uniqueCategories.map(c => ({ value: String(c.id), label: c.name }))
                                ]}
                            />
                        </div>

                        <div className="ext-seg" role="group" aria-label="Tipo">
                            {[['ALL', 'Tudo', ''], ['RECEITA', 'Entradas', ''], ['DESPESA', 'Saídas', '']].map(([value, label, tone]) => (
                                <button
                                    key={value}
                                    className={tone}
                                    type="button"
                                    aria-pressed={filters.type === value}
                                    onClick={() => setFilter('type', value)}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>

                        <div className="ext-period" ref={periodRef}>
                            <button
                                type="button"
                                className={`ext-btn ext-btn--ghost ext-period__btn ${!isGratuito && period !== 'all' ? 'is-on' : ''}`}
                                aria-haspopup="true"
                                aria-expanded={isPeriodOpen}
                                disabled={isGratuito}
                                title={isGratuito ? 'Escolher o período é do plano Prata em diante' : undefined}
                                onClick={() => setIsPeriodOpen(!isPeriodOpen)}
                            >
                                <Calendar size={16} aria-hidden="true" />
                                <span className="ext-period__label">{periodLabel}</span>
                                {!isGratuito && <ChevronDown size={16} aria-hidden="true" />}
                            </button>

                            {isPeriodOpen && (
                                <div className="ext-menu">
                                    {['all', 'thisMonth', 'lastMonth', 'last30', 'thisYear'].map(p => (
                                        <button
                                            key={p}
                                            type="button"
                                            className={`ext-menu__item ${period === p ? 'is-on' : ''}`}
                                            aria-pressed={period === p}
                                            onClick={() => applyPeriod(p)}
                                        >
                                            {PERIOD_LABELS[p]}
                                        </button>
                                    ))}
                                    <div className="ext-menu__custom">
                                        <span>Outro período</span>
                                        <label>
                                            De
                                            <input
                                                type="date"
                                                value={filters.dateStart}
                                                onChange={(e) => { setPeriod('custom'); setFilter('dateStart', e.target.value) }}
                                            />
                                        </label>
                                        <label>
                                            Até
                                            <input
                                                type="date"
                                                value={filters.dateEnd}
                                                onChange={(e) => { setPeriod('custom'); setFilter('dateEnd', e.target.value) }}
                                            />
                                        </label>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="ext-filters__status" aria-live="polite">
                        <span className="ext-total">
                            {loading ? 'Buscando lançamentos...' : plural(totalCount, 'lançamento', 'lançamentos')}
                        </span>
                        {activeFilters.length > 0 && (
                            <div className="ext-chips-wrap">
                                <ul className="ext-chips" aria-label="Filtros em uso">
                                    {activeFilters.map(f => (
                                        <li key={f.key}>
                                            <button type="button" className="ext-chip" onClick={f.clear} aria-label={`Tirar filtro ${f.label}`}>
                                                {f.label} <X size={14} aria-hidden="true" />
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                                <button type="button" className="ext-link" onClick={clearFilters}>Limpar filtros</button>
                            </div>
                        )}
                    </div>
                </section>

                {/* ── Resumo do filtro ── */}
                {!loading && transactions.length > 0 && (
                    <section className="ext-summary" aria-label="Resumo">
                        <div className="ext-summary__flow">
                            <dl className="ext-summary__grid">
                                <div className="ext-summary__in">
                                    <dt><span className="ext-dir ext-dir--in" aria-hidden="true"><ArrowDownLeft size={14} /></span>Entrou</dt>
                                    <dd>+{'\u00a0'}{formatCurrency(financialTotals.totalReceitas)}</dd>
                                </div>
                                <div className="ext-summary__out">
                                    <dt><span className="ext-dir ext-dir--out" aria-hidden="true"><ArrowUpRight size={14} /></span>Saiu</dt>
                                    <dd>−{'\u00a0'}{formatCurrency(financialTotals.totalDespesas)}</dd>
                                </div>
                            </dl>
                            {flowTotal > 0 && (
                                <div
                                    className="ext-summary__bar"
                                    role="img"
                                    aria-label={`Do total movimentado, ${inShare}% entrou e ${100 - inShare}% saiu`}
                                >
                                    <span className="ext-summary__bar-in" style={{ width: `${inShare}%` }} />
                                    <span className="ext-summary__bar-out" />
                                </div>
                            )}
                            {financialTotals.pendentes > 0 && (
                                <p className="ext-summary__pending">
                                    {formatCurrency(financialTotals.pendentes)} do que saiu ainda está pendente
                                </p>
                            )}
                            {!financialTotals.complete && (
                                <p className="ext-summary__note">
                                    Somando os {transactions.length} lançamentos carregados de {totalCount}. Role a lista para somar o resto.
                                </p>
                            )}
                        </div>
                        <div className={`ext-summary__result ${resultTone}`}>
                            <p className="ext-summary__label">
                                Resultado
                                {resultTone !== 'is-zero' && (
                                    <span className="ext-summary__tag">{resultTone === 'is-pos' ? 'Positivo' : 'Negativo'}</span>
                                )}
                            </p>
                            <p className="ext-summary__value">
                                {resultTone === 'is-neg' ? '−\u00a0' : resultTone === 'is-pos' ? '+\u00a0' : ''}{formatCurrency(Math.abs(financialTotals.saldo))}
                            </p>
                        </div>
                    </section>
                )}

                {/* ── Lista ── */}
                <section className="ext-list" aria-label="Lançamentos">
                    {loading ? (
                        <p className="ext-empty">Carregando lançamentos...</p>
                    ) : transactions.length === 0 ? (
                        <div className="ext-empty">
                            <FileText size={32} aria-hidden="true" />
                            {activeFilters.length > 0 ? (
                                <>
                                    <p>Nenhum lançamento com esses filtros.</p>
                                    <button type="button" className="ext-btn ext-btn--ghost" onClick={clearFilters}>Limpar filtros</button>
                                </>
                            ) : (
                                <>
                                    <p>{isGratuito ? 'Nenhum lançamento nos últimos 30 dias.' : 'Nenhum lançamento ainda.'}</p>
                                    <button type="button" className="ext-btn ext-btn--primary" onClick={() => setIsCreateModalOpen(true)}>
                                        <Plus size={18} aria-hidden="true" /> Novo lançamento
                                    </button>
                                </>
                            )}
                        </div>
                    ) : (
                        <>
                            <div className="ext-row ext-row--head">
                                <label className="ext-check">
                                    <input
                                        type="checkbox"
                                        checked={allSelected}
                                        onChange={toggleSelectAll}
                                        aria-label="Selecionar todos os lançamentos carregados"
                                    />
                                </label>
                                <span className="ext-row__date" aria-hidden="true">Data</span>
                                <span className="ext-row__main" aria-hidden="true">Descrição</span>
                                <span className="ext-row__wallet" aria-hidden="true">Carteira</span>
                                <span className="ext-row__method" aria-hidden="true">Pagamento</span>
                                <span className="ext-row__amount" aria-hidden="true">Valor</span>
                                <span className="ext-row__all" aria-hidden="true">Selecionar todos</span>
                            </div>

                            <ul className="ext-rows">
                                {transactions.map(t => {
                                    const wallet = walletsById.get(t.business_unit_id)
                                    const isPJ = wallet ? wallet.account_type === 'PJ' : t.target === 'BUSINESS'
                                    const title = t.description || t.categoryName || 'Sem descrição'
                                    const category = t.description ? (t.categoryName || 'Sem categoria') : null
                                    const method = METHOD_LABELS[t.paymentMethod] || t.paymentMethod || '-'
                                    const methodFull = t.cardName ? `${method} · ${t.cardName}` : method
                                    const invoiceNote = t.billing_date && t.billing_date !== t.date ? `Fatura de ${shortDate(t.billing_date)}` : null
                                    const isPending = t.status === 'PENDING'
                                    const selected = selectedIds.has(t.id)

                                    return (
                                        <li key={t.id} className={`ext-row ${selected ? 'is-selected' : ''}`}>
                                            <label className="ext-check">
                                                <input
                                                    type="checkbox"
                                                    checked={selected}
                                                    onChange={() => toggleSelectId(t.id)}
                                                    aria-label={`Selecionar ${title}`}
                                                />
                                            </label>

                                            <span className="ext-row__date">{formatDate(t.date)}</span>

                                            <div className="ext-row__main">
                                                <strong>
                                                    {title}
                                                    {isPending && <span className="ext-chip-status">Pendente</span>}
                                                </strong>
                                                {category && <span className="ext-row__cat">{category}</span>}
                                                {/* No celular: categoria · data · pagamento numa linha só */}
                                                <span className="ext-row__sub">
                                                    {[category, shortDate(t.date), method, invoiceNote].filter(Boolean).join(' · ')}
                                                </span>
                                            </div>

                                            <div className="ext-row__method">
                                                <span>{methodFull}</span>
                                                {invoiceNote && <small>{invoiceNote}</small>}
                                            </div>

                                            <span className={`ext-row__amount ${t.type === 'RECEITA' ? 'is-in' : isPending ? 'is-pending' : 'is-out'}`}>
                                                {signedAmount(t)}
                                            </span>

                                            <div className="ext-row__foot">
                                                <div className="ext-row__wallet">
                                                    {editingWalletTransactionId === t.id ? (
                                                        <Select
                                                            variant="compact"
                                                            defaultOpen
                                                            ariaLabel="Mover para a carteira"
                                                            placeholder="Escolha a carteira"
                                                            value={t.business_unit_id ? String(t.business_unit_id) : ''}
                                                            onChange={(v) => handleQuickWalletChange(t.id, String(v))}
                                                            onClose={() => setEditingWalletTransactionId(null)}
                                                            options={walletGroups}
                                                        />
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            className="ext-wallet"
                                                            onClick={() => setEditingWalletTransactionId(t.id)}
                                                            title="Trocar a carteira deste lançamento"
                                                        >
                                                            {isPJ ? <Building2 size={14} aria-hidden="true" /> : <User size={14} aria-hidden="true" />}
                                                            <span>{wallet ? wallet.name : 'Sem carteira'}</span>
                                                            <ChevronDown className="ext-wallet__chev" size={14} aria-hidden="true" />
                                                        </button>
                                                    )}
                                                </div>

                                                <div className="ext-row__actions">
                                                    <button
                                                        type="button"
                                                        className="ext-icon-btn"
                                                        aria-label={`Editar ${title}`}
                                                        title="Editar"
                                                        onClick={() => {
                                                            setEditingTransaction(t)
                                                            setIsEditModalOpen(true)
                                                        }}
                                                    >
                                                        <Pencil size={17} aria-hidden="true" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="ext-icon-btn"
                                                        aria-label={`Excluir ${title}`}
                                                        title="Excluir"
                                                        onClick={() => handleDelete(t)}
                                                    >
                                                        <Trash2 size={17} aria-hidden="true" />
                                                    </button>
                                                </div>
                                            </div>
                                        </li>
                                    )
                                })}
                            </ul>

                            {/* SENTINEL ELEMENT FOR INFINITE SCROLL */}
                            {hasMore && (
                                <div ref={loadMoreRef} className="ext-more">Carregando mais lançamentos...</div>
                            )}

                            <p className="ext-foot">
                                Mostrando {transactions.length} de {plural(totalCount, 'lançamento', 'lançamentos')}
                            </p>
                        </>
                    )}
                </section>

                {/* Barra de seleção */}
                {selectedIds.size > 0 && (
                    <div className="ext-bulk" role="region" aria-label="Lançamentos selecionados">
                        <span className="ext-bulk__info">
                            <strong>{selectedIds.size}</strong> {selectedIds.size === 1 ? 'selecionado' : 'selecionados'}
                        </span>
                        <div className="ext-bulk__actions">
                            <button type="button" className="ext-btn ext-btn--on-ink" onClick={() => setSelectedIds(new Set())}>
                                Cancelar
                            </button>
                            <button
                                type="button"
                                className="ext-btn ext-btn--danger"
                                onClick={handleBulkDelete}
                                disabled={bulkDeleting}
                            >
                                <Trash2 size={16} aria-hidden="true" />
                                {bulkDeleting ? 'Excluindo...' : `Excluir ${selectedIds.size}`}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {
                isEditModalOpen && (
                    <FinanceQuickActionModal
                        initialData={editingTransaction}
                        onWalletCreated={fetchWallets}
                        onClose={() => {
                            setIsEditModalOpen(false)
                            setEditingTransaction(null)
                        }}
                        onSuccess={() => {
                            setIsEditModalOpen(false)
                            setEditingTransaction(null)
                            fetchTransactions()
                        }}
                    />
                )
            }

            {
                isCreateModalOpen && (
                    <FinanceQuickActionModal
                        onClose={() => setIsCreateModalOpen(false)}
                        onWalletCreated={fetchWallets}
                        onSuccess={() => {
                            fetchTransactions()
                        }}
                    />
                )
            }

            {
                isTransferModalOpen && (
                    <TransferModal
                        wallets={wallets}
                        onClose={() => setIsTransferModalOpen(false)}
                        onSuccess={() => {
                            setIsTransferModalOpen(false)
                            fetchTransactions()
                        }}
                    />
                )
            }

            {dialog}
        </div >
    )
}
