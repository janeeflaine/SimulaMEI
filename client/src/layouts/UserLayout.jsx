import { useState, useEffect, useRef } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './UserLayout.css'

export default function UserLayout() {
    const { user, logout, refreshUser } = useAuth()
    const location = useLocation()
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const [isFinanceOpen, setIsFinanceOpen] = useState(false)
    const lastRefresh = useRef(0)

    // Refresh user data on every route change and when tab regains focus
    // This ensures plan changes made by admin take effect without requiring re-login
    useEffect(() => {
        setIsMenuOpen(false)
        setIsFinanceOpen(false)
        if (!user) return
        const now = Date.now()
        if (now - lastRefresh.current > 10_000) {
            lastRefresh.current = now
            refreshUser()
        }
    }, [location])

    useEffect(() => {
        const onFocus = () => {
            if (!user) return
            const now = Date.now()
            if (now - lastRefresh.current > 10_000) {
                lastRefresh.current = now
                refreshUser()
            }
        }
        window.addEventListener('focus', onFocus)
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') onFocus()
        })
        return () => {
            window.removeEventListener('focus', onFocus)
        }
    }, [user])

    return (
        <div className="user-layout">
            <header className="header">
                <div className="container">
                    <nav className="nav">
                        <Link to="/" className="logo">
                            <span className="logo-icon">📊</span>
                            <span className="logo-text">SimulaMEI</span>
                        </Link>

                        {/* Mobile Menu Toggle */}
                        <button
                            className={`mobile-menu-toggle ${isMenuOpen ? 'active' : ''}`}
                            onClick={() => setIsMenuOpen(!isMenuOpen)}
                            aria-label="Menu"
                        >
                            <span></span>
                            <span></span>
                            <span></span>
                        </button>

                        <div className={`nav-links ${isMenuOpen ? 'mobile-active' : ''}`}>
                            <Link to="/" className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}>
                                🏠 Home
                            </Link>

                            {user ? (
                                <>
                                    <Link to="/dashboard" className={`nav-link ${location.pathname === '/dashboard' ? 'active' : ''}`}>
                                        📊 Dashboard
                                    </Link>

                                    <div className={`nav-dropdown ${isFinanceOpen ? 'active' : ''}`}>
                                        <button
                                            className={`nav-link dropdown-trigger ${location.pathname.startsWith('/financas') ? 'active' : ''}`}
                                            onClick={(e) => {
                                                e.preventDefault();
                                                setIsFinanceOpen(!isFinanceOpen);
                                            }}
                                        >
                                            💰 Finanças <span className={`arrow ${isFinanceOpen ? 'up' : 'down'}`}>▼</span>
                                        </button>
                                        <div className="dropdown-content">
                                            <Link to="/financas/extrato" className="dropdown-item">Extrato Financeiro</Link>
                                            <Link to="/financas/contas" className="dropdown-item">Contas a Pagar</Link>
                                            <Link to="/financas/categorias" className="dropdown-item">Categorias</Link>
                                            <Link to="/financas/cartoes" className="dropdown-item">Cartões</Link>
                                            <div style={{ padding: '0.5rem', cursor: 'default' }}></div>
                                            <Link to="/financas/gerenciar-contas" className="dropdown-item" style={{ color: 'var(--color-primary)', fontWeight: '500' }}>👥 Gerenciar Pessoas</Link>
                                        </div>
                                    </div>

                                    {(user.plan === 'Ouro' || Number(user.planId) === 3) && (
                                        <Link to="/alertas" className={`nav-link ${location.pathname === '/alertas' ? 'active' : ''}`}>
                                            🔔 Alertas
                                        </Link>
                                    )}

                                    <Link to="/planos" className={`nav-link nav-link-plans ${location.pathname === '/planos' ? 'active' : ''}`}>
                                        💎 Planos
                                    </Link>

                                    <div className="user-menu">
                                        <span className="user-name">{user.name}</span>
                                        <button onClick={logout} className="btn btn-secondary btn-sm">
                                            Sair
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <Link to="/simular" className={`nav-link ${location.pathname === '/simular' ? 'active' : ''}`}>
                                        🚀 Simular
                                    </Link>
                                    <Link to="/planos" className={`nav-link nav-link-plans ${location.pathname === '/planos' ? 'active' : ''}`}>
                                        💎 Planos
                                    </Link>
                                    <Link to="/login" className="nav-link">Entrar</Link>
                                    <Link to="/cadastro" className="btn btn-primary btn-sm">
                                        Criar Conta
                                    </Link>
                                </>
                            )}
                        </div>
                    </nav>
                </div>
            </header>

            <main className="main-content">
                <Outlet />
            </main>

            <footer className="footer">
                <div className="container">
                    <div className="footer-content">
                        <div className="footer-brand">
                            <span className="logo-icon">📊</span>
                            <span>SimulaMEI</span>
                        </div>
                        <p className="footer-disclaimer">
                            ⚠️ Esta é uma simulação estimativa. Os valores apresentados não substituem
                            a orientação de um contador profissional.
                        </p>
                        <p className="footer-copyright">
                            © {new Date().getFullYear()} SimulaMEI. Todos os direitos reservados.
                        </p>
                    </div>
                </div>
            </footer>
        </div>
    )
}
