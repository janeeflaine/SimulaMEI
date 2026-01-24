import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './Login.css'

export default function Login() {
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
            if (user.role === 'ADMIN') {
                navigate('/admin')
            } else {
                navigate('/dashboard')
            }
        } catch (err) {
            setError(err.message)
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
                        <h1 className="auth-title">Bem-vindo de volta!</h1>
                        <p className="auth-subtitle">Entre na sua conta para continuar</p>
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
                                placeholder="seu@email.com"
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
                            {loading ? 'Entrando...' : 'Entrar'}
                        </button>
                    </form>

                    <div className="auth-footer">
                        <p>
                            Não tem uma conta?{' '}
                            <Link to="/cadastro" className="auth-link">Criar conta grátis</Link>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}
