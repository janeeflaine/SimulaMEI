import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { MessageCircle, Copy, Check } from 'lucide-react'
import './WhatsAppSection.css'

const authHeaders = () => ({
    'Authorization': `Bearer ${localStorage.getItem('token')}`,
    'Content-Type': 'application/json'
})

const EXAMPLES = [
    '"gastei 50 no mercado"',
    '"recebi 300 do cliente Ana"',
    '"boleto da luz de 180 vence dia 20"',
    '"contas da semana"',
    '"paguei a internet"',
    '"resumo do mês"'
]

export default function WhatsAppSection() {
    const [status, setStatus] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [linkCode, setLinkCode] = useState(null)
    const [secondsLeft, setSecondsLeft] = useState(0)
    const [busy, setBusy] = useState(false)
    const [copied, setCopied] = useState(false)
    const pollRef = useRef(null)

    const fetchStatus = useCallback(async () => {
        try {
            const res = await fetch('/api/whatsapp/status', { headers: authHeaders() })
            if (!res.ok) throw new Error()
            const data = await res.json()
            setStatus(data)
            if (data.linked) setLinkCode(null)
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

    const generateCode = async () => {
        setBusy(true)
        setError('')
        try {
            const res = await fetch('/api/whatsapp/link-code', { method: 'POST', headers: authHeaders() })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.message)
            setLinkCode(data)
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

    const toggleReminder = async () => {
        const next = !status.reminderEnabled
        setBusy(true)
        try {
            const res = await fetch('/api/whatsapp/settings', {
                method: 'PUT',
                headers: authHeaders(),
                body: JSON.stringify({ reminderEnabled: next })
            })
            if (!res.ok) throw new Error()
            setStatus(prev => ({ ...prev, reminderEnabled: next }))
        } catch (_) {
            setError('Não foi possível salvar o lembrete.')
        } finally {
            setBusy(false)
        }
    }

    const unlink = async () => {
        if (!window.confirm('Desconectar este WhatsApp da sua conta? Você pode conectar de novo quando quiser.')) return
        setBusy(true)
        try {
            const res = await fetch('/api/whatsapp/link', { method: 'DELETE', headers: authHeaders() })
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

            {!loading && status?.available && status.linked && (
                <>
                    <div className="whatsapp-row">
                        <div>
                            <h4>Conectado</h4>
                            <p className="whatsapp-muted">Número terminado em {status.phone?.replace('•••• ', '')}</p>
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
                            aria-checked={status.reminderEnabled}
                            aria-label="Lembrete diário"
                            className={`whatsapp-switch ${status.reminderEnabled ? 'on' : ''}`}
                            onClick={toggleReminder}
                            disabled={busy}
                        >
                            <span />
                        </button>
                    </div>

                    <div className="whatsapp-examples">
                        <p>Mande mensagens como:</p>
                        <ul>{EXAMPLES.map(e => <li key={e}>{e}</li>)}</ul>
                        {!status.mediaAvailable && (
                            <p className="whatsapp-muted">Áudio e foto de boleto ou comprovante estão disponíveis no plano Ouro.</p>
                        )}
                    </div>

                    <button type="button" className="btn btn-secondary" onClick={unlink} disabled={busy}>
                        Desconectar WhatsApp
                    </button>
                </>
            )}

            {!loading && status?.available && !status.linked && !linkCode && (
                <div className="whatsapp-connect">
                    <p>
                        Converse com o EuSempreMEI pelo WhatsApp para registrar gastos e receitas, ver contas a pagar
                        e receber lembretes de vencimento.
                    </p>
                    <button type="button" className="btn btn-primary" onClick={generateCode} disabled={busy}>
                        {busy ? 'Gerando código...' : 'Conectar WhatsApp'}
                    </button>
                </div>
            )}

            {!loading && status?.available && !status.linked && linkCode && (
                <div className="whatsapp-code-box">
                    <p>Envie esta mensagem, do seu celular, para o WhatsApp do EuSempreMEI:</p>
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
