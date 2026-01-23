import { useState, useEffect } from 'react'
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import {
    LayoutDashboard,
    Calculator,
    DollarSign,
    Users,
    Settings,
    ChevronDown,
    Menu,
    X,
    PlusCircle,
    BarChart3,
    FileText,
    CreditCard,
    Clock,
    Bell,
    Award,
    User,
    LogOut
} from 'lucide-react'
import Header from '../components/Header'
import { useAuth } from '../context/AuthContext'
import './AdminLayout.css'

export default function AdminLayout() {
    const { user, logout } = useAuth()
    const location = useLocation()
    const navigate = useNavigate()
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
    const [openGroups, setOpenGroups] = useState({
        simulador: true,
        financas: true,
        gestao: true,
        config: false
    })

    const handleLogout = () => {
        logout()
        navigate('/admin/login')
    }

    const toggleGroup = (group) => {
        setOpenGroups(prev => ({ ...prev, [group]: !prev[group] }))
    }

    // Close mobile menu on route change
    useEffect(() => {
        setIsMobileMenuOpen(false)
    }, [location.pathname])

    const isActive = (path) => location.pathname === path

    return (
        <div className={`admin-layout ${isMobileMenuOpen ? 'mobile-open' : ''}`} data-theme="dark">
            {/* Backdrop for mobile */}
            {isMobileMenuOpen && (
                <div className="sidebar-backdrop" onClick={() => setIsMobileMenuOpen(false)} />
            )}

            {/* Sidebar */}
            <aside className={`admin-sidebar ${isMobileMenuOpen ? 'open' : ''}`}>
                <div className="sidebar-header">
                    <Link to="/admin" className="admin-logo">
                        <div className="logo-icon">📊</div>
                        <div className="logo-text">
                            <span>SimulaMEI</span>
                            <span className="admin-badge">MEI Premium</span>
                        </div>
                    </Link>
                    <button className="mobile-close" onClick={() => setIsMobileMenuOpen(false)}>
                        <X size={24} />
                    </button>
                </div>

                <nav className="sidebar-nav">
                    {/* Dashboard */}
                    <Link to="/admin" className={`nav-item ${isActive('/admin') ? 'active' : ''}`}>
                        <LayoutDashboard size={20} className="nav-icon" />
                        <span className="nav-label">Dashboard</span>
                    </Link>

                    {/* Simulador Group */}
                    <div className="nav-group">
                        <button
                            className={`nav-group-trigger ${openGroups.simulador ? 'expanded' : ''}`}
                            onClick={() => toggleGroup('simulador')}
                        >
                            <Calculator size={20} className="nav-icon" />
                            <span className="nav-label">Simulador</span>
                            <ChevronDown size={16} className="chevron" />
                        </button>
                        {openGroups.simulador && (
                            <div className="nav-sub-items">
                                <Link to="/simular" className={`nav-sub-item ${isActive('/simular') ? 'active' : ''}`}>
                                    <PlusCircle size={16} /> Nova Simulação
                                </Link>
                                <Link to="/comparativo" className={`nav-sub-item ${isActive('/comparativo') ? 'active' : ''}`}>
                                    <BarChart3 size={16} /> MEI x ME
                                </Link>
                            </div>
                        )}
                    </div>

                    {/* Finanças Group */}
                    <div className="nav-group">
                        <button
                            className={`nav-group-trigger ${openGroups.financas ? 'expanded' : ''}`}
                            onClick={() => toggleGroup('financas')}
                        >
                            <DollarSign size={20} className="nav-icon" />
                            <span className="nav-label">Finanças</span>
                            <ChevronDown size={16} className="chevron" />
                        </button>
                        {openGroups.financas && (
                            <div className="nav-sub-items">
                                <Link to="/financas/extrato" className={`nav-sub-item ${isActive('/financas/extrato') ? 'active' : ''}`}>
                                    <FileText size={16} /> Extrato
                                </Link>
                                <Link to="/financas/cartoes" className={`nav-sub-item ${isActive('/financas/cartoes') ? 'active' : ''}`}>
                                    <CreditCard size={16} /> Cartões
                                </Link>
                                <Link to="/financas/contas" className={`nav-sub-item ${isActive('/financas/contas') ? 'active' : ''}`}>
                                    <Clock size={16} /> Contas a Pagar
                                </Link>
                            </div>
                        )}
                    </div>

                    {/* Gestão Familiar */}
                    <Link to="/familia" className={`nav-item ${isActive('/familia') ? 'active' : ''}`}>
                        <Users size={20} className="nav-icon" />
                        <span className="nav-label">Gestão Familiar</span>
                    </Link>

                    {/* Configurações Group */}
                    <div className="nav-group">
                        <button
                            className={`nav-group-trigger ${openGroups.config ? 'expanded' : ''}`}
                            onClick={() => toggleGroup('config')}
                        >
                            <Settings size={20} className="nav-icon" />
                            <span className="nav-label">Configurações</span>
                            <ChevronDown size={16} className="chevron" />
                        </button>
                        {openGroups.config && (
                            <div className="nav-sub-items">
                                <Link to="/alertas" className={`nav-sub-item ${isActive('/alertas') ? 'active' : ''}`}>
                                    <Bell size={16} /> Alertas
                                </Link>
                                <Link to="/planos" className={`nav-sub-item ${isActive('/planos') ? 'active' : ''}`}>
                                    <Award size={16} /> Planos
                                </Link>
                                <Link to="/perfil" className={`nav-sub-item ${isActive('/perfil') ? 'active' : ''}`}>
                                    <User size={16} /> Meu Perfil
                                </Link>
                            </div>
                        )}
                    </div>
                </nav>

                <div className="sidebar-footer">
                    <div className="admin-user">
                        <div className="user-avatar">
                            {user?.name?.charAt(0).toUpperCase() || 'A'}
                        </div>
                        <div className="user-info">
                            <span className="user-name">{user?.name}</span>
                            <span className="user-role">Sócio Proprietário</span>
                        </div>
                    </div>
                    <button className="logout-btn" onClick={handleLogout}>
                        <LogOut size={16} /> Sair
                    </button>
                </div>
            </aside>

            {/* Mobile Header Toggle */}
            <button className="mobile-toggle" onClick={() => setIsMobileMenuOpen(true)}>
                <Menu size={24} />
            </button>

            {/* Main Content */}
            <main className="admin-main">
                <Header />
                <div className="admin-content">
                    <Outlet />
                </div>
            </main>
        </div>
    )
}
