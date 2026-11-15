import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MailCheck } from 'lucide-react'
import AuthFrame, { AuthAlert, looksLikeEmail, normalizeEmail, readJson } from '../components/auth/AuthFrame'

export default function ForgotPassword() {
    const [email, setEmail] = useState('')
    const [sentTo, setSentTo] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        const clean = normalizeEmail(email)
        if (!looksLikeEmail(clean)) return setError('Digite o e-mail da sua conta, por exemplo joana@gmail.com.')

        setLoading(true)
        try {
            const res = await fetch('/api/auth/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: clean })
            })
            const data = await readJson(res)
            if (res.ok) setSentTo(clean)
            else setError(data.message || 'Não deu para enviar agora. Tente de novo em alguns minutos.')
        } catch {
            setError('Sem conexão com o site. Confira a internet e tente de novo.')
        } finally {
            setLoading(false)
        }
    }

    if (sentTo) {
        return (
            <AuthFrame>
                <div className="acs-done">
                    <span className="acs-done__icon"><MailCheck size={28} strokeWidth={1.8} aria-hidden="true" /></span>
                    <h1 className="acs-title">Confira seu e-mail</h1>
                    <p className="acs-sub" role="status">
                        Se existir uma conta com <strong>{sentTo}</strong>, mandamos um link para criar uma senha nova.
                        O link vale por 1 hora.
                    </p>
                    <p className="acs-hint">Não chegou em alguns minutos? Olhe a caixa de spam ou de promoções.</p>
                    <Link to="/login" className="acs-submit">Voltar para Entrar</Link>
                    <button type="button" className="acs-secondary" onClick={() => { setSentTo(''); setEmail('') }}>
                        Usar outro e-mail
                    </button>
                </div>
            </AuthFrame>
        )
    }

    return (
        <AuthFrame>
            <h1 className="acs-title">Esqueci a senha</h1>
            <p className="acs-sub">Digite o e-mail da sua conta. Vamos mandar um link para você criar uma senha nova.</p>

            <form onSubmit={handleSubmit} className="acs-form" noValidate>
                <AuthAlert>{error}</AuthAlert>
                <div className="acs-field">
                    <label htmlFor="acs-email">E-mail</label>
                    <input id="acs-email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none"
                        spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)}
                        placeholder="seu@email.com" disabled={loading} maxLength={254} />
                </div>
                <button type="submit" className="acs-submit" disabled={loading}>
                    {loading ? 'Enviando...' : 'Enviar o link'}
                </button>
            </form>

            <p className="acs-switch">
                Lembrou a senha? <Link to="/login" className="acs-link">Entrar</Link>
            </p>
        </AuthFrame>
    )
}
