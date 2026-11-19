import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Link2Off, MailCheck, PartyPopper, MailWarning } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { track } from '../utils/metaPixel'
import AuthFrame, { AuthAlert, readJson } from '../components/auth/AuthFrame'

/**
 * Confirmação de e-mail do teste grátis (utils/trial.js no servidor).
 * - Com ?token=: abre o link do e-mail (não precisa estar na conta) e começa o teste.
 * - Sem token: "Confira o seu e-mail", logo depois do cadastro ou pelo aviso do painel,
 *   com o botão para mandar outro link.
 */
const validToken = (t) => typeof t === 'string' && /^[a-f0-9]{64}$/.test(t)
const brDate = (d) => new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
const CONNECTION_ERROR = 'Sem conexão com o site. Confira a internet e tente de novo.'
// "e-mail" inteiro na mesma linha (no celular o título quebrava em "e-" / "mail")
const EMail = ({ cap }) => <span style={{ whiteSpace: 'nowrap' }}>{cap ? 'E-mail' : 'e-mail'}</span>

export default function ConfirmEmail() {
    const [searchParams] = useSearchParams()
    const token = searchParams.get('token')
    return token ? <OpenLink token={token} /> : <WaitForEmail />
}

function OpenLink({ token }) {
    const { user, refreshUser } = useAuth()
    const [result, setResult] = useState(validToken(token) ? null : { invalid: true })
    const [error, setError] = useState('')
    const sent = useRef(false)

    const confirm = async () => {
        setError('')
        try {
            const res = await fetch('/api/auth/verify-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token })
            })
            const data = await readJson(res)
            if (res.ok) {
                setResult(data)
                if (data.trialStarted) {
                    track('StartTrial')
                    if (localStorage.getItem('token')) refreshUser()
                }
            } else if (data.reason === 'invalid_token') {
                setResult({ invalid: true, message: data.message })
            } else {
                setError(data.message || 'Não deu para confirmar agora. Tente de novo.')
            }
        } catch {
            setError(CONNECTION_ERROR)
        }
    }

    useEffect(() => {
        // Uma vez só: o link vale uma vez (o modo de desenvolvimento do React roda efeitos duas vezes)
        if (sent.current || !validToken(token)) return
        sent.current = true
        confirm()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token])

    const next = user
        ? <Link to="/dashboard" className="acs-submit">Ir para o painel</Link>
        : <Link to="/login" className="acs-submit">Entrar</Link>

    if (error) {
        return (
            <AuthFrame>
                <h1 className="acs-title">Confirmando o seu <EMail /></h1>
                <AuthAlert>{error}</AuthAlert>
                <button type="button" className="acs-submit" onClick={confirm}>Tentar de novo</button>
            </AuthFrame>
        )
    }

    if (!result) {
        return (
            <AuthFrame>
                <h1 className="acs-title">Confirmando o seu <EMail /></h1>
                <p className="acs-sub" role="status">Só um instante...</p>
            </AuthFrame>
        )
    }

    if (result.invalid) {
        return (
            <AuthFrame>
                <div className="acs-done">
                    <span className="acs-done__icon is-warn"><Link2Off size={28} strokeWidth={1.8} aria-hidden="true" /></span>
                    <h1 className="acs-title">Este link não vale mais</h1>
                    <p className="acs-sub">
                        O link vale por 48 horas e só uma vez. Se você pediu mais de um, use o mais recente.
                        {user ? '' : ' Entre na sua conta para pedir outro.'}
                    </p>
                    {user
                        ? <Link to="/confirmar-email" className="acs-submit">Pedir um link novo</Link>
                        : <Link to="/login" className="acs-submit">Entrar</Link>}
                </div>
            </AuthFrame>
        )
    }

    if (result.trialStarted) {
        return (
            <AuthFrame>
                <div className="acs-done">
                    <span className="acs-done__icon"><PartyPopper size={28} strokeWidth={1.8} aria-hidden="true" /></span>
                    <h1 className="acs-title">Seu teste grátis começou</h1>
                    <p className="acs-sub" role="status">
                        E-mail confirmado. Você tem o plano <strong>{result.planName}</strong> até <strong>{brDate(result.trialEndsAt)}</strong>.
                        No fim, a conta volta ao Gratuito sozinha, sem cobrança e sem perder os dados.
                    </p>
                    {next}
                </div>
            </AuthFrame>
        )
    }

    return (
        <AuthFrame>
            <div className="acs-done">
                <span className="acs-done__icon"><MailCheck size={28} strokeWidth={1.8} aria-hidden="true" /></span>
                <h1 className="acs-title"><EMail cap /> confirmado</h1>
                <p className="acs-sub" role="status">{result.message || 'A conta continua no Gratuito.'}</p>
                {next}
                {result.reason !== 'not_free' && <Link to="/planos" className="acs-secondary">Ver planos</Link>}
            </div>
        </AuthFrame>
    )
}

function WaitForEmail() {
    const { user, loading: authLoading } = useAuth()
    const location = useLocation()
    const navigate = useNavigate()
    const fromRegister = location.state && location.state.trial
    const [offer, setOffer] = useState(fromRegister || null)
    const [notice, setNotice] = useState(fromRegister && fromRegister.emailSent === false
        ? { tone: 'error', text: 'Não deu para mandar o e-mail agora. Toque em "Mandar outro link".' }
        : null)
    const [sending, setSending] = useState(false)

    useEffect(() => {
        if (fromRegister) return
        let alive = true
        fetch('/api/plans/trial')
            .then(res => (res.ok ? res.json() : null))
            .then(data => { if (alive && data?.enabled) setOffer(data) })
            .catch(() => {})
        return () => { alive = false }
    }, [fromRegister])

    // Quem não tem confirmação pendente não tem o que fazer aqui
    useEffect(() => {
        if (!authLoading && user && !user.trialPending && !fromRegister) navigate('/dashboard', { replace: true })
    }, [authLoading, user, fromRegister, navigate])

    const resend = async () => {
        setSending(true)
        setNotice(null)
        try {
            const res = await fetch('/api/auth/resend-verification', {
                method: 'POST',
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            })
            const data = await readJson(res)
            setNotice({ tone: res.ok ? 'success' : 'error', text: data.message || (res.ok ? 'Mandamos um link novo.' : 'Não deu para mandar agora.') })
        } catch {
            setNotice({ tone: 'error', text: CONNECTION_ERROR })
        } finally {
            setSending(false)
        }
    }

    if (!authLoading && !user) {
        return (
            <AuthFrame>
                <div className="acs-done">
                    <span className="acs-done__icon"><MailCheck size={28} strokeWidth={1.8} aria-hidden="true" /></span>
                    <h1 className="acs-title">Confirme o seu <EMail /></h1>
                    <p className="acs-sub">Abra o link que mandamos para o seu e-mail. Para pedir outro, entre na sua conta.</p>
                    <Link to="/login" className="acs-submit">Entrar</Link>
                </div>
            </AuthFrame>
        )
    }

    const email = user?.email
    const expired = user?.trialLinkExpired
    return (
        <AuthFrame>
            <div className="acs-done">
                <span className={`acs-done__icon${expired ? ' is-warn' : ''}`}>
                    {expired ? <MailWarning size={28} strokeWidth={1.8} aria-hidden="true" /> : <MailCheck size={28} strokeWidth={1.8} aria-hidden="true" />}
                </span>
                <h1 className="acs-title">{expired ? 'O link de confirmação venceu' : <>Confira o seu <EMail /></>}</h1>
                <p className="acs-sub" role="status">
                    {expired
                        ? 'Peça outro link para começar o teste grátis. Ele vale por 48 horas.'
                        : <>Mandamos um link para <strong>{email}</strong>.{' '}
                            {offer ? <>Abra o link para começar os {offer.days} dias do plano {offer.planName}.</> : 'Abra o link para começar o teste grátis.'}</>}
                </p>
                {!expired && <p className="acs-hint">Não chegou em alguns minutos? Olhe a caixa de spam ou de promoções. Enquanto isso, a conta já funciona no Gratuito.</p>}
                <AuthAlert tone={notice?.tone}>{notice?.text}</AuthAlert>
                <Link to="/dashboard" className="acs-submit">Ir para o painel</Link>
                <button type="button" className="acs-secondary" onClick={resend} disabled={sending}>
                    {sending ? 'Mandando...' : 'Mandar outro link'}
                </button>
            </div>
        </AuthFrame>
    )
}
