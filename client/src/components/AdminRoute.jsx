import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function AdminRoute() {
    const { user, loading, isAdmin } = useAuth()

    if (loading) {
        return (
            <div className="flex items-center justify-center" style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
                <div className="loader"></div>
            </div>
        )
    }

    if (!user || !isAdmin()) {
        return <Navigate to="/admin/login" replace />
    }

    return <Outlet />
}
