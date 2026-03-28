import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import './Login.css'

export default function ResetPassword() {
    const [searchParams] = useSearchParams()
    const token = searchParams.get('token')

    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [message, setMessage] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        setMessage('')

        if (!token) {
            return setError('Token de recuperação não encontrado na URL.')
        }

        if (password !== confirmPassword) {
            return setError('As senhas não coincidem.')
        }

        if (password.length < 6) {
            return setError('A senha deve ter no mínimo 6 caracteres.')
        }

        setLoading(true)

        try {
            const res = await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ token, newPassword: password })
            })

            const data = await res.json()

            if (res.ok) {
                setMessage('Senha redefinida com sucesso! Você já pode fazer login.')
                setPassword('')
                setConfirmPassword('')
            } else {
                setError(data.message || 'Ocorreu um erro ao redefinir a senha.')
            }
        } catch (err) {
            setError('Erro de conexão. Tente novamente mais tarde.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="auth-page">
            <div className="container">
                <div className="auth-container">
                    <div className="auth-header">
                        <Link to="/" className="auth-logo">
                            <span>📊</span> SimulaMEI
                        </Link>
                        <h1 className="auth-title">Criar Nova Senha</h1>
                        <p className="auth-subtitle">Digite sua nova senha abaixo</p>
                    </div>

                    <form onSubmit={handleSubmit} className="auth-form">
                        {error && (
                            <div className="alert alert-danger" style={{ padding: '12px', backgroundColor: '#fee2e2', color: '#b91c1c', borderRadius: '6px', marginBottom: '16px' }}>
                                <span>⚠️</span> {error}
                            </div>
                        )}
                        {message && (
                            <div className="alert alert-success" style={{ padding: '12px', backgroundColor: '#d1fae5', color: '#047857', borderRadius: '6px', marginBottom: '16px' }}>
                                <span>✅</span> {message}
                            </div>
                        )}

                        {!message && (
                            <>
                                <div className="form-group">
                                    <label className="form-label">Nova Senha</label>
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                        className="form-input"
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Confirmar Nova Senha</label>
                                    <input
                                        type="password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        placeholder="••••••••"
                                        className="form-input"
                                        required
                                    />
                                </div>

                                <button
                                    type="submit"
                                    className="btn btn-primary btn-lg auth-submit"
                                    style={{ width: '100%' }}
                                    disabled={loading || !token}
                                >
                                    {loading ? 'Salvando...' : 'Redefinir Senha'}
                                </button>
                            </>
                        )}

                        {message && (
                            <Link to="/login" className="btn btn-primary btn-lg auth-submit" style={{ width: '100%', display: 'block', textAlign: 'center', textDecoration: 'none' }}>
                                Fazer Login
                            </Link>
                        )}
                    </form>
                </div>
            </div>
        </div>
    )
}
