import { useState, useEffect, useRef } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import {
    Home, LayoutDashboard, Wallet, Bell, Gem, Calculator, ChevronDown,
    ReceiptText, CalendarClock, Tags, CreditCard, WalletCards,
    Building2, Mail, MessageCircle, Phone, Clock, TriangleAlert, ArrowRight
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import BrandMark from '../components/ui/BrandMark'
import { COMPANY, CONTACT_EMAILS } from '../utils/legalInfo'
import './UserLayout.css'

// Itens do menu Finanças: caminho, nome e ícone
const FINANCE_LINKS = [
    { to: '/financas/extrato', label: 'Extrato', Icon: ReceiptText },
    { to: '/financas/contas', label: 'Contas a pagar', Icon: CalendarClock },
    { to: '/financas/categorias', label: 'Categorias', Icon: Tags },
    { to: '/financas/cartoes', label: 'Cartões', Icon: CreditCard },
    { to: '/financas/gerenciar-contas', label: 'Carteiras', Icon: WalletCards, separated: true }
]

export default function UserLayout() {
    const { user, logout, refreshUser } = useAuth()
    const location = useLocation()
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const [isFinanceOpen, setIsFinanceOpen] = useState(false)
    const [avatarUrl, setAvatarUrl] = useState('')
    const lastRefresh = useRef(0)
    const financeRef = useRef(null)

    // Foto do avatar: logo da primeira carteira criada na conta.
    // Recarrega ao entrar/sair de Gerenciar Carteiras, onde a foto pode mudar.
    const onWalletsPage = location.pathname === '/financas/gerenciar-contas'
    useEffect(() => {
        if (!user) {
            setAvatarUrl('')
            return
        }
        let cancelled = false
        const loadAvatar = async () => {
            try {
                const token = localStorage.getItem('token')
                const res = await fetch('/api/finance/business-units', {
                    headers: { 'Authorization': `Bearer ${token}` }
                })
                if (!res.ok) return
                const data = await res.json()
                // A principal primeiro; sem principal, a mais antiga
                const first = [...data].sort((a, b) => {
                    if (Boolean(a.isPrimary) !== Boolean(b.isPrimary)) return a.isPrimary ? -1 : 1
                    const byDate = new Date(a.createdAt) - new Date(b.createdAt)
                    return byDate !== 0 && !Number.isNaN(byDate) ? byDate : a.id - b.id
                })[0]
                if (!cancelled) setAvatarUrl(first?.logo_url || '')
            } catch (error) {
                console.error('Erro ao carregar avatar:', error)
            }
        }
        loadAvatar()
        return () => { cancelled = true }
    }, [user?.id, onWalletsPage])

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
        const onVisible = () => {
            if (document.visibilityState === 'visible') onFocus()
        }
        window.addEventListener('focus', onFocus)
        document.addEventListener('visibilitychange', onVisible)
        return () => {
            window.removeEventListener('focus', onFocus)
            document.removeEventListener('visibilitychange', onVisible)
        }
    }, [user])

    // Menu Finanças (computador): fecha ao clicar fora
    useEffect(() => {
        if (!isFinanceOpen || isMenuOpen) return undefined
        const onDown = (e) => {
            if (financeRef.current && !financeRef.current.contains(e.target)) setIsFinanceOpen(false)
        }
        document.addEventListener('mousedown', onDown)
        document.addEventListener('touchstart', onDown)
        return () => {
            document.removeEventListener('mousedown', onDown)
            document.removeEventListener('touchstart', onDown)
        }
    }, [isFinanceOpen, isMenuOpen])

    // Esc fecha o menu Finanças e o menu do celular
    useEffect(() => {
        if (!isFinanceOpen && !isMenuOpen) return undefined
        const onKey = (e) => {
            if (e.key !== 'Escape' || e.defaultPrevented) return
            setIsFinanceOpen(false)
            setIsMenuOpen(false)
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [isFinanceOpen, isMenuOpen])

    // Celular: com o menu aberto, a página de trás não rola
    useEffect(() => {
        if (!isMenuOpen) return undefined
        const { overflow } = document.body.style
        document.body.style.overflow = 'hidden'
        return () => { document.body.style.overflow = overflow }
    }, [isMenuOpen])

    const isFinanceItemActive = (to) => location.pathname === to || location.pathname.startsWith(`${to}/`)

    return (
        <div className="user-layout">
            <header className="header">
                <div className="container">
                    <nav className="nav">
                        <Link to="/" className="logo" aria-label="EuSempreMEI, página inicial">
                            <BrandMark className="logo-icon" size={30} />
                            <span className="logo-text">EuSempreMEI</span>
                        </Link>

                        {/* Mobile Menu Toggle */}
                        <button
                            type="button"
                            className={`mobile-menu-toggle ${isMenuOpen ? 'active' : ''}`}
                            onClick={() => setIsMenuOpen(!isMenuOpen)}
                            aria-label={isMenuOpen ? 'Fechar menu' : 'Abrir menu'}
                            aria-expanded={isMenuOpen}
                            aria-controls="site-menu"
                        >
                            <span></span>
                            <span></span>
                            <span></span>
                        </button>

                        {/* Celular: fundo escuro atrás do menu; tocar nele fecha */}
                        <div
                            className={`nav-backdrop ${isMenuOpen ? 'is-open' : ''}`}
                            onClick={() => setIsMenuOpen(false)}
                            aria-hidden="true"
                        />

                        <div id="site-menu" className={`nav-links ${isMenuOpen ? 'mobile-active' : ''}`}>
                            <Link to="/" className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}>
                                <Home size={16} aria-hidden="true" /> Início
                            </Link>

                            {user ? (
                                <>
                                    <Link to="/dashboard" className={`nav-link ${location.pathname === '/dashboard' ? 'active' : ''}`}>
                                        <LayoutDashboard size={16} aria-hidden="true" /> Painel
                                    </Link>

                                    <div ref={financeRef} className={`nav-dropdown ${isFinanceOpen ? 'active' : ''}`}>
                                        <button
                                            type="button"
                                            className={`nav-link dropdown-trigger ${location.pathname.startsWith('/financas') ? 'active' : ''}`}
                                            aria-expanded={isFinanceOpen}
                                            aria-controls="menu-financas"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                setIsFinanceOpen(!isFinanceOpen);
                                            }}
                                        >
                                            <Wallet size={16} aria-hidden="true" /> Finanças
                                            <span className={`arrow ${isFinanceOpen ? 'up' : 'down'}`} aria-hidden="true"><ChevronDown size={14} /></span>
                                        </button>
                                        <div id="menu-financas" className="dropdown-content">
                                            {FINANCE_LINKS.map(({ to, label, Icon, separated }) => {
                                                const active = isFinanceItemActive(to)
                                                return (
                                                    <Link
                                                        key={to}
                                                        to={to}
                                                        className={`dropdown-item ${separated ? 'dropdown-item--sep' : ''} ${active ? 'is-active' : ''}`}
                                                        aria-current={active ? 'page' : undefined}
                                                    >
                                                        <Icon size={16} aria-hidden="true" /> {label}
                                                    </Link>
                                                )
                                            })}
                                        </div>
                                    </div>

                                    {(user.plan === 'Ouro' || Number(user.planId) === 3) && (
                                        <Link to="/alertas" className={`nav-link ${location.pathname === '/alertas' ? 'active' : ''}`}>
                                            <Bell size={16} aria-hidden="true" /> Alertas
                                        </Link>
                                    )}

                                    <Link to="/planos" className={`nav-link nav-link-plans ${location.pathname === '/planos' ? 'active' : ''}`}>
                                        <Gem size={16} aria-hidden="true" /> Planos
                                    </Link>

                                    <div className="user-menu">
                                        <span className="user-name">{user.name}</span>
                                        <Link
                                            to="/conta"
                                            className={`user-avatar-link ${location.pathname === '/conta' ? 'active' : ''}`}
                                            title="Minha Conta"
                                            aria-label="Minha Conta"
                                        >
                                            {avatarUrl ? (
                                                <img src={avatarUrl} alt={user.name} className="user-avatar-img" />
                                            ) : (
                                                <span className="user-avatar-initial">
                                                    {(user.name || '?').trim().charAt(0).toUpperCase()}
                                                </span>
                                            )}
                                        </Link>
                                        <button type="button" onClick={logout} className="btn btn-secondary btn-sm">
                                            Sair
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <Link to="/simular" className={`nav-link ${location.pathname === '/simular' ? 'active' : ''}`}>
                                        <Calculator size={16} aria-hidden="true" /> Simular
                                    </Link>
                                    <Link to="/planos" className={`nav-link nav-link-plans ${location.pathname === '/planos' ? 'active' : ''}`}>
                                        <Gem size={16} aria-hidden="true" /> Planos
                                    </Link>
                                    <Link to="/login" className="nav-link">Entrar</Link>
                                    <Link to="/cadastro" className="btn btn-primary btn-sm">
                                        Criar conta
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
                            <Link to="/" className="footer-brand" aria-label="EuSempreMEI, página inicial">
                                <BrandMark className="logo-icon" size={30} />
                                <span className="logo-text">EuSempreMEI</span>
                            </Link>
                            <p className="footer-desc">
                                Plataforma inteligente de apoio à gestão financeira, controle de faturamento e simulação tributária para o Microempreendedor Individual (MEI).
                            </p>
                            <div className="footer-entity-pill">
                                <Building2 size={15} aria-hidden="true" className="footer-inline-icon" /> EuSempreMEI é um produto de <strong>{COMPANY.legalName}</strong>
                                <div className="footer-cnpj">CNPJ: <strong>{COMPANY.cnpj}</strong></div>
                                <div className="footer-cnpj">{COMPANY.address}</div>
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
                                    <Mail size={16} aria-hidden="true" className="contact-icon" />
                                    <a href={`mailto:${CONTACT_EMAILS.contato}`}>{CONTACT_EMAILS.contato}</a>
                                </p>
                                <p className="footer-contact-line">
                                    <MessageCircle size={16} aria-hidden="true" className="contact-icon" />
                                    <a href={`mailto:${CONTACT_EMAILS.suporte}`}>{CONTACT_EMAILS.suporte}</a>
                                </p>
                                <p className="footer-contact-line">
                                    <Phone size={16} aria-hidden="true" className="contact-icon" />
                                    <a href={COMPANY.phoneHref}>{COMPANY.phone}</a>
                                </p>
                                <p className="footer-hours">
                                    <Clock size={14} aria-hidden="true" /> Seg. a sex. das 9h às 18h (Brasília)
                                </p>
                                <Link to="/contato" className="footer-contact-link">
                                    Central de atendimento <ArrowRight size={16} aria-hidden="true" />
                                </Link>
                            </div>
                        </div>
                    </div>

                    <div className="footer-bottom">
                        <p className="footer-disclaimer">
                            <TriangleAlert size={15} aria-hidden="true" className="footer-inline-icon" /> <strong>Aviso legal:</strong> O EuSempreMEI é uma plataforma informativa de apoio à gestão do empreendedor.
                            Os valores e simulações são estimativos e não substituem o papel de um contador profissional habilitado.
                        </p>
                        <div className="footer-copyright-bar">
                            <p className="footer-copyright">
                                © {new Date().getFullYear()} EuSempreMEI. Todos os direitos reservados.
                            </p>
                            <p className="footer-legal-mention">
                                Desenvolvido e mantido por <strong>{COMPANY.legalName}</strong> • CNPJ: <strong>{COMPANY.cnpj}</strong>
                            </p>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    )
}
