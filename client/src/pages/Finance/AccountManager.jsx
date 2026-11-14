import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
    Wallet,
    Building2,
    User,
    Plus,
    X,
    Pencil,
    Trash2,
    Star,
    TrendingUp,
    TrendingDown,
    Camera,
    Upload
} from 'lucide-react'
import ImageCropperModal from '../../components/ImageCropperModal'
import { useConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Stat } from '../../components/cards/CardsSummaryPanel'
import { maskDocument, documentError } from '../../utils/brDocument'
import './AccountManager.css'

const TYPES = [
    { value: 'PJ', label: 'MEI', icon: Building2, doc: 'CNPJ', hint: 'Dinheiro da empresa: vendas, serviços e despesas do MEI.' },
    { value: 'PF', label: 'Pessoal', icon: User, doc: 'CPF', hint: 'Dinheiro da casa e da família, separado do MEI.' }
]
const typeOf = (value) => TYPES.find(t => t.value === value) || TYPES[1]
const MAX_NAME = 60
const MAX_PHOTO = 3 * 1024 * 1024 // o servidor aceita até ~2 MB de imagem

const brl = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const plural = (n, one, many) => `${(Number(n) || 0).toLocaleString('pt-BR')} ${Number(n) === 1 ? one : many}`
const usesOf = (w) => (Number(w.transactionsCount) || 0) + (Number(w.cardsCount) || 0)
const usageText = (w) => [
    Number(w.transactionsCount) ? plural(w.transactionsCount, 'lançamento', 'lançamentos') : null,
    Number(w.cardsCount) ? plural(w.cardsCount, 'cartão', 'cartões') : null
].filter(Boolean).join(' e ')

const EMPTY_FORM = { name: '', type: 'PF', document: '', photo_url: '' }

function WalletAvatar({ wallet, size = 48 }) {
    const Icon = typeOf(wallet.account_type).icon
    return (
        <span className="crt-avatar" style={{ width: size, height: size }} aria-hidden="true">
            {wallet.logo_url ? <img src={wallet.logo_url} alt="" /> : <Icon size={Math.round(size * 0.45)} />}
        </span>
    )
}

export default function AccountManager() {
    const { confirm, notify, dialog } = useConfirmDialog()
    const token = localStorage.getItem('token')
    const year = new Date().getFullYear()

    const [wallets, setWallets] = useState([])
    const [totals, setTotals] = useState({ in: {}, out: {} })
    const [loadState, setLoadState] = useState('loading') // loading | ok | error
    const [busyId, setBusyId] = useState(null) // carteira virando principal

    const [form, setForm] = useState(null) // null = fechada; { id?, name, type, document, photo_url, uses }
    const [formError, setFormError] = useState(null) // { message, limit }
    const [saving, setSaving] = useState(false)

    const [cropSrc, setCropSrc] = useState(null)
    const fileInputRef = useRef(null)
    const alertRef = useRef(null)

    // No celular o aviso pode ficar abaixo da dobra da janela: rola até ele
    useEffect(() => { if (formError) alertRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [formError])

    const fetchWallets = useCallback(async () => {
        const headers = { 'Authorization': `Bearer ${token}` }
        try {
            const res = await fetch('/api/finance/business-units?uso=1', { headers })
            if (!res.ok) throw new Error()
            const data = await res.json()
            setWallets(Array.isArray(data) ? data : [])
            setLoadState('ok')
        } catch {
            setLoadState('error')
            return
        }
        // Entrou e saiu no ano por carteira (só o que já foi pago). Se falhar, a página segue sem os valores.
        const range = `startDate=${year}-01-01&endDate=${year}-12-31`
        const byWallet = async (type) => {
            const res = await fetch(`/api/finance/stats/wallet-breakdown?type=${type}&${range}`, { headers })
            if (!res.ok) return {}
            const rows = await res.json()
            return Object.fromEntries((Array.isArray(rows) ? rows : []).map(r => [r.id, Number(r.total) || 0]))
        }
        try {
            const [inc, out] = await Promise.all([byWallet('RECEITA'), byWallet('DESPESA')])
            setTotals({ in: inc, out })
        } catch { /* sem os valores do ano */ }
    }, [token, year])

    useEffect(() => { fetchWallets() }, [fetchWallets])

    const sumOf = (map) => wallets.reduce((s, w) => s + (map[w.id] || 0), 0)
    const countOf = (type) => wallets.filter(w => w.account_type === type).length
    const primary = wallets.find(w => w.isPrimary)

    // ── Janela de criar / editar ────────────────────────────────────────
    const openNew = () => { setForm({ ...EMPTY_FORM }); setFormError(null) }
    const openEdit = (w) => {
        setForm({
            id: w.id,
            name: w.name || '',
            type: w.account_type === 'PJ' ? 'PJ' : 'PF',
            document: w.cnpj || '',
            originalDocument: w.cnpj || '',
            originalType: w.account_type,
            photo_url: w.logo_url || '',
            uses: usesOf(w),
            usage: usageText(w)
        })
        setFormError(null)
    }
    const closeForm = useCallback(() => { if (!saving) setForm(null) }, [saving])

    // Esc fecha a janela (se um aviso ou o recorte da foto estiver por cima, o Esc é deles)
    useEffect(() => {
        if (!form) return undefined
        const onKey = (e) => { if (e.key === 'Escape' && !e.defaultPrevented && !cropSrc) closeForm() }
        window.addEventListener('keydown', onKey)
        const { overflow } = document.body.style
        document.body.style.overflow = 'hidden'
        return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow }
    }, [form, closeForm, cropSrc])

    // Trocar o tipo só limpa o documento quando ele não serve no tipo novo (CPF não vira CNPJ)
    const setType = (type) => setForm(prev => {
        if (prev.type === type) return prev
        const doc = maskDocument(prev.document, type)
        return { ...prev, type, document: documentError(doc, type) ? '' : doc }
    })

    const onFile = (e) => {
        const file = e.target.files?.[0]
        e.target.value = null
        if (!file) return
        if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) {
            setFormError({ message: 'Use uma foto PNG, JPG ou WebP.' })
            return
        }
        const reader = new FileReader()
        reader.onload = () => setCropSrc(reader.result)
        reader.readAsDataURL(file)
    }

    const handleSave = async (e) => {
        e.preventDefault()
        const name = form.name.trim().replace(/\s+/g, ' ')
        if (!name) { setFormError({ message: 'Escreva o nome da carteira.' }); return }
        if (name.length > MAX_NAME) { setFormError({ message: `O nome pode ter até ${MAX_NAME} letras.` }); return }
        // Documento antigo que não mudou passa sem conferir (o servidor faz igual)
        const unchangedDoc = form.id && form.document === form.originalDocument && form.type === form.originalType
        const docError = unchangedDoc ? '' : documentError(form.document, form.type)
        if (docError) { setFormError({ message: docError }); return }
        if (form.photo_url && form.photo_url.length > MAX_PHOTO) { setFormError({ message: 'A foto está grande demais. Escolha outra.' }); return }

        setSaving(true)
        setFormError(null)
        try {
            const res = await fetch(form.id ? `/api/finance/business-units/${form.id}` : '/api/finance/business-units', {
                method: form.id ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ name, account_type: form.type, cnpj: form.document.trim(), photo_url: form.photo_url })
            })
            const body = await res.json().catch(() => ({}))
            if (!res.ok) {
                // 403 = limite de carteiras do plano (só o servidor sabe o limite)
                setFormError({ message: body.message || 'Não deu para salvar a carteira. Tente de novo.', limit: res.status === 403 })
                return
            }
            setForm(null)
            fetchWallets()
        } catch {
            setFormError({ message: 'Sem conexão. Verifique a internet e tente de novo.' })
        } finally {
            setSaving(false)
        }
    }

    // ── Ações de cada carteira ──────────────────────────────────────────
    const makePrimary = async (w) => {
        setBusyId(w.id)
        try {
            const res = await fetch(`/api/finance/business-units/${w.id}/primary`, { method: 'PATCH', headers: { 'Authorization': `Bearer ${token}` } })
            const body = await res.json().catch(() => ({}))
            if (!res.ok) {
                notify({ title: 'Não deu para trocar a principal', message: body.message || 'Tente de novo em instantes.', tone: 'error' })
                return
            }
            await fetchWallets()
        } catch {
            notify({ title: 'Sem conexão', message: 'Não deu para trocar a carteira principal. Tente de novo.', tone: 'error' })
        } finally {
            setBusyId(null)
        }
    }

    const handleDelete = async (w) => {
        // Com lançamentos ou cartões o servidor recusa: explica antes de tentar
        if (usesOf(w)) {
            const details = []
            if (Number(w.transactionsCount)) details.push({ label: 'Lançamentos', value: Number(w.transactionsCount).toLocaleString('pt-BR') })
            if (Number(w.cardsCount)) details.push({ label: 'Cartões', value: Number(w.cardsCount).toLocaleString('pt-BR') })
            notify({
                title: `A carteira ${w.name} ainda tem ${usageText(w)}`,
                message: 'Para excluir, passe os lançamentos para outra carteira (editando no Extrato) e os cartões também (editando em Cartões), ou exclua-os antes.',
                details
            })
            return
        }
        const ok = await confirm({
            title: `Excluir a carteira ${w.name}?`,
            message: 'Ela não tem lançamentos nem cartões. Isso não pode ser desfeito.',
            confirmLabel: 'Excluir carteira',
            tone: 'danger'
        })
        if (!ok) return
        try {
            const res = await fetch(`/api/finance/business-units/${w.id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } })
            const body = await res.json().catch(() => ({}))
            if (!res.ok) {
                notify({ title: 'Não deu para excluir', message: body.message || 'Tente de novo em instantes.', tone: 'error' })
                fetchWallets()
                return
            }
            fetchWallets()
        } catch {
            notify({ title: 'Sem conexão', message: 'Não deu para excluir a carteira. Tente de novo.', tone: 'error' })
        }
    }

    // ── Tela ────────────────────────────────────────────────────────────
    const hasTotals = Object.keys(totals.in).length > 0 || Object.keys(totals.out).length > 0
    const typeLocked = Boolean(form?.id && form.uses > 0)
    const formType = form ? typeOf(form.type) : null

    return (
        <div className="carteiras">
            <div className="crt-container">
                <header className="crt-head">
                    <div>
                        <h1 className="crt-title">Carteiras</h1>
                        <p className="crt-sub">Cada lançamento fica numa carteira: a do MEI para o dinheiro da empresa, a pessoal para o da casa.</p>
                    </div>
                    <button type="button" className="btn btn-primary" onClick={openNew}>
                        <Plus size={18} aria-hidden="true" /> Nova carteira
                    </button>
                </header>

                {loadState === 'loading' && (
                    <div className="csp-loading" aria-busy="true">{Array.from({ length: 4 }, (_, i) => <span key={i} />)}</div>
                )}

                {loadState === 'error' && (
                    <div className="csp-message" role="alert">
                        <p>Não deu para carregar as carteiras.</p>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setLoadState('loading'); fetchWallets() }}>Tentar de novo</button>
                    </div>
                )}

                {loadState === 'ok' && wallets.length === 0 && (
                    <div className="crt-empty">
                        <span className="crt-empty__icon" aria-hidden="true"><Wallet size={28} /></span>
                        <h2>Nenhuma carteira ainda</h2>
                        <p>Crie uma carteira do MEI e outra pessoal para separar o dinheiro da empresa do dinheiro da casa.</p>
                        <button type="button" className="btn btn-primary" onClick={openNew}>
                            <Plus size={18} aria-hidden="true" /> Criar carteira
                        </button>
                    </div>
                )}

                {loadState === 'ok' && wallets.length > 0 && (
                    <>
                        <section className="csp csp--flat crt-stats" aria-label="Resumo das carteiras">
                            <dl className="csp-stats">
                                <Stat
                                    main
                                    icon={Wallet}
                                    label="Carteiras"
                                    value={wallets.length.toLocaleString('pt-BR')}
                                    note={`${countOf('PJ')} do MEI e ${plural(countOf('PF'), 'pessoal', 'pessoais')}`}
                                />
                                <Stat
                                    icon={TrendingUp}
                                    label={`Entrou em ${year}`}
                                    value={hasTotals ? brl(sumOf(totals.in)) : '—'}
                                    note="recebido, somando todas as carteiras"
                                />
                                <Stat
                                    icon={TrendingDown}
                                    label={`Saiu em ${year}`}
                                    value={hasTotals ? brl(sumOf(totals.out)) : '—'}
                                    note="pago, somando todas as carteiras"
                                />
                                <Stat
                                    icon={Star}
                                    label="Carteira principal"
                                    value={primary ? primary.name : 'Nenhuma'}
                                    note={primary ? 'aparece primeiro nas listas' : 'escolha uma em “Tornar principal”'}
                                />
                            </dl>
                        </section>

                        <ul className="crt-grid">
                            {wallets.map(w => {
                                const t = typeOf(w.account_type)
                                const isBusy = busyId === w.id
                                return (
                                    <li key={w.id} className={`crt-card ${w.isPrimary ? 'is-primary' : ''}`}>
                                        <div className="crt-card__head">
                                            <WalletAvatar wallet={w} />
                                            <div className="crt-card__id">
                                                <h2 className="crt-card__name">{w.name}</h2>
                                                <div className="crt-tags">
                                                    <span className="crt-tag">{t.label}</span>
                                                    {w.isPrimary && <span className="crt-tag crt-tag--primary"><Star size={12} aria-hidden="true" /> Principal</span>}
                                                </div>
                                            </div>
                                        </div>

                                        <p className={`crt-doc ${w.cnpj ? '' : 'is-empty'}`}>
                                            {w.cnpj ? <>{t.doc} <span>{w.cnpj}</span></> : `Sem ${t.doc} cadastrado`}
                                        </p>

                                        <dl className="crt-facts">
                                            <div>
                                                <dt>Entrou em {year}</dt>
                                                <dd className={totals.in[w.id] > 0 ? 'is-in' : ''}>{hasTotals ? brl(totals.in[w.id]) : '—'}</dd>
                                            </div>
                                            <div>
                                                <dt>Saiu em {year}</dt>
                                                <dd className={totals.out[w.id] > 0 ? 'is-out' : ''}>{hasTotals ? brl(totals.out[w.id]) : '—'}</dd>
                                            </div>
                                            <div>
                                                <dt>Lançamentos</dt>
                                                <dd>{(Number(w.transactionsCount) || 0).toLocaleString('pt-BR')}</dd>
                                            </div>
                                            <div>
                                                <dt>Cartões</dt>
                                                <dd>{(Number(w.cardsCount) || 0).toLocaleString('pt-BR')}</dd>
                                            </div>
                                        </dl>

                                        <div className="crt-card__foot">
                                            {w.isPrimary ? (
                                                <span className="crt-foot-note">Aparece primeiro nas listas e não pode ser excluída.</span>
                                            ) : (
                                                <button type="button" className="crt-btn" onClick={() => makePrimary(w)} disabled={busyId !== null}>
                                                    <Star size={16} aria-hidden="true" /> {isBusy ? 'Trocando...' : 'Tornar principal'}
                                                </button>
                                            )}
                                            <div className="crt-card__actions">
                                                <button type="button" className="crt-icon-btn" onClick={() => openEdit(w)} aria-label={`Editar a carteira ${w.name}`} title="Editar">
                                                    <Pencil size={18} aria-hidden="true" />
                                                </button>
                                                {!w.isPrimary && (
                                                    <button type="button" className="crt-icon-btn crt-icon-btn--danger" onClick={() => handleDelete(w)} aria-label={`Excluir a carteira ${w.name}`} title="Excluir">
                                                        <Trash2 size={18} aria-hidden="true" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </li>
                                )
                            })}
                        </ul>
                    </>
                )}
            </div>

            {form && (
                <div className="cd-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) closeForm() }}>
                    <form className="cd-box crt-box" role="dialog" aria-modal="true" aria-labelledby="crt-form-title" onSubmit={handleSave} noValidate>
                        <button type="button" className="crt-box__close" onClick={closeForm} aria-label="Fechar" disabled={saving}><X size={20} aria-hidden="true" /></button>
                        <h2 id="crt-form-title" className="cd-title">{form.id ? 'Editar carteira' : 'Nova carteira'}</h2>
                        <p className="cd-message">
                            {!form.id ? 'Depois é só escolher essa carteira ao lançar ou ao cadastrar um cartão.'
                                : form.uses ? `Tem ${form.usage}. Mudar o nome muda em todos.`
                                    : 'Ainda sem lançamentos nem cartões.'}
                        </p>

                        <fieldset className="crt-field" disabled={typeLocked || saving}>
                            <legend>Tipo</legend>
                            <div className="crt-seg" role="radiogroup" aria-label="Tipo da carteira">
                                {TYPES.map(t => (
                                    <label key={t.value} className={`crt-seg__opt ${form.type === t.value ? 'is-on' : ''}`}>
                                        <input type="radio" name="crt-type" value={t.value} checked={form.type === t.value} onChange={() => setType(t.value)} />
                                        <t.icon size={16} aria-hidden="true" />
                                        {t.label}
                                    </label>
                                ))}
                            </div>
                            <small>{typeLocked ? 'O tipo não muda porque a carteira já tem lançamentos ou cartões. Para o outro tipo, crie uma carteira nova.' : formType.hint}</small>
                        </fieldset>

                        <label className="crt-field">
                            <span>Nome</span>
                            <input
                                type="text"
                                autoFocus
                                maxLength={MAX_NAME}
                                value={form.name}
                                onChange={e => { setForm(prev => ({ ...prev, name: e.target.value })); setFormError(null) }}
                                placeholder={form.type === 'PJ' ? 'Ex.: Doces da Ana, Oficina do Zé' : 'Ex.: Casa, Reserva'}
                                disabled={saving}
                            />
                        </label>

                        <label className="crt-field">
                            <span>{formType.doc} <em>(opcional)</em></span>
                            <input
                                type="text"
                                inputMode={form.type === 'PJ' ? 'text' : 'numeric'}
                                autoCapitalize="characters"
                                autoComplete="off"
                                value={form.document}
                                onChange={e => { setForm(prev => ({ ...prev, document: maskDocument(e.target.value, prev.type) })); setFormError(null) }}
                                placeholder={form.type === 'PJ' ? '00.000.000/0000-00' : '000.000.000-00'}
                                disabled={saving}
                            />
                            {form.type === 'PJ' && <small>CNPJ novo pode ter letras: escreva como está no cartão do CNPJ.</small>}
                        </label>

                        <div className="crt-field">
                            <span>Foto <em>(opcional)</em></span>
                            <div className="crt-photo">
                                <span className="crt-photo__preview" aria-hidden="true">
                                    {form.photo_url ? <img src={form.photo_url} alt="" /> : <Camera size={24} />}
                                </span>
                                <div className="crt-photo__actions">
                                    <input type="file" accept="image/png,image/jpeg,image/webp" hidden ref={fileInputRef} onChange={onFile} />
                                    <button type="button" className="crt-btn" onClick={() => fileInputRef.current?.click()} disabled={saving}>
                                        <Upload size={16} aria-hidden="true" /> {form.photo_url ? 'Trocar foto' : 'Escolher foto'}
                                    </button>
                                    {form.photo_url && (
                                        <button type="button" className="crt-link-danger" onClick={() => setForm(prev => ({ ...prev, photo_url: '' }))} disabled={saving}>
                                            Tirar foto
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {formError && (
                            <div className="crt-alert" role="alert" ref={alertRef}>
                                <span>{formError.message}</span>
                                {formError.limit && <Link to="/planos" className="crt-alert__link">Ver planos</Link>}
                            </div>
                        )}

                        <div className="cd-actions">
                            <button type="button" className="cd-btn" onClick={closeForm} disabled={saving}>Cancelar</button>
                            <button type="submit" className="cd-btn cd-btn--primary" disabled={saving}>
                                {saving ? 'Salvando...' : form.id ? 'Salvar' : 'Criar carteira'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {cropSrc && (
                <ImageCropperModal
                    imageSrc={cropSrc}
                    onCancel={() => setCropSrc(null)}
                    onSave={(base64) => { setForm(prev => (prev ? { ...prev, photo_url: base64 } : prev)); setCropSrc(null) }}
                />
            )}

            {dialog}
        </div>
    )
}
