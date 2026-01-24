import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import '../Login.css'

export default function AdminLogin() {
    const navigate = useNavigate()
    const { login } = useAuth()
    const [formData, setFormData] = useState({ email: '', password: '' })
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    const handleChange = (e) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        setLoading(true)

        try {
            const user = await login(formData.email, formData.password)
            if (user.role !== 'ADMIN') {
                setError('Acesso negado. Apenas administradores podem acessar este painel.')
                return
            }
            navigate('/admin')
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="auth-page" style={{ background: 'var(--gradient-hero)', minHeight: '100vh' }}>
            <div className="container">
                <div className="auth-container">
                    <div className="auth-header">
                        <div className="auth-logo">
                            <span>📊</span> SimulaMEI
                        </div>
                        <span className="admin-badge" style={{
                            background: 'var(--color-primary)',
                            color: 'white',
                            padding: '4px 12px',
                            borderRadius: '20px',
                            fontSize: '12px',
                            fontWeight: '600',
                            display: 'inline-block',
                            marginBottom: '16px'
                        }}>
                            PAINEL ADMINISTRATIVO
                        </span>
                        <h1 className="auth-title">Acesso Restrito</h1>
                        <p className="auth-subtitle">Entre com suas credenciais de administrador</p>
                    </div>

                    <form onSubmit={handleSubmit} className="auth-form">
                        {error && (
                            <div className="alert alert-danger">
                                <span>⚠️</span> {error}
                            </div>
                        )}

                        <div className="form-group">
                            <label className="form-label">E-mail</label>
                            <input
                                type="email"
                                name="email"
                                value={formData.email}
                                onChange={handleChange}
                                placeholder="admin@simulamei.com"
                                className="form-input"
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Senha</label>
                            <input
                                type="password"
                                name="password"
                                value={formData.password}
                                onChange={handleChange}
                                placeholder="••••••••"
                                className="form-input"
                                required
                            />
                        </div>

                        <button
                            type="submit"
                            className="btn btn-primary btn-lg auth-submit"
                            disabled={loading}
                        >
                            {loading ? 'Verificando...' : '🔐 Entrar'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    )
}
