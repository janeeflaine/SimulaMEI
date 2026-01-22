import { useState, useRef, useEffect } from 'react'
import { useTenant } from '../../context/TenantContext'
import './TenantSwitcher.css'

export default function TenantSwitcher() {
    const { tenants, currentTenant, switchTenant } = useTenant()
    const [isOpen, setIsOpen] = useState(false)
    const dropdownRef = useRef(null)

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    if (!currentTenant) return null

    return (
        <div className="tenant-switcher" ref={dropdownRef}>
            <button
                className="tenant-btn"
                onClick={() => setIsOpen(!isOpen)}
                title="Trocar Empresa / MEI"
            >
                <span className="tenant-icon">🏢</span>
                <span className="tenant-name">{currentTenant.name}</span>
                <span className="arrow">▼</span>
            </button>

            {isOpen && (
                <div className="tenant-dropdown">
                    <div className="tenant-label">Selecione o Contexto:</div>
                    {tenants.map(tenant => (
                        <button
                            key={tenant.id}
                            className={`tenant-option ${currentTenant.id === tenant.id ? 'active' : ''}`}
                            onClick={() => {
                                switchTenant(tenant.id)
                                setIsOpen(false)
                                window.location.reload() // Force reload to ensure all data fetches refresh with new tenant
                            }}
                        >
                            {tenant.name}
                            {currentTenant.id === tenant.id && <span className="check">✓</span>}
                        </button>
                    ))}
                    <div className="tenant-divider"></div>
                    <button className="tenant-option add-new" disabled title="Em breve">
                        + Nova Empresa
                    </button>
                </div>
            )}
        </div>
    )
}
