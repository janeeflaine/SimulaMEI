import { createContext, useContext, useState, useEffect } from 'react'
import { useAuth } from './AuthContext'

const TenantContext = createContext(null)

export function TenantProvider({ children }) {
    const { user } = useAuth()
    const [tenants, setTenants] = useState([])
    const [currentTenant, setCurrentTenant] = useState(null)
    const [loading, setLoading] = useState(true)

    // Load Tenants when User changes
    useEffect(() => {
        if (!user) {
            setTenants([])
            setCurrentTenant(null)
            setLoading(false)
            return
        }

        // HOTFIX: Prevent infinite loop
        if (currentTenant && tenants.length > 0) {
            setLoading(false)
            return
        }

        const fetchTenants = async () => {
            try {
                const token = localStorage.getItem('token')
                const res = await fetch('/api/family/units', {
                    headers: { 'Authorization': `Bearer ${token}` }
                })

                if (res.ok) {
                    const data = await res.json()
                    setTenants(data)

                    // Determine active tenant
                    const savedTenantId = localStorage.getItem('activeTenantId')

                    if (savedTenantId === 'consolidated') {
                        setCurrentTenant({ id: 'consolidated', name: 'Visão Consolidada' })
                    } else {
                        const selected = data.find(t => t.id === Number(savedTenantId)) || data[0] // Default to first
                        if (selected) {
                            setCurrentTenant(selected)
                            if (!savedTenantId) localStorage.setItem('activeTenantId', selected.id)
                        }
                    }
                }
            } catch (error) {
                console.error('Error loading tenants:', error)
            } finally {
                setLoading(false)
            }
        }

        fetchTenants()
    }, [user])

    const switchTenant = (tenantId) => {
        if (tenantId === 'consolidated') {
            setCurrentTenant({ id: 'consolidated', name: 'Visão Consolidada' })
            localStorage.setItem('activeTenantId', 'consolidated')
            return
        }

        const tenant = tenants.find(t => t.id === Number(tenantId))
        if (tenant) {
            setCurrentTenant(tenant)
            localStorage.setItem('activeTenantId', tenant.id)
            // Ideally, we might want to reload the page or trigger a re-fetch of data
            // But since checkTenant uses the context state or header, 
            // other components watching 'currentTenant' should react.
            // However, typical fetches in pages (useEffect) depend on user.id usually.
            // We need to update those pages to depend on `currentTenant.id`.
            // For now, a window.location.reload() might be a crude but effective way to ensure all stale data is flushed,
            // OR we rely on React state updates if we update the hooks correctly.
            // Let's stick to state update and assume components will listen to 'currentTenant'.
        }
    }

    return (
        <TenantContext.Provider value={{ tenants, currentTenant, switchTenant, loading }}>
            {children}
        </TenantContext.Provider>
    )
}

export function useTenant() {
    const context = useContext(TenantContext)
    if (!context) {
        throw new Error('useTenant must be used within a TenantProvider')
    }
    return context
}
