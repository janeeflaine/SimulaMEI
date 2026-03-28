import { useState } from 'react'
import { Link } from 'react-router-dom'
import './Login.css'

export default function ForgotPassword() {
    const [email, setEmail] = useState('')
    const [message, setMessage] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        setMessage('')
        setLoading(true)

        try {
            const res = await fetch('http://localhost:5000/api/auth/forgot-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email })
            })

            const data = await res.json()

            if (res.ok) {
                setMessage(data.message || 'Se o e-mail estiver cadastrado, você receberá um link de recuperação em breve.')
            } else {
                setError(data.message || 'Ocorreu um erro ao processar sua solicitação.')
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
                        <h1 className="auth-title">Recuperar Senha</h1>
                        <p className="auth-subtitle">Informe seu e-mail para receber o link de recuperação</p>
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

                        <div className="form-group">
                            <label className="form-label">E-mail</label>
                            <input
                                type="email"
                                name="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="seu@email.com"
                                className="form-input"
                                required
                            />
                        </div>

                        <button
                            type="submit"
                            className="btn btn-primary btn-lg auth-submit"
                            style={{ width: '100%' }}
                            disabled={loading || message}
                        >
                            {loading ? 'Enviando...' : 'Enviar Link de Recuperação'}
                        </button>
                    </form>

                    <div className="auth-footer" style={{ marginTop: '24px', textAlign: 'center' }}>
                        <p>
                            Lembrou a senha?{' '}
                            <Link to="/login" className="auth-link" style={{ color: 'var(--color-primary)', fontWeight: '500' }}>Voltar ao login</Link>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}
