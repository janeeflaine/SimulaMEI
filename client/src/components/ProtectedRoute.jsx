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

    // Do NOT let the user pass if payment verification is pending with Stripe
    if (user.subscriptionStatus === 'pending_payment') {
        return <Navigate to="/planos?pending=true" replace />
    }

    return <Outlet />
}
