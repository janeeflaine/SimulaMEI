import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Search, RotateCw, X, AlertTriangle, ChevronLeft, ChevronRight, ShieldAlert, ScrollText, LogIn } from 'lucide-react'
import Select from '../../components/ui/Select'
import { showToast } from '../../utils/toast'
import { EVENTS, EVENT_GROUPS, describeEvent, eventLabel, when, todayBR, TZ } from './auditEvents'
// AdminPages.css segue importado: as outras páginas do admin ainda usam as classes dele
// A janela de detalhes usa .cd-overlay/.cd-box/.cd-actions da janela de confirmação
import '../../components/ui/ConfirmDialog.css'
import './AdminPages.css'
import './AdminLogs.css'

const PAGE_SIZE = 50
const AUTO_MS = 15000
const num = (v) => new Intl.NumberFormat('pt-BR').format(Number(v) || 0)
const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` })
const WARN_LEVELS = ['WARN', 'ERROR', 'CRITICAL']
const LEVELS = { INFO: 'Informação', WARN: 'Atenção', ERROR: 'Erro', CRITICAL: 'Crítico' }

const LEVEL_OPTIONS = [
    { value: '', label: 'Níveis' },
    { value: 'WARN', label: 'Atenção' },
    { value: 'ERROR', label: 'Erro' },
    { value: 'CRITICAL', label: 'Crítico' },
    { value: 'INFO', label: 'Informação' },
]
const EVENT_OPTIONS = [
    { value: '', label: 'Eventos' },
    ...EVENT_GROUPS.map((g) => ({
        group: g.name,
        options: Object.entries(EVENTS).filter(([, e]) => e.group === g.key).map(([k, e]) => ({ value: k, label: e.label })),
    })),
]
const WHEN_OPTIONS = [
    { value: '', label: 'Datas' },
    { value: 'today', label: 'Hoje' },
    { value: '7d', label: 'Últimos 7 dias' },
    { value: '30d', label: 'Últimos 30 dias' },
    { value: 'custom', label: 'Escolher datas' },
]

// AAAA-MM-DD menos n dias (conta no meio-dia UTC: não muda de dia por fuso)
const minusDays = (day, n) => {
    const d = new Date(`${day}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() - n)
    return d.toISOString().slice(0, 10)
}
function rangeOf(whenKey, from, to) {
    const today = todayBR()
    if (whenKey === 'today') return { from: today, to: today }
    if (whenKey === '7d') return { from: minusDays(today, 6), to: today }
    if (whenKey === '30d') return { from: minusDays(today, 29), to: today }
    if (whenKey === 'custom') return { from, to }
    return { from: '', to: '' }
}

const fullDate = (value) => {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return ''
    const day = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
    const hour = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(d)
    return `${day} às ${hour}`
}

// "Chrome no Windows", "Safari no iPhone"... (o texto completo fica nos dados técnicos)
function browserOf(ua) {
    if (!ua) return null
    const b = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
        : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : null
    const s = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android'
        : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : null
    if (b && s) return `${b} no ${s}`
    return b || s || 'Outro'
}

// Nomes dos campos que aparecem em "O que mudou"
const FIELD_LABELS = {
    name: 'Nome', email: 'E-mail', planId: 'Plano', role: 'Acesso', isBlocked: 'Bloqueada', price: 'Preço',
    features: 'Recursos', isActive: 'Ativo', stripePriceId: 'Código do preço no Stripe', inssPercentage: 'INSS (%)',
    icmsValue: 'ICMS (R$)', issValue: 'ISS (R$)', minimumWage: 'Salário mínimo', employeeCost: 'Custo do funcionário',
    annualLimit: 'Limite anual', warningPercentage: 'Aviso amarelo (%)', dangerPercentage: 'Aviso vermelho (%)', year: 'Ano',
    subscriptionStatus: 'Situação da assinatura', planExpiresAt: 'Plano vale até',
}
const META_LABELS = {
    email: 'E-mail digitado', reason: 'Motivo', previous_ip: 'IP anterior', new_ip: 'IP novo',
    previous_fingerprint: 'Aparelho anterior', new_fingerprint: 'Aparelho novo', sent: 'Enviados', failed: 'Falharam',
    email_sha256: 'Código do e-mail', attempts: 'Tentativas',
}
function show(v) {
    if (v === null || v === undefined || v === '') return '–'
    if (typeof v === 'boolean') return v ? 'Sim' : 'Não'
    if (typeof v === 'object') return JSON.stringify(v)
    return String(v)
}
function changeRows(oldV, newV) {
    const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v)
    if (isObj(oldV) || isObj(newV)) {
        const keys = [...new Set([...Object.keys(isObj(oldV) ? oldV : {}), ...Object.keys(isObj(newV) ? newV : {})])]
        return keys.map((k) => ({ key: FIELD_LABELS[k] || k, before: show(isObj(oldV) ? oldV[k] : undefined), after: show(isObj(newV) ? newV[k] : undefined) }))
    }
    if (oldV == null && newV == null) return []
    return [{ key: 'Valor', before: show(oldV), after: show(newV) }]
}

function LevelTag({ level }) {
    if (!WARN_LEVELS.includes(level)) return null
    return <span className={`alg-tag alg-tag--${level.toLowerCase()}`}>{LEVELS[level]}</span>
}

// Janela de detalhes: foco preso, Esc fecha, volta o foco para a linha
function LogDetail({ id, onClose }) {
    const [log, setLog] = useState(null)
    const [state, setState] = useState('loading')
    const boxRef = useRef(null)

    useEffect(() => {
        let alive = true
        fetch(`/api/admin/logs/${encodeURIComponent(id)}`, { headers: auth() })
            .then(async (r) => {
                const body = await r.json().catch(() => null)
                if (!r.ok || !body || typeof body !== 'object' || !body.event_type) throw new Error('resposta inesperada')
                if (alive) { setLog(body); setState('ready') }
            })
            .catch(() => alive && setState('error'))
        return () => { alive = false }
    }, [id])

    useEffect(() => {
        const prev = document.activeElement
        const { overflow } = document.body.style
        document.body.style.overflow = 'hidden'
        boxRef.current?.querySelector('button')?.focus()
        const onKey = (e) => {
            if (e.key === 'Escape') onClose()
            if (e.key === 'Tab' && boxRef.current) {
                const items = [...boxRef.current.querySelectorAll('button, summary, [tabindex="0"]')]
                if (!items.length) return
                const a = items[0]; const z = items[items.length - 1]
                if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus() }
                else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus() }
            }
        }
        document.addEventListener('keydown', onKey)
        return () => {
            document.removeEventListener('keydown', onKey)
            document.body.style.overflow = overflow
            prev?.focus?.()
        }
    }, [onClose])

    const d = log ? describeEvent(log) : null
    const changes = log ? changeRows(log.old_value, log.new_value) : []
    const meta = log && log.metadata && typeof log.metadata === 'object' && !Array.isArray(log.metadata) ? Object.entries(log.metadata) : []
    const isUserTarget = log?.resource_type === 'USER'

    return (
        <div className="cd-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
            <div ref={boxRef} className="cd-box alg-box" role="dialog" aria-modal="true" aria-labelledby="alg-detail-title">
                <button type="button" className="alg-close" onClick={onClose} aria-label="Fechar"><X size={20} aria-hidden="true" /></button>
                {state === 'loading' && <p className="alg-box__state" role="status"><span className="alg-spinner" aria-hidden="true" />Carregando o registro…</p>}
                {state === 'error' && (
                    <>
                        <h2 id="alg-detail-title" className="cd-title">Não deu para abrir o registro</h2>
                        <p className="alg-box__state">Feche e tente de novo em alguns segundos.</p>
                    </>
                )}
                {state === 'ready' && (
                    <>
                        <h2 id="alg-detail-title" className="cd-title">{eventLabel(log.event_type)}</h2>
                        <p className="alg-box__when">{fullDate(log.timestamp)} <LevelTag level={log.level} /></p>
                        <p className="alg-box__sentence"><strong>{d.who}</strong> {d.text}{d.target && <> <strong>{d.target}</strong></>}</p>

                        <dl className="alg-facts">
                            <div><dt>Quem fez</dt><dd>{log.user_name ? <>{log.user_name}{log.user_email && <small>{log.user_email}</small>}</> : d.who}{log.user_role === 'ADMIN' && <small>Administrador</small>}</dd></div>
                            {isUserTarget && <div><dt>Conta afetada</dt><dd>{log.target_name || 'Conta já excluída'}</dd></div>}
                            {log.resource_type === 'SYSTEM_SETTINGS' && log.resource_id && <div><dt>Configuração</dt><dd><code>{log.resource_id}</code></dd></div>}
                            <div><dt>IP</dt><dd>{log.ip_address || '–'}</dd></div>
                            <div><dt>Navegador</dt><dd>{browserOf(log.user_agent) || '–'}</dd></div>
                        </dl>

                        {changes.length > 0 && (
                            <section className="alg-sec" aria-labelledby="alg-ch-t">
                                <h3 id="alg-ch-t">O que mudou</h3>
                                <div className="alg-changes" role="table" aria-label="O que mudou">
                                    <div role="row" className="alg-changes__head"><span role="columnheader">Campo</span><span role="columnheader">Antes</span><span role="columnheader">Depois</span></div>
                                    {changes.map((c) => (
                                        <div role="row" key={c.key} className={c.before !== c.after ? 'is-diff' : ''}>
                                            <span role="rowheader">{c.key}</span><span role="cell">{c.before}</span><span role="cell">{c.after}</span>
                                        </div>
                                    ))}
                                </div>
                                {changes.some((c) => c.before === '(alterado)' || c.after === '(alterado)') && (
                                    <p className="alg-hint">Nome e e-mail não ficam guardados nos registros, só que foram alterados.</p>
                                )}
                            </section>
                        )}

                        {meta.length > 0 && (
                            <section className="alg-sec" aria-labelledby="alg-meta-t">
                                <h3 id="alg-meta-t">Detalhes</h3>
                                <dl className="alg-meta">
                                    {meta.map(([k, v]) => <div key={k}><dt>{META_LABELS[k] || k}</dt><dd>{show(v)}</dd></div>)}
                                </dl>
                            </section>
                        )}

                        <details className="alg-tech">
                            <summary>Dados técnicos</summary>
                            <dl className="alg-meta">
                                <div><dt>Evento</dt><dd><code>{log.event_type}</code></dd></div>
                                <div><dt>Registro</dt><dd>{log.id}</dd></div>
                                {log.resource_type && <div><dt>Recurso</dt><dd><code>{log.resource_type}{log.resource_id ? ` ${log.resource_id}` : ''}</code></dd></div>}
                                <div><dt>Navegador completo</dt><dd>{log.user_agent || '–'}</dd></div>
                                <div><dt>Aparelho</dt><dd>{log.device_fingerprint ? <code>{log.device_fingerprint.slice(0, 16)}</code> : '–'}</dd></div>
                            </dl>
                        </details>
                    </>
                )}
                <div className="cd-actions alg-box__actions">
                    <button type="button" className="alg-btn" onClick={onClose}>Fechar</button>
                </div>
            </div>
        </div>
    )
}

function Sessions() {
    const [rows, setRows] = useState(null)
    const [failed, setFailed] = useState(false)
    const load = useCallback(() => {
        setFailed(false)
        fetch('/api/admin/logs/sessions', { headers: auth() })
            .then(async (r) => {
                const body = await r.json().catch(() => null)
                if (!r.ok || !Array.isArray(body)) throw new Error('resposta inesperada')
                setRows(body)
            })
            .catch(() => setFailed(true))
    }, [])
    useEffect(() => { load() }, [load])

    if (failed) return <ErrorBox title="Não deu para carregar as entradas" onRetry={load} />
    if (!rows) return <div className="alg-state" role="status"><span className="alg-spinner" aria-hidden="true" />Carregando…</div>
    return (
        <section className="alg-card">
            <p className="alg-card__lead">
                A última entrada de cada conta nos últimos 7 dias (o tempo que um login vale).
                {rows.length > 0 && <> {num(rows.length)} {rows.length === 1 ? 'conta' : 'contas'}.</>}
            </p>
            {rows.length === 0 ? (
                <p className="alg-empty">Ninguém entrou nos últimos 7 dias.</p>
            ) : (
                <ul className="alg-list">
                    {rows.map((s) => (
                        <li key={s.id} className="alg-row alg-row--static">
                            <span className="alg-row__icon" aria-hidden="true"><LogIn size={16} /></span>
                            <span className="alg-row__body">
                                <span className="alg-row__text"><strong>{s.user_name || 'Conta'}</strong> <span className="alg-muted">{s.user_email}</span></span>
                                <span className="alg-row__sub">
                                    <span>{when(s.created_at)}</span>
                                    {s.ip_address && <span>IP {s.ip_address}</span>}
                                    {s.user_agent && <span>{browserOf(s.user_agent)}</span>}
                                </span>
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    )
}

function ErrorBox({ title, onRetry }) {
    return (
        <div className="alg-state alg-state--error" role="alert">
            <span className="alg-state__icon" aria-hidden="true"><AlertTriangle size={22} /></span>
            <h2>{title}</h2>
            <p>O servidor não respondeu direito. Tente de novo em alguns segundos.</p>
            <button type="button" className="alg-btn alg-btn--primary" onClick={onRetry}><RotateCw size={16} aria-hidden="true" />Tentar de novo</button>
        </div>
    )
}

const EMPTY = { search: '', level: '', event: '', when: '', from: '', to: '' }
const isLogs = (d) => d && Array.isArray(d.logs) && Number.isFinite(Number(d.total))

export default function AdminLogs() {
    const [tab, setTab] = useState('all') // all | suspicious | sessions
    const [filters, setFilters] = useState(EMPTY)
    const [search, setSearch] = useState('') // texto digitado (vai para o filtro 400 ms depois)
    const [page, setPage] = useState(1)
    const [data, setData] = useState(null)
    const [status, setStatus] = useState('loading') // loading | ready | error
    const [suspicious, setSuspicious] = useState(0)
    const [auto, setAuto] = useState(false)
    const [updatedAt, setUpdatedAt] = useState(null)
    const [openId, setOpenId] = useState(null)
    const reqId = useRef(0)

    useEffect(() => {
        const t = setTimeout(() => setFilters((f) => (f.search === search.trim() ? f : { ...f, search: search.trim() })), 400)
        return () => clearTimeout(t)
    }, [search])
    useEffect(() => { setPage(1) }, [filters, tab])

    const range = rangeOf(filters.when, filters.from, filters.to)
    const badRange = filters.when === 'custom' && range.from && range.to && range.from > range.to
    const query = useMemo(() => {
        const p = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) })
        if (filters.level) p.set('level', filters.level)
        if (filters.event) p.set('event_type', filters.event)
        if (filters.search) p.set('search', filters.search)
        if (range.from) p.set('from', range.from)
        if (range.to) p.set('to', range.to)
        if (tab === 'suspicious') p.set('suspicious', 'true')
        return p.toString()
    }, [page, filters, tab, range.from, range.to])

    const load = useCallback(async ({ quiet = false } = {}) => {
        if (tab === 'sessions' || badRange) return
        const id = ++reqId.current
        if (!quiet) setStatus((s) => (s === 'ready' ? 'refreshing' : 'loading'))
        try {
            const [res, susp] = await Promise.all([
                fetch(`/api/admin/logs?${query}`, { headers: auth() }),
                fetch('/api/admin/logs?suspicious=true&limit=1', { headers: auth() }),
            ])
            const body = await res.json().catch(() => null)
            const sBody = await susp.json().catch(() => null)
            if (id !== reqId.current) return
            if (!res.ok) {
                // Filtro recusado pelo servidor (data inválida etc.): mostra o motivo
                if (res.status === 400 && body?.message) { showToast(body.message, 'error'); setStatus((s) => (s === 'loading' ? 'error' : 'ready')); return }
                throw new Error('resposta inesperada')
            }
            if (!isLogs(body)) throw new Error('resposta inesperada')
            setData(body)
            if (susp.ok && sBody && Number.isFinite(Number(sBody.total))) setSuspicious(Number(sBody.total))
            setUpdatedAt(new Date())
            setStatus('ready')
        } catch (err) {
            if (id !== reqId.current) return
            console.error('Logs:', err)
            if (quiet) return
            setStatus((s) => (s === 'refreshing' ? 'ready' : 'error'))
            if (data) showToast('Não deu para atualizar os registros. Tente de novo.', 'error')
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query, tab, badRange])
    useEffect(() => { load() }, [load])

    useEffect(() => {
        if (!auto || tab === 'sessions') return undefined
        const t = setInterval(() => { if (!document.hidden && !openId) load({ quiet: true }) }, AUTO_MS)
        return () => clearInterval(t)
    }, [auto, tab, load, openId])

    const set = (key) => (value) => setFilters((f) => ({ ...f, [key]: value }))
    const active = filters.level || filters.event || filters.search || filters.when
    const clear = () => { setSearch(''); setFilters(EMPTY) }
    const closeDetail = useCallback(() => setOpenId(null), [])

    const total = data ? Number(data.total) : 0
    const pages = data ? Math.max(1, Number(data.pages) || 1) : 1
    const first = total ? (page - 1) * PAGE_SIZE + 1 : 0
    const last = Math.min(total, page * PAGE_SIZE)
    const clock = updatedAt ? new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(updatedAt) : null

    return (
        <div className={`alg adm-light${status === 'refreshing' ? ' is-refreshing' : ''}`}>
            <header className="alg-head">
                <div>
                    <h1>Logs de auditoria</h1>
                    <p>Quem fez o quê e quando: entradas, contas, planos e configurações.</p>
                </div>
                {tab !== 'sessions' && (
                    <div className="alg-head__side">
                        {clock && <span className="alg-updated">Atualizado às {clock}</span>}
                        <label className="alg-switch">
                            <button type="button" role="switch" aria-checked={auto} onClick={() => setAuto((v) => !v)}><span /></button>
                            Atualizar sozinho
                        </label>
                        <button type="button" className="alg-btn alg-refresh" aria-label="Atualizar agora" onClick={() => load()} disabled={status === 'loading' || status === 'refreshing'}>
                            <RotateCw size={16} aria-hidden="true" className={status === 'refreshing' ? 'alg-spin' : ''} /><span className="alg-btn__label">Atualizar</span>
                        </button>
                    </div>
                )}
            </header>

            <div className="alg-tabs" role="tablist" aria-label="Registros">
                {[
                    { key: 'all', label: 'Todos', icon: ScrollText },
                    { key: 'suspicious', label: 'Suspeitos', icon: ShieldAlert, count: suspicious },
                    { key: 'sessions', label: 'Entradas', icon: LogIn },
                ].map((t) => (
                    <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={`alg-tab${tab === t.key ? ' is-active' : ''}`} onClick={() => setTab(t.key)}>
                        <t.icon size={16} aria-hidden="true" />{t.label}
                        {t.count > 0 && <span className="alg-count" aria-label={`${t.count} registros`}>{num(t.count)}</span>}
                    </button>
                ))}
            </div>

            {tab === 'sessions' ? <Sessions /> : (
                <>
                    <div className="alg-filters">
                        <label className="alg-search">
                            <Search size={18} aria-hidden="true" />
                            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} maxLength={100}
                                placeholder="Nome, e-mail ou IP" aria-label="Buscar por nome, e-mail ou IP" />
                        </label>
                        <Select variant="pill" ariaLabel="Evento" value={filters.event} onChange={set('event')} options={EVENT_OPTIONS} active={!!filters.event} />
                        <Select variant="pill" ariaLabel="Nível" value={filters.level} onChange={set('level')} options={LEVEL_OPTIONS} active={!!filters.level} />
                        <Select variant="pill" ariaLabel="Quando" value={filters.when} onChange={set('when')} options={WHEN_OPTIONS} active={!!filters.when} />
                        {active && <button type="button" className="alg-clear" onClick={clear}>Limpar filtros</button>}
                    </div>
                    {filters.when === 'custom' && (
                        <div className="alg-dates">
                            <label>De<input type="date" value={filters.from} max={filters.to || todayBR()} onChange={(e) => set('from')(e.target.value)} /></label>
                            <label>Até<input type="date" value={filters.to} min={filters.from || undefined} max={todayBR()} onChange={(e) => set('to')(e.target.value)} /></label>
                            {badRange && <span className="alg-dates__err" role="alert">A data inicial é depois da final.</span>}
                        </div>
                    )}

                    {tab === 'suspicious' && (
                        <p className="alg-note"><ShieldAlert size={18} aria-hidden="true" />
                            Senhas erradas, travas por tentativas, contas bloqueadas, entradas em outro aparelho e qualquer registro de atenção ou erro.
                        </p>
                    )}

                    {status === 'loading' && <div className="alg-state" role="status"><span className="alg-spinner" aria-hidden="true" />Carregando os registros…</div>}
                    {status === 'error' && <ErrorBox title="Não deu para carregar os registros" onRetry={() => load()} />}
                    {(status === 'ready' || status === 'refreshing') && data && (
                        <section className="alg-card" aria-busy={status === 'refreshing'}>
                            {data.logs.length === 0 ? (
                                <p className="alg-empty">{active ? 'Nenhum registro com esses filtros.' : tab === 'suspicious' ? 'Nenhum registro suspeito.' : 'Nenhum registro ainda.'}</p>
                            ) : (
                                <ul className="alg-list">
                                    {data.logs.map((log) => {
                                        const d = describeEvent(log)
                                        const warn = WARN_LEVELS.includes(log.level)
                                        return (
                                            <li key={log.id}>
                                                <button type="button" className={`alg-row${warn ? ' is-warn' : ''}`} onClick={() => setOpenId(log.id)}>
                                                    <span className="alg-row__icon" aria-hidden="true"><d.icon size={16} /></span>
                                                    <span className="alg-row__body">
                                                        <span className="alg-row__text"><strong>{d.who}</strong> {d.text}{d.target && <> <strong>{d.target}</strong></>}</span>
                                                        <span className="alg-row__sub">
                                                            <span>{when(log.timestamp)}</span>
                                                            {log.ip_address && <span>IP {log.ip_address}</span>}
                                                            <LevelTag level={log.level} />
                                                        </span>
                                                    </span>
                                                    <ChevronRight size={18} aria-hidden="true" className="alg-row__go" />
                                                </button>
                                            </li>
                                        )
                                    })}
                                </ul>
                            )}
                            {total > 0 && (
                                <footer className="alg-pager">
                                    <span>{num(first)}–{num(last)} de {num(total)}</span>
                                    {pages > 1 && (
                                        <span className="alg-pager__btns">
                                            <button type="button" className="alg-btn" onClick={() => setPage((p) => p - 1)} disabled={page <= 1}><ChevronLeft size={16} aria-hidden="true" />Mais novos</button>
                                            <button type="button" className="alg-btn" onClick={() => setPage((p) => p + 1)} disabled={page >= pages}>Mais antigos<ChevronRight size={16} aria-hidden="true" /></button>
                                        </span>
                                    )}
                                </footer>
                            )}
                        </section>
                    )}
                </>
            )}

            {openId !== null && <LogDetail id={openId} onClose={closeDetail} />}
        </div>
    )
}
