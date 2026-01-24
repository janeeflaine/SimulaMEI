import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute() {
    const { user, loading } = useAuth()

    if (loading) {
        return (
            <div className="flex items-center justify-center" style={{ minHeight: '50vh' }}>
                <div className="loader"></div>
            </div>
        )
    }

    if (!user) {
        return <Navigate to="/login" replace />
    }

    return <Outlet />
}
