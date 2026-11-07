import { useState, useEffect, useRef } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { CONTACT_EMAILS } from '../utils/legalInfo'
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
                            <span className="logo-text">EuSempreMEI</span>
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
                    <div className="footer-grid">
                        {/* Coluna 1: Marca & Identificação da Empresa */}
                        <div className="footer-col footer-col-brand">
                            <Link to="/" className="footer-brand">
                                <span className="logo-icon">📊</span>
                                <span className="logo-text">EuSempreMEI</span>
                            </Link>
                            <p className="footer-desc">
                                Plataforma inteligente de apoio à gestão financeira, controle de faturamento e simulação tributária para o Microempreendedor Individual (MEI).
                            </p>
                            <div className="footer-entity-pill">
                                🏢 EuSempreMEI é um produto de <strong>ESPETINHO DO NORDESTE</strong>
                                <div className="footer-cnpj">CNPJ: <strong>33.137.007/0001-09</strong></div>
                            </div>
                        </div>

                        {/* Coluna 2: Navegação Rápida */}
                        <div className="footer-col">
                            <h4 className="footer-col-title">Navegação</h4>
                            <ul className="footer-links">
                                <li><Link to="/">Página Inicial</Link></li>
                                <li><Link to="/simular">Simulador MEI</Link></li>
                                <li><Link to="/planos">Planos & Preços</Link></li>
                                {user ? (
                                    <li><Link to="/dashboard">Painel Geral</Link></li>
                                ) : (
                                    <li><Link to="/login">Acessar Conta</Link></li>
                                )}
                            </ul>
                        </div>

                        {/* Coluna 3: Legal & Regras de Utilização */}
                        <div className="footer-col">
                            <h4 className="footer-col-title">Termos & Privacidade</h4>
                            <ul className="footer-links">
                                <li>
                                    <Link to="/politica-de-privacidade">Política de Privacidade</Link>
                                </li>
                                <li>
                                    <Link to="/termos-de-servico">Termos de Serviço</Link>
                                </li>
                                <li>
                                    <Link to="/exclusao-de-dados">Exclusão de Dados</Link>
                                </li>
                                <li>
                                    <Link to="/contato">Informações de Contato</Link>
                                </li>
                            </ul>
                        </div>

                        {/* Coluna 4: Informações de Contato & Suporte */}
                        <div className="footer-col">
                            <h4 className="footer-col-title">Atendimento & Contato</h4>
                            <div className="footer-contact-info">
                                <p className="footer-contact-line">
                                    <span className="contact-icon">✉️</span>
                                    <a href={`mailto:${CONTACT_EMAILS.contato}`}>{CONTACT_EMAILS.contato}</a>
                                </p>
                                <p className="footer-contact-line">
                                    <span className="contact-icon">💬</span>
                                    <a href={`mailto:${CONTACT_EMAILS.suporte}`}>{CONTACT_EMAILS.suporte}</a>
                                </p>
                                <p className="footer-hours">
                                    🕒 Seg. a Sex. das 09h às 18h (Brasília)
                                </p>
                                <Link to="/contato" className="footer-contact-link">
                                    Central de Atendimento →
                                </Link>
                            </div>
                        </div>
                    </div>

                    <div className="footer-bottom">
                        <p className="footer-disclaimer">
                            ⚠️ <strong>Aviso Legal:</strong> O EuSempreMEI é uma plataforma informativa de apoio à gestão do empreendedor.
                            Os valores e simulações são estimativos e não substituem o papel de um contador profissional habilitado.
                        </p>
                        <div className="footer-copyright-bar">
                            <p className="footer-copyright">
                                © {new Date().getFullYear()} EuSempreMEI. Todos os direitos reservados.
                            </p>
                            <p className="footer-legal-mention">
                                Desenvolvido e mantido por <strong>ESPETINHO DO NORDESTE</strong> • CNPJ: <strong>33.137.007/0001-09</strong>
                            </p>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    )
}
