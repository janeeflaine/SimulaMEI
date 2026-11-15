import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Check, KeyRound, Link2Off } from 'lucide-react'
import AuthFrame, { AuthAlert, PasswordField, passwordProblem, readJson } from '../components/auth/AuthFrame'

// O link do e-mail traz um código de 64 letras e números (0-9, a-f)
const validToken = (t) => typeof t === 'string' && /^[a-f0-9]{64}$/i.test(t)

export default function ResetPassword() {
    const [searchParams] = useSearchParams()
    const token = searchParams.get('token')
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [done, setDone] = useState(false)
    const [error, setError] = useState('')
    const [expired, setExpired] = useState(false)
    const [loading, setLoading] = useState(false)

    const same = confirmPassword.length > 0 && password === confirmPassword

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        const problem = passwordProblem(password)
        if (problem) return setError(problem)
        if (password !== confirmPassword) return setError('As duas senhas não estão iguais.')

        setLoading(true)
        try {
            const res = await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, newPassword: password })
            })
            const data = await readJson(res)
            if (res.ok) {
                setDone(true)
            } else if (data.reason === 'invalid_token') {
                setExpired(true)
            } else {
                setError(data.message || 'Não deu para salvar a senha agora. Tente de novo.')
            }
        } catch {
            setError('Sem conexão com o site. Confira a internet e tente de novo.')
        } finally {
            setLoading(false)
        }
    }

    if (!validToken(token) || expired) {
        return (
            <AuthFrame>
                <div className="acs-done">
                    <span className="acs-done__icon is-warn"><Link2Off size={28} strokeWidth={1.8} aria-hidden="true" /></span>
                    <h1 className="acs-title">{expired ? 'Este link já venceu' : 'Este link não está completo'}</h1>
                    <p className="acs-sub">
                        {expired
                            ? 'O link vale por 1 hora e só pode ser usado uma vez. Peça um novo e use o mais recente.'
                            : 'Abra o link direto do e-mail que mandamos. Se ele quebrou em duas linhas, peça um novo.'}
                    </p>
                    <Link to="/esqueci-senha" className="acs-submit">Pedir um link novo</Link>
                </div>
            </AuthFrame>
        )
    }

    if (done) {
        return (
            <AuthFrame>
                <div className="acs-done">
                    <span className="acs-done__icon"><KeyRound size={28} strokeWidth={1.8} aria-hidden="true" /></span>
                    <h1 className="acs-title">Senha nova salva</h1>
                    <p className="acs-sub" role="status">Por segurança, saímos da sua conta em todos os aparelhos. Entre de novo com a senha nova.</p>
                    <Link to="/login" className="acs-submit">Entrar</Link>
                </div>
            </AuthFrame>
        )
    }

    return (
        <AuthFrame>
            <h1 className="acs-title">Criar senha nova</h1>
            <p className="acs-sub">Escolha uma senha que você não usa em outros sites.</p>

            <form onSubmit={handleSubmit} className="acs-form" noValidate>
                <AuthAlert>{error}</AuthAlert>
                <PasswordField id="acs-password" label="Senha nova" value={password} onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password" disabled={loading} describedBy="acs-rules" />
                <PasswordField id="acs-confirm" label="Repita a senha nova" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password" disabled={loading} describedBy="acs-rules" invalid={confirmPassword.length > 0 && !same} />
                <ul className="acs-rules" id="acs-rules">
                    <li className={password.length >= 8 ? 'is-ok' : ''}><Check size={16} strokeWidth={2.4} aria-hidden="true" />Pelo menos 8 caracteres</li>
                    <li className={same ? 'is-ok' : ''}><Check size={16} strokeWidth={2.4} aria-hidden="true" />As duas senhas iguais</li>
                </ul>
                <button type="submit" className="acs-submit" disabled={loading}>
                    {loading ? 'Salvando...' : 'Salvar senha nova'}
                </button>
            </form>
        </AuthFrame>
    )
}
