import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Pencil, Power, Check, X, AlertTriangle, RotateCw, CircleCheck, CircleAlert, Users } from 'lucide-react'
import { FEATURE_LABELS, formatBRL } from '../../components/plans/planFeatures'
import { useConfirmDialog } from '../../components/ui/ConfirmDialog'
import { showToast } from '../../utils/toast'
// AdminPages.css segue importado: as outras páginas do admin ainda usam as classes dele
import './AdminPages.css'
import './AdminPlans.css'

const authHeaders = (json = false) => {
    const h = { Authorization: `Bearer ${localStorage.getItem('token')}` }
    if (json) h['Content-Type'] = 'application/json'
    return h
}
async function api(url, options = {}) {
    const res = await fetch(url, options)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
        const err = new Error(data.message || 'Não deu para concluir agora. Tente de novo.')
        err.field = data.field
        throw err
    }
    return data
}

// "19,90" -> 19.9 ; aceita "1.234,56"
const parseMoney = (txt) => {
    const clean = String(txt || '').replace(/[^\d,]/g, '')
    if (!clean) return null
    const [int, dec = ''] = clean.split(',')
    const n = Number(`${int || '0'}.${dec.slice(0, 2).padEnd(2, '0')}`)
    return Number.isFinite(n) ? n : null
}
const moneyText = (v) => (v === null || v === undefined ? '' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))

// Como está o preço no Stripe, em uma linha (o que o cliente paga de verdade)
function stripeLine(plan) {
    const s = plan.stripe || {}
    if (plan.price === 0) return { tone: 'muted', text: 'Plano gratuito: sem cobrança' }
    if (s.status === 'missing') return { tone: 'warn', text: 'Sem o código do preço no Stripe: ninguém consegue assinar' }
    if (s.status === 'not_found') return { tone: 'danger', text: 'O código do preço não existe no Stripe' }
    if (s.status === 'unconfigured') return { tone: 'muted', text: 'Stripe não configurado neste servidor' }
    if (s.status === 'error') return { tone: 'muted', text: 'Não deu para consultar o Stripe agora' }
    if (s.status === 'ok') {
        const same = Math.round(s.amount * 100) === Math.round(plan.price * 100) && s.interval === 'month' && s.currency === 'brl' && s.active
        if (same) return { tone: 'ok', text: `No Stripe: ${formatBRL(s.amount)} por mês, igual ao site` }
        if (!s.active) return { tone: 'danger', text: 'O preço está arquivado no Stripe' }
        return { tone: 'danger', text: `No Stripe: ${formatBRL(s.amount)}${s.interval === 'month' ? ' por mês' : ` por ${s.interval === 'year' ? 'ano' : s.interval}`}. Diferente do site` }
    }
    return { tone: 'muted', text: '' }
}

function Switch({ checked, onChange, label, disabled, id }) {
    return (
        <button
            type="button"
            id={id}
            role="switch"
            aria-checked={checked}
            aria-label={label}
            className={`apl-switch ${checked ? 'is-on' : ''}`}
            onClick={() => onChange(!checked)}
            disabled={disabled}
        >
            <span aria-hidden="true" />
        </button>
    )
}

function PlanDialog({ plan, onClose, onSaved }) {
    const isNew = !plan.id
    const isFree = !isNew && plan.price === 0
    const [form, setForm] = useState({
        name: plan.name || '',
        price: isNew ? '' : moneyText(plan.price),
        stripePriceId: plan.stripePriceId || '',
        isActive: isNew ? true : plan.isActive,
        features: { ...(plan.features || {}) },
    })
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState(null)
    const boxRef = useRef(null)

    useEffect(() => {
        const prev = document.activeElement
        const { overflow } = document.body.style
        document.body.style.overflow = 'hidden'
        boxRef.current?.querySelector('input:not([disabled])')?.focus()
        const onKey = (e) => {
            if (e.key === 'Escape' && !e.defaultPrevented && !saving) onClose()
        }
        document.addEventListener('keydown', onKey)
        return () => {
            document.removeEventListener('keydown', onKey)
            document.body.style.overflow = overflow
            prev?.focus?.()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [saving])

    const price = parseMoney(form.price)
    const priceChanged = !isNew && (price !== plan.price || (form.stripePriceId.trim() || null) !== (plan.stripePriceId || null))

    const save = async (e) => {
        e.preventDefault()
        setError(null)
        if (!form.name.trim()) return setError({ field: 'name', message: 'Dê um nome ao plano.' })
        if (price === null) return setError({ field: 'price', message: 'Digite o preço por mês (0 para gratuito).' })
        const body = {
            name: form.name,
            price,
            isActive: form.isActive,
            features: form.features,
            stripePriceId: form.stripePriceId.trim() || null,
        }
        if (isFree) delete body.stripePriceId
        setSaving(true)
        try {
            await api(isNew ? '/api/admin/plans' : `/api/admin/plans/${plan.id}`, {
                method: isNew ? 'POST' : 'PUT', headers: authHeaders(true), body: JSON.stringify(body),
            })
            showToast(isNew ? 'Plano criado.' : 'Plano salvo.', 'success')
            onSaved()
        } catch (err) {
            setError({ field: err.field, message: err.message })
            setSaving(false)
        }
    }

    return (
        <div className="cd-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose() }}>
            <form ref={boxRef} className="cd-box apl-box" role="dialog" aria-modal="true" aria-labelledby="apl-title" onSubmit={save} noValidate>
                <button type="button" className="apl-box__close" onClick={onClose} aria-label="Fechar" disabled={saving}><X size={20} aria-hidden="true" /></button>
                <h2 id="apl-title" className="cd-title">{isNew ? 'Novo plano' : `Editar plano ${plan.name}`}</h2>

                <div className="apl-row">
                    <label className="apl-field">
                        <span>Nome</span>
                        <input type="text" value={form.name} maxLength={30} onChange={(e) => setForm({ ...form, name: e.target.value })}
                            aria-invalid={error?.field === 'name' || undefined} disabled={saving} />
                    </label>
                    <label className="apl-field">
                        <span>Preço por mês</span>
                        <span className="apl-money">
                            <b aria-hidden="true">R$</b>
                            <input type="text" inputMode="decimal" value={form.price} placeholder="0,00"
                                onChange={(e) => setForm({ ...form, price: e.target.value.replace(/[^\d.,]/g, '') })}
                                onBlur={() => { const v = parseMoney(form.price); if (v !== null) setForm((f) => ({ ...f, price: moneyText(v) })) }}
                                aria-invalid={error?.field === 'price' || undefined} disabled={saving || isFree} />
                        </span>
                        {isFree && <small>O gratuito fica sempre em R$ 0,00: é para ele que volta quem para de pagar.</small>}
                    </label>
                </div>

                {!isFree && (
                    <label className="apl-field">
                        <span>Código do preço no Stripe</span>
                        <input type="text" value={form.stripePriceId} placeholder="price_..." autoComplete="off" spellCheck={false}
                            onChange={(e) => setForm({ ...form, stripePriceId: e.target.value.trim() })}
                            aria-invalid={error?.field === 'stripePriceId' || undefined} disabled={saving || price === 0} />
                        <small>
                            No Stripe: Catálogo de produtos &gt; o plano &gt; o preço &gt; copie o ID (começa com price_). Tem de ser mensal, em reais e com o mesmo valor daqui.
                            {plan.priceSource === 'variavel' && !form.stripePriceId && ' Hoje este plano usa o código que está na configuração do servidor.'}
                        </small>
                    </label>
                )}

                {priceChanged && plan.paying > 0 && (
                    <p className="apl-note apl-note--warn">
                        Quem já assina ({plan.paying}) continua pagando o preço antigo do Stripe. O preço novo vale para quem assinar daqui para frente.
                    </p>
                )}

                <fieldset className="apl-field apl-features" disabled={saving}>
                    <legend>O que o plano libera</legend>
                    <ul>
                        {FEATURE_LABELS.map(([key, label]) => (
                            <li key={key}>
                                <label htmlFor={`apl-f-${key}`}>{label}</label>
                                <Switch id={`apl-f-${key}`} label={label} checked={!!form.features[key]}
                                    onChange={(v) => setForm((f) => ({ ...f, features: { ...f.features, [key]: v } }))} />
                            </li>
                        ))}
                    </ul>
                    <small>Limites de uso (carteiras, lançamentos, leituras de fatura, números de WhatsApp) ficam em <Link to="/admin/funcionalidades" className="apl-link">Funcionalidades</Link>.</small>
                </fieldset>

                <div className="apl-field apl-active">
                    <label htmlFor="apl-active">Aparece em Planos para quem vai assinar</label>
                    <Switch id="apl-active" label="Plano ativo" checked={form.isActive} disabled={saving || isFree}
                        onChange={(v) => setForm({ ...form, isActive: v })} />
                </div>

                {error && <p className="apl-note apl-note--error" role="alert">{error.message}</p>}

                <div className="cd-actions">
                    <button type="button" className="cd-btn" onClick={onClose} disabled={saving}>Cancelar</button>
                    <button type="submit" className="cd-btn cd-btn--primary" disabled={saving}>{saving ? 'Salvando…' : (isNew ? 'Criar plano' : 'Salvar plano')}</button>
                </div>
            </form>
        </div>
    )
}

export default function AdminPlans() {
    const { confirm, dialog } = useConfirmDialog()
    const [plans, setPlans] = useState([])
    const [status, setStatus] = useState('loading')
    const [editing, setEditing] = useState(null)

    const load = useCallback(async () => {
        try {
            const data = await api('/api/admin/plans', { headers: authHeaders() })
            if (!Array.isArray(data)) throw new Error('resposta inesperada')
            setPlans(data)
            setStatus('ready')
        } catch (err) {
            console.error('Planos:', err)
            setStatus('error')
        }
    }, [])
    useEffect(() => { load() }, [load])

    const toggleActive = async (plan) => {
        const turningOff = plan.isActive
        const ok = await confirm(turningOff
            ? {
                title: `Desativar o plano ${plan.name}?`,
                message: `Ele some da página Planos para quem vai assinar. ${plan.accounts > 0 ? `As ${plan.accounts} contas que estão nele continuam com os recursos e a cobrança de hoje.` : ''}`,
                confirmLabel: 'Desativar plano',
                tone: 'danger',
            }
            : { title: `Ativar o plano ${plan.name}?`, message: 'Ele volta a aparecer na página Planos para quem vai assinar.', confirmLabel: 'Ativar plano' })
        if (!ok) return
        try {
            await api(`/api/admin/plans/${plan.id}`, { method: 'PUT', headers: authHeaders(true), body: JSON.stringify({ isActive: !plan.isActive }) })
            showToast(turningOff ? 'Plano desativado.' : 'Plano ativado.', 'success')
            load()
        } catch (err) {
            showToast(err.message, 'error')
        }
    }

    return (
        <div className="apl adm-light">
            <header className="apl-head">
                <div>
                    <h1>Planos</h1>
                    <p>Quanto cada plano custa e o que ele libera. O preço do site tem de ser o mesmo do Stripe.</p>
                </div>
                {status === 'ready' && (
                    <button type="button" className="apl-btn apl-btn--primary" onClick={() => setEditing({ features: {} })}>
                        <Plus size={18} aria-hidden="true" />Novo plano
                    </button>
                )}
            </header>

            {status === 'loading' && <div className="apl-state" role="status"><span className="apl-spinner" aria-hidden="true" />Carregando os planos…</div>}

            {status === 'error' && (
                <div className="apl-state apl-state--error" role="alert">
                    <span className="apl-state__icon" aria-hidden="true"><AlertTriangle size={22} /></span>
                    <h2>Não deu para carregar os planos</h2>
                    <p>O servidor não respondeu direito. Tente de novo em alguns segundos.</p>
                    <button type="button" className="apl-btn apl-btn--primary" onClick={() => { setStatus('loading'); load() }}>
                        <RotateCw size={16} aria-hidden="true" />Tentar de novo
                    </button>
                </div>
            )}

            {status === 'ready' && (
                <ul className="apl-grid">
                    {plans.map((plan) => {
                        const line = stripeLine(plan)
                        const LineIcon = line.tone === 'ok' ? CircleCheck : CircleAlert
                        return (
                            <li key={plan.id} className={`apl-card ${plan.isActive ? '' : 'is-off'}`}>
                                <div className="apl-card__head">
                                    <h2>{plan.name}</h2>
                                    <span className={`apl-tag ${plan.isActive ? 'apl-tag--on' : 'apl-tag--off'}`}>{plan.isActive ? 'Ativo' : 'Inativo'}</span>
                                </div>
                                <p className="apl-price">
                                    {plan.price > 0 ? <>{formatBRL(plan.price)}<small>/mês</small></> : 'Grátis'}
                                </p>
                                {line.text && (
                                    <p className={`apl-stripe apl-stripe--${line.tone}`}>
                                        {line.tone !== 'muted' && <LineIcon size={16} aria-hidden="true" />}
                                        {line.text}
                                    </p>
                                )}
                                <p className="apl-people">
                                    <Users size={16} aria-hidden="true" />
                                    {plan.accounts} {plan.accounts === 1 ? 'conta' : 'contas'}
                                    {plan.price > 0 && `, ${plan.paying} pagando`}
                                </p>
                                <ul className="apl-features-list" aria-label={`Recursos do plano ${plan.name}`}>
                                    {FEATURE_LABELS.map(([key, label]) => {
                                        const on = !!plan.features?.[key]
                                        return (
                                            <li key={key} className={on ? 'is-on' : ''}>
                                                {on ? <Check size={16} aria-hidden="true" /> : <X size={16} aria-hidden="true" />}
                                                <span>{label}</span>
                                                <span className="apl-sr">{on ? '(incluído)' : '(não incluído)'}</span>
                                            </li>
                                        )
                                    })}
                                </ul>
                                <div className="apl-card__actions">
                                    <button type="button" className="apl-btn" onClick={() => setEditing(plan)}>
                                        <Pencil size={16} aria-hidden="true" />Editar
                                    </button>
                                    {plan.price > 0 && (
                                        <button type="button" className="apl-btn" onClick={() => toggleActive(plan)}>
                                            <Power size={16} aria-hidden="true" />{plan.isActive ? 'Desativar' : 'Ativar'}
                                        </button>
                                    )}
                                </div>
                            </li>
                        )
                    })}
                </ul>
            )}

            {editing && <PlanDialog plan={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
            {dialog}
        </div>
    )
}
