import { Component, useEffect, useRef, useState } from 'react'
import { Outlet, Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
    LayoutDashboard, Users, Gem, Calculator, Gauge, ToggleRight, Settings,
    BarChart3, ShieldCheck, LogOut, ExternalLink, Menu, X, AlertTriangle, RotateCw
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import BrandMark from '../components/ui/BrandMark'
import './AdminLayout.css'

// Menu do painel do administrador, em grupos. Prefixo .adm- (o resto do admin
// ainda usa as classes antigas dentro de .admin-layout).
const MENU = [
    {
        group: 'Visão geral',
        items: [
            { path: '/admin', icon: LayoutDashboard, label: 'Painel', end: true },
            { path: '/admin/relatorios', icon: BarChart3, label: 'Relatórios' },
            { path: '/admin/logs', icon: ShieldCheck, label: 'Logs de auditoria' },
        ],
    },
    {
        group: 'Clientes',
        items: [
            { path: '/admin/usuarios', icon: Users, label: 'Usuários' },
            { path: '/admin/planos', icon: Gem, label: 'Planos' },
        ],
    },
    {
        group: 'Regras do MEI',
        items: [
            { path: '/admin/regras', icon: Calculator, label: 'Regras de cálculo' },
            { path: '/admin/limites', icon: Gauge, label: 'Limites MEI' },
        ],
    },
    {
        group: 'Sistema',
        items: [
            { path: '/admin/funcionalidades', icon: ToggleRight, label: 'Funcionalidades' },
            { path: '/admin/configuracoes', icon: Settings, label: 'Configurações' },
        ],
    },
]

const ALL_ITEMS = MENU.flatMap((g) => g.items)

// Se uma página do admin quebrar (por exemplo, resposta do servidor fora do
// esperado), o menu continua de pé e o erro aparece só no lugar da página.
class PageBoundary extends Component {
    constructor(props) {
        super(props)
        this.state = { failed: false }
    }

    static getDerivedStateFromError() {
        return { failed: true }
    }

    componentDidCatch(error, info) {
        console.error('[admin] a página quebrou:', error, info?.componentStack)
    }

    render() {
        if (!this.state.failed) return this.props.children
        return (
            <div className="adm-crash" role="alert">
                <span className="adm-crash__icon" aria-hidden="true"><AlertTriangle size={22} /></span>
                <h1>Esta página não abriu</h1>
                <p>
                    Os dados chegaram diferentes do esperado ou o servidor não respondeu direito.
                    Tente de novo; se continuar, abra outra página pelo menu.
                </p>
                <div className="adm-crash__actions">
                    <button type="button" className="adm-crash__btn adm-crash__btn--primary" onClick={() => window.location.reload()}>
                        <RotateCw size={16} aria-hidden="true" />
                        Tentar de novo
                    </button>
                    <Link to="/admin" className="adm-crash__btn">Ir para o Painel</Link>
                </div>
            </div>
        )
    }
}

function currentLabel(pathname) {
    const exact = ALL_ITEMS.find((i) => i.path === pathname)
    if (exact) return exact.label
    const nested = ALL_ITEMS.filter((i) => i.path !== '/admin' && pathname.startsWith(`${i.path}/`))
    return nested[0]?.label || 'Painel'
}

export default function AdminLayout() {
    const { user, logout } = useAuth()
    const location = useLocation()
    const navigate = useNavigate()
    const [open, setOpen] = useState(false)
    const toggleRef = useRef(null)
    const closeRef = useRef(null)

    const handleLogout = () => {
        logout()
        navigate('/admin/login')
    }

    // Fecha o menu do celular ao trocar de página
    useEffect(() => {
        setOpen(false)
    }, [location.pathname])

    // Menu aberto no celular: Esc fecha, a página de trás não rola, foco no botão de fechar
    useEffect(() => {
        if (!open) return undefined
        const onKey = (e) => {
            if (e.key === 'Escape' && !e.defaultPrevented) {
                setOpen(false)
                toggleRef.current?.focus()
            }
        }
        document.addEventListener('keydown', onKey)
        const prevOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        const raf = requestAnimationFrame(() => closeRef.current?.focus())
        return () => {
            cancelAnimationFrame(raf)
            document.removeEventListener('keydown', onKey)
            document.body.style.overflow = prevOverflow
        }
    }, [open])

    const pageLabel = currentLabel(location.pathname)
    const initial = (user?.name || 'A').trim().charAt(0).toUpperCase()

    return (
        <div className={`admin-layout adm${open ? ' is-menu-open' : ''}`} data-theme="dark">
            {/* Topo (só celular e tablet) */}
            <header className="adm-topbar">
                <button
                    ref={toggleRef}
                    type="button"
                    className="adm-icon-btn"
                    aria-label="Abrir o menu"
                    aria-expanded={open}
                    aria-controls="adm-sidebar"
                    onClick={() => setOpen(true)}
                >
                    <Menu size={22} aria-hidden="true" />
                </button>
                <Link to="/admin" className="adm-topbar__brand" aria-label="Painel do administrador">
                    <BrandMark size={26} />
                </Link>
                <span className="adm-topbar__title">{pageLabel}</span>
            </header>

            <div className="adm-backdrop" aria-hidden="true" onClick={() => setOpen(false)} />

            <aside id="adm-sidebar" className="adm-sidebar" aria-label="Menu do administrador">
                <div className="adm-head">
                    <Link to="/admin" className="adm-brand">
                        <BrandMark size={28} />
                        <span>EuSempreMEI</span>
                    </Link>
                    <button
                        ref={closeRef}
                        type="button"
                        className="adm-icon-btn adm-close"
                        aria-label="Fechar o menu"
                        onClick={() => { setOpen(false); toggleRef.current?.focus() }}
                    >
                        <X size={22} aria-hidden="true" />
                    </button>
                    <span className="adm-tag">
                        <ShieldCheck size={14} aria-hidden="true" />
                        Administrador
                    </span>
                </div>

                <nav className="adm-nav" aria-label="Páginas do administrador">
                    {MENU.map((g) => (
                        <div key={g.group} className="adm-group">
                            <p className="adm-group__title">{g.group}</p>
                            <ul>
                                {g.items.map(({ path, icon: Icon, label, end }) => (
                                    <li key={path}>
                                        <NavLink
                                            to={path}
                                            end={end}
                                            className={({ isActive }) => `adm-link${isActive ? ' is-active' : ''}`}
                                        >
                                            <Icon size={18} aria-hidden="true" />
                                            <span>{label}</span>
                                        </NavLink>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </nav>

                <div className="adm-foot">
                    <div className="adm-me">
                        <span className="adm-me__avatar" aria-hidden="true">{initial}</span>
                        <span className="adm-me__info">
                            <strong>{user?.name || 'Administrador'}</strong>
                            <span>{user?.email}</span>
                        </span>
                    </div>
                    <div className="adm-foot__actions">
                        <Link to="/" className="adm-btn">
                            <ExternalLink size={16} aria-hidden="true" />
                            Ver o site
                        </Link>
                        <button type="button" className="adm-btn" onClick={handleLogout}>
                            <LogOut size={16} aria-hidden="true" />
                            Sair
                        </button>
                    </div>
                </div>
            </aside>

            <main className="admin-main adm-main">
                <PageBoundary key={location.pathname}>
                    <Outlet />
                </PageBoundary>
            </main>
        </div>
    )
}
