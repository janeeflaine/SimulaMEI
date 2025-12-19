import { Outlet, Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './UserLayout.css'

export default function UserLayout() {
    const { user, logout } = useAuth()
    const location = useLocation()

    return (
        <div className="user-layout">
            <header className="header">
                <div className="container">
                    <nav className="nav">
                        <Link to="/" className="logo">
                            <span className="logo-icon">📊</span>
                            <span className="logo-text">SimulaMEI</span>
                        </Link>

                        <div className="nav-links">
                            <Link to="/simular" className={`nav-link ${location.pathname === '/simular' ? 'active' : ''}`}>
                                Simular
                            </Link>
                            <Link to="/planos" className={`nav-link nav-link-plans ${location.pathname === '/planos' ? 'active' : ''}`}>
                                💎 Planos
                            </Link>

                            {user ? (
                                <>
                                    <Link to="/dashboard" className={`nav-link ${location.pathname === '/dashboard' ? 'active' : ''}`}>
                                        Dashboard
                                    </Link>
                                    {user.planId === 3 && (
                                        <Link to="/alertas" className={`nav-link ${location.pathname === '/alertas' ? 'active' : ''}`}>
                                            🔔 Alertas
                                        </Link>
                                    )}
                                    <div className="user-menu">
                                        <span className="user-name">{user.name}</span>
                                        <button onClick={logout} className="btn btn-secondary btn-sm">
                                            Sair
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <>
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
