import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTenant } from '../context/TenantContext'
import { useAuth } from '../context/AuthContext'
import {
    Building2,
    ChevronDown,
    Bell,
    LayoutDashboard,
    DollarSign,
    Bell as BellIcon,
    Award,
    Users,
    LogOut,
    Menu,
    X,
    TrendingUp
} from 'lucide-react'
import './Header.css'

export default function Header() {
    const { tenants, currentTenant, switchTenant } = useTenant()
    const { user, logout } = useAuth()
    const location = useLocation()
    const [isDropdownOpen, setIsDropdownOpen] = useState(false)
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

    // Close mobile menu on route change
    useEffect(() => {
        setIsMobileMenuOpen(false)
    }, [location.pathname])

    const isActive = (path) => location.pathname === path

    const navItems = [
        { label: 'Dashboard', path: '/admin', icon: LayoutDashboard },
        { label: 'Finanças', path: '/financas/extrato', icon: DollarSign },
        { label: 'Alertas', path: '/alertas', icon: BellIcon },
        { label: 'Planos', path: '/planos', icon: Award },
        { label: 'Gestão Familiar', path: '/familia', icon: Users },
    ]

    return (
        <header className="app-header">
            <div className="header-container">
                <div className="header-left">
                    <Link to="/admin" className="header-logo">
                        <div className="logo-icon-wrapper">
                            <TrendingUp size={24} />
                        </div>
                        <span className="logo-text">Simula<span>MEI</span></span>
                    </Link>
                </div>

                <div className={`header-nav-container ${isMobileMenuOpen ? 'mobile-active' : ''}`}>
                    <nav className="main-nav">
                        {navItems.map((item) => (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={`nav-link ${isActive(item.path) ? 'active' : ''}`}
                            >
                                <item.icon size={18} />
                                <span>{item.label}</span>
                            </Link>
                        ))}
                    </nav>

                    <div className="header-divider mobile-only" />

                    <div className="header-right-group">
                        {/* Unit Selector */}
                        <div className="unit-selector-container">
                            <button
                                className="unit-selector-btn"
                                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                            >
                                <div className="unit-icon">
                                    <Building2 size={16} />
                                </div>
                                <div className="unit-info">
                                    <span className="unit-label">Unidade Ativa</span>
                                    <span className="unit-name">
                                        {currentTenant ? currentTenant.name : 'Console...'}
                                    </span>
                                </div>
                                <ChevronDown size={14} className={`chevron ${isDropdownOpen ? 'open' : ''}`} />
                            </button>

                            {isDropdownOpen && (
                                <div className="unit-dropdown" onMouseLeave={() => setIsDropdownOpen(false)}>
                                    <div className="dropdown-label">Minhas Empresas</div>
                                    <div className="dropdown-scroll">
                                        {tenants.map(tenant => (
                                            <button
                                                key={tenant.id}
                                                className={`dropdown-item ${currentTenant?.id === tenant.id ? 'active' : ''}`}
                                                onClick={() => {
                                                    switchTenant(tenant.id)
                                                    setIsDropdownOpen(false)
                                                }}
                                            >
                                                <span className="tenant-name">{tenant.name}</span>
                                                {tenant.isPrimary && <span className="p-badge">Principal</span>}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="dropdown-divider"></div>
                                    <button
                                        className={`dropdown-item consolidated ${currentTenant?.id === 'consolidated' ? 'active' : ''}`}
                                        onClick={() => {
                                            switchTenant('consolidated')
                                            setIsDropdownOpen(false)
                                        }}
                                    >
                                        <span className="tenant-name">🔍 Visão Consolidada</span>
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="header-divider desktop-only" />

                        <button className="logout-button" onClick={logout}>
                            <LogOut size={18} />
                            <span>Sair</span>
                        </button>
                    </div>
                </div>

                <button
                    className="hamburger-menu"
                    onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                    aria-label="Menu"
                >
                    {isMobileMenuOpen ? <X size={28} /> : <Menu size={28} />}
                </button>
            </div>
        </header>
    )
}
