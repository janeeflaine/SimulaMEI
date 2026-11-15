import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    Search, Pencil, Lock, LockOpen, Trash2, X, Mail, RotateCw, AlertTriangle, ShieldCheck, Users
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import Select from '../../components/ui/Select'
import { useConfirmDialog } from '../../components/ui/ConfirmDialog'
import { showToast } from '../../utils/toast'
// AdminPages.css segue importado: as outras páginas do admin ainda usam as classes dele
import './AdminPages.css'
import './AdminUsers.css'

const TZ = 'America/Sao_Paulo'
const PAGE = 50

const fmtDate = (v) => {
    if (!v) return ''
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
}
const brl = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0)
// Busca sem diferença de acento e maiúsculas
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

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
        err.status = res.status
        err.reason = data.reason
        err.field = data.field
        throw err
    }
    return data
}

// Quebra a linha depois do @ (e não no meio do domínio)
function MailText({ email }) {
    const [user, domain] = String(email || '').split('@')
    return domain ? <>{user}@<wbr />{domain}</> : <>{email}</>
}

const hasLiveSub = (u) => u.hasSubscription && ['active', 'canceling'].includes(u.subscriptionStatus)

// Como está a cobrança desta conta, em uma linha
function billingNote(u) {
    if (u.subscriptionStatus === 'pending_payment') return { text: 'Esperando pagamento', tone: 'warn' }
    if (hasLiveSub(u) && u.subscriptionStatus === 'canceling') return { text: `Cancela em ${fmtDate(u.planExpiresAt)}`, tone: 'warn' }
    if (hasLiveSub(u)) return { text: 'Pagando no Stripe', tone: 'ok' }
    if (Number(u.planPrice) > 0) return { text: 'Liberado pelo admin', tone: '' }
    return { text: 'Grátis', tone: '' }
}

const FILTERS = [
    { key: 'all', label: 'Todas', test: () => true },
    { key: 'paying', label: 'Pagando', test: (u) => hasLiveSub(u) },
    { key: 'pending', label: 'Esperando pagamento', test: (u) => u.subscriptionStatus === 'pending_payment' },
    { key: 'blocked', label: 'Bloqueadas', test: (u) => u.isBlocked },
    { key: 'admins', label: 'Administradores', test: (u) => u.role === 'ADMIN' },
]

function Avatar({ name }) {
    return <span className="aus-avatar" aria-hidden="true">{String(name || '?').trim().charAt(0).toUpperCase()}</span>
}

function StatusTags({ u }) {
    return (
        <span className="aus-tags">
            {u.role === 'ADMIN' && <span className="aus-tag aus-tag--admin"><ShieldCheck size={13} aria-hidden="true" />Administrador</span>}
            {u.isBlocked
                ? <span className="aus-tag aus-tag--blocked">Bloqueada</span>
                : <span className="aus-tag aus-tag--ok">Ativa</span>}
        </span>
    )
}

// Janela própria com foco preso e Esc (ignora o Esc que a janela de confirmação já tratou)
function useDialogBehavior(onClose, boxRef, busy) {
    useEffect(() => {
        const prev = document.activeElement
        const { overflow } = document.body.style
        document.body.style.overflow = 'hidden'
        const first = boxRef.current?.querySelector('input:not([disabled])') || boxRef.current?.querySelector('button:not([disabled])')
        first?.focus()
        const onKey = (e) => {
            // A janela de confirmação aberta por cima cuida das próprias teclas
            const other = document.activeElement?.closest?.('.cd-box')
            if (other && other !== boxRef.current) return
            if (e.key === 'Escape' && !e.defaultPrevented && !busy) onClose()
            if (e.key === 'Tab' && boxRef.current) {
                const items = [...boxRef.current.querySelectorAll('input:not([disabled]), button:not([disabled]), [tabindex="0"]')]
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [busy])
}

function EditUserDialog({ user, plans, isSelf, onClose, onSaved, confirm }) {
    const [form, setForm] = useState({
        name: user.name || '',
        email: user.email || '',
        planId: user.planId ? String(user.planId) : '',
        role: user.role || 'USER',
        blocked: !!user.isBlocked,
    })
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState(null)
    const [link, setLink] = useState({ state: 'idle', message: '' })
    const boxRef = useRef(null)
    useDialogBehavior(onClose, boxRef, saving)

    const planLocked = hasLiveSub(user)
    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e && e.target ? e.target.value : e }))

    const planOptions = [
        { value: '', label: 'Sem plano (usa o Gratuito)' },
        ...plans.map((p) => ({ value: String(p.id), label: Number(p.price) > 0 ? `${p.name} (${brl(p.price)}/mês)` : p.name })),
    ]

    const save = async (e) => {
        e.preventDefault()
        setError(null)
        const body = {}
        if (form.name.trim() !== user.name) body.name = form.name
        if (form.email.trim().toLowerCase() !== String(user.email).toLowerCase()) body.email = form.email
        if (!planLocked && form.planId !== (user.planId ? String(user.planId) : '')) body.planId = form.planId ? Number(form.planId) : null
        if (!isSelf && form.role !== user.role) body.role = form.role
        if (!isSelf && form.blocked !== !!user.isBlocked) body.isBlocked = form.blocked
        if (Object.keys(body).length === 0) { onClose(); return }

        if (body.role === 'ADMIN') {
            const ok = await confirm({
                title: `Dar acesso de administrador a ${user.name}?`,
                message: 'Com esse acesso, a pessoa vê e muda contas, planos, regras de cálculo e configurações do site.',
                confirmLabel: 'Dar acesso',
            })
            if (!ok) return
        }
        if (body.isBlocked === true) {
            const ok = await confirm({
                title: `Bloquear a conta de ${user.name}?`,
                message: 'A pessoa sai na hora de todos os aparelhos e não consegue entrar até ser desbloqueada. Os dados continuam guardados.',
                confirmLabel: 'Bloquear conta',
                tone: 'danger',
            })
            if (!ok) return
        }

        setSaving(true)
        try {
            await api(`/api/admin/users/${user.id}`, { method: 'PUT', headers: authHeaders(true), body: JSON.stringify(body) })
            showToast('Conta atualizada.', 'success')
            onSaved()
        } catch (err) {
            setError({ message: err.message, field: err.field || (err.reason === 'email_taken' ? 'email' : null) })
            setSaving(false)
        }
    }

    const sendLink = async () => {
        setLink({ state: 'sending', message: '' })
        try {
            const data = await api(`/api/admin/users/${user.id}/reset-link`, { method: 'POST', headers: authHeaders() })
            setLink({ state: 'sent', message: data.message })
        } catch (err) {
            setLink({ state: 'error', message: err.message })
        }
    }

    return (
        <div className="cd-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose() }}>
            <form ref={boxRef} className="cd-box aus-box" role="dialog" aria-modal="true" aria-labelledby="aus-edit-title" onSubmit={save} noValidate>
                <button type="button" className="aus-box__close" onClick={onClose} aria-label="Fechar" disabled={saving}><X size={20} aria-hidden="true" /></button>
                <div className="aus-box__who">
                    <Avatar name={user.name} />
                    <div>
                        <h2 id="aus-edit-title" className="cd-title">Editar conta</h2>
                        <p>Criada em {fmtDate(user.createdAt)}</p>
                    </div>
                </div>

                <label className="aus-field">
                    <span>Nome</span>
                    <input type="text" value={form.name} onChange={set('name')} maxLength={80} autoComplete="off"
                        aria-invalid={error?.field === 'name' || undefined} disabled={saving} />
                </label>
                <label className="aus-field">
                    <span>E-mail</span>
                    <input type="email" value={form.email} onChange={set('email')} maxLength={254} autoComplete="off" inputMode="email"
                        aria-invalid={error?.field === 'email' || undefined} disabled={saving} />
                    <small>Mudar o e-mail cancela um link de senha nova que tenha ido para o endereço antigo.</small>
                </label>

                <div className="aus-field">
                    <span id="aus-plan-label">Plano</span>
                    <Select id="aus-plan" ariaLabel="Plano" value={form.planId} onChange={set('planId')} options={planOptions} disabled={saving || planLocked} />
                    <small>
                        {planLocked
                            ? 'Esta conta paga uma assinatura no Stripe: a troca de plano é feita pela própria pessoa em Planos.'
                            : 'Um plano pago dado aqui fica liberado sem cobrança.'}
                    </small>
                </div>

                <fieldset className="aus-field" disabled={saving || isSelf}>
                    <legend>Acesso</legend>
                    <div className="aus-seg" role="radiogroup" aria-label="Papel da conta">
                        {[['USER', 'Usuário'], ['ADMIN', 'Administrador']].map(([v, l]) => (
                            <label key={v} className={`aus-seg__opt ${form.role === v ? 'is-on' : ''}`}>
                                <input type="radio" name="aus-role" value={v} checked={form.role === v} onChange={() => setForm((f) => ({ ...f, role: v }))} />
                                {l}
                            </label>
                        ))}
                    </div>
                    <div className="aus-seg" role="radiogroup" aria-label="Situação da conta">
                        {[[false, 'Ativa'], [true, 'Bloqueada']].map(([v, l]) => (
                            <label key={l} className={`aus-seg__opt ${form.blocked === v ? 'is-on' : ''} ${v ? 'is-danger' : ''}`}>
                                <input type="radio" name="aus-blocked" checked={form.blocked === v} onChange={() => setForm((f) => ({ ...f, blocked: v }))} />
                                {l}
                            </label>
                        ))}
                    </div>
                    {isSelf && <small>Esta é a sua conta: você não pode tirar o seu acesso nem se bloquear.</small>}
                </fieldset>

                <div className="aus-field aus-password">
                    <span>Senha</span>
                    <p>Por segurança, o administrador não vê nem define senhas. Mande um link para a pessoa criar uma senha nova (vale por 1 hora).</p>
                    <button type="button" className="aus-btn" onClick={sendLink} disabled={saving || link.state === 'sending'}>
                        <Mail size={16} aria-hidden="true" />
                        {link.state === 'sending' ? 'Mandando…' : 'Mandar link de senha nova'}
                    </button>
                    {link.state === 'sent' && <p className="aus-note aus-note--ok" role="status">{link.message}</p>}
                    {link.state === 'error' && <p className="aus-note aus-note--error" role="alert">{link.message}</p>}
                </div>

                {error && <p className="aus-note aus-note--error" role="alert">{error.message}</p>}

                <div className="cd-actions">
                    <button type="button" className="cd-btn" onClick={onClose} disabled={saving}>Cancelar</button>
                    <button type="submit" className="cd-btn cd-btn--primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar alterações'}</button>
                </div>
            </form>
        </div>
    )
}

function DeleteUserDialog({ user, onClose, onDeleted }) {
    const [text, setText] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const boxRef = useRef(null)
    useDialogBehavior(onClose, boxRef, busy)
    const ok = text.trim().toUpperCase() === 'EXCLUIR'

    const run = async (e) => {
        e.preventDefault()
        if (!ok) return
        setBusy(true)
        setError('')
        try {
            await api(`/api/admin/users/${user.id}`, { method: 'DELETE', headers: authHeaders() })
            showToast('Conta excluída.', 'success')
            onDeleted()
        } catch (err) {
            setError(err.message)
            setBusy(false)
        }
    }

    return (
        <div className="cd-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}>
            <form ref={boxRef} className="cd-box cd-box--danger aus-box" role="alertdialog" aria-modal="true" aria-labelledby="aus-del-title" onSubmit={run} noValidate>
                <h2 id="aus-del-title" className="cd-title">Excluir a conta de {user.name} para sempre?</h2>
                <p className="cd-message">Isto não pode ser desfeito. Saem a conta ({user.email}) e tudo o que está nela:</p>
                <ul className="aus-list">
                    <li>carteiras, lançamentos, contas a pagar e categorias;</li>
                    <li>cartões, faturas e compras;</li>
                    <li>alertas, simulações, aparelhos conectados e o WhatsApp.</li>
                </ul>
                {hasLiveSub(user) && <p className="aus-note aus-note--warn">A assinatura no Stripe é cancelada antes. Se não der para cancelar, a conta não é excluída.</p>}
                <label className="aus-field">
                    <span>Para confirmar, digite EXCLUIR</span>
                    <input type="text" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" autoCapitalize="characters" disabled={busy} />
                </label>
                {error && <p className="aus-note aus-note--error" role="alert">{error}</p>}
                <div className="cd-actions">
                    <button type="button" className="cd-btn" onClick={onClose} disabled={busy}>Voltar</button>
                    <button type="submit" className="cd-btn cd-btn--primary cd-btn--danger" disabled={!ok || busy}>{busy ? 'Excluindo…' : 'Excluir conta'}</button>
                </div>
            </form>
        </div>
    )
}

function RowActions({ u, isSelf, onEdit, onBlock, onDelete }) {
    const canDelete = u.role !== 'ADMIN' && !isSelf
    return (
        <div className="aus-actions">
            <button type="button" className="aus-btn aus-btn--sm aus-edit" onClick={() => onEdit(u)} aria-label={`Editar ${u.name}`} title="Editar">
                <Pencil size={15} aria-hidden="true" /><span className="aus-edit__label">Editar</span>
            </button>
            {!isSelf && (
                <button type="button" className="aus-icon-btn" onClick={() => onBlock(u)}
                    aria-label={u.isBlocked ? `Desbloquear ${u.name}` : `Bloquear ${u.name}`} title={u.isBlocked ? 'Desbloquear' : 'Bloquear'}>
                    {u.isBlocked ? <LockOpen size={17} aria-hidden="true" /> : <Lock size={17} aria-hidden="true" />}
                </button>
            )}
            {canDelete && (
                <button type="button" className="aus-icon-btn aus-icon-btn--danger" onClick={() => onDelete(u)} aria-label={`Excluir ${u.name}`} title="Excluir">
                    <Trash2 size={17} aria-hidden="true" />
                </button>
            )}
        </div>
    )
}

export default function AdminUsers() {
    const { user: me } = useAuth()
    const { confirm, dialog } = useConfirmDialog()
    const [users, setUsers] = useState([])
    const [plans, setPlans] = useState([])
    const [status, setStatus] = useState('loading')
    const [search, setSearch] = useState('')
    const [filter, setFilter] = useState('all')
    const [shown, setShown] = useState(PAGE)
    const [editing, setEditing] = useState(null)
    const [deleting, setDeleting] = useState(null)

    const load = useCallback(async () => {
        try {
            const [list, planList] = await Promise.all([
                api('/api/admin/users', { headers: authHeaders() }),
                fetch('/api/plans').then((r) => (r.ok ? r.json() : [])).catch(() => []),
            ])
            if (!Array.isArray(list)) throw new Error('resposta inesperada')
            setUsers(list)
            setPlans(Array.isArray(planList) ? planList.slice().sort((a, b) => Number(a.price) - Number(b.price)) : [])
            setStatus('ready')
        } catch (err) {
            console.error('Usuários:', err)
            setStatus('error')
        }
    }, [])

    useEffect(() => { load() }, [load])
    useEffect(() => { setShown(PAGE) }, [search, filter])

    const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.key, users.filter(f.test).length])), [users])
    const list = useMemo(() => {
        const f = FILTERS.find((x) => x.key === filter) || FILTERS[0]
        const term = fold(search.trim())
        return users.filter((u) => f.test(u) && (!term || fold(u.name).includes(term) || fold(u.email).includes(term)))
    }, [users, filter, search])
    const visible = list.slice(0, shown)

    const toggleBlock = async (u) => {
        const blocking = !u.isBlocked
        const ok = await confirm(blocking
            ? { title: `Bloquear a conta de ${u.name}?`, message: 'A pessoa sai na hora de todos os aparelhos e não consegue entrar até ser desbloqueada. Os dados continuam guardados.', confirmLabel: 'Bloquear conta', tone: 'danger' }
            : { title: `Desbloquear a conta de ${u.name}?`, message: 'A pessoa volta a entrar normalmente.', confirmLabel: 'Desbloquear' })
        if (!ok) return
        try {
            await api(`/api/admin/users/${u.id}`, { method: 'PUT', headers: authHeaders(true), body: JSON.stringify({ isBlocked: blocking }) })
            showToast(blocking ? 'Conta bloqueada.' : 'Conta desbloqueada.', 'success')
            load()
        } catch (err) {
            showToast(err.message, 'error')
        }
    }

    const isSelf = (u) => Number(me?.id) === Number(u.id)

    return (
        <div className="aus adm-light">
            <header className="aus-head">
                <div>
                    <h1>Usuários</h1>
                    <p>Contas do site: plano, situação e acesso.</p>
                </div>
                {status === 'ready' && <span className="aus-count"><Users size={16} aria-hidden="true" />{users.length} {users.length === 1 ? 'conta' : 'contas'}</span>}
            </header>

            {status === 'loading' && (
                <div className="aus-state" role="status"><span className="aus-spinner" aria-hidden="true" />Carregando as contas…</div>
            )}

            {status === 'error' && (
                <div className="aus-state aus-state--error" role="alert">
                    <span className="aus-state__icon" aria-hidden="true"><AlertTriangle size={22} /></span>
                    <h2>Não deu para carregar as contas</h2>
                    <p>O servidor não respondeu direito. Tente de novo em alguns segundos.</p>
                    <button type="button" className="aus-btn aus-btn--primary" onClick={() => { setStatus('loading'); load() }}>
                        <RotateCw size={16} aria-hidden="true" />Tentar de novo
                    </button>
                </div>
            )}

            {status === 'ready' && (
                <>
                    <div className="aus-tools">
                        <label className="aus-search">
                            <Search size={18} aria-hidden="true" />
                            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome ou e-mail" aria-label="Buscar por nome ou e-mail" />
                        </label>
                        <div className="aus-filters" role="group" aria-label="Mostrar">
                            {FILTERS.map((f) => (
                                <button key={f.key} type="button" className={`aus-chip ${filter === f.key ? 'is-on' : ''}`} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
                                    {f.label} <span>{counts[f.key]}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {list.length === 0 ? (
                        <div className="aus-empty">
                            <p>{users.length === 0 ? 'Nenhuma conta ainda.' : 'Nenhuma conta com esse filtro ou busca.'}</p>
                            {(search || filter !== 'all') && (
                                <button type="button" className="aus-btn" onClick={() => { setSearch(''); setFilter('all') }}>Limpar busca e filtro</button>
                            )}
                        </div>
                    ) : (
                        <div className="aus-card">
                            <table className="aus-table">
                                <thead>
                                    <tr>
                                        <th scope="col">Conta</th>
                                        <th scope="col">Plano</th>
                                        <th scope="col">Datas</th>
                                        <th scope="col"><span className="aus-sr">Ações</span></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visible.map((u) => {
                                        const note = billingNote(u)
                                        return (
                                            <tr key={u.id}>
                                                <td data-label="Conta">
                                                    <div className="aus-who">
                                                        <Avatar name={u.name} />
                                                        <span className="aus-who__text">
                                                            <strong>{u.name}{isSelf(u) && <em> (você)</em>}</strong>
                                                            <span className="aus-who__mail"><MailText email={u.email} /></span>
                                                            <StatusTags u={u} />
                                                        </span>
                                                    </div>
                                                </td>
                                                <td data-label="Plano">
                                                    <span className="aus-plan">{u.plan?.name || 'Gratuito'}</span>
                                                    <span className={`aus-bill ${note.tone ? `aus-bill--${note.tone}` : ''}`}>{note.text}</span>
                                                </td>
                                                <td data-label="Datas" className="aus-dates">
                                                    <span>Criada em <b>{fmtDate(u.createdAt)}</b></span>
                                                    <span>Última entrada <b>{fmtDate(u.lastLoginAt) || 'nunca'}</b></span>
                                                </td>
                                                <td className="aus-cell-actions">
                                                    <RowActions u={u} isSelf={isSelf(u)} onEdit={setEditing} onBlock={toggleBlock} onDelete={setDeleting} />
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                            <div className="aus-foot">
                                <span>Mostrando {visible.length} de {list.length}</span>
                                {visible.length < list.length && (
                                    <button type="button" className="aus-btn" onClick={() => setShown((n) => n + PAGE)}>Mostrar mais {Math.min(PAGE, list.length - visible.length)}</button>
                                )}
                            </div>
                        </div>
                    )}
                </>
            )}

            {editing && (
                <EditUserDialog
                    user={editing}
                    plans={plans}
                    isSelf={isSelf(editing)}
                    confirm={confirm}
                    onClose={() => setEditing(null)}
                    onSaved={() => { setEditing(null); load() }}
                />
            )}
            {deleting && (
                <DeleteUserDialog
                    user={deleting}
                    onClose={() => setDeleting(null)}
                    onDeleted={() => { setDeleting(null); load() }}
                />
            )}
            {dialog}
        </div>
    )
}
