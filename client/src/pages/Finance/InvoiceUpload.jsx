import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
    ChevronLeft, Upload, FileText, Image as ImageIcon, FileSpreadsheet, CheckCircle2, AlertTriangle,
    ReceiptText, CalendarClock, ListChecks, Scale, Search, X, Sparkles, CreditCard, RotateCcw
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import FeatureLock from '../../components/FeatureLock'
import Select from '../../components/ui/Select'
import { useConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Stat } from '../../components/cards/CardsSummaryPanel'
import './InvoiceUpload.css'

const ACCEPTED_TYPES = [
    'application/pdf', 'text/csv', 'application/vnd.ms-excel', 'text/plain',
    'application/x-ofx', 'application/ofx', 'text/ofx',
    'image/png', 'image/jpeg', 'image/jpg', 'image/webp'
]
const ACCEPT_STRING = ACCEPTED_TYPES.join(',') + ',.ofx,.csv'
const MAX_SIZE_MB = 10
const REVIEW_BELOW = 0.6
const NEW_CATEGORY = '__nova__'
const MONTHS = ['', 'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const STAGES = ['Enviando o arquivo', 'A IA está lendo as compras', 'Separando parcelas e estornos', 'Sugerindo as categorias']

const brl = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const formatBytes = (b) => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`)
const formatDate = (value) => {
    if (!value) return '—'
    const [y, m, d] = String(value).slice(0, 10).split('-')
    return y && m && d ? `${d}/${m}/${y}` : '—'
}
const shortDate = (value) => formatDate(value).slice(0, 5)
const plural = (n, one, many) => `${n.toLocaleString('pt-BR')} ${n === 1 ? one : many}`
const sameName = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()

// Plano mais barato que libera um recurso (o admin decide os recursos de cada plano)
const planWith = (plans, feature, fallback) => {
    const found = (plans || []).filter(p => p.features?.[feature]).sort((a, b) => Number(a.price) - Number(b.price))[0]
    return found?.name || fallback
}

const fileKind = (f) => {
    const ext = String(f?.name || '').toLowerCase().split('.').pop()
    if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) return 'image'
    if (['csv', 'ofx', 'txt'].includes(ext)) return 'sheet'
    return 'pdf'
}
const FileIcon = ({ file, size = 22 }) => {
    const kind = fileKind(file)
    const Icon = kind === 'image' ? ImageIcon : kind === 'sheet' ? FileSpreadsheet : FileText
    return <Icon size={size} aria-hidden="true" />
}

export default function InvoiceUpload() {
    const { id: cardId } = useParams()
    const navigate = useNavigate()
    const { user } = useAuth()
    const { confirm, dialog } = useConfirmDialog()
    const fileInputRef = useRef(null)
    const token = localStorage.getItem('token')
    const authHeaders = useMemo(() => ({ 'Authorization': `Bearer ${token}` }), [token])
    const canUpload = user?.planFeatures?.upload_faturas || user?.isInTrial || user?.role === 'ADMIN'

    const [card, setCard] = useState(null)
    const [cardState, setCardState] = useState('loading') // loading | ok | notfound
    const [plans, setPlans] = useState([])
    const [categories, setCategories] = useState([])
    const [pending, setPending] = useState([])

    const [phase, setPhase] = useState('upload') // upload | processing | review | error
    const [dragOver, setDragOver] = useState(false)
    const [file, setFile] = useState(null)
    const [stage, setStage] = useState(0)
    const [error, setError] = useState(null)

    const [review, setReview] = useState(null) // { invoiceId, metadata, items, alreadyConfirmedCount, fromPending }
    const [selected, setSelected] = useState(new Set())
    const [choices, setChoices] = useState({}) // id do item → valor da categoria ('id:12' | 'ai:Nome' | '')
    const [search, setSearch] = useState('')
    const [saving, setSaving] = useState(false)
    const [saveError, setSaveError] = useState('')
    const [newCat, setNewCat] = useState(null) // { itemId, name }
    const [creatingCat, setCreatingCat] = useState(false)
    const [newCatError, setNewCatError] = useState('')

    // ── Dados de apoio ──────────────────────────────────────────────────
    useEffect(() => {
        fetch('/api/plans').then(r => (r.ok ? r.json() : [])).then(list => setPlans(Array.isArray(list) ? list : [])).catch(() => {})
    }, [])

    const fetchPending = useCallback(async () => {
        try {
            const res = await fetch(`/api/finance/invoices/card/${cardId}/pending`, { headers: authHeaders })
            if (res.ok) setPending(await res.json())
        } catch { /* sem a lista, só não mostra o aviso */ }
    }, [cardId, authHeaders])

    useEffect(() => {
        if (!canUpload) return
        let alive = true
        ;(async () => {
            try {
                const [cardsRes, catRes] = await Promise.all([
                    fetch('/api/finance/cards', { headers: authHeaders }),
                    fetch('/api/finance/categories', { headers: authHeaders })
                ])
                const cards = cardsRes.ok ? await cardsRes.json() : []
                const found = (Array.isArray(cards) ? cards : []).find(c => String(c.id) === String(cardId))
                if (!alive) return
                setCard(found || null)
                setCardState(found ? 'ok' : 'notfound')
                if (catRes.ok) setCategories(await catRes.json())
            } catch {
                if (alive) setCardState('ok') // sem conexão: deixa tentar o envio, o servidor confere o cartão
            }
        })()
        fetchPending()
        return () => { alive = false }
    }, [canUpload, cardId, authHeaders, fetchPending])

    // Categorias que combinam com a carteira do cartão: MEI usa despesas do MEI
    const walletType = review?.walletType || card?.walletType
    const categoryType = walletType === 'PJ' ? 'DESPESA_MEI' : 'DESPESA_PESSOAL'
    const cardCategories = useMemo(() => {
        const seen = new Set()
        return categories
            .filter(c => c.type === categoryType)
            .filter(c => { const k = c.name.trim().toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true })
            .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    }, [categories, categoryType])

    // ── Enviar ──────────────────────────────────────────────────────────
    const validateFile = (f) => {
        if (!f) return 'Nenhum arquivo escolhido.'
        const ext = f.name.toLowerCase().split('.').pop()
        if (!['ofx', 'csv'].includes(ext) && !ACCEPTED_TYPES.includes(f.type)) {
            return 'Esse tipo de arquivo não serve. Envie a fatura em PDF, CSV, OFX ou uma foto (PNG, JPG ou WebP).'
        }
        if (f.size > MAX_SIZE_MB * 1024 * 1024) return `O arquivo tem ${formatBytes(f.size)}. O limite é ${MAX_SIZE_MB} MB.`
        if (f.size === 0) return 'O arquivo está vazio.'
        return null
    }

    // Itens lidos → escolha inicial de categoria (a da lista com o mesmo nome, ou a sugestão)
    const startReview = useCallback((data) => {
        const initialChoices = {}
        const initialSelected = new Set()
        for (const item of data.items) {
            if (item.categoryId) initialChoices[item.id] = `id:${item.categoryId}`
            else {
                const match = categories.find(c => c.type === (data.walletType === 'PJ' ? 'DESPESA_MEI' : 'DESPESA_PESSOAL') && sameName(c.name, item.aiCategory))
                initialChoices[item.id] = match ? `id:${match.id}` : (item.aiCategory ? `ai:${item.aiCategory}` : '')
            }
            if (!item.alreadyInInvoice) initialSelected.add(item.id)
        }
        setChoices(initialChoices)
        setSelected(initialSelected)
        setSearch('')
        setSaveError('')
        setReview(data)
        setPhase('review')
        window.scrollTo({ top: 0 })
    }, [categories])

    const handleUpload = async (selectedFile) => {
        const problem = validateFile(selectedFile)
        setFile(selectedFile || null)
        if (problem) { setError(problem); setPhase('error'); return }

        setPhase('processing')
        setStage(0)
        setError(null)
        const timer = setInterval(() => setStage(s => Math.min(s + 1, STAGES.length - 1)), 2600)
        try {
            const form = new FormData()
            form.append('file', selectedFile)
            form.append('cardId', cardId)
            const res = await fetch('/api/finance/invoices/upload', { method: 'POST', headers: authHeaders, body: form })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
                throw new Error(res.status === 413
                    ? `O arquivo passa de ${MAX_SIZE_MB} MB.`
                    : data.message || 'Não deu para ler a fatura agora. Tente de novo em alguns minutos.')
            }
            startReview({
                invoiceId: data.invoiceId,
                metadata: data.metadata || {},
                items: Array.isArray(data.items) ? data.items : [],
                alreadyConfirmedCount: data.alreadyConfirmedCount || 0,
                walletType: data.card?.walletType ?? card?.walletType,
                cardLastFour: data.card?.lastFour ?? card?.lastFour
            })
        } catch (err) {
            setError(err?.message && err.message !== 'Failed to fetch' ? err.message : 'Sem conexão. Verifique a internet e tente de novo.')
            setPhase('error')
        } finally {
            clearInterval(timer)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    const openPending = async (inv) => {
        setPhase('processing')
        setFile(null)
        setStage(0)
        try {
            const res = await fetch(`/api/finance/invoices/${inv.invoiceId}/items`, { headers: authHeaders })
            if (!res.ok) throw new Error()
            const list = await res.json()
            startReview({
                invoiceId: inv.invoiceId,
                metadata: { referenceMonth: inv.referenceMonth, referenceYear: inv.referenceYear, dueDate: inv.dueDate ? String(inv.dueDate).slice(0, 10) : null, closingDate: inv.closingDate ? String(inv.closingDate).slice(0, 10) : null, totalAmount: 0 },
                items: list.filter(i => !i.isConfirmed),
                alreadyConfirmedCount: list.filter(i => i.isConfirmed).length,
                walletType: card?.walletType,
                cardLastFour: card?.lastFour,
                fromPending: true
            })
        } catch {
            setError('Não deu para abrir as compras dessa fatura. Tente de novo.')
            setPhase('error')
        }
    }

    const resetToUpload = () => {
        setPhase('upload')
        setFile(null)
        setError(null)
        setReview(null)
        setSelected(new Set())
        setChoices({})
        fetchPending()
    }

    // ── Revisão ─────────────────────────────────────────────────────────
    const items = review?.items || []
    const visibleItems = useMemo(() => {
        const q = search.trim().toLowerCase()
        if (!q) return items
        return items.filter(i => `${i.description} ${i.aiCategory || ''}`.toLowerCase().includes(q))
    }, [items, search])
    const selectedItems = items.filter(i => selected.has(i.id))
    const selectedTotal = selectedItems.reduce((s, i) => s + (Number(i.amount) || 0), 0)
    const printedTotal = Number(review?.metadata?.totalAmount) || 0
    // As já lançadas (desmarcadas) também contam para bater com o total impresso
    const launchedTotal = items.filter(i => i.alreadyInInvoice && !selected.has(i.id)).reduce((s, i) => s + (Number(i.amount) || 0), 0)
    const totalDiff = printedTotal > 0 ? Math.round((selectedTotal + launchedTotal - printedTotal) * 100) / 100 : null
    const repeatedCount = items.filter(i => i.alreadyInInvoice).length
    const toCheck = items.filter(i => Number(i.aiConfidence) > 0 && Number(i.aiConfidence) < REVIEW_BELOW).length
    // Aviso de outro cartão só quando o final deste cartão não aparece em nenhum cartão da fatura (titular ou adicional)
    const invoiceCards = review?.metadata?.cardsLastFour?.length ? review.metadata.cardsLastFour : (review?.metadata?.cardLastFour ? [review.metadata.cardLastFour] : [])
    const otherCard = invoiceCards.length > 0 && review?.cardLastFour && !invoiceCards.includes(review.cardLastFour)
    const allVisibleSelected = visibleItems.length > 0 && visibleItems.every(i => selected.has(i.id))
    const reviewMonth = review?.metadata?.referenceMonth
        ? `${MONTHS[review.metadata.referenceMonth]} de ${review.metadata.referenceYear}`
        : ''

    const toggleItem = (id) => setSelected(prev => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
    })
    const toggleAllVisible = () => setSelected(prev => {
        const next = new Set(prev)
        if (allVisibleSelected) visibleItems.forEach(i => next.delete(i.id))
        else visibleItems.forEach(i => next.add(i.id))
        return next
    })

    const optionsFor = (item) => {
        const options = [{ value: '', label: 'Sem categoria' }]
        const current = choices[item.id] || ''
        if (current.startsWith('ai:')) options.push({ value: current, label: `${current.slice(3)} (sugerida)` })
        if (item.categoryId && !cardCategories.some(c => c.id === item.categoryId)) {
            options.push({ value: `id:${item.categoryId}`, label: item.categoryName || 'Categoria atual' })
        }
        if (cardCategories.length) {
            options.push({
                group: walletType === 'PJ' ? 'Despesas do MEI' : 'Despesas pessoais',
                options: cardCategories.map(c => ({ value: `id:${c.id}`, label: c.name }))
            })
        }
        options.push({ value: NEW_CATEGORY, label: '+ Criar categoria nova' })
        return options
    }

    const chooseCategory = (itemId, value) => {
        if (value === NEW_CATEGORY) {
            setNewCat({ itemId, name: '' })
            setNewCatError('')
            return
        }
        setChoices(prev => ({ ...prev, [itemId]: String(value) }))
    }

    const handleCreateCategory = async (e) => {
        e?.preventDefault()
        const name = (newCat?.name || '').trim()
        if (!name) return
        if (name.length > 60) { setNewCatError('O nome pode ter até 60 letras.'); return }
        setCreatingCat(true)
        setNewCatError('')
        try {
            const res = await fetch('/api/finance/categories', {
                method: 'POST',
                headers: { ...authHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, type: categoryType })
            })
            const body = await res.json().catch(() => ({}))
            if (res.status === 409 && body?.id) {
                // Já existe com esse nome: usa a que já existe
                setChoices(prev => ({ ...prev, [newCat.itemId]: `id:${body.id}` }))
                setNewCat(null)
                return
            }
            if (!res.ok || !body?.id) { setNewCatError(body.message || 'Não deu para criar a categoria. Tente de novo.'); return }
            setCategories(prev => [...prev, body])
            // A categoria nova vale para esta compra e para as outras com a mesma sugestão
            const suggestion = choices[newCat.itemId]
            setChoices(prev => {
                const next = { ...prev, [newCat.itemId]: `id:${body.id}` }
                if (suggestion?.startsWith('ai:') && sameName(suggestion.slice(3), name)) {
                    for (const [id, value] of Object.entries(prev)) if (value === suggestion) next[id] = `id:${body.id}`
                }
                return next
            })
            setNewCat(null)
        } catch {
            setNewCatError('Sem conexão. Verifique a internet e tente de novo.')
        } finally {
            setCreatingCat(false)
        }
    }

    // Esc fecha a janela de categoria nova (se um aviso estiver por cima, o Esc é dele)
    useEffect(() => {
        if (!newCat) return undefined
        const onKey = (e) => { if (e.key === 'Escape' && !e.defaultPrevented && !creatingCat) setNewCat(null) }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [newCat, creatingCat])

    const sendReview = async (confirmItems, discardIds) => {
        const res = await fetch(`/api/finance/invoices/${review.invoiceId}/review`, {
            method: 'POST',
            headers: { ...authHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ confirm: confirmItems, discard: discardIds })
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.message || 'Não deu para gravar. Nada foi alterado; tente de novo.')
        return body
    }

    const handleConfirm = async () => {
        if (!selectedItems.length || saving) return
        const discarded = items.length - selectedItems.length
        if (discarded > 0) {
            const ok = await confirm({
                title: `Confirmar ${plural(selectedItems.length, 'compra', 'compras')}?`,
                message: `${plural(discarded, 'compra desmarcada será descartada', 'compras desmarcadas serão descartadas')}. As confirmadas entram na fatura${card?.walletName ? ' e no Extrato' : ''}.`,
                details: [{ label: 'Total confirmado', value: brl(selectedTotal), strong: true }],
                confirmLabel: 'Confirmar compras'
            })
            if (!ok) return
        }
        setSaving(true)
        setSaveError('')
        try {
            const confirmItems = selectedItems.map(i => {
                const value = choices[i.id] || ''
                if (value.startsWith('id:')) return { id: i.id, categoryId: Number(value.slice(3)) }
                if (value.startsWith('ai:')) return { id: i.id, categoryName: value.slice(3) }
                return { id: i.id, categoryId: null }
            })
            await sendReview(confirmItems, items.filter(i => !selected.has(i.id)).map(i => i.id))
            navigate(`/financas/cartoes/${cardId}`)
        } catch (err) {
            setSaveError(err.message && err.message !== 'Failed to fetch' ? err.message : 'Sem conexão. Nada foi gravado; tente de novo.')
        } finally {
            setSaving(false)
        }
    }

    const handleDiscard = async () => {
        const ok = await confirm({
            title: 'Descartar esta leitura?',
            message: review?.alreadyConfirmedCount
                ? 'As compras lidas agora saem. As que já estavam lançadas nessa fatura continuam.'
                : 'As compras lidas saem e nada entra na fatura nem no Extrato.',
            confirmLabel: 'Descartar leitura',
            tone: 'danger'
        })
        if (!ok) return
        setSaving(true)
        setSaveError('')
        try {
            await sendReview([], items.map(i => i.id))
            resetToUpload()
        } catch (err) {
            setSaveError(err.message && err.message !== 'Failed to fetch' ? err.message : 'Sem conexão. Tente de novo.')
        } finally {
            setSaving(false)
        }
    }

    // ── Telas ───────────────────────────────────────────────────────────
    if (!canUpload) {
        return (
            <div className="enviar-fatura">
                <div className="ef-container">
                    <FeatureLock
                        featureName="Leitura de faturas com IA"
                        requiredPlan={planWith(plans, 'upload_faturas', 'Prata')}
                        description="Envie o PDF ou a foto da fatura e as compras entram sozinhas, já com categoria."
                        icon={<Sparkles size={28} aria-hidden="true" />}
                    />
                </div>
            </div>
        )
    }

    if (cardState === 'notfound') {
        return (
            <div className="enviar-fatura">
                <div className="ef-container">
                    <div className="ef-empty">
                        <span className="ef-empty__icon" aria-hidden="true"><CreditCard size={26} /></span>
                        <h1>Cartão não encontrado</h1>
                        <p>Esse cartão não existe ou não é da sua conta.</p>
                        <Link to="/financas/cartoes" className="btn btn-primary">Ver meus cartões</Link>
                    </div>
                </div>
            </div>
        )
    }

    const cardLabel = card ? `${card.name}${card.lastFour ? ` •••• ${card.lastFour}` : ''}` : 'Cartão'

    // ── Revisão ──
    if (phase === 'review' && review) {
        return (
            <div className="enviar-fatura">
                <div className="ef-container">
                    <Link to={`/financas/cartoes/${cardId}`} className="ef-back"><ChevronLeft size={18} aria-hidden="true" /> {card?.name || 'Painel do cartão'}</Link>

                    <header className="ef-head">
                        <h1 className="ef-title">Confira as compras{reviewMonth ? ` da fatura de ${reviewMonth}` : ''}</h1>
                        <p className="ef-sub">
                            A IA leu {plural(items.length, 'compra', 'compras')} do cartão {cardLabel}. Ajuste o que precisar e confirme. Só as compras marcadas entram na fatura{card?.walletName ? ' e no Extrato' : ''}.
                        </p>
                    </header>

                    <section className="csp csp--flat ef-facts" aria-label="Resumo da fatura lida">
                        <dl className="csp-stats">
                            <Stat
                                main
                                icon={ReceiptText}
                                label="Total da fatura"
                                value={printedTotal > 0 ? brl(printedTotal) : '—'}
                                note={printedTotal > 0 ? 'como está impresso na fatura' : 'a IA não achou o total impresso'}
                            />
                            <Stat
                                icon={Scale}
                                label="Soma das marcadas"
                                value={brl(selectedTotal)}
                                tone={totalDiff === null || Math.abs(totalDiff) < 0.05 ? '' : 'warn'}
                                note={totalDiff === null ? `${plural(selectedItems.length, 'compra', 'compras')}` : Math.abs(totalDiff) < 0.05 ? (launchedTotal ? 'com as já lançadas, bate com a fatura' : 'bate com o total da fatura') : `${brl(Math.abs(totalDiff))} ${totalDiff > 0 ? 'a mais' : 'a menos'} que a fatura`}
                            />
                            <Stat
                                icon={CalendarClock}
                                label="Vencimento"
                                value={review.metadata.dueDate ? formatDate(review.metadata.dueDate) : '—'}
                                note={review.metadata.closingDate ? `fechou em ${shortDate(review.metadata.closingDate)}` : null}
                            />
                            <Stat
                                icon={ListChecks}
                                label="Compras marcadas"
                                value={`${selectedItems.length} de ${items.length}`}
                                note={toCheck > 0 ? `${plural(toCheck, 'categoria', 'categorias')} para conferir` : 'categorias sugeridas pela IA'}
                            />
                        </dl>
                    </section>

                    {(otherCard || repeatedCount > 0 || (totalDiff !== null && Math.abs(totalDiff) >= 0.05)) && (
                        <ul className="ef-notes">
                            {otherCard && (
                                <li className="is-warn">
                                    <AlertTriangle size={18} aria-hidden="true" />
                                    <span>Esta fatura parece ser do cartão final <strong>{invoiceCards.join(' ou ')}</strong>, e este cartão é final {review.cardLastFour}. Confira se escolheu o cartão certo.</span>
                                </li>
                            )}
                            {repeatedCount > 0 && (
                                <li>
                                    <CheckCircle2 size={18} aria-hidden="true" />
                                    <span>{plural(repeatedCount, 'compra já estava lançada', 'compras já estavam lançadas')} nessa fatura e {repeatedCount === 1 ? 'ficou desmarcada' : 'ficaram desmarcadas'}, para não repetir.</span>
                                </li>
                            )}
                            {totalDiff !== null && Math.abs(totalDiff) >= 0.05 && (
                                <li className="is-warn">
                                    <AlertTriangle size={18} aria-hidden="true" />
                                    <span>A soma das compras marcadas não bate com o total impresso. Confira se faltou ou sobrou alguma compra{review.alreadyConfirmedCount ? ', lembrando que parte da fatura já estava lançada' : ''}.</span>
                                </li>
                            )}
                        </ul>
                    )}

                    <section className="ef-block" aria-labelledby="ef-list-title">
                        <div className="ef-block__head">
                            <h2 id="ef-list-title" className="ef-block__title">Compras lidas</h2>
                            {items.length > 8 && (
                                <label className="ef-search">
                                    <Search size={16} aria-hidden="true" />
                                    <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar compra" aria-label="Buscar compra pela descrição" />
                                </label>
                            )}
                        </div>

                        {visibleItems.length === 0 ? (
                            <p className="ef-muted">Nenhuma compra com “{search.trim()}”.</p>
                        ) : (
                            <table className="ef-table">
                                <thead>
                                    <tr>
                                        <th scope="col" className="ef-table__check">
                                            <input type="checkbox" className="ef-check" checked={allVisibleSelected} onChange={toggleAllVisible} aria-label="Marcar todas as compras da lista" />
                                        </th>
                                        <th scope="col">Data</th>
                                        <th scope="col">Descrição</th>
                                        <th scope="col">Categoria</th>
                                        <th scope="col" className="ef-num">Valor</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visibleItems.map(item => {
                                        const amount = Number(item.amount) || 0
                                        const conf = Number(item.aiConfidence) || 0
                                        const isOn = selected.has(item.id)
                                        return (
                                            <tr key={item.id} className={isOn ? '' : 'is-off'}>
                                                <td className="ef-table__check">
                                                    <input type="checkbox" className="ef-check" checked={isOn} onChange={() => toggleItem(item.id)} aria-label={`Marcar ${item.description}`} />
                                                </td>
                                                <td className="ef-table__date">{shortDate(item.transactionDate)}</td>
                                                <th scope="row" className="ef-table__desc">
                                                    <span>{item.description}</span>
                                                    {item.installment && <span className="ef-tag">parcela {item.installment}</span>}
                                                    {item.alreadyInInvoice && <span className="ef-tag ef-tag--done">já lançada</span>}
                                                </th>
                                                <td className="ef-table__cat">
                                                    <Select
                                                        variant="compact"
                                                        ariaLabel={`Categoria de ${item.description}`}
                                                        value={choices[item.id] || ''}
                                                        onChange={v => chooseCategory(item.id, v)}
                                                        options={optionsFor(item)}
                                                        disabled={!isOn || saving}
                                                    />
                                                    {conf > 0 && conf < REVIEW_BELOW && <span className="ef-flag">conferir</span>}
                                                </td>
                                                <td className={`ef-num ef-table__amount ${amount < 0 ? 'is-refund' : ''}`}>
                                                    {amount < 0 && <span className="ef-refund">estorno</span>}
                                                    {brl(amount)}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        )}
                    </section>

                    {saveError && <p className="ef-alert" role="alert">{saveError}</p>}
                </div>

                {/* Barra de confirmar: fica embaixo da tela */}
                <div className="ef-bar" role="region" aria-label="Confirmar compras">
                    <p>
                        <strong>{selectedItems.length} de {items.length} marcadas</strong>
                        <span>{brl(selectedTotal)}</span>
                    </p>
                    <div className="ef-bar__actions">
                        <button type="button" className="ef-bar__btn" onClick={handleDiscard} disabled={saving}>
                            <RotateCcw size={16} aria-hidden="true" /> Descartar
                        </button>
                        <button type="button" className="ef-bar__btn ef-bar__btn--primary" onClick={handleConfirm} disabled={saving || selectedItems.length === 0}>
                            <CheckCircle2 size={16} aria-hidden="true" />
                            {saving ? 'Gravando...' : `Confirmar ${selectedItems.length}`}
                        </button>
                    </div>
                </div>

                {newCat && (
                    <div className="cd-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !creatingCat) setNewCat(null) }}>
                        <form className="cd-box ef-box" role="dialog" aria-modal="true" aria-labelledby="ef-cat-title" onSubmit={handleCreateCategory}>
                            <button type="button" className="ef-box__close" onClick={() => setNewCat(null)} aria-label="Fechar" disabled={creatingCat}><X size={20} aria-hidden="true" /></button>
                            <h2 id="ef-cat-title" className="cd-title">Criar categoria</h2>
                            <p className="cd-message">{walletType === 'PJ' ? 'Fica nas despesas do MEI, porque o cartão é da carteira MEI.' : 'Fica nas despesas pessoais.'}</p>
                            <label className="ef-field">
                                <span>Nome da categoria</span>
                                <input type="text" autoFocus maxLength={60} value={newCat.name} onChange={e => setNewCat(prev => ({ ...prev, name: e.target.value }))} placeholder={walletType === 'PJ' ? 'Ex.: Embalagens' : 'Ex.: Academia'} />
                            </label>
                            {newCatError && <p className="ef-alert" role="alert">{newCatError}</p>}
                            <div className="cd-actions">
                                <button type="button" className="cd-btn" onClick={() => setNewCat(null)} disabled={creatingCat}>Cancelar</button>
                                <button type="submit" className="cd-btn cd-btn--primary" disabled={creatingCat || !newCat.name.trim()}>{creatingCat ? 'Criando...' : 'Criar categoria'}</button>
                            </div>
                        </form>
                    </div>
                )}

                {dialog}
            </div>
        )
    }

    // ── Enviar / lendo / erro ──
    return (
        <div className="enviar-fatura">
            <div className="ef-container">
                <Link to={`/financas/cartoes/${cardId}`} className="ef-back"><ChevronLeft size={18} aria-hidden="true" /> {card?.name || 'Painel do cartão'}</Link>

                <header className="ef-head">
                    <h1 className="ef-title">Enviar fatura</h1>
                    <p className="ef-sub">A IA lê as compras da fatura do cartão <strong>{cardLabel}</strong> e sugere a categoria de cada uma. Nada entra na fatura antes de você conferir.</p>
                </header>

                {phase === 'upload' && pending.length > 0 && (
                    <ul className="ef-pending">
                        {pending.map(inv => (
                            <li key={inv.invoiceId}>
                                <span className="ef-pending__icon" aria-hidden="true"><ListChecks size={20} /></span>
                                <p>
                                    <strong>Fatura de {MONTHS[inv.referenceMonth]} de {inv.referenceYear}</strong>
                                    <span>{plural(Number(inv.pending) || 0, 'compra lida ainda não conferida', 'compras lidas ainda não conferidas')}, {brl(inv.pendingAmount)}</span>
                                </p>
                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => openPending(inv)}>Conferir agora</button>
                            </li>
                        ))}
                    </ul>
                )}

                <div className="ef-layout">
                    <div className="ef-main">
                        {phase === 'upload' && (
                            <div
                                className={`ef-drop ${dragOver ? 'is-over' : ''}`}
                                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                                onDragLeave={() => setDragOver(false)}
                                onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) handleUpload(f) }}
                            >
                                <span className="ef-drop__icon" aria-hidden="true"><Upload size={28} /></span>
                                <h2>Arraste o arquivo da fatura aqui</h2>
                                <p>ou</p>
                                <button type="button" className="btn btn-primary" onClick={() => fileInputRef.current?.click()} disabled={cardState === 'loading'}>
                                    <FileText size={18} aria-hidden="true" /> Escolher arquivo
                                </button>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept={ACCEPT_STRING}
                                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f) }}
                                    className="ef-file"
                                    tabIndex={-1}
                                    aria-hidden="true"
                                />
                                <small>PDF ou CSV do banco funcionam melhor. Também aceita OFX e foto (PNG, JPG, WebP), até {MAX_SIZE_MB} MB.</small>
                            </div>
                        )}

                        {phase === 'processing' && (
                            <div className="ef-progress" role="status" aria-live="polite">
                                {file && (
                                    <div className="ef-progress__file">
                                        <span className="ef-progress__icon"><FileIcon file={file} /></span>
                                        <p><strong>{file.name}</strong><span>{formatBytes(file.size)}</span></p>
                                    </div>
                                )}
                                <div className="ef-progress__track" aria-hidden="true"><span /></div>
                                <p className="ef-progress__stage">{file ? STAGES[stage] : 'Abrindo as compras da fatura'}...</p>
                                {file && <small>Costuma levar de 10 a 40 segundos. Não feche esta página.</small>}
                            </div>
                        )}

                        {phase === 'error' && (
                            <div className="ef-error" role="alert">
                                <span className="ef-error__icon" aria-hidden="true"><AlertTriangle size={22} /></span>
                                <div>
                                    <h2>Não deu para ler a fatura</h2>
                                    <p>{error}</p>
                                    {file && <small>Arquivo: {file.name}</small>}
                                </div>
                                <div className="ef-error__actions">
                                    <button type="button" className="btn btn-primary" onClick={resetToUpload}>
                                        <FileText size={18} aria-hidden="true" /> Escolher outro arquivo
                                    </button>
                                    {file && (
                                        <button type="button" className="btn btn-secondary" onClick={() => handleUpload(file)}>
                                            <RotateCcw size={18} aria-hidden="true" /> Tentar de novo
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    <aside className="ef-aside" aria-labelledby="ef-how">
                        <h2 id="ef-how" className="ef-aside__title">Como funciona</h2>
                        <ol className="ef-steps">
                            <li><strong>Envie a fatura</strong><span>Baixe o PDF ou o CSV no app ou no site do banco.</span></li>
                            <li><strong>A IA lê as compras</strong><span>Com data, valor, parcela, estorno e uma categoria sugerida.</span></li>
                            <li><strong>Você confere</strong><span>Troca a categoria, desmarca o que não quer e confirma.</span></li>
                        </ol>
                        <p className="ef-tip">
                            PDF com senha do banco não abre: use “Imprimir” e “Salvar como PDF” para gerar uma cópia sem proteção.
                        </p>
                    </aside>
                </div>
            </div>
            {dialog}
        </div>
    )
}
