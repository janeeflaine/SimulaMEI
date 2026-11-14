import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
    ChevronLeft, ChevronRight, Wallet, TrendingUp, TrendingDown, CalendarDays, CalendarCheck, ReceiptText,
    Tags, ShoppingBag, Gauge, Lightbulb, BarChart3, PieChart, Table2, Plus, Upload, Lock, Pencil, Trash2,
    Search, CreditCard, X
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import FeatureLock from '../../components/FeatureLock'
import Select from '../../components/ui/Select'
import { useConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Stat, Block, BarList } from '../../components/cards/CardsSummaryPanel'
import MonthlyTrendChart from '../../components/cards/charts/MonthlyTrendChart'
import { buildMonthlyTrend } from '../../utils/cardsDashboard/buildMonthlyTrend'
import './CardDashboard.css'

const MONTHS = ['', 'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const MONTHS_SHORT = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const STATUS = { PAID: 'Paga', PARTIAL: 'Paga em parte', OVERDUE: 'Atrasada', PENDING: 'Aberta' }
const BRANDS = { Amex: 'American Express', Outro: '' }
const MAX_AMOUNT = 100000000
const REVIEW_BELOW = 0.6 // categoria sugerida pela leitura da fatura com pouca certeza

const brl = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const plural = (n, one, many) => `${n.toLocaleString('pt-BR')} ${n === 1 ? one : many}`
const pad = (n) => String(n).padStart(2, '0')
const todayISO = () => new Date().toLocaleDateString('sv-SE')
const formatDate = (value) => {
    if (!value) return '—'
    const [y, m, d] = String(value).slice(0, 10).split('-')
    return y && m && d ? `${d}/${m}/${y}` : '—'
}
const shortDate = (value) => formatDate(value).slice(0, 5)
const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)
const daysInMonth = (year, month) => new Date(year, month, 0).getDate()
// Uso do limite: abaixo de 10% com uma casa (0,2%), para não mostrar 0% com fatura aberta
const limitUse = (total, limit) => {
    const pct = (total / limit) * 100
    if (pct > 0 && pct < 0.1) return 'menos de 0,1%'
    return `${pct.toLocaleString('pt-BR', { maximumFractionDigits: pct < 10 ? 1 : 0 })}%`
}

// "1.234,56", "45,9", "R$ 10" → número. Volta NaN se não for valor.
const parseMoney = (text) => {
    let s = String(text ?? '').replace(/[R$\s]/g, '')
    if (!s) return NaN
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
    return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN
}
const toMoneyText = (n) => Math.abs(Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Plano mais barato que libera um recurso (o admin decide os recursos de cada plano)
const planWith = (plans, feature, fallback) => {
    const found = (plans || []).filter(p => p.features?.[feature]).sort((a, b) => Number(a.price) - Number(b.price))[0]
    return found?.name || fallback
}

const NEW_CATEGORY = '__nova__'
const emptyForm = { description: '', amount: '', refund: false, transactionDate: '', category: '', month: '' }

export default function CardDashboard() {
    const { id: cardId } = useParams()
    const navigate = useNavigate()
    const { user } = useAuth()
    const { confirm, notify, dialog } = useConfirmDialog()
    const token = localStorage.getItem('token')
    const authHeaders = useMemo(() => ({ 'Authorization': `Bearer ${token}` }), [token])

    const now = new Date()
    const currentYear = now.getFullYear()
    const maxYear = currentYear + (now.getMonth() === 11 ? 1 : 0) // em dezembro já existe a fatura de janeiro

    const [year, setYear] = useState(currentYear)
    const [data, setData] = useState(null)
    const [invoices, setInvoices] = useState([]) // faturas do ano (id, mês, vencimento)
    const [loadState, setLoadState] = useState('loading') // loading | ok | notfound | error
    const [selectedMonth, setSelectedMonth] = useState(null)
    const [items, setItems] = useState([])
    const [itemsState, setItemsState] = useState('idle') // idle | loading | ok | error
    const [search, setSearch] = useState('')
    const [selectedIds, setSelectedIds] = useState(new Set())
    const [busy, setBusy] = useState(false)
    const [categories, setCategories] = useState([])
    const [plans, setPlans] = useState([])

    const [form, setForm] = useState(null) // null = janela fechada; { mode: 'add' | 'edit', item? }
    const [formData, setFormData] = useState(emptyForm)
    const [formError, setFormError] = useState('')
    const [saving, setSaving] = useState(false)
    const [newCat, setNewCat] = useState(null) // null = fechado; texto do nome da categoria nova
    const [creatingCat, setCreatingCat] = useState(false)

    const summaryReq = useRef(0)
    const itemsReq = useRef(0)
    const monthsRef = useRef(null)

    const hasCartoes = user?.planFeatures?.cartoes || user?.isInTrial || user?.role === 'ADMIN'
    const hasUploadFaturas = user?.planFeatures?.upload_faturas || user?.isInTrial || user?.role === 'ADMIN'

    // Planos: para dizer em qual plano está cada recurso
    useEffect(() => {
        fetch('/api/plans').then(r => (r.ok ? r.json() : [])).then(list => setPlans(Array.isArray(list) ? list : [])).catch(() => {})
    }, [])

    // Resumo do ano + faturas do ano (para achar a fatura de cada mês)
    const fetchSummary = useCallback(async ({ keepMonth = false } = {}) => {
        const req = ++summaryReq.current
        if (!keepMonth) setLoadState('loading')
        try {
            const [sumRes, invRes] = await Promise.all([
                fetch(`/api/finance/invoices/card/${cardId}/summary?year=${year}`, { headers: authHeaders }),
                fetch(`/api/finance/invoices?cardId=${cardId}&year=${year}`, { headers: authHeaders })
            ])
            if (req !== summaryReq.current) return
            if (sumRes.status === 404 || sumRes.status === 400) { setLoadState('notfound'); return }
            if (!sumRes.ok) throw new Error('summary')
            const result = await sumRes.json()
            const list = invRes.ok ? await invRes.json() : []
            if (req !== summaryReq.current) return
            setData(result)
            setInvoices(Array.isArray(list) ? list.filter(inv => Number(inv.referenceYear) === Number(year)) : [])
            setLoadState('ok')

            if (!keepMonth) {
                // Abre o mês atual se tiver fatura; senão a última fatura do ano
                const months = (result.monthlyTotals || []).map(m => Number(m.referenceMonth))
                const thisMonth = now.getMonth() + 1
                let pick = null
                if (year === currentYear && months.includes(thisMonth)) pick = thisMonth
                else if (months.length) pick = months[months.length - 1]
                else if (year === currentYear) pick = thisMonth
                setSelectedMonth(pick)
                setSelectedIds(new Set())
                setSearch('')
            }
        } catch (err) {
            if (req !== summaryReq.current) return
            console.error('Painel do cartão:', err)
            setLoadState('error')
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cardId, year, authHeaders, currentYear])

    const invoiceOf = useCallback((month) => invoices.find(inv => Number(inv.referenceMonth) === Number(month)), [invoices])

    const fetchItems = useCallback(async () => {
        const req = ++itemsReq.current
        const invoice = selectedMonth ? invoiceOf(selectedMonth) : null
        if (!invoice) { setItems([]); setItemsState('ok'); return }
        setItemsState('loading')
        try {
            const res = await fetch(`/api/finance/invoices/${invoice.id}/items`, { headers: authHeaders })
            if (req !== itemsReq.current) return
            if (!res.ok) throw new Error('items')
            const list = await res.json()
            if (req !== itemsReq.current) return
            setItems(Array.isArray(list) ? list : [])
            setItemsState('ok')
        } catch (err) {
            if (req !== itemsReq.current) return
            console.error('Compras da fatura:', err)
            setItemsState('error')
        }
    }, [selectedMonth, invoiceOf, authHeaders])

    const fetchCategories = useCallback(async () => {
        try {
            const res = await fetch('/api/finance/categories', { headers: authHeaders })
            if (res.ok) setCategories(await res.json())
        } catch { /* sem categorias, o campo fica só com "Sem categoria" */ }
    }, [authHeaders])

    useEffect(() => { if (hasCartoes) fetchSummary() }, [hasCartoes, fetchSummary])
    useEffect(() => { if (hasCartoes) fetchCategories() }, [hasCartoes, fetchCategories])
    useEffect(() => { if (loadState === 'ok') fetchItems() }, [loadState, fetchItems])

    // No celular os meses rolam de lado: mostra o mês escolhido
    useEffect(() => {
        const box = monthsRef.current
        const chip = box?.querySelector('.pc-month.is-active')
        if (!box || !chip) return
        box.scrollLeft = Math.max(0, chip.offsetLeft - box.offsetLeft - (box.clientWidth - chip.offsetWidth) / 2)
    }, [selectedMonth, loadState])

    const refresh = async () => {
        await fetchSummary({ keepMonth: true })
    }

    const card = data?.card
    // Categorias que combinam com a carteira do cartão: MEI usa despesas do MEI
    const categoryType = card?.walletType === 'PJ' ? 'DESPESA_MEI' : 'DESPESA_PESSOAL'
    const cardCategories = useMemo(() => {
        const seen = new Set()
        return categories
            .filter(c => c.type === categoryType)
            .filter(c => { const k = c.name.trim().toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true })
            .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    }, [categories, categoryType])

    // ── Números do ano ──────────────────────────────────────────────────
    const stats = useMemo(() => {
        if (!data) return null
        const months = (data.monthlyTotals || [])
            .map(m => ({ month: Number(m.referenceMonth), total: Number(m.totalAmount) || 0, status: m.status, dueDate: m.dueDate }))
            .sort((a, b) => a.month - b.month)
        const withSpend = months.filter(m => m.total > 0)
        const totalSpent = Number(data.totalSpent) || 0
        const average = withSpend.length ? totalSpent / withSpend.length : 0
        const top = withSpend.reduce((a, m) => (!a || m.total > a.total ? m : a), null)
        const low = withSpend.length > 1 ? withSpend.reduce((a, m) => (!a || m.total < a.total ? m : a), null) : null
        const last = months.length ? months[months.length - 1] : null
        const previous = last ? months.find(m => m.month === last.month - 1) : null
        const change = last && previous && previous.total > 0 ? Math.round(((last.total - previous.total) / previous.total) * 100) : null

        const categoriesYear = (data.categoryBreakdown || []).map(c => ({ name: c.category, total: Number(c.total) || 0, count: Number(c.count) || 0 }))
        const purchases = categoriesYear.reduce((s, c) => s + c.count, 0)
        const namedCategories = categoriesYear.filter(c => c.name !== 'Sem Categoria' && c.total > 0)
        const topCategory = namedCategories.sort((a, b) => b.total - a.total)[0] || null
        const uncategorized = categoriesYear.find(c => c.name === 'Sem Categoria')
        // Parte de cada categoria: sobre o que foi comprado (sem os estornos), para nunca passar de 100%
        const purchasedTotal = categoriesYear.reduce((s, c) => s + Math.max(c.total, 0), 0)
        const shareOf = (value) => (purchasedTotal > 0 && value > 0 ? Math.round((value / purchasedTotal) * 100) : 0)
        const limit = Number(data.creditLimit) || 0

        return { months, withSpend, totalSpent, average, top, low, last, previous, change, categoriesYear, purchases, topCategory, uncategorized, limit, shareOf }
    }, [data])

    const insights = useMemo(() => {
        if (!stats || !stats.withSpend.length) return []
        const list = []
        if (stats.top && stats.withSpend.length > 1 && stats.average > 0) {
            const above = Math.round(((stats.top.total - stats.average) / stats.average) * 100)
            if (above > 0) list.push(`${capitalize(MONTHS[stats.top.month])} foi o mês mais caro: ${brl(stats.top.total)}, ${above}% acima da média.`)
        }
        if (stats.topCategory) {
            list.push(`${stats.topCategory.name} levou ${stats.shareOf(stats.topCategory.total)}% das compras no cartão em ${year}.`)
        }
        if (stats.change !== null && stats.change !== 0 && stats.last && stats.previous) {
            const diff = Math.abs(stats.last.total - stats.previous.total)
            list.push(`A fatura de ${MONTHS[stats.last.month]} ficou ${brl(diff)} ${stats.change > 0 ? 'maior' : 'menor'} que a de ${MONTHS[stats.previous.month]}.`)
        }
        if (stats.uncategorized && stats.uncategorized.count > 0) {
            list.push(`${plural(stats.uncategorized.count, 'compra está', 'compras estão')} sem categoria (${brl(stats.uncategorized.total)}). Com categoria, os relatórios ficam mais certos.`)
        }
        return list
    }, [stats, year])

    // ── Compras do mês escolhido ────────────────────────────────────────
    const selectedInvoice = selectedMonth ? invoiceOf(selectedMonth) : null
    const monthTotal = items.reduce((s, i) => s + (Number(i.amount) || 0), 0)
    // Estorno é dinheiro que volta: o total da fatura é compras menos estornos
    const monthRefunds = items.reduce((s, i) => s + Math.min(Number(i.amount) || 0, 0), 0)
    const monthPurchases = monthTotal - monthRefunds
    // Lidas pela IA e ainda não conferidas: estão na fatura, mas não no Extrato
    const unconfirmedCount = items.filter(i => i.isConfirmed === false).length
    const toReview = items.filter(i => !i.categoryId || (Number(i.aiConfidence) > 0 && Number(i.aiConfidence) < REVIEW_BELOW)).length
    const visibleItems = useMemo(() => {
        const q = search.trim().toLowerCase()
        if (!q) return items
        return items.filter(i => `${i.description} ${i.categoryName || i.aiCategory || ''}`.toLowerCase().includes(q))
    }, [items, search])
    const selectedTotal = items.filter(i => selectedIds.has(i.id)).reduce((s, i) => s + (Number(i.amount) || 0), 0)
    const allVisibleSelected = visibleItems.length > 0 && visibleItems.every(i => selectedIds.has(i.id))

    const chooseMonth = (month) => {
        setSelectedMonth(month)
        setSelectedIds(new Set())
        setSearch('')
    }

    const toggleItem = (id) => setSelectedIds(prev => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
    })

    const toggleAllVisible = () => setSelectedIds(prev => {
        const next = new Set(prev)
        if (allVisibleSelected) visibleItems.forEach(i => next.delete(i.id))
        else visibleItems.forEach(i => next.add(i.id))
        return next
    })

    // ── Janela de compra (adicionar / editar) ───────────────────────────
    const categoryValueOf = (item) => {
        if (item.categoryId) return `id:${item.categoryId}`
        if (item.aiCategory) return `ai:${item.aiCategory}`
        return ''
    }

    const openAdd = () => {
        const month = selectedMonth || (year === currentYear ? now.getMonth() + 1 : 12)
        setFormData({ ...emptyForm, transactionDate: todayISO(), month: String(month) })
        setFormError('')
        setNewCat(null)
        setForm({ mode: 'add' })
    }

    const openEdit = (item) => {
        const amount = Number(item.amount) || 0
        setFormData({
            description: item.description || '',
            amount: toMoneyText(amount),
            refund: amount < 0,
            transactionDate: item.transactionDate ? String(item.transactionDate).slice(0, 10) : '',
            category: categoryValueOf(item),
            month: String(selectedMonth)
        })
        setFormError('')
        setNewCat(null)
        setForm({ mode: 'edit', item })
    }

    const closeForm = useCallback(() => { if (!saving) { setForm(null); setNewCat(null) } }, [saving])
    const setField = (field, value) => setFormData(prev => ({ ...prev, [field]: value }))

    // Esc fecha a janela (se um aviso estiver por cima, o Esc é dele)
    useEffect(() => {
        if (!form) return undefined
        const onKey = (e) => {
            if (e.key !== 'Escape' || e.defaultPrevented) return
            if (newCat !== null) { setNewCat(null); return }
            closeForm()
        }
        window.addEventListener('keydown', onKey)
        const { overflow } = document.body.style
        document.body.style.overflow = 'hidden'
        return () => {
            window.removeEventListener('keydown', onKey)
            document.body.style.overflow = overflow
        }
    }, [form, newCat, closeForm])

    const categoryOptions = useMemo(() => {
        const options = [{ value: '', label: 'Sem categoria' }]
        const current = form?.mode === 'edit' ? form.item : null
        // Categoria atual que não está na lista (de outro tipo, ou sugestão da leitura)
        if (current?.categoryId && !cardCategories.some(c => c.id === current.categoryId)) {
            options.push({ value: `id:${current.categoryId}`, label: current.categoryName || 'Categoria atual' })
        }
        if (current && !current.categoryId && current.aiCategory) {
            options.push({ value: `ai:${current.aiCategory}`, label: `${current.aiCategory} (sugerida)` })
        }
        if (cardCategories.length) {
            options.push({
                group: card?.walletType === 'PJ' ? 'Despesas do MEI' : 'Despesas pessoais',
                options: cardCategories.map(c => ({ value: `id:${c.id}`, label: c.name }))
            })
        }
        // No fim da lista, para achar sem procurar o link embaixo do campo
        options.push({ value: NEW_CATEGORY, label: '+ Criar categoria nova' })
        return options
    }, [cardCategories, form, card?.walletType])

    const monthOptions = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `${capitalize(MONTHS[i + 1])} de ${year}` }))

    const handleCreateCategory = async () => {
        const name = (newCat || '').trim()
        if (!name) return
        if (name.length > 60) { setFormError('O nome da categoria pode ter até 60 letras.'); return }
        setCreatingCat(true)
        setFormError('')
        try {
            const res = await fetch('/api/finance/categories', {
                method: 'POST',
                headers: { ...authHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, type: categoryType })
            })
            const body = await res.json().catch(() => ({}))
            if (res.status === 409 && body?.id) {
                // Já existe com esse nome: usa a que já existe
                setField('category', `id:${body.id}`)
                setNewCat(null)
                return
            }
            if (!res.ok || !body?.id) {
                setFormError(body.message || 'Não deu para criar a categoria. Tente de novo.')
                return
            }
            setCategories(prev => [...prev, body])
            setField('category', `id:${body.id}`)
            setNewCat(null)
        } catch {
            setFormError('Sem conexão. Verifique a internet e tente de novo.')
        } finally {
            setCreatingCat(false)
        }
    }

    // Fatura do mês: usa a que existe ou cria (vencimento no dia do cartão, sem passar do fim do mês)
    const ensureInvoice = async (month) => {
        const existing = invoiceOf(month)
        if (existing) return existing
        const day = Math.min(Number(card?.dueDate) || 10, daysInMonth(year, month))
        const res = await fetch('/api/finance/invoices', {
            method: 'POST',
            headers: { ...authHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ cardId: Number(cardId), referenceMonth: month, referenceYear: year, dueDate: `${year}-${pad(month)}-${pad(day)}` })
        })
        if (res.status === 409) {
            // Criada agora por outra aba: busca de novo
            const list = await fetch(`/api/finance/invoices?cardId=${cardId}&year=${year}`, { headers: authHeaders }).then(r => (r.ok ? r.json() : []))
            const found = list.find(inv => Number(inv.referenceMonth) === month && Number(inv.referenceYear) === year)
            if (found) return found
        }
        const body = await res.json().catch(() => ({}))
        if (!res.ok || !body?.id) throw new Error(body.message || 'Não deu para abrir a fatura desse mês.')
        return body
    }

    const handleSave = async (e) => {
        e.preventDefault()
        const description = formData.description.trim()
        const value = parseMoney(formData.amount)
        if (!description) { setFormError('Escreva a descrição da compra.'); return }
        if (!Number.isFinite(value) || value <= 0) { setFormError('Informe o valor da compra, por exemplo 45,90.'); return }
        if (value > MAX_AMOUNT) { setFormError('Esse valor está alto demais. Confira os números.'); return }
        const amount = formData.refund ? -value : value

        const category = formData.category
        const categoryPart = category.startsWith('id:')
            ? { categoryId: Number(category.slice(3)) }
            : category.startsWith('ai:') ? { categoryName: category.slice(3) } : { categoryId: null }

        setSaving(true)
        setFormError('')
        try {
            if (form.mode === 'add') {
                const month = Number(formData.month)
                const invoice = await ensureInvoice(month)
                const res = await fetch(`/api/finance/invoices/${invoice.id}/items`, {
                    method: 'POST',
                    headers: { ...authHeaders, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        description,
                        amount,
                        transactionDate: formData.transactionDate || null,
                        categoryId: categoryPart.categoryId ?? null,
                        isConfirmed: true
                    })
                })
                const body = await res.json().catch(() => ({}))
                if (!res.ok) { setFormError(body.message || 'Não deu para adicionar a compra. Tente de novo.'); return }
                setForm(null)
                if (month !== selectedMonth) chooseMonth(month)
                await refresh() // as faturas novas fazem a lista de compras recarregar
            } else {
                const res = await fetch(`/api/finance/invoices/items/${form.item.id}`, {
                    method: 'PATCH',
                    headers: { ...authHeaders, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ description, amount, transactionDate: formData.transactionDate || null, ...categoryPart })
                })
                const body = await res.json().catch(() => ({}))
                if (!res.ok) { setFormError(body.message || 'Não deu para salvar a compra. Tente de novo.'); return }
                setForm(null)
                await refresh()
            }
        } catch (err) {
            setFormError(err?.message && err.message !== 'Failed to fetch' ? err.message : 'Sem conexão. Verifique a internet e tente de novo.')
        } finally {
            setSaving(false)
        }
    }

    // ── Excluir ─────────────────────────────────────────────────────────
    const deleteItems = async (ids, label) => {
        const ok = await confirm({
            title: ids.length === 1 ? `Excluir ${label}?` : `Excluir ${ids.length} compras?`,
            message: ids.length === 1
                ? 'A compra sai da fatura e do Extrato. Isso não pode ser desfeito.'
                : 'As compras saem da fatura e do Extrato. Isso não pode ser desfeito.',
            details: ids.length > 1 ? [{ label: 'Total das compras', value: brl(selectedTotal), strong: true }] : [],
            confirmLabel: ids.length === 1 ? 'Excluir compra' : `Excluir ${ids.length} compras`,
            tone: 'danger'
        })
        if (!ok) return
        setBusy(true)
        try {
            const res = ids.length === 1
                ? await fetch(`/api/finance/invoices/items/${ids[0]}`, { method: 'DELETE', headers: authHeaders })
                : await fetch('/api/finance/invoices/items/bulk-delete', {
                    method: 'POST',
                    headers: { ...authHeaders, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ids })
                })
            if (!res.ok) {
                const body = await res.json().catch(() => ({}))
                notify({ title: 'Não deu para excluir', message: body.message || 'Tente de novo em instantes.', tone: 'error' })
                return
            }
            setSelectedIds(prev => { const next = new Set(prev); ids.forEach(id => next.delete(id)); return next })
            await refresh()
        } catch {
            notify({ title: 'Sem conexão', message: 'Não deu para excluir. Verifique a internet e tente de novo.', tone: 'error' })
        } finally {
            setBusy(false)
        }
    }

    const askUpgrade = async () => {
        const plan = planWith(plans, 'upload_faturas', 'Prata')
        const ok = await confirm({
            title: 'Leitura de faturas com IA',
            message: `Envie o PDF ou a foto da fatura e as compras entram sozinhas, já com categoria. Está no plano ${plan}.`,
            confirmLabel: 'Ver planos',
            cancelLabel: 'Agora não'
        })
        if (ok) navigate('/planos')
    }

    // ── Telas sem dados ─────────────────────────────────────────────────
    if (!hasCartoes) {
        return (
            <div className="painel-cartao">
                <div className="pc-container">
                    <FeatureLock
                        featureName="Painel do cartão"
                        requiredPlan={planWith(plans, 'cartoes', 'Prata')}
                        description="Veja os gastos de cada cartão mês a mês, por categoria, e as compras de cada fatura."
                        icon={<CreditCard size={28} aria-hidden="true" />}
                    />
                </div>
            </div>
        )
    }

    if (loadState === 'notfound') {
        return (
            <div className="painel-cartao">
                <div className="pc-container">
                    <div className="pc-empty">
                        <span className="pc-empty__icon" aria-hidden="true"><CreditCard size={26} /></span>
                        <h1>Cartão não encontrado</h1>
                        <p>Esse cartão não existe ou não é da sua conta.</p>
                        <Link to="/financas/cartoes" className="btn btn-primary">Ver meus cartões</Link>
                    </div>
                </div>
            </div>
        )
    }

    if (loadState === 'error' && !data) {
        return (
            <div className="painel-cartao">
                <div className="pc-container">
                    <Link to="/financas/cartoes" className="pc-back"><ChevronLeft size={18} aria-hidden="true" /> Cartões</Link>
                    <div className="csp-message" role="alert">
                        <p>Não deu para carregar o painel do cartão.</p>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => fetchSummary()}>Tentar de novo</button>
                    </div>
                </div>
            </div>
        )
    }

    const loadingFirst = !data
    const brand = card ? (BRANDS[card.brand] ?? card.brand ?? '') : ''
    const isPJ = card?.walletType === 'PJ'
    const hasYearData = !!stats && stats.months.length > 0
    const trend = buildMonthlyTrend((stats?.months || []).map(m => ({ month: m.month, total: m.total })))
    const lastMonthName = stats?.last ? MONTHS[stats.last.month] : ''

    return (
        <div className="painel-cartao">
            <div className="pc-container">
                <Link to="/financas/cartoes" className="pc-back"><ChevronLeft size={18} aria-hidden="true" /> Cartões</Link>

                {/* ── Cartão ── */}
                {loadingFirst ? (
                    <div className="pc-hero pc-hero--loading" aria-busy="true"><span /><span /></div>
                ) : (
                    <header className="pc-hero">
                        {/* O mesmo cartão de plástico da página Cartões */}
                        <div
                            className={`cc-plastic pc-plastic ${card.imageUrl ? 'has-image' : ''}`}
                            style={card.imageUrl ? { backgroundImage: `url("${String(card.imageUrl).replace(/["\\\n]/g, '')}")` } : undefined}
                            aria-hidden="true"
                        >
                            <span className="cc-plastic__top">
                                <span className="cc-plastic__name">{card.name}</span>
                                {brand && <span className="cc-plastic__brand">{brand}</span>}
                            </span>
                            <span className="cc-plastic__chip" />
                            <span className="cc-plastic__number">{card.lastFour ? `•••• ${card.lastFour}` : 'Final não informado'}</span>
                        </div>

                        <div className="pc-hero__info">
                            <h1 className="pc-title">{card.name}</h1>
                            <p className="pc-wallet">
                                {card.walletName ? (
                                    <>
                                        <span className="cc-tag">{isPJ ? 'MEI' : 'Pessoal'}</span>
                                        <span className="pc-wallet__name">{card.walletName}</span>
                                    </>
                                ) : (
                                    <span className="cc-tag cc-tag--warn">Sem carteira</span>
                                )}
                            </p>
                            {!card.walletName && (
                                <p className="pc-hint">
                                    Sem carteira, as compras deste cartão não entram no Extrato. Escolha uma carteira em <Link to="/financas/cartoes">Cartões</Link>.
                                </p>
                            )}
                            <dl className="cc-days pc-days">
                                <div><dt>Fecha</dt><dd>dia {card.closingDay || '—'}</dd></div>
                                <div><dt>Vence</dt><dd>dia {card.dueDate || '—'}</dd></div>
                                {brand && <div><dt>Bandeira</dt><dd>{brand}</dd></div>}
                                {stats?.limit > 0 && <div><dt>Limite</dt><dd>{brl(stats.limit)}</dd></div>}
                            </dl>
                            <div className="pc-actions">
                                <button type="button" className="btn btn-primary" onClick={openAdd}>
                                    <Plus size={18} aria-hidden="true" /> Adicionar compra
                                </button>
                                {hasUploadFaturas ? (
                                    <Link to={`/financas/cartoes/${cardId}/upload`} className="btn btn-secondary">
                                        <Upload size={18} aria-hidden="true" /> Enviar fatura
                                    </Link>
                                ) : (
                                    <button type="button" className="btn btn-secondary" onClick={askUpgrade}>
                                        <Lock size={16} aria-hidden="true" /> Enviar fatura
                                    </button>
                                )}
                            </div>
                        </div>
                    </header>
                )}

                {/* ── Números do ano ── */}
                <section className="csp csp--flat pc-year" aria-labelledby="pc-year-title">
                    <div className="csp-head">
                        <div>
                            <h2 id="pc-year-title" className="csp-title">Gastos em {year}</h2>
                            <p className="csp-sub">Soma das faturas deste cartão no ano.</p>
                        </div>
                        <div className="csp-year" role="group" aria-label="Ano">
                            <button type="button" className="csp-year__btn" onClick={() => setYear(y => y - 1)} aria-label="Ano anterior" disabled={year <= 2000}>
                                <ChevronLeft size={18} aria-hidden="true" />
                            </button>
                            <span className="csp-year__label">{year}</span>
                            <button type="button" className="csp-year__btn" onClick={() => setYear(y => y + 1)} disabled={year >= maxYear} aria-label="Próximo ano">
                                <ChevronRight size={18} aria-hidden="true" />
                            </button>
                        </div>
                    </div>

                    {loadState === 'loading' && (
                        <div className="csp-loading" aria-busy="true">
                            {Array.from({ length: 8 }, (_, i) => <span key={i} />)}
                        </div>
                    )}

                    {loadState === 'error' && data && (
                        <div className="csp-message" role="alert">
                            <p>Não deu para carregar {year}.</p>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => fetchSummary()}>Tentar de novo</button>
                        </div>
                    )}

                    {loadState === 'ok' && !hasYearData && (
                        <div className="csp-message">
                            <span className="csp-message__icon" aria-hidden="true"><ReceiptText size={22} /></span>
                            <p><strong>Nenhuma fatura em {year}.</strong> Adicione uma compra ou envie a fatura do cartão para ver os gastos aqui.</p>
                        </div>
                    )}

                    {loadState === 'ok' && hasYearData && (
                        <>
                            <dl className="csp-stats">
                                <Stat
                                    main
                                    icon={Wallet}
                                    label="Total gasto"
                                    value={brl(stats.totalSpent)}
                                    note={`em ${plural(stats.withSpend.length, 'mês', 'meses')} com fatura`}
                                />
                                <Stat icon={TrendingUp} label="Média por mês" value={brl(stats.average)} note="nos meses com fatura" />
                                <Stat
                                    icon={CalendarDays}
                                    label="Mês mais caro"
                                    value={stats.top ? MONTHS[stats.top.month] : '—'}
                                    note={stats.top ? brl(stats.top.total) : null}
                                />
                                {stats.limit > 0 ? (
                                    <Stat
                                        icon={Gauge}
                                        label="Uso do limite"
                                        value={stats.last ? limitUse(stats.last.total, stats.limit) : '—'}
                                        note={stats.last ? `fatura de ${lastMonthName}, de ${brl(stats.limit)}` : null}
                                    />
                                ) : (
                                    <Stat
                                        icon={CalendarCheck}
                                        label="Mês mais barato"
                                        value={stats.low ? MONTHS[stats.low.month] : '—'}
                                        note={stats.low ? brl(stats.low.total) : 'precisa de dois meses com fatura'}
                                    />
                                )}
                                <Stat
                                    icon={ReceiptText}
                                    label="Última fatura"
                                    value={stats.last ? brl(stats.last.total) : '—'}
                                    note={stats.last ? `${lastMonthName}${stats.last.dueDate ? `, vence ${shortDate(stats.last.dueDate)}` : ''}` : null}
                                />
                                <Stat
                                    icon={stats.change !== null && stats.change < 0 ? TrendingDown : TrendingUp}
                                    label="Comparada à anterior"
                                    tone={stats.change > 0 ? 'up' : stats.change < 0 ? 'down' : ''}
                                    value={stats.change === null ? '—' : `${stats.change > 0 ? '+' : stats.change < 0 ? '−' : ''}${Math.abs(stats.change)}%`}
                                    note={stats.change === null
                                        ? 'sem fatura no mês anterior'
                                        : `${brl(Math.abs(stats.last.total - stats.previous.total))} ${stats.change >= 0 ? 'a mais' : 'a menos'} que ${MONTHS[stats.previous.month]}`}
                                />
                                <Stat
                                    icon={Tags}
                                    label="Categoria com mais gastos"
                                    value={stats.topCategory?.name || '—'}
                                    note={stats.topCategory ? `${brl(stats.topCategory.total)}, ${stats.shareOf(stats.topCategory.total)}% das compras` : null}
                                />
                                <Stat
                                    icon={ShoppingBag}
                                    label="Compras no ano"
                                    value={stats.purchases.toLocaleString('pt-BR')}
                                    note={stats.purchases ? `média de ${brl(stats.totalSpent / stats.purchases)} por compra` : null}
                                />
                            </dl>

                            {insights.length > 0 && (
                                <Block icon={Lightbulb} title="Destaques do ano" className="csp-block--insights">
                                    <ul className="csp-insights">
                                        {insights.map((text, i) => <li key={i}>{text}</li>)}
                                    </ul>
                                </Block>
                            )}

                            <Block icon={BarChart3} title="Mês a mês" aside={<span className="pc-aside">Clique numa barra para ver as compras do mês</span>}>
                                <MonthlyTrendChart data={trend} activeMonth={selectedMonth} onSelect={chooseMonth} />
                            </Block>

                            <div className="csp-split">
                                <Block icon={PieChart} title="Gasto por categoria">
                                    <BarList
                                        emptyLabel="Nenhuma categoria nas faturas."
                                        rows={stats.categoriesYear.map(c => ({
                                            key: c.name,
                                            label: c.name === 'Sem Categoria' ? 'Sem categoria' : c.name,
                                            total: c.total,
                                            muted: c.total < 0 || c.name === 'Outros' || c.name === 'Sem Categoria',
                                            note: c.total < 0
                                                ? `${plural(c.count, 'item', 'itens')}, estorno maior que as compras`
                                                : `${plural(c.count, 'compra', 'compras')}, ${stats.shareOf(c.total)}% das compras`
                                        }))}
                                    />
                                </Block>
                                <Block icon={Table2} title="Faturas do ano">
                                    <table className="pc-invoices">
                                        <thead>
                                            <tr>
                                                <th scope="col">Mês</th>
                                                <th scope="col">Vence</th>
                                                <th scope="col">Situação</th>
                                                <th scope="col">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {[...stats.months].reverse().map(m => (
                                                <tr key={m.month} className={m.month === selectedMonth ? 'is-active' : ''}>
                                                    <th scope="row">
                                                        <button type="button" className="pc-link" onClick={() => { chooseMonth(m.month); document.getElementById('pc-compras')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}>
                                                            {capitalize(MONTHS[m.month])}
                                                        </button>
                                                    </th>
                                                    <td>{m.dueDate ? shortDate(m.dueDate) : '—'}</td>
                                                    <td><span className={`pc-status pc-status--${(m.status || 'PENDING').toLowerCase()}`}>{STATUS[m.status] || 'Aberta'}</span></td>
                                                    <td className="pc-num">{brl(m.total)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </Block>
                            </div>
                        </>
                    )}

                    {/* ── Compras da fatura ── */}
                    {loadState === 'ok' && selectedMonth && (
                        <Block
                            id="pc-compras"
                            icon={ShoppingBag}
                            title={`Compras da fatura de ${MONTHS[selectedMonth]}`}
                            className="pc-items"
                            aside={stats?.months.length > 1 ? (
                                <div className="pc-months" role="group" aria-label="Mês da fatura" ref={monthsRef}>
                                    {stats.months.map(m => (
                                        <button
                                            key={m.month}
                                            type="button"
                                            className={`pc-month ${m.month === selectedMonth ? 'is-active' : ''}`}
                                            aria-pressed={m.month === selectedMonth}
                                            onClick={() => chooseMonth(m.month)}
                                        >
                                            {MONTHS_SHORT[m.month]}
                                        </button>
                                    ))}
                                </div>
                            ) : null}
                        >
                            {itemsState === 'loading' && <div className="pc-items__loading" aria-busy="true"><span /><span /><span /></div>}

                            {itemsState === 'error' && (
                                <div className="csp-message" role="alert">
                                    <p>Não deu para carregar as compras.</p>
                                    <button type="button" className="btn btn-secondary btn-sm" onClick={fetchItems}>Tentar de novo</button>
                                </div>
                            )}

                            {itemsState === 'ok' && items.length === 0 && (
                                <div className="pc-none">
                                    <p><strong>Nenhuma compra na fatura de {MONTHS[selectedMonth]}.</strong> Adicione as compras à mão ou envie a fatura.</p>
                                    <button type="button" className="btn btn-secondary btn-sm" onClick={openAdd}>
                                        <Plus size={16} aria-hidden="true" /> Adicionar compra
                                    </button>
                                </div>
                            )}

                            {itemsState === 'ok' && items.length > 0 && (
                                <>
                                    <div className="pc-toolbar">
                                        <ul className="pc-facts">
                                            {monthRefunds < 0 && <li><span>Compras</span><strong>{brl(monthPurchases)}</strong></li>}
                                            {monthRefunds < 0 && <li className="is-refund"><span>Estornos</span><strong>{brl(monthRefunds)}</strong></li>}
                                            <li><span>{monthRefunds < 0 ? 'Total da fatura' : 'Total'}</span><strong>{brl(monthTotal)}</strong></li>
                                            <li><span>Itens</span><strong>{items.length}</strong></li>
                                            {selectedInvoice?.dueDate && <li><span>Vence</span><strong>{formatDate(selectedInvoice.dueDate)}</strong></li>}
                                            {toReview > 0 && <li className="is-warn"><span>Para conferir</span><strong>{toReview}</strong></li>}
                                        </ul>
                                        {items.length > 5 && (
                                            <label className="pc-search">
                                                <Search size={16} aria-hidden="true" />
                                                <input
                                                    type="search"
                                                    value={search}
                                                    onChange={e => setSearch(e.target.value)}
                                                    placeholder="Buscar compra"
                                                    aria-label="Buscar compra pela descrição ou categoria"
                                                />
                                            </label>
                                        )}
                                    </div>

                                    {unconfirmedCount > 0 && (
                                        <p className="pc-unconfirmed">
                                            {plural(unconfirmedCount, 'compra lida pela IA ainda não foi conferida', 'compras lidas pela IA ainda não foram conferidas')} e não {unconfirmedCount === 1 ? 'está' : 'estão'} no Extrato.{' '}
                                            <Link to={`/financas/cartoes/${cardId}/upload`}>Conferir agora</Link>
                                        </p>
                                    )}

                                    {visibleItems.length === 0 ? (
                                        <p className="csp-muted pc-nofind">Nenhuma compra com “{search.trim()}”.</p>
                                    ) : (
                                        <table className="pc-table">
                                            <thead>
                                                <tr>
                                                    <th scope="col" className="pc-table__check">
                                                        <input
                                                            type="checkbox"
                                                            className="pc-check"
                                                            checked={allVisibleSelected}
                                                            onChange={toggleAllVisible}
                                                            aria-label="Selecionar todas as compras da lista"
                                                        />
                                                    </th>
                                                    <th scope="col">Data</th>
                                                    <th scope="col">Descrição</th>
                                                    <th scope="col">Categoria</th>
                                                    <th scope="col" className="pc-num">Valor</th>
                                                    <th scope="col"><span className="sr-only">Ações</span></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {visibleItems.map(item => {
                                                    const amount = Number(item.amount) || 0
                                                    const conf = Number(item.aiConfidence) || 0
                                                    const checked = selectedIds.has(item.id)
                                                    return (
                                                        <tr key={item.id} className={checked ? 'is-selected' : ''}>
                                                            <td className="pc-table__check">
                                                                <input
                                                                    type="checkbox"
                                                                    className="pc-check"
                                                                    checked={checked}
                                                                    onChange={() => toggleItem(item.id)}
                                                                    aria-label={`Selecionar ${item.description}`}
                                                                />
                                                            </td>
                                                            <td className="pc-table__date">{shortDate(item.transactionDate)}</td>
                                                            <th scope="row" className="pc-table__desc">
                                                                {item.description}
                                                                {item.installment && <span className="pc-installment">{item.installment}</span>}
                                                                {item.isConfirmed === false && <span className="pc-flag">não conferida</span>}
                                                            </th>
                                                            <td className="pc-table__cat">
                                                                {item.categoryId ? (
                                                                    <span className="pc-cat">{item.categoryName}</span>
                                                                ) : item.aiCategory ? (
                                                                    <span className="pc-cat pc-cat--suggested">{item.aiCategory} <em>sugerida</em></span>
                                                                ) : (
                                                                    <span className="pc-cat pc-cat--none">Sem categoria</span>
                                                                )}
                                                                {item.categoryId && conf > 0 && conf < REVIEW_BELOW && <span className="pc-flag">conferir</span>}
                                                            </td>
                                                            <td className={`pc-num pc-table__amount ${amount < 0 ? 'is-refund' : ''}`}>
                                                                {amount < 0 ? <><span className="pc-refund">estorno</span>{brl(amount)}</> : brl(amount)}
                                                            </td>
                                                            <td className="pc-table__actions">
                                                                <button type="button" className="cc-icon-btn" onClick={() => openEdit(item)} disabled={busy} aria-label={`Editar ${item.description}`} title="Editar">
                                                                    <Pencil size={18} aria-hidden="true" />
                                                                </button>
                                                                <button type="button" className="cc-icon-btn cc-icon-btn--danger" onClick={() => deleteItems([item.id], item.description)} disabled={busy} aria-label={`Excluir ${item.description}`} title="Excluir">
                                                                    <Trash2 size={18} aria-hidden="true" />
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    )
                                                })}
                                            </tbody>
                                        </table>
                                    )}
                                </>
                            )}
                        </Block>
                    )}
                </section>

            </div>

            {/* Barra das compras selecionadas */}
            {selectedIds.size > 0 && (
                <div className="pc-bulk" role="region" aria-label="Compras selecionadas">
                    <p>
                        <strong>{plural(selectedIds.size, 'selecionada', 'selecionadas')}</strong>
                        <span>{brl(selectedTotal)}</span>
                    </p>
                    <div className="pc-bulk__actions">
                        <button type="button" className="pc-bulk__btn" onClick={() => setSelectedIds(new Set())} disabled={busy}>Limpar</button>
                        <button type="button" className="pc-bulk__btn pc-bulk__btn--danger" onClick={() => deleteItems([...selectedIds], '')} disabled={busy}>
                            <Trash2 size={16} aria-hidden="true" /> {busy ? 'Excluindo...' : `Excluir ${selectedIds.size}`}
                        </button>
                    </div>
                </div>
            )}

            {/* Janela de adicionar / editar compra */}
            {form && (
                <div className="cd-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) closeForm() }}>
                    <form className="cd-box cc-box pc-box" role="dialog" aria-modal="true" aria-labelledby="pc-form-title" onSubmit={handleSave} noValidate>
                        <button type="button" className="pc-box__close" onClick={closeForm} aria-label="Fechar" disabled={saving}><X size={20} aria-hidden="true" /></button>
                        <h2 id="pc-form-title" className="cd-title">{form.mode === 'add' ? 'Adicionar compra' : 'Editar compra'}</h2>
                        <p className="cd-message">
                            {form.mode === 'add'
                                ? `Fica na fatura do cartão ${card.name}${card.walletName ? ' e entra no Extrato.' : '.'}`
                                : `Fatura de ${MONTHS[selectedMonth]} de ${year}.`}
                        </p>

                        <label className="cc-field">
                            <span>Descrição</span>
                            <input
                                type="text"
                                autoFocus
                                maxLength={200}
                                value={formData.description}
                                onChange={e => setField('description', e.target.value)}
                                placeholder="Ex.: Mercado, posto, tecido"
                            />
                        </label>

                        <div className="cc-grid-2">
                            <label className="cc-field">
                                <span>Valor (R$)</span>
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    value={formData.amount}
                                    onChange={e => setField('amount', e.target.value.replace(/[^\d.,]/g, ''))}
                                    placeholder="0,00"
                                />
                            </label>
                            <label className="cc-field">
                                <span>Data da compra</span>
                                <input
                                    type="date"
                                    value={formData.transactionDate}
                                    max={`${maxYear}-12-31`}
                                    onChange={e => setField('transactionDate', e.target.value)}
                                />
                            </label>
                        </div>

                        <label className="pc-refund-check">
                            <input type="checkbox" className="pc-check" checked={formData.refund} onChange={e => setField('refund', e.target.checked)} />
                            <span>É um estorno <em>(dinheiro que voltou para o cartão)</em></span>
                        </label>

                        {form.mode === 'add' && (
                            <div className="cc-field">
                                <label htmlFor="pc-month">Fatura</label>
                                <Select id="pc-month" ariaLabel="Fatura" value={formData.month} onChange={v => setField('month', String(v))} options={monthOptions} />
                            </div>
                        )}

                        <div className="cc-field">
                            <label htmlFor="pc-category">Categoria</label>
                            <Select id="pc-category" ariaLabel="Categoria" value={formData.category} onChange={v => { if (v === NEW_CATEGORY) setNewCat(''); else setField('category', String(v)) }} options={categoryOptions} />
                            {newCat === null ? (
                                <button type="button" className="pc-link pc-newcat-open" onClick={() => setNewCat('')}>
                                    <Plus size={16} aria-hidden="true" /> Criar categoria nova
                                </button>
                            ) : (
                                <div className="pc-newcat">
                                    <input
                                        type="text"
                                        autoFocus
                                        maxLength={60}
                                        value={newCat}
                                        onChange={e => setNewCat(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateCategory() } }}
                                        placeholder={isPJ ? 'Ex.: Embalagens' : 'Ex.: Academia'}
                                        aria-label="Nome da categoria nova"
                                    />
                                    <button type="button" className="cd-btn" onClick={() => setNewCat(null)} disabled={creatingCat}>Cancelar</button>
                                    <button type="button" className="cd-btn cd-btn--primary" onClick={handleCreateCategory} disabled={creatingCat || !newCat.trim()}>
                                        {creatingCat ? 'Criando...' : 'Criar'}
                                    </button>
                                </div>
                            )}
                            <small>{isPJ ? 'Categorias de despesas do MEI, porque o cartão é da carteira MEI.' : 'Categorias de despesas pessoais.'}</small>
                        </div>

                        {formError && <p className="cc-notice" role="alert">{formError}</p>}

                        <div className="cd-actions">
                            <button type="button" className="cd-btn" onClick={closeForm} disabled={saving}>Cancelar</button>
                            <button type="submit" className="cd-btn cd-btn--primary" disabled={saving}>
                                {saving ? 'Salvando...' : form.mode === 'add' ? 'Adicionar compra' : 'Salvar'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {dialog}
        </div>
    )
}
