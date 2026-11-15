import { useState } from 'react'
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

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        const cleanEmail = normalizeEmail(email)
        if (!looksLikeEmail(cleanEmail)) return setError('Digite o e-mail da sua conta, por exemplo joana@gmail.com.')
        if (!password) return setError('Digite a sua senha.')

        setLoading(true)
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
            setError(err.message || 'Não deu para entrar agora. Tente de novo.')
            setLoading(false)
        }
    }

    const registerLink = planIdParam ? `/cadastro?planId=${encodeURIComponent(planIdParam)}` : '/cadastro'

    return (
        <AuthFrame>
            <h1 className="acs-title">Entrar</h1>
            <p className="acs-sub">Use o e-mail e a senha da sua conta.</p>

            <form onSubmit={handleSubmit} className="acs-form" noValidate>
                {!error && notice && <AuthAlert tone="info">{notice}</AuthAlert>}
                <AuthAlert>{error}</AuthAlert>

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

                <button type="submit" className="acs-submit" disabled={loading}>
                    {loading ? 'Entrando...' : 'Entrar'}
                </button>
            </form>

            <p className="acs-switch">
                Ainda não tem conta? <Link to={registerLink} className="acs-link">Criar conta grátis</Link>
            </p>
        </AuthFrame>
    )
}
