import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { MessageCircle, Copy, Check, Plus } from 'lucide-react'
import './WhatsAppSection.css'

const authHeaders = () => ({
    'Authorization': `Bearer ${localStorage.getItem('token')}`,
    'Content-Type': 'application/json'
})

const EXAMPLES = [
    '"gastei 50 no mercado no pix"',
    '"recebi 300 do cliente Ana"',
    '"comprei 10 de peixe carteira Maria pix"',
    '"boleto da luz de 180 vence dia 20"',
    '"contas da semana"',
    '"resumo do mês"'
]

/** Primeira carteira do tipo que ainda não é padrão de outro número (senão a primeira do tipo). */
const suggestWallet = (wallets, links, accountType, key) => {
    const ofType = wallets.filter(w => w.accountType === accountType)
    const used = new Set(links.map(l => l[key]?.id).filter(Boolean))
    const free = ofType.find(w => !used.has(w.id))
    return String((free || ofType[0] || {}).id || '')
}

export default function WhatsAppSection() {
    const [status, setStatus] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [linkCode, setLinkCode] = useState(null)
    const [secondsLeft, setSecondsLeft] = useState(0)
    const [busy, setBusy] = useState(false)
    const [copied, setCopied] = useState(false)
    const [choosing, setChoosing] = useState(false)
    const [personalWalletId, setPersonalWalletId] = useState('')
    const [businessWalletId, setBusinessWalletId] = useState('')
    const pollRef = useRef(null)
    const linksBeforeCode = useRef(0)

    const fetchStatus = useCallback(async () => {
        try {
            const res = await fetch('/api/whatsapp/status', { headers: authHeaders() })
            if (!res.ok) throw new Error()
            const data = await res.json()
            setStatus(data)
            // Um número novo apareceu: o código foi usado
            if ((data.links || []).length > linksBeforeCode.current) setLinkCode(null)
            return data
        } catch (_) {
            setError('Não foi possível carregar a situação do WhatsApp.')
            return null
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { fetchStatus() }, [fetchStatus])

    // Enquanto o código está na tela: contagem regressiva e checagem do vínculo a cada 5s
    useEffect(() => {
        if (!linkCode) return undefined
        const tick = () => {
            const left = Math.max(0, Math.round((new Date(linkCode.expiresAt) - Date.now()) / 1000))
            setSecondsLeft(left)
            if (left === 0) setLinkCode(null)
        }
        tick()
        const timer = setInterval(tick, 1000)
        pollRef.current = setInterval(fetchStatus, 5000)
        return () => {
            clearInterval(timer)
            clearInterval(pollRef.current)
        }
    }, [linkCode, fetchStatus])

    const links = status?.links || []
    const wallets = status?.wallets || []
    const maxNumbers = status?.maxNumbers || 0
    const canAddMore = links.length < maxNumbers
    const personalWallets = wallets.filter(w => w.accountType === 'PF')
    const businessWallets = wallets.filter(w => w.accountType === 'PJ')

    const startChoosing = () => {
        setError('')
        setPersonalWalletId(suggestWallet(wallets, links, 'PF', 'personalWallet'))
        setBusinessWalletId(suggestWallet(wallets, links, 'PJ', 'businessWallet'))
        setChoosing(true)
    }

    const generateCode = async () => {
        setBusy(true)
        setError('')
        try {
            const res = await fetch('/api/whatsapp/link-code', {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    personalWalletId: personalWalletId ? Number(personalWalletId) : null,
                    businessWalletId: businessWalletId ? Number(businessWalletId) : null
                })
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.message)
            linksBeforeCode.current = links.length
            setLinkCode(data)
            setChoosing(false)
            setCopied(false)
        } catch (err) {
            setError(err.message || 'Não foi possível gerar o código.')
        } finally {
            setBusy(false)
        }
    }

    const copyMessage = async () => {
        try {
            await navigator.clipboard.writeText(linkCode.message)
            setCopied(true)
        } catch (_) {
            setCopied(false)
        }
    }

    const toggleReminder = async (link) => {
        const next = !link.reminderEnabled
        setBusy(true)
        try {
            const res = await fetch('/api/whatsapp/settings', {
                method: 'PUT',
                headers: authHeaders(),
                body: JSON.stringify({ linkId: link.id, reminderEnabled: next })
            })
            if (!res.ok) throw new Error()
            setStatus(prev => ({
                ...prev,
                links: prev.links.map(l => (l.id === link.id ? { ...l, reminderEnabled: next } : l))
            }))
        } catch (_) {
            setError('Não foi possível salvar o lembrete.')
        } finally {
            setBusy(false)
        }
    }

    const unlink = async (link) => {
        const ending = link.phone?.replace('•••• ', '')
        if (!window.confirm(`Desconectar o WhatsApp terminado em ${ending}? Você pode conectar de novo quando quiser.`)) return
        setBusy(true)
        try {
            const res = await fetch(`/api/whatsapp/link/${link.id}`, { method: 'DELETE', headers: authHeaders() })
            if (!res.ok) throw new Error()
            await fetchStatus()
        } catch (_) {
            setError('Não foi possível desconectar.')
        } finally {
            setBusy(false)
        }
    }

    const minutes = String(Math.floor(secondsLeft / 60)).padStart(2, '0')
    const seconds = String(secondsLeft % 60).padStart(2, '0')

    return (
        <div className="section whatsapp-section">
            <h2>
                <MessageCircle size={20} aria-hidden="true" />
                WhatsApp
            </h2>

            {loading && <div className="loader" aria-label="Carregando"></div>}

            {!loading && error && (
                <div className="alert alert-danger whatsapp-alert"><span>⚠️</span> {error}</div>
            )}

            {!loading && status && !status.available && (
                <div className="whatsapp-locked">
                    <p>
                        Registre gastos, consulte e pague contas mandando mensagem no WhatsApp.
                        Disponível nos planos <strong>Prata</strong> e <strong>Ouro</strong>.
                    </p>
                    <Link to="/planos" className="btn btn-primary">Ver planos</Link>
                </div>
            )}

            {!loading && status?.available && links.length > 0 && (
                <>
                    <p className="whatsapp-muted whatsapp-count">
                        {links.length} de {maxNumbers} número(s) conectado(s). Cada número lança nas próprias carteiras;
                        para usar outra, cite o nome na mensagem.
                    </p>

                    <ul className="whatsapp-links">
                        {links.map(link => (
                            <li key={link.id} className="whatsapp-link-card">
                                <div className="whatsapp-link-head">
                                    <div>
                                        <h4>Número terminado em {link.phone?.replace('•••• ', '')}</h4>
                                        <p className="whatsapp-muted">
                                            Pessoal: <strong>{link.personalWallet?.name || 'automática'}</strong>
                                            {' · '}
                                            MEI: <strong>{link.businessWallet?.name || 'automática'}</strong>
                                        </p>
                                    </div>
                                    <span className="badge badge-success">Ativo</span>
                                </div>

                                <div className="whatsapp-row">
                                    <div>
                                        <h4>Lembrete diário</h4>
                                        <p className="whatsapp-muted">Aviso pela manhã quando houver conta vencendo hoje ou atrasada.</p>
                                    </div>
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={link.reminderEnabled}
                                        aria-label={`Lembrete diário do número terminado em ${link.phone?.replace('•••• ', '')}`}
                                        className={`whatsapp-switch ${link.reminderEnabled ? 'on' : ''}`}
                                        onClick={() => toggleReminder(link)}
                                        disabled={busy}
                                    >
                                        <span />
                                    </button>
                                </div>

                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => unlink(link)} disabled={busy}>
                                    Desconectar este número
                                </button>
                            </li>
                        ))}
                    </ul>

                    <div className="whatsapp-examples">
                        <p>Mande mensagens como:</p>
                        <ul>{EXAMPLES.map(e => <li key={e}>{e}</li>)}</ul>
                        {!status.mediaAvailable && (
                            <p className="whatsapp-muted">Áudio e foto de boleto ou comprovante estão disponíveis no plano Ouro.</p>
                        )}
                    </div>

                    {!canAddMore && (
                        <p className="whatsapp-muted">
                            Seu plano permite {maxNumbers} número(s). <Link to="/planos">Ver planos</Link>
                        </p>
                    )}
                </>
            )}

            {!loading && status?.available && !linkCode && !choosing && canAddMore && (
                <div className="whatsapp-connect">
                    {links.length === 0 && (
                        <p>
                            Converse com o EuSempreMEI pelo WhatsApp para registrar gastos e receitas, ver contas a pagar
                            e receber lembretes de vencimento.
                        </p>
                    )}
                    <button type="button" className="btn btn-primary whatsapp-add-btn" onClick={startChoosing} disabled={busy}>
                        {links.length === 0 ? 'Conectar WhatsApp' : <><Plus size={16} aria-hidden="true" /> Conectar outro número</>}
                    </button>
                </div>
            )}

            {!loading && status?.available && choosing && !linkCode && (
                <div className="whatsapp-code-box">
                    <p>Escolha para quais carteiras vão os lançamentos feitos por este número:</p>
                    <div className="whatsapp-wallet-fields">
                        <label>
                            <span>Carteira pessoal</span>
                            <select value={personalWalletId} onChange={(e) => setPersonalWalletId(e.target.value)}>
                                <option value="">Automática</option>
                                {personalWallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                            </select>
                        </label>
                        <label>
                            <span>Carteira MEI</span>
                            <select value={businessWalletId} onChange={(e) => setBusinessWalletId(e.target.value)}>
                                <option value="">Automática</option>
                                {businessWallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                            </select>
                        </label>
                    </div>
                    <p className="whatsapp-muted">
                        "Automática" usa a carteira principal (ou a mais antiga) daquele tipo.
                        Pela mensagem dá para lançar em qualquer carteira citando o nome dela.
                    </p>
                    <div className="whatsapp-code-actions">
                        <button type="button" className="btn btn-primary" onClick={generateCode} disabled={busy}>
                            {busy ? 'Gerando código...' : 'Gerar código'}
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={() => setChoosing(false)} disabled={busy}>
                            Cancelar
                        </button>
                    </div>
                </div>
            )}

            {!loading && status?.available && linkCode && (
                <div className="whatsapp-code-box">
                    <p>Envie esta mensagem, do celular que vai usar, para o WhatsApp do EuSempreMEI:</p>
                    <div className="whatsapp-code">{linkCode.message}</div>
                    <div className="whatsapp-code-actions">
                        {linkCode.waLink && (
                            <a href={linkCode.waLink} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
                                Abrir o WhatsApp
                            </a>
                        )}
                        <button type="button" className="btn btn-secondary" onClick={copyMessage}>
                            {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                            {copied ? 'Copiado' : 'Copiar mensagem'}
                        </button>
                    </div>
                    {!linkCode.waLink && status.businessNumber && (
                        <p className="whatsapp-muted">Número do EuSempreMEI: +{status.businessNumber}</p>
                    )}
                    <p className="whatsapp-muted" aria-live="polite">
                        O código vale por {minutes}:{seconds}. Esta tela atualiza sozinha quando a conexão for confirmada.
                    </p>
                    <p className="whatsapp-muted">
                        Ao enviar, você autoriza o EuSempreMEI a te mandar mensagens sobre a sua conta.
                        Para parar os lembretes, responda PARAR. <Link to="/politica-de-privacidade">Política de Privacidade</Link>.
                    </p>
                </div>
            )}
        </div>
    )
}
