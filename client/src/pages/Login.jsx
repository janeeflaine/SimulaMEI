import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AuthFrame, { AuthAlert, PasswordField, looksLikeEmail, normalizeEmail } from '../components/auth/AuthFrame'

export default function Login() {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const planIdParam = searchParams.get('planId') || sessionStorage.getItem('selectedPlanId')

    const { login } = useAuth()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    // Motivo de ter saído sozinho (ex.: conta aberta em outro aparelho), guardado pelo AuthContext
    const [notice] = useState(() => {
        const reason = sessionStorage.getItem('logoutReason')
        if (reason) sessionStorage.removeItem('logoutReason')
        return reason || ''
    })
    const [loading, setLoading] = useState(false)
    // Trava de tentativas: até quando e para qual e-mail (o aviso conta os minutos que faltam)
    const [lock, setLock] = useState(null) // { until, email, message }
    const [now, setNow] = useState(Date.now())

    useEffect(() => {
        if (!lock) return
        const timer = setInterval(() => setNow(Date.now()), 15000)
        return () => clearInterval(timer)
    }, [lock])

    const lockLeft = lock ? Math.max(0, lock.until - now) : 0
    const lockedNow = !!lock && lockLeft > 0 && normalizeEmail(email) === lock.email
    const lockMessage = () => {
        if (!lock) return ''
        if (lockLeft <= 0) return ''
        const m = Math.max(1, Math.ceil(lockLeft / 60000))
        return lock.message.replace(/em \d+ minutos?/, `em ${m === 1 ? '1 minuto' : `${m} minutos`}`)
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        const cleanEmail = normalizeEmail(email)
        if (!looksLikeEmail(cleanEmail)) return setError('Digite o e-mail da sua conta, por exemplo joana@gmail.com.')
        if (!password) return setError('Digite a sua senha.')

        setLoading(true)
        setLock(null)
        try {
            const user = await login(cleanEmail, password)
            if (user.role === 'ADMIN') {
                navigate('/admin')
            } else if (user.subscriptionStatus === 'pending_payment') {
                navigate('/planos?pending=true')
            } else if (planIdParam) {
                sessionStorage.removeItem('selectedPlanId')
                navigate(`/planos?selected=${encodeURIComponent(planIdParam)}&autoCheckout=true`)
            } else {
                navigate('/dashboard')
            }
        } catch (err) {
            if (err.retryAfter) {
                setNow(Date.now())
                setLock({ until: Date.now() + err.retryAfter * 1000, email: cleanEmail, message: err.message })
                setError('')
            } else {
                setError(err.message || 'Não deu para entrar agora. Tente de novo.')
            }
            setLoading(false)
        }
    }

    const registerLink = planIdParam ? `/cadastro?planId=${encodeURIComponent(planIdParam)}` : '/cadastro'

    return (
        <AuthFrame>
            <h1 className="acs-title">Entrar</h1>
            <p className="acs-sub">Use o e-mail e a senha da sua conta.</p>

            <form onSubmit={handleSubmit} className="acs-form" noValidate>
                {!error && !lock && notice && <AuthAlert tone="info">{notice}</AuthAlert>}
                <AuthAlert>{error || lockMessage()}</AuthAlert>
                {lock && lockLeft <= 0 && <AuthAlert tone="success">Já pode tentar de novo.</AuthAlert>}

                <div className="acs-field">
                    <label htmlFor="acs-email">E-mail</label>
                    <input
                        id="acs-email"
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        autoCapitalize="none"
                        spellCheck={false}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="seu@email.com"
                        disabled={loading}
                        maxLength={254}
                    />
                </div>

                <PasswordField
                    id="acs-password"
                    label="Senha"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    disabled={loading}
                    aside={<Link to="/esqueci-senha" className="acs-link acs-link--small">Esqueci a senha</Link>}
                />

                <button type="submit" className="acs-submit" disabled={loading || lockedNow}>
                    {loading ? 'Entrando...' : 'Entrar'}
                </button>
            </form>

            <p className="acs-switch">
                Ainda não tem conta? <Link to={registerLink} className="acs-link">Criar conta grátis</Link>
            </p>
        </AuthFrame>
    )
}
