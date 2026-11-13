import { useState, useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import FeatureLock from '../components/FeatureLock'
import FinanceQuickActionModal from '../components/FinanceQuickActionModal'
import { useConfirmDialog } from '../components/ui/ConfirmDialog'
import Select from '../components/ui/Select'
import { tierOf } from '../components/plans/planFeatures'
import './Dashboard.css'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
    Plus,
    Calendar,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Calculator,
    Scale,
    CreditCard,
    FileDown,
    Lock,
    Camera
} from 'lucide-react'
import {
    ResponsiveContainer,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    BarChart,
    Bar
} from 'recharts'

// Helper: get date range for a filter preset
const getDateRange = (preset) => {
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth()
    switch (preset) {
        case 'thisMonth': {
            const start = new Date(y, m, 1)
            const end = new Date(y, m + 1, 0)
            return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) }
        }
        case 'lastMonth': {
            const start = new Date(y, m - 1, 1)
            const end = new Date(y, m, 0)
            return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) }
        }
        case 'thisYear': {
            const start = new Date(y, 0, 1)
            const end = new Date(y, 11, 31)
            return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) }
        }
        case 'all':
            return { startDate: '', endDate: '' }
        default:
            return { startDate: '', endDate: '' }
    }
}

const FILTER_LABELS = {
    thisMonth: 'Este mês',
    lastMonth: 'Mês passado',
    thisYear: 'Este ano',
    all: 'Tudo',
    custom: 'Personalizado'
}

const MONTH_NAMES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

/** "1 conta vencida" / "2 contas vencidas" */
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

/** Período escolhido no filtro, em palavras: "novembro de 2026", "2026", "todo o período"... */
const describePeriod = (preset, startDate, endDate) => {
    const now = new Date()
    if (preset === 'thisMonth') return `${MONTH_NAMES[now.getMonth()]} de ${now.getFullYear()}`
    if (preset === 'lastMonth') {
        const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        return `${MONTH_NAMES[d.getMonth()]} de ${d.getFullYear()}`
    }
    if (preset === 'thisYear') return String(now.getFullYear())
    if (preset === 'all' || (!startDate && !endDate)) return 'todo o período'
    const br = (s) => s ? s.split('-').reverse().join('/') : '...'
    return `${br(startDate)} a ${br(endDate)}`
}

/** Eixo do gráfico: "R$ 6 mil" */
const compactBRL = (v) => {
    if (!v) return 'R$ 0'
    if (Math.abs(v) >= 1000) return `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
    return `R$ ${Math.round(v)}`
}

const EMPTY_WALLET = { name: '', account_type: 'PF', document: '', photo_url: '' }

/**
 * Janela "Nova carteira" no padrão das janelas do site (mesma moldura do ConfirmDialog):
 * no computador fica no meio da tela; no celular sobe de baixo.
 */
function NewWalletDialog({ form, setForm, saving, onSave, onClose }) {
    const overlayRef = useRef(null)
    const nameRef = useRef(null)
    const isPJ = form.account_type === 'PJ'
    const onCloseRef = useRef(onClose)
    onCloseRef.current = onClose

    useEffect(() => {
        const previouslyFocused = document.activeElement
        nameRef.current?.focus()
        const { overflow } = document.body.style
        document.body.style.overflow = 'hidden'
        const onKey = (e) => {
            if (e.key !== 'Escape') return
            // Se um aviso do site estiver aberto por cima, o Esc fecha só o aviso
            const overlays = document.querySelectorAll('.cd-overlay')
            if (overlays[overlays.length - 1] !== overlayRef.current) return
            e.preventDefault()
            onCloseRef.current()
        }
        document.addEventListener('keydown', onKey)
        return () => {
            document.removeEventListener('keydown', onKey)
            document.body.style.overflow = overflow
            if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus()
        }
    }, [])

    const setType = (type) => setForm(prev => ({ ...prev, account_type: type, document: '' }))

    const onDocument = (e) => {
        let v = e.target.value.replace(/\D/g, '')
        if (form.account_type === 'PF') {
            v = v.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2').slice(0, 14)
        } else {
            v = v.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2').slice(0, 18)
        }
        setForm(prev => ({ ...prev, document: v }))
    }

    const onPhoto = (e) => {
        const file = e.target.files[0]
        if (file) {
            const reader = new FileReader()
            reader.onload = () => setForm(prev => ({ ...prev, photo_url: reader.result }))
            reader.readAsDataURL(file)
            e.target.value = null
        }
    }

    const initial = (form.name || '').trim().charAt(0).toUpperCase()

    return (
        <div ref={overlayRef} className="cd-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
            <form
                className="cd-box wd-box"
                role="dialog"
                aria-modal="true"
                aria-labelledby="wd-title"
                onSubmit={(e) => { e.preventDefault(); if (!saving && form.name.trim()) onSave() }}
            >
                <h2 id="wd-title" className="cd-title">Nova carteira</h2>
                <p className="cd-message">Use uma carteira para o MEI e outra para o pessoal. Em cada lançamento você escolhe de qual carteira é.</p>

                <fieldset className="wd-field wd-types">
                    <legend>Tipo</legend>
                    <label className={`wd-type ${!isPJ ? 'is-on' : ''}`}>
                        <input type="radio" name="wd-type" checked={!isPJ} onChange={() => setType('PF')} />
                        <span><strong>Pessoal</strong><small>Com CPF</small></span>
                    </label>
                    <label className={`wd-type ${isPJ ? 'is-on' : ''}`}>
                        <input type="radio" name="wd-type" checked={isPJ} onChange={() => setType('PJ')} />
                        <span><strong>Empresa (MEI)</strong><small>Com CNPJ</small></span>
                    </label>
                </fieldset>

                <label className="wd-field">
                    <span>{isPJ ? 'Nome da empresa' : 'Nome da carteira'}</span>
                    <input
                        ref={nameRef}
                        type="text"
                        placeholder={isPJ ? 'Ex.: Doces da Ana' : 'Ex.: Conta pessoal'}
                        value={form.name}
                        onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                    />
                </label>

                <label className="wd-field">
                    <span>{isPJ ? 'CNPJ' : 'CPF'} <em>(opcional)</em></span>
                    <input
                        type="text"
                        inputMode="numeric"
                        placeholder={isPJ ? '00.000.000/0000-00' : '000.000.000-00'}
                        value={form.document}
                        onChange={onDocument}
                    />
                </label>

                <div className="wd-field wd-photo">
                    <span className="wd-photo__preview" aria-hidden="true">
                        {form.photo_url ? <img src={form.photo_url} alt="" /> : (initial || <Camera size={20} />)}
                    </span>
                    <label className="wd-photo__btn">
                        {form.photo_url ? 'Trocar foto' : 'Escolher foto'}
                        <input type="file" accept="image/*" onChange={onPhoto} />
                    </label>
                    <small>Opcional</small>
                </div>

                <div className="cd-actions">
                    <button type="button" className="cd-btn" onClick={onClose}>Cancelar</button>
                    <button type="submit" className="cd-btn cd-btn--primary" disabled={saving || !form.name.trim()}>
                        {saving ? 'Criando...' : 'Criar carteira'}
                    </button>
                </div>
            </form>
        </div>
    )
}

export default function Dashboard() {
    const { user } = useAuth()
    const { notify, dialog } = useConfirmDialog()
    const [simulations, setSimulations] = useState([])
    const [transactions, setTransactions] = useState([])
    const [loading, setLoading] = useState(true)
    const [stats, setStats] = useState({ totalSimulations: 0, avgRevenue: 0, limitStatus: 'success' })
    const [userPlan, setUserPlan] = useState(null)
    const [activeAlerts, setActiveAlerts] = useState([])
    const [isFinanceModalOpen, setIsFinanceModalOpen] = useState(false)
    const [cashFlowData, setCashFlowData] = useState([])
    const [cashFlowYear, setCashFlowYear] = useState(new Date().getFullYear())
    const [walletBreakdown, setWalletBreakdown] = useState([])
    const [walletBreakdownType, setWalletBreakdownType] = useState('DESPESA')
    const [showNewWalletModal, setShowNewWalletModal] = useState(false)
    const [newWalletForm, setNewWalletForm] = useState({ name: '', account_type: 'PF', document: '', photo_url: '' })
    const [savingWallet, setSavingWallet] = useState(false)
    const [cardSummary, setCardSummary] = useState(null)

    // Pagination
    const [simPage, setSimPage] = useState(1)
    const [transPage, setTransPage] = useState(1)
    const rowsPerPage = 12

    // Bills due today
    const [dueTodayBills, setDueTodayBills] = useState([])
    const [showDueTodayAlert, setShowDueTodayAlert] = useState(false)

    // Smart Filters
    const initRange = getDateRange('thisMonth')
    const [filterPreset, setFilterPreset] = useState('thisMonth')
    const [startDate, setStartDate] = useState(initRange.startDate)
    const [endDate, setEndDate] = useState(initRange.endDate)
    const [walletId, setWalletId] = useState('')
    const [wallets, setWallets] = useState([])
    const [isFilterOpen, setIsFilterOpen] = useState(false)

    const applyPreset = (preset) => {
        setFilterPreset(preset)
        if (preset !== 'custom') {
            const range = getDateRange(preset)
            setStartDate(range.startDate)
            setEndDate(range.endDate)
        }
        setIsFilterOpen(false)
    }

    // Fetch wallets for filter
    const fetchWallets = async () => {
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/finance/business-units', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (res.ok) {
                const data = await res.json()
                setWallets(Array.isArray(data) ? data : [])
            }
        } catch (err) {
            console.error(err)
        }
    }

    // Fetch initial data
    useEffect(() => {
        const init = async () => {
            await fetchUserPlan()
            await fetchStats()
            await fetchActiveAlerts()
        }
        init()
    }, [])

    // Fetch plan-dependent data (first load)
    useEffect(() => {
        if (userPlan) {
            if (userPlan.features?.historico) fetchSimulations()
            // Lançamentos disponíveis para todos os planos
            fetchTransactions()
            // Recursos guiados por features do plano (admin controla pelo painel)
            if (userPlan.features?.multi_carteiras || user?.isInTrial) fetchWallets()
            if (userPlan.features?.contas_pagar    || user?.isInTrial) fetchDueTodayBills()
            if (userPlan.features?.multi_carteiras || user?.isInTrial) fetchWalletBreakdown()
            if (userPlan.features?.historico       || user?.isInTrial) fetchCashFlowData(new Date().getFullYear())
            if (userPlan.features?.cartoes         || user?.isInTrial) fetchCardSummary()
            if (!userPlan.features?.historico) setLoading(false)
        }
    }, [userPlan])

    // Re-fetch when filters change
    useEffect(() => {
        if (userPlan) {
            fetchTransactions()
        }
        if (userPlan && (userPlan.features?.multi_carteiras || user?.isInTrial)) {
            fetchWalletBreakdown()
        }
    }, [startDate, endDate, walletId])

    // Re-fetch cash flow when year changes
    useEffect(() => {
        if (userPlan && (userPlan.features?.historico || user?.isInTrial)) {
            fetchCashFlowData(cashFlowYear)
        }
    }, [cashFlowYear])

    // Re-fetch wallet breakdown when type toggle changes
    useEffect(() => {
        if (userPlan && (userPlan.features?.multi_carteiras || user?.isInTrial)) {
            fetchWalletBreakdown()
        }
    }, [walletBreakdownType])

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
            const params = new URLSearchParams({ limit: '9999' })
            if (startDate) params.append('startDate', startDate)
            if (endDate) params.append('endDate', endDate)
            if (walletId) params.append('walletId', walletId)
            const res = await fetch(`/api/finance/transactions?${params}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (res.ok) {
                const response = await res.json()
                setTransactions(Array.isArray(response.data) ? response.data : Array.isArray(response) ? response : [])
            }
        } catch (error) {
            console.error('Erro ao buscar transações:', error)
        }
    }

    const fetchCashFlowData = async (year) => {
        try {
            const token = localStorage.getItem('token')
            const targetYear = year || cashFlowYear || new Date().getFullYear()
            const res = await fetch(`/api/finance/stats/cash-flow?year=${targetYear}`, {
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

    const fetchWalletBreakdown = async () => {
        try {
            const token = localStorage.getItem('token')
            const params = new URLSearchParams({ type: walletBreakdownType })
            if (startDate) params.append('startDate', startDate)
            if (endDate) params.append('endDate', endDate)
            const res = await fetch(`/api/finance/stats/wallet-breakdown?${params}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (res.ok) {
                const data = await res.json()
                setWalletBreakdown(Array.isArray(data) ? data : [])
            }
        } catch (error) {
            console.error('Erro ao buscar breakdown por carteira:', error)
        }
    }

    const fetchCardSummary = async () => {
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/finance/invoices/dashboard-summary', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (res.ok) {
                const data = await res.json()
                setCardSummary(data)
            }
        } catch (error) {
            console.error('Erro ao buscar resumo de cartões:', error)
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
        const safeTransactions = Array.isArray(transactions) ? transactions : []
        const paidTransactions = safeTransactions.filter(t => t.status !== 'PENDING')
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
        if (Array.isArray(cashFlowData) && cashFlowData.length > 0) return cashFlowData

        // Fallback placeholder: full year (12 months)
        return [
            { name: 'Jan', entrada: 0, saida: 0 },
            { name: 'Fev', entrada: 0, saida: 0 },
            { name: 'Mar', entrada: 0, saida: 0 },
            { name: 'Abr', entrada: 0, saida: 0 },
            { name: 'Mai', entrada: 0, saida: 0 },
            { name: 'Jun', entrada: 0, saida: 0 },
            { name: 'Jul', entrada: 0, saida: 0 },
            { name: 'Ago', entrada: 0, saida: 0 },
            { name: 'Set', entrada: 0, saida: 0 },
            { name: 'Out', entrada: 0, saida: 0 },
            { name: 'Nov', entrada: 0, saida: 0 },
            { name: 'Dez', entrada: 0, saida: 0 },
        ]
    }, [cashFlowData])

    const categoryData = useMemo(() => {
        const categories = {}
        const safeTransactions = Array.isArray(transactions) ? transactions : []
        safeTransactions.filter(t => t.type === 'DESPESA' && t.status !== 'PENDING').forEach(t => {
            const name = t.categoryName || 'Outros'
            categories[name] = (categories[name] || 0) + t.amount
        })
        return Object.entries(categories).map(([name, value]) => ({ name, value }))
    }, [transactions])


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
        const safeItems = Array.isArray(items) ? items : []
        const start = (page - 1) * rowsPerPage
        return safeItems.slice(start, start + rowsPerPage)
    }

    const PaginationControls = ({ current, total, onPageChange }) => {
        const totalPages = Math.ceil(total / rowsPerPage)
        if (totalPages <= 1) return null

        return (
            <nav className="painel-pages" aria-label="Páginas">
                <button
                    type="button"
                    className="painel-btn painel-btn--quiet"
                    disabled={current === 1}
                    onClick={() => onPageChange(current - 1)}
                >
                    <ChevronLeft size={16} aria-hidden="true" /> Anterior
                </button>
                <span><span className="painel-pages__word">Página </span>{current} de {totalPages}</span>
                <button
                    type="button"
                    className="painel-btn painel-btn--quiet"
                    disabled={current === totalPages}
                    onClick={() => onPageChange(current + 1)}
                >
                    Próxima <ChevronRight size={16} aria-hidden="true" />
                </button>
            </nav>
        )
    }

    const generatePDF = () => {
        try {
            const doc = new jsPDF()
            doc.setFontSize(22)
            doc.setTextColor(16, 185, 129)
            doc.text('Relatório EuSempreMEI', 14, 20)
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
            doc.save('relatorio-eusempremei.pdf')
        } catch (error) {
            console.error('Erro ao gerar PDF:', error)
        }
    }

    // Nova carteira (antes avisava erro com a janela do navegador)
    const closeWalletDialog = () => {
        setShowNewWalletModal(false)
        setNewWalletForm(EMPTY_WALLET)
    }

    const handleCreateWallet = async () => {
        setSavingWallet(true)
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/finance/business-units', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    name: newWalletForm.name,
                    account_type: newWalletForm.account_type,
                    cnpj: newWalletForm.document,
                    photo_url: newWalletForm.photo_url
                })
            })
            if (res.ok) {
                setShowNewWalletModal(false)
                setNewWalletForm(EMPTY_WALLET)
                fetchWalletBreakdown()
                fetchWallets()
            } else {
                const err = await res.json().catch(() => ({}))
                notify({
                    title: 'Não foi possível criar a carteira',
                    message: err.message || 'Tente de novo em instantes.',
                    tone: 'error'
                })
            }
        } catch (err) {
            console.error(err)
            notify({
                title: 'Sem conexão com o servidor',
                message: 'Confira a internet e tente de novo. Nada foi salvo.',
                tone: 'error'
            })
        } finally {
            setSavingWallet(false)
        }
    }

    // Menu de período: fecha ao tocar fora ou com Esc
    const filterRef = useRef(null)
    useEffect(() => {
        if (!isFilterOpen) return undefined
        const onDown = (e) => {
            if (filterRef.current && !filterRef.current.contains(e.target)) setIsFilterOpen(false)
        }
        const onKey = (e) => { if (e.key === 'Escape') setIsFilterOpen(false) }
        document.addEventListener('mousedown', onDown)
        document.addEventListener('touchstart', onDown)
        document.addEventListener('keydown', onKey)
        return () => {
            document.removeEventListener('mousedown', onDown)
            document.removeEventListener('touchstart', onDown)
            document.removeEventListener('keydown', onKey)
        }
    }, [isFilterOpen])

    // ── Dados já calculados, só arrumados para a tela ──────────────────────
    const canFilter = userPlan?.features?.multi_carteiras || user?.isInTrial
    const canSeeCharts = userPlan?.features?.historico || user?.isInTrial
    const canSeeCards = (userPlan?.features?.cartoes || user?.isInTrial) && cardSummary?.cards?.length > 0
    const firstName = user?.name?.split(' ')[0]
    const periodText = describePeriod(filterPreset, startDate, endDate)
    const selectedWallet = wallets.find(w => String(w.id) === String(walletId))
    const pjWallets = wallets.filter(w => w.account_type === 'PJ')
    const pfWallets = wallets.filter(w => w.account_type === 'PF')

    // Carteiras agrupadas (MEI / Pessoal) para as listas de escolha
    const walletGroups = [
        ...(pjWallets.length > 0 ? [{ group: 'MEI', options: pjWallets.map(w => ({ value: String(w.id), label: w.name })) }] : []),
        ...(pfWallets.length > 0 ? [{ group: 'Pessoal', options: pfWallets.map(w => ({ value: String(w.id), label: w.name })) }] : [])
    ]

    const { totalRevenue, totalExpense, balance, profitPJ, revenuePJ, expensePF, expensePJ } = financialSummary
    const flowMax = Math.max(totalRevenue, totalExpense, 1)
    const margin = revenuePJ > 0 ? Math.round((profitPJ / revenuePJ) * 100) : null
    const resultCaption = totalRevenue === 0 && totalExpense === 0
        ? 'Nenhum lançamento pago neste período.'
        : balance >= 0 ? 'Entrou mais dinheiro do que saiu.' : 'Saiu mais dinheiro do que entrou.'

    // O servidor manda o mês em inglês ("Feb") e os valores como texto; aqui viram "Fev" e número.
    // No ano atual, os meses que ainda não chegaram ficam de fora do gráfico.
    const nowYear = new Date().getFullYear()
    const chartData = memoizedCashFlowData
        .map((m, i) => ({ name: MONTH_NAMES[i] ? MONTH_NAMES[i].slice(0, 3).replace(/^./, c => c.toUpperCase()) : m.name, entrada: Number(m.entrada) || 0, saida: Number(m.saida) || 0 }))
        .slice(0, cashFlowYear === nowYear ? new Date().getMonth() + 1 : 12)

    const sortedCats = [...categoryData].sort((a, b) => b.value - a.value)
    const catTotal = sortedCats.reduce((acc, c) => acc + c.value, 0) || 1
    const shownCats = sortedCats.length > 6
        ? [...sortedCats.slice(0, 5), { name: 'Outras', value: sortedCats.slice(5).reduce((acc, c) => acc + c.value, 0) }]
        : sortedCats
    const catMax = Math.max(...shownCats.map(c => c.value), 1)

    const walletMax = Math.max(...walletBreakdown.map(w => Number(w.total) || 0), 1)

    const planName = userPlan?.name || user?.plan || 'Gratuito'
    const tier = tierOf(planName)
    const planNote = {
        gratuito: 'Com o Prata você usa o assistente no WhatsApp, contas a pagar com lembrete e várias carteiras.',
        prata: 'Com o Ouro você também manda áudio, foto de boleto e comprovante pelo WhatsApp.',
        ouro: 'Você tem todos os recursos do EuSempreMEI liberados.'
    }[tier]

    const dueTitle = (() => {
        if (!showDueTodayAlert || dueTodayBills.length === 0) return null
        const overdue = dueTodayBills.filter(b => b.alertType === 'OVERDUE').length
        const today = dueTodayBills.filter(b => b.alertType === 'DUE_TODAY').length
        if (overdue && today) return `${plural(overdue, 'conta vencida', 'contas vencidas')} e ${today} ${today === 1 ? 'vence' : 'vencem'} hoje`
        if (overdue) return plural(overdue, 'conta vencida', 'contas vencidas')
        return `${plural(today, 'conta vence', 'contas vencem')} hoje`
    })()

    return (
        <div className="painel">
            <div className="painel-container">

                {/* Topo: saudação, filtros e novo lançamento */}
                <header className="painel-head">
                    <h1 className="painel-title">Olá, {firstName}</h1>
                    <div className="painel-actions">
                        {canFilter && (
                            <>
                                <div className="painel-select">
                                    <Select
                                        variant="pill"
                                        ariaLabel="Carteira"
                                        value={walletId}
                                        active={walletId !== ''}
                                        onChange={(v) => setWalletId(String(v))}
                                        options={[
                                            { value: '', label: 'Todas as carteiras' },
                                            ...walletGroups
                                        ]}
                                    />
                                </div>

                                <div className="painel-filter" ref={filterRef}>
                                    <button
                                        type="button"
                                        className="painel-btn painel-btn--ghost"
                                        aria-haspopup="true"
                                        aria-expanded={isFilterOpen}
                                        onClick={() => setIsFilterOpen(!isFilterOpen)}
                                    >
                                        <Calendar size={16} aria-hidden="true" />
                                        {FILTER_LABELS[filterPreset]}
                                        <ChevronDown size={16} aria-hidden="true" />
                                    </button>

                                    {isFilterOpen && (
                                        <div className="painel-menu">
                                            {['thisMonth', 'lastMonth', 'thisYear', 'all'].map(p => (
                                                <button
                                                    key={p}
                                                    type="button"
                                                    className={`painel-menu__item ${filterPreset === p ? 'is-on' : ''}`}
                                                    aria-pressed={filterPreset === p}
                                                    onClick={() => applyPreset(p)}
                                                >
                                                    {FILTER_LABELS[p]}
                                                </button>
                                            ))}
                                            <div className="painel-menu__custom">
                                                <span>Outro período</span>
                                                <label>
                                                    De
                                                    <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setFilterPreset('custom') }} />
                                                </label>
                                                <label>
                                                    Até
                                                    <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setFilterPreset('custom') }} />
                                                </label>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}

                        <button type="button" className="painel-btn painel-btn--primary" onClick={() => setIsFinanceModalOpen(true)}>
                            <Plus size={18} aria-hidden="true" /> Novo lançamento
                        </button>
                    </div>
                </header>

                {/* Avisos */}
                {user?.trialExpired && user?.plan === 'Gratuito' && (
                    <div className="painel-notice" role="status">
                        <div className="painel-notice__text">
                            <strong>Seu teste grátis terminou</strong>
                            <span>Para continuar com finanças, alertas e gráficos, escolha um plano.</span>
                        </div>
                        <div className="painel-notice__actions">
                            <Link to="/planos" className="painel-btn painel-btn--primary">Ver planos</Link>
                        </div>
                    </div>
                )}

                {dueTitle && (
                    <div className="painel-notice" role="status">
                        <div className="painel-notice__text">
                            <strong>{dueTitle}</strong>
                            <span>Os valores e as datas estão em Contas a pagar.</span>
                        </div>
                        <div className="painel-notice__actions">
                            <button type="button" className="painel-btn painel-btn--quiet" onClick={handleSnooze}>Lembrar em 1 hora</button>
                            <Link to="/financas/contas" className="painel-btn painel-btn--primary">Ver contas a pagar</Link>
                        </div>
                    </div>
                )}

                {/* Resultado do período: o destaque da página */}
                <section className="painel-result" aria-labelledby="painel-result-title">
                    <div className="painel-result__main">
                        <h2 id="painel-result-title" className="painel-result__label">
                            Resultado de {periodText}
                            {selectedWallet && <span>Carteira {selectedWallet.name}</span>}
                        </h2>
                        <p className="painel-result__value">{formatCurrency(balance)}</p>
                        <p className="painel-result__caption">{resultCaption} Conta só os lançamentos já pagos.</p>
                    </div>
                    <dl className="painel-result__flow">
                        <div className="painel-flow painel-flow--in">
                            <dt>Entrou</dt>
                            <dd>
                                <span className="painel-flow__value">{formatCurrency(totalRevenue)}</span>
                                <span className="painel-flow__bar" aria-hidden="true"><i style={{ width: `${(totalRevenue / flowMax) * 100}%` }} /></span>
                            </dd>
                        </div>
                        <div className="painel-flow painel-flow--out">
                            <dt>Saiu</dt>
                            <dd>
                                <span className="painel-flow__value">{formatCurrency(totalExpense)}</span>
                                <span className="painel-flow__bar" aria-hidden="true"><i style={{ width: `${(totalExpense / flowMax) * 100}%` }} /></span>
                                <small>{formatCurrency(expensePJ)} do MEI e {formatCurrency(expensePF)} pessoal</small>
                            </dd>
                        </div>
                        <div className="painel-flow painel-flow--profit">
                            <dt>Lucro do MEI</dt>
                            <dd>
                                <span className="painel-flow__value">{formatCurrency(profitPJ)}</span>
                                {margin !== null && <small>Margem de {margin}% sobre o que o MEI recebeu</small>}
                            </dd>
                        </div>
                    </dl>
                </section>

                {/* Gráficos */}
                {canSeeCharts ? (
                    <section className="painel-block painel-charts" aria-label="Gráficos">
                        <div className="painel-chart">
                            <div className="painel-block__head">
                                <h2 className="painel-h2">Entradas e saídas em {cashFlowYear}</h2>
                                <div className="painel-year">
                                    <button type="button" className="painel-icon-btn" onClick={() => setCashFlowYear(prev => prev - 1)} aria-label="Ano anterior">
                                        <ChevronLeft size={18} aria-hidden="true" />
                                    </button>
                                    <button
                                        type="button"
                                        className="painel-icon-btn"
                                        onClick={() => setCashFlowYear(prev => prev + 1)}
                                        disabled={cashFlowYear >= nowYear}
                                        aria-label="Próximo ano"
                                    >
                                        <ChevronRight size={18} aria-hidden="true" />
                                    </button>
                                </div>
                            </div>
                            <p className="painel-muted">Todas as carteiras, só lançamentos pagos.</p>
                            <ul className="painel-legend" aria-hidden="true">
                                <li className="is-in">Entrou</li>
                                <li className="is-out">Saiu</li>
                            </ul>
                            <div className="painel-chart__area">
                                <ResponsiveContainer>
                                    <BarChart data={chartData} barGap={2} barCategoryGap="24%" margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
                                        <CartesianGrid vertical={false} stroke="#E3E8EF" />
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#5B6B80', fontSize: 12 }} interval="preserveStartEnd" minTickGap={6} />
                                        <YAxis axisLine={false} tickLine={false} width={72} tick={{ fill: '#5B6B80', fontSize: 12 }} tickFormatter={compactBRL} />
                                        <Tooltip
                                            cursor={{ fill: 'rgba(18, 40, 74, 0.05)' }}
                                            formatter={(value, name) => [formatCurrency(value), name === 'entrada' ? 'Entrou' : 'Saiu']}
                                            contentStyle={{ borderRadius: 12, border: '1px solid #E3E8EF', boxShadow: '0 10px 24px -12px rgba(18, 40, 74, 0.35)', fontSize: 13 }}
                                        />
                                        <Bar dataKey="entrada" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={22} />
                                        <Bar dataKey="saida" fill="#12284A" radius={[4, 4, 0, 0]} maxBarSize={22} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div className="painel-cats">
                            <h2 className="painel-h2">Despesas por categoria</h2>
                            <p className="painel-muted">Em {periodText}, só lançamentos pagos.</p>
                            {shownCats.length > 0 ? (
                                <ol className="painel-cats__list">
                                    {shownCats.map(c => (
                                        <li key={c.name}>
                                            <span className="painel-cats__name">{c.name}</span>
                                            <span className="painel-cats__value">{formatCurrency(c.value)}</span>
                                            <span className="painel-cats__bar" aria-hidden="true"><i style={{ width: `${(c.value / catMax) * 100}%` }} /></span>
                                            <span className="painel-cats__pct">{Math.round((c.value / catTotal) * 100)}%</span>
                                        </li>
                                    ))}
                                </ol>
                            ) : (
                                <p className="painel-empty">Nenhuma despesa neste período.</p>
                            )}
                        </div>
                    </section>
                ) : (
                    <section className="painel-block painel-locked">
                        <Lock size={18} aria-hidden="true" />
                        <div>
                            <h2 className="painel-h2">Gráficos de entradas, saídas e categorias</h2>
                            <p className="painel-muted">Fazem parte dos planos Prata e Ouro.</p>
                        </div>
                        <Link to="/planos" className="painel-btn painel-btn--ghost">Ver planos</Link>
                    </section>
                )}

                <div className="painel-columns">
                    <div className="painel-col">
                        {/* Últimos lançamentos — disponível para todos os planos */}
                        <section className="painel-block" aria-labelledby="painel-tx-title">
                            <div className="painel-block__head">
                                <h2 id="painel-tx-title" className="painel-h2">Últimos lançamentos</h2>
                                <Link to="/financas/extrato" className="painel-link">Ver extrato</Link>
                            </div>
                            {transactions.length === 0 ? (
                                <div className="painel-empty">
                                    <p>Nenhum lançamento em {periodText}.</p>
                                    <button type="button" className="painel-btn painel-btn--ghost" onClick={() => setIsFinanceModalOpen(true)}>
                                        <Plus size={16} aria-hidden="true" /> Novo lançamento
                                    </button>
                                </div>
                            ) : (
                                <ul className="painel-list">
                                    {paginate(transactions, transPage).map((t) => (
                                        <li key={t.id} className="painel-row">
                                            <span className="painel-row__date">{formatDate(t.date)}</span>
                                            <span className="painel-row__info">
                                                <strong>{t.categoryName || 'Sem categoria'}</strong>
                                                <span>
                                                    <em className="painel-tag">{t.target === 'BUSINESS' ? 'MEI' : 'PF'}</em>
                                                    {t.description || (t.type === 'RECEITA' ? 'Recebimento' : 'Pagamento')}
                                                </span>
                                            </span>
                                            <span className="painel-row__end">
                                                <span className={`painel-amount ${t.type === 'RECEITA' ? 'is-in' : 'is-out'}`}>
                                                    {t.type === 'RECEITA' ? '+' : '−'} {formatCurrency(t.amount)}
                                                </span>
                                                {t.status !== 'PAID' && <span className="painel-chip painel-chip--warn">Pendente</span>}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            <PaginationControls current={transPage} total={transactions.length} onPageChange={setTransPage} />
                        </section>

                        {/* Simulações salvas — Prata+ */}
                        <section className="painel-block" aria-labelledby="painel-sim-title">
                            <div className="painel-block__head">
                                <h2 id="painel-sim-title" className="painel-h2">Simulações salvas</h2>
                                <Link to="/simular" className="painel-link">Nova simulação</Link>
                            </div>
                            {!hasFeature('historico') ? (
                                <div className="painel-locked painel-locked--inline">
                                    <Lock size={18} aria-hidden="true" />
                                    <p className="painel-muted">Salvar e comparar suas simulações faz parte dos planos Prata e Ouro.</p>
                                    <Link to="/planos" className="painel-btn painel-btn--ghost">Ver planos</Link>
                                </div>
                            ) : simulations.length === 0 ? (
                                <p className="painel-empty">Nenhuma simulação salva ainda.</p>
                            ) : (
                                <ul className="painel-list">
                                    {paginate(simulations, simPage).map((s) => {
                                        const pct = Number(s.limitPercentage) || 0
                                        return (
                                            <li key={s.id} className="painel-row">
                                                <span className="painel-row__date">{formatDate(s.createdAt)}</span>
                                                <span className="painel-row__info">
                                                    <strong className="painel-cap">{s.activityType}</strong>
                                                    <span>Faturamento de {formatCurrency(s.revenue)}</span>
                                                </span>
                                                <span className={`painel-row__end painel-limit ${pct >= 90 ? 'is-warn' : ''}`}>
                                                    <span>{pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% do limite</span>
                                                    <span className="painel-limit__bar" aria-hidden="true"><i style={{ width: `${Math.min(pct, 100)}%` }} /></span>
                                                </span>
                                            </li>
                                        )
                                    })}
                                </ul>
                            )}
                            <PaginationControls current={simPage} total={simulations.length} onPageChange={setSimPage} />
                        </section>
                    </div>

                    <aside className="painel-col painel-side">
                        {/* Por carteira */}
                        {canFilter && (
                            <section className="painel-block" aria-labelledby="painel-wallet-title">
                                <div className="painel-block__head">
                                    <h2 id="painel-wallet-title" className="painel-h2">Por carteira</h2>
                                    <button type="button" className="painel-link" onClick={() => setShowNewWalletModal(true)}>
                                        <Plus size={16} aria-hidden="true" /> Nova carteira
                                    </button>
                                </div>
                                <div className="painel-seg" role="group" aria-label="Mostrar por carteira">
                                    <button type="button" aria-pressed={walletBreakdownType === 'DESPESA'} onClick={() => setWalletBreakdownType('DESPESA')}>Despesas</button>
                                    <button type="button" aria-pressed={walletBreakdownType === 'RECEITA'} onClick={() => setWalletBreakdownType('RECEITA')}>Receitas</button>
                                </div>
                                {walletBreakdown.length > 0 ? (
                                    <ul className="painel-wallets">
                                        {walletBreakdown.map(w => {
                                            const total = Number(w.total) || 0
                                            return (
                                                <li key={w.id}>
                                                    <span className="painel-avatar" aria-hidden="true">
                                                        {w.logo_url ? <img src={w.logo_url} alt="" /> : (w.name || '?').trim().charAt(0).toUpperCase()}
                                                    </span>
                                                    <span className="painel-wallets__info">
                                                        <strong>{w.name}</strong>
                                                        <small>{w.account_type === 'PJ' ? 'MEI' : 'Pessoal'}</small>
                                                    </span>
                                                    <span className="painel-wallets__value">{formatCurrency(total)}</span>
                                                    <span className={`painel-wallets__bar ${walletBreakdownType === 'RECEITA' ? 'is-in' : 'is-out'}`} aria-hidden="true">
                                                        <i style={{ width: `${(total / walletMax) * 100}%` }} />
                                                    </span>
                                                </li>
                                            )
                                        })}
                                    </ul>
                                ) : (
                                    <p className="painel-empty">Nenhuma carteira ainda. Crie uma para separar o dinheiro do MEI do pessoal.</p>
                                )}
                            </section>
                        )}

                        {/* Cartões */}
                        {canSeeCards && (
                            <section className="painel-block" aria-labelledby="painel-cards-title">
                                <div className="painel-block__head">
                                    <h2 id="painel-cards-title" className="painel-h2">Cartões de crédito</h2>
                                    <Link to="/financas/cartoes" className="painel-link">Ver cartões</Link>
                                </div>
                                <ul className="painel-cards">
                                    {cardSummary.cards.map(card => {
                                        const paid = card.currentMonthStatus === 'PAID'
                                        return (
                                            <li key={card.id}>
                                                <Link to={`/financas/cartoes/${card.id}`} className="painel-card">
                                                    <span className="painel-card__name">
                                                        <strong>{card.name}</strong>
                                                        <small>{card.brand ? `${card.brand}, final ${card.lastFour || '****'}` : `Final ${card.lastFour || '****'}`}</small>
                                                    </span>
                                                    <span className="painel-card__bill">
                                                        <small>Fatura atual</small>
                                                        <strong>{formatCurrency(card.currentMonthTotal)}</strong>
                                                    </span>
                                                    <span className="painel-card__meta">
                                                        <span className={`painel-chip ${paid ? 'painel-chip--ok' : 'painel-chip--warn'}`}>{paid ? 'Paga' : 'Em aberto'}</span>
                                                        <span>Vence dia {card.dueDate || '--'}</span>
                                                    </span>
                                                    {card.nextMonthTotal > 0 && (
                                                        <small className="painel-card__next">Próximo mês: {formatCurrency(card.nextMonthTotal)}</small>
                                                    )}
                                                </Link>
                                            </li>
                                        )
                                    })}
                                </ul>
                            </section>
                        )}

                        {/* Atalhos */}
                        <section className="painel-block" aria-labelledby="painel-short-title">
                            <h2 id="painel-short-title" className="painel-h2">Atalhos</h2>
                            <ul className="painel-shortcuts">
                                <li>
                                    <Link to="/simular"><Calculator size={18} aria-hidden="true" /> Simular imposto</Link>
                                </li>
                                <li>
                                    <Link to="/comparativo"><Scale size={18} aria-hidden="true" /> Comparar MEI e ME</Link>
                                </li>
                                <li>
                                    <Link to="/financas/cartoes"><CreditCard size={18} aria-hidden="true" /> Cartões de crédito</Link>
                                </li>
                                <li>
                                    {hasFeature('pdf') ? (
                                        <button type="button" onClick={generatePDF}><FileDown size={18} aria-hidden="true" /> Baixar relatório em PDF</button>
                                    ) : (
                                        <Link to="/planos" className="is-locked">
                                            <Lock size={18} aria-hidden="true" /> Relatório em PDF
                                            <small>a partir do Prata</small>
                                        </Link>
                                    )}
                                </li>
                            </ul>
                        </section>

                        {/* Plano */}
                        <section className={`painel-block painel-plan painel-plan--${tier}`} aria-labelledby="painel-plan-title">
                            <h2 id="painel-plan-title" className="painel-h2">Seu plano: {planName}</h2>
                            <p className="painel-muted">{planNote}</p>
                            <Link to={tier === 'ouro' ? '/conta' : '/planos'} className="painel-link">
                                {tier === 'ouro' ? 'Ver minha conta' : 'Comparar planos'}
                            </Link>
                        </section>
                    </aside>
                </div>
            </div>

            {isFinanceModalOpen && (
                <FinanceQuickActionModal
                    onClose={() => setIsFinanceModalOpen(false)}
                    onWalletCreated={() => {
                        if (userPlan?.features?.multi_carteiras || user?.isInTrial) {
                            fetchWallets()
                            fetchWalletBreakdown()
                        }
                    }}
                    onSuccess={() => {
                        fetchTransactions()
                        fetchStats()
                        fetchDueTodayBills()
                        fetchCashFlowData(cashFlowYear)
                    }}
                />
            )}

            {showNewWalletModal && (
                <NewWalletDialog
                    form={newWalletForm}
                    setForm={setNewWalletForm}
                    saving={savingWallet}
                    onSave={handleCreateWallet}
                    onClose={closeWalletDialog}
                />
            )}

            {dialog}
        </div>
    )
}
