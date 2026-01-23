import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTenant } from '../context/TenantContext'
import { useAuth } from '../context/AuthContext'
import {
    Building2,
    ChevronDown,
    Bell,
    Search,
    LayoutDashboard
} from 'lucide-react'
import './Header.css'

export default function Header() {
    const { tenants, currentTenant, switchTenant } = useTenant()
    const { user } = useAuth()
    const [isDropdownOpen, setIsDropdownOpen] = useState(false)

    return (
        <header className="app-header">
            <div className="header-left">
                {/* Mobile Context Logo */}
                <div className="mobile-brand">
                    <LayoutDashboard size={20} color="var(--color-primary)" />
                    <span className="mobile-logo-text">SimulaMEI</span>
                </div>

                <div className="search-bar">
                    <Search size={18} className="search-icon" />
                    <input type="text" placeholder="Buscar informações..." />
                </div>
            </div>

            <div className="header-right">
                {/* Unit Selector */}
                <div className="unit-selector-container">
                    <button
                        className="unit-selector-btn"
                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                        onBlur={() => setTimeout(() => setIsDropdownOpen(false), 200)}
                    >
                        <div className="unit-icon">
                            <Building2 size={16} />
                        </div>
                        <div className="unit-info">
                            <span className="unit-label">Minhas MEIs</span>
                            <span className="unit-name">
                                {currentTenant ? currentTenant.name : 'Selecione...'}
                            </span>
                        </div>
                        <ChevronDown size={14} className={`chevron ${isDropdownOpen ? 'open' : ''}`} />
                    </button>

                    {isDropdownOpen && (
                        <div className="unit-dropdown">
                            <div className="dropdown-label">Suas Unidades de Negócio</div>
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
                                        <div className="tenant-item-content">
                                            <span className="tenant-name">{tenant.name}</span>
                                            {tenant.isPrimary && <span className="p-badge">Principal</span>}
                                        </div>
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

                <div className="header-actions">
                    <button className="icon-btn-header">
                        <Bell size={20} />
                        <span className="notification-dot"></span>
                    </button>
                </div>
            </div>
        </header>
    )
}
