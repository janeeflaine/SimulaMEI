import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Tags, TrendingUp, Building2, User, Plus, Pencil, Trash2, Search, X, AlertTriangle } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import FeatureLock from '../../components/FeatureLock'
import { useConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Stat } from '../../components/cards/CardsSummaryPanel'
import './FinanceCategories.css'

const TYPES = [
    { value: 'RECEITA', label: 'Receitas', one: 'receita', icon: TrendingUp, hint: 'O que entra: vendas, serviços, rendimentos.' },
    { value: 'DESPESA_MEI', label: 'Despesas do MEI', one: 'despesa do MEI', icon: Building2, hint: 'Gastos da empresa: matéria-prima, DAS, ferramentas.' },
    { value: 'DESPESA_PESSOAL', label: 'Despesas pessoais', one: 'despesa pessoal', icon: User, hint: 'Gastos da casa e da família: mercado, aluguel, saúde.' }
]
const typeOf = (value) => TYPES.find(t => t.value === value) || TYPES[0]
const MAX_NAME = 60

const brl = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const plural = (n, one, many) => `${(Number(n) || 0).toLocaleString('pt-BR')} ${n === 1 ? one : many}`

// Plano mais barato que libera um recurso (o admin decide os recursos de cada plano)
const planWith = (plans, feature, fallback) => {
    const found = (plans || []).filter(p => p.features?.[feature]).sort((a, b) => Number(a.price) - Number(b.price))[0]
    return found?.name || fallback
}

const usesOf = (cat) => (Number(cat.transactionsCount) || 0) + (Number(cat.invoiceItemsCount) || 0)

export default function FinanceCategories() {
    const { user } = useAuth()
    const { confirm, notify, dialog } = useConfirmDialog()
    const token = localStorage.getItem('token')
    const year = new Date().getFullYear()

    const [categories, setCategories] = useState([])
    const [uncategorized, setUncategorized] = useState(0)
    const [loadState, setLoadState] = useState('loading') // loading | ok | error
    const [search, setSearch] = useState('')
    const [plans, setPlans] = useState([])

    const [form, setForm] = useState(null) // null = fechada; { id?, name, type }
    const [formError, setFormError] = useState('')
    const [saving, setSaving] = useState(false)

    const canEdit = user?.planFeatures?.categorias || user?.isInTrial || user?.role === 'ADMIN'

    useEffect(() => {
        fetch('/api/plans').then(r => (r.ok ? r.json() : [])).then(list => setPlans(Array.isArray(list) ? list : [])).catch(() => {})
    }, [])

    const fetchCategories = useCallback(async () => {
        try {
            const res = await fetch('/api/finance/categories?uso=1', { headers: { 'Authorization': `Bearer ${token}` } })
            if (!res.ok) throw new Error()
            const data = await res.json()
            setCategories(Array.isArray(data) ? data : [])
            setUncategorized(Number(res.headers.get('X-Uncategorized-Year')) || 0)
            setLoadState('ok')
        } catch {
            setLoadState('error')
        }
    }, [token])

    useEffect(() => { if (canEdit) fetchCategories() }, [canEdit, fetchCategories])

    const visible = useMemo(() => {
        const q = search.trim().toLowerCase()
        return q ? categories.filter(c => c.name.toLowerCase().includes(q)) : categories
    }, [categories, search])

    const byType = (type) => visible.filter(c => c.type === type).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    const countOf = (type) => categories.filter(c => c.type === type).length
    const yearOf = (type) => categories.filter(c => c.type === type).reduce((s, c) => s + (Number(c.yearTotal) || 0), 0)
    const topOf = (type) => categories.filter(c => c.type === type && Number(c.yearTotal) > 0).sort((a, b) => b.yearTotal - a.yearTotal)[0]

    // ── Janela de criar / editar ────────────────────────────────────────
    const openNew = (type = 'RECEITA') => { setForm({ name: '', type }); setFormError('') }
    const openEdit = (cat) => { setForm({ id: cat.id, name: cat.name, type: cat.type, uses: usesOf(cat), originalType: cat.type }); setFormError('') }
    const closeForm = useCallback(() => { if (!saving) setForm(null) }, [saving])

    // Esc fecha a janela (se um aviso estiver por cima, o Esc é dele)
    useEffect(() => {
        if (!form) return undefined
        const onKey = (e) => { if (e.key === 'Escape' && !e.defaultPrevented) closeForm() }
        window.addEventListener('keydown', onKey)
        const { overflow } = document.body.style
        document.body.style.overflow = 'hidden'
        return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow }
    }, [form, closeForm])

    const handleSave = async (e) => {
        e.preventDefault()
        const name = form.name.trim().replace(/\s+/g, ' ')
        if (!name) { setFormError('Escreva o nome da categoria.'); return }
        if (name.length > MAX_NAME) { setFormError(`O nome pode ter até ${MAX_NAME} letras.`); return }
        setSaving(true)
        setFormError('')
        try {
            const res = await fetch(form.id ? `/api/finance/categories/${form.id}` : '/api/finance/categories', {
                method: form.id ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ name, type: form.type })
            })
            const body = await res.json().catch(() => ({}))
            if (!res.ok) { setFormError(body.message || 'Não deu para salvar a categoria. Tente de novo.'); return }
            setForm(null)
            fetchCategories()
        } catch {
            setFormError('Sem conexão. Verifique a internet e tente de novo.')
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async (cat) => {
        const tx = Number(cat.transactionsCount) || 0
        const items = Number(cat.invoiceItemsCount) || 0
        const details = []
        if (tx) details.push({ label: 'Lançamentos que ficam sem categoria', value: tx.toLocaleString('pt-BR') })
        if (items) details.push({ label: 'Compras de cartão que ficam sem categoria', value: items.toLocaleString('pt-BR') })
        const ok = await confirm({
            title: `Excluir a categoria ${cat.name}?`,
            message: tx || items
                ? 'Nada é apagado do Extrato: o que usa essa categoria só fica sem categoria. Isso não pode ser desfeito.'
                : 'Nenhum lançamento usa essa categoria. Isso não pode ser desfeito.',
            details,
            confirmLabel: 'Excluir categoria',
            tone: 'danger'
        })
        if (!ok) return
        try {
            const res = await fetch(`/api/finance/categories/${cat.id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } })
            const body = await res.json().catch(() => ({}))
            if (!res.ok) {
                notify({ title: 'Não deu para excluir', message: body.message || 'Tente de novo em instantes.', tone: 'error' })
                return
            }
            fetchCategories()
        } catch {
            notify({ title: 'Sem conexão', message: 'Não deu para excluir a categoria. Tente de novo.', tone: 'error' })
        }
    }

    // ── Telas ───────────────────────────────────────────────────────────
    if (!canEdit) {
        return (
            <div className="categorias">
                <div className="ctg-container">
                    <FeatureLock
                        featureName="Categorias próprias"
                        requiredPlan={planWith(plans, 'categorias', 'Prata')}
                        description="Organize os lançamentos com categorias suas: receitas, despesas do MEI e despesas pessoais."
                        icon={<Tags size={28} aria-hidden="true" />}
                    />
                </div>
            </div>
        )
    }

    const typeLocked = form?.id && form.uses > 0

    return (
        <div className="categorias">
            <div className="ctg-container">
                <header className="ctg-head">
                    <div>
                        <h1 className="ctg-title">Categorias</h1>
                        <p className="ctg-sub">Organizam os lançamentos no Extrato, no Painel e nos relatórios.</p>
                    </div>
                    <button type="button" className="btn btn-primary" onClick={() => openNew()}>
                        <Plus size={18} aria-hidden="true" /> Nova categoria
                    </button>
                </header>

                {loadState === 'loading' && (
                    <div className="csp-loading" aria-busy="true">{Array.from({ length: 4 }, (_, i) => <span key={i} />)}</div>
                )}

                {loadState === 'error' && (
                    <div className="csp-message" role="alert">
                        <p>Não deu para carregar as categorias.</p>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={fetchCategories}>Tentar de novo</button>
                    </div>
                )}

                {loadState === 'ok' && (
                    <>
                        <section className="csp csp--flat ctg-stats" aria-label="Resumo das categorias">
                            <dl className="csp-stats">
                                <Stat
                                    main
                                    icon={Tags}
                                    label="Categorias"
                                    value={categories.length.toLocaleString('pt-BR')}
                                    note={uncategorized ? `${plural(uncategorized, 'lançamento', 'lançamentos')} sem categoria em ${year}` : `todos os lançamentos de ${year} com categoria`}
                                />
                                {TYPES.map(t => {
                                    const top = topOf(t.value)
                                    return (
                                        <Stat
                                            key={t.value}
                                            icon={t.icon}
                                            label={t.label}
                                            value={`${countOf(t.value)} ${countOf(t.value) === 1 ? 'categoria' : 'categorias'}`}
                                            note={top ? `${brl(yearOf(t.value))} em ${year}; mais usada: ${top.name}` : `${brl(yearOf(t.value))} em ${year}`}
                                        />
                                    )
                                })}
                            </dl>
                        </section>

                        {uncategorized > 0 && (
                            <p className="ctg-note">
                                <AlertTriangle size={18} aria-hidden="true" />
                                <span>{plural(uncategorized, 'lançamento', 'lançamentos')} de {year} {uncategorized === 1 ? 'está' : 'estão'} sem categoria. Com categoria, o Painel e os relatórios mostram para onde vai o dinheiro. Dá para escolher a categoria editando o lançamento no <Link to="/financas/extrato">Extrato</Link>.</span>
                            </p>
                        )}

                        {categories.length > 8 && (
                            <label className="ctg-search">
                                <Search size={16} aria-hidden="true" />
                                <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar categoria" aria-label="Buscar categoria pelo nome" />
                            </label>
                        )}

                        <div className="ctg-groups">
                            {TYPES.map(t => {
                                const list = byType(t.value)
                                const Icon = t.icon
                                return (
                                    <section key={t.value} className="ctg-group" aria-labelledby={`ctg-${t.value}`}>
                                        <div className="ctg-group__head">
                                            <h2 id={`ctg-${t.value}`} className="ctg-group__title">
                                                <span className="ctg-group__icon" aria-hidden="true"><Icon size={18} /></span>
                                                {t.label}
                                                <span className="ctg-count">{countOf(t.value)}</span>
                                            </h2>
                                            <button type="button" className="ctg-add" onClick={() => openNew(t.value)} aria-label={`Nova categoria de ${t.one}`}>
                                                <Plus size={16} aria-hidden="true" /> Nova
                                            </button>
                                        </div>
                                        <p className="ctg-group__hint">{t.hint}</p>

                                        {list.length === 0 ? (
                                            <p className="ctg-empty">
                                                {search.trim() ? `Nenhuma com “${search.trim()}”.` : 'Nenhuma categoria ainda.'}
                                            </p>
                                        ) : (
                                            <ul className="ctg-list">
                                                {list.map(cat => {
                                                    const uses = usesOf(cat)
                                                    return (
                                                        <li key={cat.id} className="ctg-item">
                                                            <div className="ctg-item__main">
                                                                <strong>{cat.name}</strong>
                                                                <span>
                                                                    {uses ? plural(uses, 'lançamento', 'lançamentos') : 'Ainda não usada'}
                                                                    {Number(cat.yearTotal) ? `, ${brl(cat.yearTotal)} em ${year}` : ''}
                                                                </span>
                                                            </div>
                                                            <div className="ctg-item__actions">
                                                                <button type="button" className="ctg-icon-btn" onClick={() => openEdit(cat)} aria-label={`Editar a categoria ${cat.name}`} title="Editar">
                                                                    <Pencil size={18} aria-hidden="true" />
                                                                </button>
                                                                <button type="button" className="ctg-icon-btn ctg-icon-btn--danger" onClick={() => handleDelete(cat)} aria-label={`Excluir a categoria ${cat.name}`} title="Excluir">
                                                                    <Trash2 size={18} aria-hidden="true" />
                                                                </button>
                                                            </div>
                                                        </li>
                                                    )
                                                })}
                                            </ul>
                                        )}
                                    </section>
                                )
                            })}
                        </div>
                    </>
                )}
            </div>

            {form && (
                <div className="cd-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) closeForm() }}>
                    <form className="cd-box ctg-box" role="dialog" aria-modal="true" aria-labelledby="ctg-form-title" onSubmit={handleSave} noValidate>
                        <button type="button" className="ctg-box__close" onClick={closeForm} aria-label="Fechar" disabled={saving}><X size={20} aria-hidden="true" /></button>
                        <h2 id="ctg-form-title" className="cd-title">{form.id ? 'Editar categoria' : 'Nova categoria'}</h2>
                        <p className="cd-message">{form.id && form.uses ? `Usada em ${plural(form.uses, 'lançamento', 'lançamentos')}. Mudar o nome muda em todos.` : 'Aparece na hora de lançar e nos relatórios.'}</p>

                        <label className="ctg-field">
                            <span>Nome</span>
                            <input
                                type="text"
                                autoFocus
                                maxLength={MAX_NAME}
                                value={form.name}
                                onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                                placeholder={form.type === 'RECEITA' ? 'Ex.: Vendas, Serviços' : form.type === 'DESPESA_MEI' ? 'Ex.: Matéria-prima, DAS' : 'Ex.: Mercado, Aluguel'}
                            />
                        </label>

                        <fieldset className="ctg-field ctg-types" disabled={typeLocked}>
                            <legend>Tipo</legend>
                            <div className="ctg-seg" role="radiogroup" aria-label="Tipo da categoria">
                                {TYPES.map(t => (
                                    <label key={t.value} className={`ctg-seg__opt ${form.type === t.value ? 'is-on' : ''}`}>
                                        <input
                                            type="radio"
                                            name="ctg-type"
                                            value={t.value}
                                            checked={form.type === t.value}
                                            onChange={() => setForm(prev => ({ ...prev, type: t.value }))}
                                        />
                                        <t.icon size={16} aria-hidden="true" />
                                        {t.label}
                                    </label>
                                ))}
                            </div>
                            <small>{typeLocked ? 'O tipo não muda porque a categoria já tem lançamentos. Para outro tipo, crie uma categoria nova.' : typeOf(form.type).hint}</small>
                        </fieldset>

                        {formError && <p className="ctg-alert" role="alert">{formError}</p>}

                        <div className="cd-actions">
                            <button type="button" className="cd-btn" onClick={closeForm} disabled={saving}>Cancelar</button>
                            <button type="submit" className="cd-btn cd-btn--primary" disabled={saving}>
                                {saving ? 'Salvando...' : form.id ? 'Salvar' : 'Criar categoria'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {dialog}
        </div>
    )
}
