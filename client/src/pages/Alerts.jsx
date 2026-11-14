import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Bell, TrendingUp, Receipt, FileText, CircleCheck, AlertTriangle, CalendarClock } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import FeatureLock from '../components/FeatureLock'
import Select from '../components/ui/Select'
import { useConfirmDialog } from '../components/ui/ConfirmDialog'
import { Stat } from '../components/cards/CardsSummaryPanel'
import './Alerts.css'

const brl = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const pct = (v) => `${(Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
const dateBR = (iso) => (iso ? iso.split('-').reverse().join('/') : '')
const daysText = (n) => (n === 0 ? 'hoje' : n === 1 ? 'amanhã' : `daqui a ${n} dias`)

const parseConfig = (raw) => {
    if (raw && typeof raw === 'object') return raw
    try { return JSON.parse(raw || '{}') || {} } catch { return {} }
}

const PERCENT_OPTIONS = [50, 60, 70, 75, 80, 85, 90, 95, 100].map(n => ({ value: String(n), label: `${n}% do limite` }))
const DAYS_OPTIONS = [1, 2, 3, 5, 7, 10, 15].map(n => ({ value: String(n), label: n === 1 ? '1 dia' : `${n} dias` }))

const ALERT_INFO = {
    REVENUE_LIMIT: { icon: TrendingUp, title: 'Limite de faturamento do MEI', text: 'Avisa quando o que o MEI recebeu no ano chega perto do limite anual.' },
    DAS_EXPIRY: { icon: Receipt, title: 'Vencimento do DAS', text: 'Lembra de pagar o DAS, que vence todo dia 20.' },
    ANNUAL_DECLARATION: { icon: FileText, title: 'Declaração anual (DASN-SIMEI)', text: 'Lembra de entregar a declaração do ano anterior, em abril e maio.' }
}
const ORDER = ['REVENUE_LIMIT', 'DAS_EXPIRY', 'ANNUAL_DECLARATION']

// Plano mais barato que libera um recurso (o admin decide os recursos de cada plano)
const planWith = (plans, feature, fallback) => {
    const found = (plans || []).filter(p => p.features?.[feature]).sort((a, b) => Number(a.price) - Number(b.price))[0]
    return found?.name || fallback
}

export default function Alerts() {
    const { user } = useAuth()
    const { notify, dialog } = useConfirmDialog()
    const token = localStorage.getItem('token')
    const canUse = user?.planFeatures?.alertas || user?.isInTrial || user?.role === 'ADMIN'

    const [status, setStatus] = useState(null)
    const [loadState, setLoadState] = useState('loading') // loading | ok | error
    const [savingId, setSavingId] = useState(null)
    const [savedId, setSavedId] = useState(null)
    const [plans, setPlans] = useState([])

    useEffect(() => {
        if (canUse) return
        fetch('/api/plans').then(r => (r.ok ? r.json() : [])).then(list => setPlans(Array.isArray(list) ? list : [])).catch(() => {})
    }, [canUse])

    const fetchStatus = useCallback(async () => {
        try {
            const res = await fetch('/api/alerts/status', { headers: { 'Authorization': `Bearer ${token}` } })
            if (!res.ok) throw new Error()
            setStatus(await res.json())
            setLoadState('ok')
        } catch {
            setLoadState('error')
        }
    }, [token])

    useEffect(() => { if (canUse) fetchStatus() }, [canUse, fetchStatus])

    // Liga/desliga e configuração: a tela muda na hora e volta se o servidor recusar
    const saveAlert = async (alert, change) => {
        const before = status
        setStatus(prev => ({
            ...prev,
            alerts: prev.alerts.map(a => (a.id === alert.id
                ? { ...a, ...(change.enabled !== undefined ? { enabled: change.enabled } : {}), ...(change.config ? { config: JSON.stringify({ ...parseConfig(a.config), ...change.config }) } : {}) }
                : a))
        }))
        setSavingId(alert.id)
        setSavedId(null)
        try {
            const res = await fetch(`/api/alerts/${alert.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(change)
            })
            const body = await res.json().catch(() => ({}))
            if (!res.ok) {
                setStatus(before)
                notify({ title: 'Não deu para salvar o alerta', message: body.message || 'Tente de novo em instantes.', tone: 'error' })
                return
            }
            setSavedId(alert.id)
            fetchStatus()
        } catch {
            setStatus(before)
            notify({ title: 'Sem conexão', message: 'O alerta não foi salvo. Confira a internet e tente de novo.', tone: 'error' })
        } finally {
            setSavingId(null)
        }
    }

    if (!canUse) {
        return (
            <div className="alertas">
                <div className="alr-container">
                    <FeatureLock
                        featureName="Alertas do MEI"
                        requiredPlan={planWith(plans, 'alertas', 'Prata')}
                        description="Avisos do limite de faturamento, do vencimento do DAS e da declaração anual."
                        icon={<Bell size={28} aria-hidden="true" />}
                    />
                </div>
            </div>
        )
    }

    const revenue = status?.revenue
    const alerts = status ? ORDER.map(t => status.alerts.find(a => a.type === t)).filter(Boolean) : []
    const revenueAlert = alerts.find(a => a.type === 'REVENUE_LIMIT')
    const trigger = Number(parseConfig(revenueAlert?.config).trigger_at_percentage) || 80
    const barWidth = Math.min(100, Number(revenue?.percent) || 0)
    const left = revenue ? revenue.limit - revenue.total : 0

    return (
        <div className="alertas">
            <div className="alr-container">
                <header className="alr-head">
                    <h1 className="alr-title">Alertas</h1>
                    <p className="alr-sub">Avisos do MEI que aparecem aqui e no Painel: limite de faturamento, DAS e declaração anual.</p>
                    {(user?.planFeatures?.whatsapp || user?.isInTrial || user?.role === 'ADMIN') && (
                        <p className="alr-sub alr-sub--wa">
                            Os números de WhatsApp vinculados em <Link to="/conta">Minha conta</Link>, com lembrete ligado, também recebem cada aviso uma vez, às 8h.
                        </p>
                    )}
                </header>

                {loadState === 'loading' && (
                    <div className="csp-loading" aria-busy="true">{Array.from({ length: 3 }, (_, i) => <span key={i} />)}</div>
                )}

                {loadState === 'error' && (
                    <div className="csp-message" role="alert">
                        <p>Não deu para carregar os alertas.</p>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setLoadState('loading'); fetchStatus() }}>Tentar de novo</button>
                    </div>
                )}

                {loadState === 'ok' && status && (
                    <>
                        <div className="alr-top">
                            {/* Faturamento do ano: o destaque da página */}
                            <section className="alr-revenue" aria-labelledby="alr-revenue-title">
                                <h2 id="alr-revenue-title" className="alr-revenue__label">Faturamento do MEI em {revenue.year}</h2>
                                {revenue.source ? (
                                    <>
                                        <p className="alr-revenue__value">{brl(revenue.total)}</p>
                                        <div className="alr-bar" role="img" aria-label={`${pct(revenue.percent)} do limite anual`}>
                                            <i style={{ width: `${barWidth}%` }} />
                                            {revenueAlert?.enabled && <b style={{ left: `${trigger}%` }} title={`Aviso em ${trigger}%`} />}
                                        </div>
                                        <div className="alr-revenue__row">
                                            <span className="alr-revenue__tag">{pct(revenue.percent)} do limite</span>
                                            <span>
                                                {left >= 0 ? `Faltam ${brl(left)} para o limite de ${brl(revenue.limit)}` : `Passou ${brl(-left)} do limite de ${brl(revenue.limit)}`}
                                            </span>
                                        </div>
                                        <p className="alr-revenue__note">
                                            {revenue.source === 'extrato'
                                                ? 'Soma das receitas das carteiras do MEI já recebidas no ano, sem transferências entre carteiras.'
                                                : `Ainda não há receitas do MEI recebidas em ${revenue.year}. A conta usa a sua última simulação${revenue.monthly ? ` (${brl(revenue.monthly)} por mês)` : ''}.`}
                                        </p>
                                    </>
                                ) : (
                                    <>
                                        <p className="alr-revenue__value">{brl(0)}</p>
                                        <p className="alr-revenue__note">
                                            Ainda não há receitas do MEI em {revenue.year}. Lance as vendas no <Link to="/financas/extrato">Extrato</Link> para acompanhar o limite de {brl(revenue.limit)} por ano.
                                        </p>
                                    </>
                                )}
                            </section>

                            <section className="csp csp--flat alr-dates" aria-label="Próximos prazos">
                            <dl className="csp-stats">
                                <Stat
                                    icon={CalendarClock}
                                    label={`DAS de ${status.das.referenceMonth}`}
                                    value={`vence ${dateBR(status.das.dueDate)}`}
                                    note={daysText(status.das.daysLeft)}
                                />
                                <Stat
                                    icon={FileText}
                                    label={`Declaração anual de ${status.dasn.referenceYear}`}
                                    value={`até ${dateBR(status.dasn.deadline)}`}
                                    note={status.dasn.season ? daysText(status.dasn.daysLeft) : 'o aviso começa em abril'}
                                />
                            </dl>
                            </section>
                        </div>

                        <section className="alr-section" aria-labelledby="alr-now-title">
                            <h2 id="alr-now-title" className="alr-h2">Avisos de agora</h2>
                            {status.triggered.length === 0 ? (
                                <p className="alr-clear"><CircleCheck size={18} aria-hidden="true" /> Nenhum aviso agora. Quando algum alerta ligado disparar, ele aparece aqui e no Painel.</p>
                            ) : (
                                <ul className="alr-notices">
                                    {status.triggered.map(t => (
                                        <li key={`${t.type}-${t.id}`} className={`alr-notice ${t.severity === 'danger' ? 'is-danger' : ''}`}>
                                            <AlertTriangle size={18} aria-hidden="true" />
                                            <div>
                                                <strong>{t.title}</strong>
                                                <span>{t.message}</span>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>

                        <section className="alr-section" aria-labelledby="alr-list-title">
                            <h2 id="alr-list-title" className="alr-h2">Seus alertas</h2>
                            <ul className="alr-list">
                                {alerts.map(alert => {
                                    const info = ALERT_INFO[alert.type]
                                    const Icon = info.icon
                                    const config = parseConfig(alert.config)
                                    const busy = savingId === alert.id
                                    return (
                                        <li key={alert.id} className={`alr-item ${alert.enabled ? '' : 'is-off'}`}>
                                            <span className="alr-item__icon" aria-hidden="true"><Icon size={20} /></span>
                                            <div className="alr-item__main">
                                                <h3 className="alr-item__title" id={`alr-${alert.id}`}>{info.title}</h3>
                                                <p className="alr-item__text">{info.text}</p>

                                                {alert.enabled && alert.type === 'REVENUE_LIMIT' && (
                                                    <div className="alr-config">
                                                        <span>Avisar quando chegar a</span>
                                                        <Select
                                                            variant="field"
                                                            ariaLabel="Quando avisar do limite"
                                                            value={String(config.trigger_at_percentage || 80)}
                                                            onChange={(v) => saveAlert(alert, { config: { trigger_at_percentage: Number(v) } })}
                                                            options={PERCENT_OPTIONS}
                                                        />
                                                    </div>
                                                )}
                                                {alert.enabled && alert.type === 'DAS_EXPIRY' && (
                                                    <div className="alr-config">
                                                        <span>Avisar antes do dia 20, com</span>
                                                        <Select
                                                            variant="field"
                                                            ariaLabel="Quantos dias antes do vencimento do DAS"
                                                            value={String(config.days_before || 5)}
                                                            onChange={(v) => saveAlert(alert, { config: { days_before: Number(v) } })}
                                                            options={DAYS_OPTIONS}
                                                        />
                                                    </div>
                                                )}
                                                {alert.enabled && alert.type === 'ANNUAL_DECLARATION' && (
                                                    <p className="alr-config alr-config--text">Avisa de 1º de abril a 31 de maio, com os dias que faltam.</p>
                                                )}
                                                <span className="alr-saved" aria-live="polite">{savedId === alert.id && !busy ? 'Salvo' : ''}</span>
                                            </div>
                                            <button
                                                type="button"
                                                role="switch"
                                                aria-checked={alert.enabled}
                                                aria-labelledby={`alr-${alert.id}`}
                                                className={`alr-switch ${alert.enabled ? 'is-on' : ''}`}
                                                onClick={() => saveAlert(alert, { enabled: !alert.enabled })}
                                                disabled={busy}
                                            >
                                                <span className="alr-switch__track" aria-hidden="true"><span className="alr-switch__dot" /></span>
                                                <span className="alr-switch__label">{alert.enabled ? 'Ligado' : 'Desligado'}</span>
                                            </button>
                                        </li>
                                    )
                                })}
                            </ul>
                        </section>
                    </>
                )}
            </div>
            {dialog}
        </div>
    )
}
