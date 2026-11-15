import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ToggleRight, Gauge, Mail, MessageCircle, AlertTriangle, RotateCw, CircleCheck, CircleAlert, Send } from 'lucide-react'
import { FEATURE_LABELS } from '../../components/plans/planFeatures'
import { useConfirmDialog } from '../../components/ui/ConfirmDialog'
import { showToast } from '../../utils/toast'
// AdminPages.css segue importado: as outras páginas do admin ainda usam as classes dele
import './AdminPages.css'
import './AdminFeatures.css'

const TZ = 'America/Sao_Paulo'
const fmtWhen = (v) => {
    if (!v) return ''
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' }).format(d)
}
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
        err.data = data
        throw err
    }
    return data
}

function Switch({ checked, onChange, label, disabled, busy }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            aria-busy={busy || undefined}
            className={`afn-switch ${checked ? 'is-on' : ''} ${busy ? 'is-busy' : ''}`}
            onClick={() => onChange(!checked)}
            disabled={disabled || busy}
        >
            <span aria-hidden="true" />
        </button>
    )
}

function Section({ icon: Icon, title, intro, children, aside, id }) {
    return (
        <section className="afn-section" aria-labelledby={`${id}-t`}>
            <div className="afn-section__head">
                <div className="afn-section__title">
                    <span className="afn-section__icon" aria-hidden="true"><Icon size={18} /></span>
                    <div>
                        <h2 id={`${id}-t`}>{title}</h2>
                        {intro && <p>{intro}</p>}
                    </div>
                </div>
                {aside}
            </div>
            {children}
        </section>
    )
}

function Problem({ text, onRetry }) {
    return (
        <div className="afn-problem" role="alert">
            <AlertTriangle size={18} aria-hidden="true" />
            <span>{text}</span>
            {onRetry && <button type="button" className="afn-btn afn-btn--sm" onClick={onRetry}><RotateCw size={15} aria-hidden="true" />Tentar de novo</button>}
        </div>
    )
}

// ── Recursos por plano: cada chave salva na hora ───────────────────────────────
function FeatureMatrix() {
    const [plans, setPlans] = useState(null)
    const [error, setError] = useState(false)
    const [busy, setBusy] = useState({})

    const load = useCallback(async () => {
        setError(false)
        try {
            const data = await api('/api/admin/plans', { headers: authHeaders() })
            if (!Array.isArray(data)) throw new Error('resposta inesperada')
            setPlans(data.filter((p) => p.isActive))
        } catch (err) {
            console.error('Recursos por plano:', err)
            setError(true)
        }
    }, [])
    useEffect(() => { load() }, [load])

    const toggle = async (plan, key, value) => {
        const id = `${plan.id}:${key}`
        setBusy((b) => ({ ...b, [id]: true }))
        // Muda na tela na hora e volta se o servidor recusar
        setPlans((ps) => ps.map((p) => (p.id === plan.id ? { ...p, features: { ...p.features, [key]: value } } : p)))
        try {
            await api(`/api/admin/plans/${plan.id}`, { method: 'PUT', headers: authHeaders(true), body: JSON.stringify({ features: { [key]: value } }) })
        } catch (err) {
            setPlans((ps) => ps.map((p) => (p.id === plan.id ? { ...p, features: { ...p.features, [key]: !value } } : p)))
            showToast(err.message, 'error')
        } finally {
            setBusy((b) => { const n = { ...b }; delete n[id]; return n })
        }
    }

    return (
        <Section
            id="afn-feat"
            icon={ToggleRight}
            title="Recursos por plano"
            intro="Ligou ou desligou, vale na hora para todas as contas do plano. Os nomes são os que o cliente vê em Planos."
            aside={<Link to="/admin/planos" className="afn-link">Preços e planos</Link>}
        >
            {error && <Problem text="Não deu para carregar os planos." onRetry={load} />}
            {!error && !plans && <p className="afn-muted" role="status">Carregando…</p>}
            {plans && (
                <>
                    <div className="afn-table-wrap afn-only-wide">
                        <table className="afn-table">
                            <thead>
                                <tr>
                                    <th scope="col">Recurso</th>
                                    {plans.map((p) => <th key={p.id} scope="col" className="afn-col-plan">{p.name}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {FEATURE_LABELS.map(([key, label]) => (
                                    <tr key={key}>
                                        <th scope="row">{label}</th>
                                        {plans.map((p) => (
                                            <td key={p.id} className="afn-col-plan">
                                                <Switch checked={!!p.features?.[key]} label={`${label} no plano ${p.name}`}
                                                    busy={!!busy[`${p.id}:${key}`]} onChange={(v) => toggle(p, key, v)} />
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="afn-only-narrow afn-plan-cards">
                        {plans.map((p) => (
                            <details key={p.id} className="afn-plan-card">
                                <summary>
                                    <span>{p.name}</span>
                                    <small>{FEATURE_LABELS.filter(([k]) => p.features?.[k]).length} de {FEATURE_LABELS.length} recursos</small>
                                </summary>
                                <ul>
                                    {FEATURE_LABELS.map(([key, label]) => (
                                        <li key={key}>
                                            <span>{label}</span>
                                            <Switch checked={!!p.features?.[key]} label={`${label} no plano ${p.name}`}
                                                busy={!!busy[`${p.id}:${key}`]} onChange={(v) => toggle(p, key, v)} />
                                        </li>
                                    ))}
                                </ul>
                            </details>
                        ))}
                    </div>
                </>
            )}
        </Section>
    )
}

// ── Limites de uso: editados juntos e salvos de uma vez ─────────────────────────
function LimitsTable() {
    const [data, setData] = useState(null)
    const [draft, setDraft] = useState({})
    const [error, setError] = useState(false)
    const [saving, setSaving] = useState(false)
    const [problem, setProblem] = useState(null)

    const load = useCallback(async () => {
        setError(false)
        try {
            const d = await api('/api/admin/plan-limits', { headers: authHeaders() })
            if (!d || !Array.isArray(d.plans) || !Array.isArray(d.defs) || !d.limits) throw new Error('resposta inesperada')
            setData(d)
            const text = {}
            for (const p of d.plans) {
                text[p.id] = {}
                for (const def of d.defs) {
                    const v = d.limits[p.id]?.[def.key]
                    text[p.id][def.key] = def.type === 'bool' ? !!v : String(v ?? 0)
                }
            }
            setDraft(text)
            setProblem(null)
        } catch (err) {
            console.error('Limites:', err)
            setError(true)
        }
    }, [])
    useEffect(() => { load() }, [load])

    const plans = useMemo(() => (data ? data.plans.filter((p) => p.isActive) : []), [data])
    const changes = useMemo(() => {
        if (!data) return {}
        const out = {}
        for (const p of plans) {
            for (const def of data.defs) {
                const now = draft[p.id]?.[def.key]
                const before = data.limits[p.id]?.[def.key]
                const same = def.type === 'bool' ? now === !!before : String(now).trim() === String(before)
                if (!same) {
                    out[p.id] = out[p.id] || {}
                    out[p.id][def.key] = def.type === 'bool' ? now : (String(now).trim() === '' ? '' : Number(String(now).trim()))
                }
            }
        }
        return out
    }, [data, draft, plans])
    const dirty = Object.keys(changes).length > 0

    const set = (pid, key, value) => setDraft((d) => ({ ...d, [pid]: { ...d[pid], [key]: value } }))

    const save = async () => {
        setProblem(null)
        setSaving(true)
        try {
            await api('/api/admin/plan-limits', { method: 'PUT', headers: authHeaders(true), body: JSON.stringify({ limits: changes }) })
            showToast('Limites salvos.', 'success')
            await load()
        } catch (err) {
            setProblem({ text: err.message, planId: err.data?.planId, key: err.data?.key })
        } finally {
            setSaving(false)
        }
    }

    const field = (p, def) => {
        const v = draft[p.id]?.[def.key]
        const label = `${def.label} no plano ${p.name}`
        if (def.type === 'bool') {
            return <Switch checked={!!v} label={label} disabled={saving} onChange={(x) => set(p.id, def.key, x)} />
        }
        const invalid = problem && problem.planId === p.id && problem.key === def.key
        return (
            <input
                type="text"
                inputMode="numeric"
                className="afn-num"
                aria-label={label}
                aria-invalid={invalid || undefined}
                value={v ?? ''}
                disabled={saving}
                onChange={(e) => set(p.id, def.key, e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
            />
        )
    }

    return (
        <Section
            id="afn-lim"
            icon={Gauge}
            title="Limites de uso por plano"
            intro="0 = sem limite. Vale para os planos ativos; o que passar do limite mostra ao cliente o aviso do plano."
        >
            {error && <Problem text="Não deu para carregar os limites." onRetry={load} />}
            {!error && !data && <p className="afn-muted" role="status">Carregando…</p>}
            {data && (
                <>
                    <div className="afn-table-wrap afn-only-wide">
                        <table className="afn-table afn-table--limits">
                            <thead>
                                <tr>
                                    <th scope="col">Limite</th>
                                    {plans.map((p) => <th key={p.id} scope="col" className="afn-col-plan">{p.name}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {data.defs.map((def) => (
                                    <tr key={def.key}>
                                        <th scope="row">
                                            {def.label}
                                            {def.key === 'single_device' && <small>Entrar num aparelho novo tira a conta dos outros.</small>}
                                        </th>
                                        {plans.map((p) => <td key={p.id} className="afn-col-plan">{field(p, def)}</td>)}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="afn-only-narrow afn-plan-cards">
                        {plans.map((p) => (
                            <details key={p.id} className="afn-plan-card">
                                <summary><span>{p.name}</span><small>{changes[p.id] ? 'Com mudanças' : 'Limites'}</small></summary>
                                <ul>
                                    {data.defs.map((def) => (
                                        <li key={def.key}>
                                            <span>{def.label}</span>
                                            {field(p, def)}
                                        </li>
                                    ))}
                                </ul>
                            </details>
                        ))}
                    </div>
                    {problem && <p className="afn-note afn-note--error" role="alert">{problem.text}</p>}
                    <div className="afn-actions">
                        {dirty && <span className="afn-muted">Há mudanças que ainda não foram salvas.</span>}
                        <button type="button" className="afn-btn" onClick={load} disabled={!dirty || saving}>Desfazer</button>
                        <button type="button" className="afn-btn afn-btn--primary" onClick={save} disabled={!dirty || saving}>{saving ? 'Salvando…' : 'Salvar limites'}</button>
                    </div>
                </>
            )}
        </Section>
    )
}

// ── E-mail do site ──────────────────────────────────────────────────────────────
function EmailStatus() {
    const [data, setData] = useState(null)
    const [error, setError] = useState(false)
    const [sending, setSending] = useState(false)
    const [result, setResult] = useState(null)

    const load = useCallback(async () => {
        setError(false)
        try {
            const d = await api('/api/admin/email/status', { headers: authHeaders() })
            if (!d || typeof d.configured !== 'boolean') throw new Error('resposta inesperada')
            setData(d)
        } catch (err) {
            console.error('E-mail do site:', err)
            setError(true)
        }
    }, [])
    useEffect(() => { load() }, [load])

    const sendTest = async () => {
        setSending(true)
        setResult(null)
        try {
            const d = await api('/api/admin/email/test', { method: 'POST', headers: authHeaders() })
            setResult({ ok: true, text: d.message || 'Enviado.' })
        } catch (err) {
            setResult({ ok: false, text: err.message })
        } finally {
            setSending(false)
            load()
        }
    }

    const kindName = { senha: 'link de senha nova', teste: 'e-mail de teste' }
    const last = data?.last

    return (
        <Section
            id="afn-mail"
            icon={Mail}
            title="E-mail do site"
            intro="Usado no link de senha nova. O serviço de envio fica nas variáveis da Vercel (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS e SMTP_FROM), nunca aqui."
        >
            {error && <Problem text="Não deu para ler a situação do e-mail." onRetry={load} />}
            {data && (
                <>
                    <dl className="afn-facts">
                        <div>
                            <dt>Situação</dt>
                            <dd className={data.configured ? 'is-ok' : 'is-warn'}>
                                {data.configured ? <CircleCheck size={16} aria-hidden="true" /> : <CircleAlert size={16} aria-hidden="true" />}
                                {data.configured ? 'Configurado' : 'Não configurado: os e-mails não estão saindo'}
                            </dd>
                        </div>
                        {data.configured && (
                            <>
                                <div><dt>Servidor</dt><dd>{data.host}, porta {data.port}</dd></div>
                                <div><dt>Remetente</dt><dd>{data.from}</dd></div>
                            </>
                        )}
                        <div className="is-wide">
                            <dt>Último envio</dt>
                            <dd>
                                {last
                                    ? <>{kindName[last.kind] || 'e-mail'} para {last.to}, {fmtWhen(last.at)}: <b className={last.ok ? 'is-ok' : 'is-bad'}>{last.ok ? 'enviado' : 'não saiu'}</b>{!last.ok && last.reason ? `. ${last.reason}` : ''}</>
                                    : 'Nenhum envio registrado ainda.'}
                            </dd>
                        </div>
                    </dl>
                    {result && <p className={`afn-note ${result.ok ? 'afn-note--ok' : 'afn-note--error'}`} role="status">{result.text}</p>}
                    <div className="afn-actions">
                        <button type="button" className="afn-btn afn-btn--primary" onClick={sendTest} disabled={sending}>
                            <Send size={16} aria-hidden="true" />{sending ? 'Enviando…' : 'Mandar e-mail de teste para mim'}
                        </button>
                    </div>
                </>
            )}
        </Section>
    )
}

// ── Lembretes no WhatsApp ───────────────────────────────────────────────────────
function WhatsAppReminders({ confirm }) {
    const [data, setData] = useState(null)
    const [error, setError] = useState(false)
    const [running, setRunning] = useState(false)
    const [result, setResult] = useState(null)

    const load = useCallback(async () => {
        setError(false)
        try {
            const d = await api('/api/admin/whatsapp/reminders', { headers: authHeaders() })
            if (!d || !d.templates) throw new Error('resposta inesperada')
            setData(d)
        } catch (err) {
            console.error('Lembretes no WhatsApp:', err)
            setError(true)
        }
    }, [])
    useEffect(() => { load() }, [load])

    const run = async (resend) => {
        const ok = await confirm(resend
            ? { title: 'Reenviar os lembretes de contas de hoje?', message: 'Manda o lembrete de contas de hoje de novo, também para quem já recebeu hoje.', confirmLabel: 'Reenviar' }
            : { title: 'Enviar os lembretes agora?', message: 'Manda o lembrete de contas e os alertas do MEI para quem ainda não recebeu hoje.', confirmLabel: 'Enviar agora' })
        if (!ok) return
        setRunning(true)
        setResult(null)
        try {
            const body = await api('/api/admin/whatsapp/reminders/run', { method: 'POST', headers: authHeaders(true), body: JSON.stringify({ resend }) })
            const fails = (body.failed || 0) + (body.alertas?.failed || 0)
            setResult({
                ok: fails === 0 && !body.resendBusy,
                text: `${body.resendBusy ? 'Um reenvio já rodou há menos de 1 minuto; esta rodada não reenviou. ' : ''}Rodada feita: ${body.sent || 0} lembrete(s) de contas e ${body.alertas?.sent || 0} alerta(s) enviados${fails ? `, ${fails} falha(s) (o motivo está abaixo)` : ''}.`,
            })
        } catch (err) {
            setResult({ ok: false, text: err.message })
        } finally {
            setRunning(false)
            load()
        }
    }

    const lastRun = data?.lastRun
    const part = (p) => (p ? `${p.sent} enviado(s), ${p.failed} falha(s), ${p.skipped} sem o recurso ou já enviado(s)` : '—')
    const billsWhy = (c) => {
        if (!c || c.withBills == null) return null
        if (!c.links) return 'Nenhum número de WhatsApp vinculado.'
        const parts = [`${c.withBills} de ${c.links} número(s) vinculados têm contas vencendo até hoje`]
        if (c.reminderOff) parts.push(`${c.reminderOff} com o lembrete desligado (PARAR)`)
        if (c.alreadyToday && !c.resend) parts.push(`${c.alreadyToday} já marcado(s) como enviado(s) hoje`)
        return `${parts.join('; ')}.`
    }

    return (
        <Section
            id="afn-wa"
            icon={MessageCircle}
            title="Lembretes no WhatsApp"
            intro={data ? `Todo dia às 8h (Brasília) saem o lembrete de contas vencendo (modelo ${data.templates.contas}) e os alertas do MEI (modelo ${data.templates.alertas}). Os dois modelos precisam estar aprovados no WhatsApp Manager da Meta.` : null}
        >
            {error && <Problem text="Não deu para ler os lembretes do WhatsApp." onRetry={load} />}
            {data && (
                <>
                    {(!data.configured || !data.cronSecret) && (
                        <div className="afn-note afn-note--error" role="alert">
                            {!data.configured && <p>WhatsApp não configurado no servidor: falta WHATSAPP_TOKEN ou WHATSAPP_PHONE_NUMBER_ID na Vercel.</p>}
                            {!data.cronSecret && <p>Falta CRON_SECRET na Vercel: sem ele o envio das 8h é recusado.</p>}
                        </div>
                    )}
                    <dl className="afn-facts">
                        <div className="is-wide">
                            <dt>Última rodada</dt>
                            <dd>{lastRun ? `${fmtWhen(lastRun.ranAt)} (${lastRun.trigger === 'admin' ? 'pelo botão' : 'automática'})` : 'Nenhuma rodada registrada ainda. Se já passou das 8h, confira o Cron Job na Vercel (Settings > Cron Jobs) e o CRON_SECRET.'}</dd>
                        </div>
                        {lastRun && (
                            <>
                                <div><dt>Contas vencendo{lastRun.contas?.resend ? ' (reenvio)' : ''}</dt><dd>{part(lastRun.contas)}</dd></div>
                                <div><dt>Alertas do MEI</dt><dd>{part(lastRun.alertas)}</dd></div>
                                {billsWhy(lastRun.contas) && <div className="is-wide"><dt>Quem entrou no lembrete de contas</dt><dd>{billsWhy(lastRun.contas)}</dd></div>}
                            </>
                        )}
                    </dl>
                    {lastRun?.errors?.length > 0 && (
                        <ul className="afn-errors">
                            {lastRun.errors.map((e, i) => (
                                <li key={i}>{e.kind === 'contas' ? 'Contas' : 'Alertas'} ({e.template}){e.count > 1 ? `, ${e.count} vezes` : ''}: {e.reason}</li>
                            ))}
                        </ul>
                    )}
                    {result && <p className={`afn-note ${result.ok ? 'afn-note--ok' : 'afn-note--error'}`} role="status">{result.text}</p>}
                    <div className="afn-actions">
                        {lastRun?.contas?.alreadyToday > 0 && (
                            <button type="button" className="afn-btn" onClick={() => run(true)} disabled={running}>Reenviar contas de hoje</button>
                        )}
                        <button type="button" className="afn-btn afn-btn--primary" onClick={() => run(false)} disabled={running}>
                            <Send size={16} aria-hidden="true" />{running ? 'Enviando…' : 'Enviar agora'}
                        </button>
                    </div>
                </>
            )}
        </Section>
    )
}

export default function AdminFeatures() {
    const { confirm, dialog } = useConfirmDialog()
    return (
        <div className="afn adm-light">
            <header className="afn-head">
                <h1>Funcionalidades</h1>
                <p>O que cada plano libera, os limites de uso e os envios automáticos do site.</p>
            </header>
            <FeatureMatrix />
            <LimitsTable />
            <EmailStatus />
            <WhatsAppReminders confirm={confirm} />
            {dialog}
        </div>
    )
}
