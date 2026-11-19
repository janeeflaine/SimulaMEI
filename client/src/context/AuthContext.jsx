import { createContext, useContext, useState, useEffect } from 'react'
import { getDeviceFingerprint } from '../utils/fingerprint'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const token = localStorage.getItem('token')
        const userData = localStorage.getItem('user')

        if (token && userData) {
            setUser(JSON.parse(userData))
        }
        setLoading(false)
    }, [])

    const login = async (email, password, options = {}) => {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Device-Fingerprint': getDeviceFingerprint(),
            },
            // scope 'admin': o servidor só devolve a sessão para conta de administrador
            body: JSON.stringify(options.scope ? { email, password, scope: options.scope } : { email, password })
        })

        if (!res.ok) {
            const isJson = res.headers.get('content-type')?.includes('application/json')
            const error = isJson ? await res.json().catch(() => ({})) : {}
            const err = new Error(error.message || 'Não deu para entrar agora. Tente de novo em alguns minutos.')
            // Trava de tentativas: quantos segundos faltam (a tela de Entrar conta para baixo)
            if (res.status === 429 && Number(error.retryAfter) > 0) err.retryAfter = Number(error.retryAfter)
            throw err
        }

        const data = await res.json()
        localStorage.setItem('token', data.token)
        localStorage.setItem('user', JSON.stringify(data.user))
        setUser(data.user)
        return data.user
    }

    const register = async (name, email, password, planId = null, acceptedTermsVersion = null) => {
        const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Device-Fingerprint': getDeviceFingerprint(),
            },
            body: JSON.stringify({ name, email, password, planId, acceptedTermsVersion })
        })

        if (!res.ok) {
            const error = await res.json().catch(() => ({}))
            throw new Error(error.message || 'Não deu para criar a conta agora. Tente de novo.')
        }

        const data = await res.json()
        localStorage.setItem('token', data.token)
        localStorage.setItem('user', JSON.stringify(data.user))
        setUser(data.user)
        // trial: teste grátis esperando a confirmação do e-mail (ou o motivo de não ter)
        return { user: data.user, trial: data.trial || null }
    }

    const logout = () => {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        setUser(null)
    }

    const refreshUser = async () => {
        const token = localStorage.getItem('token')
        if (!token) return

        try {
            // Refresh user data
            const res = await fetch('/api/auth/me', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (res.ok) {
                const user = await res.json()
                localStorage.setItem('user', JSON.stringify(user))
                setUser(user)
            } else if (res.status === 401 || res.status === 403) {
                // Sessão encerrada, conta bloqueada ou excluída: sai e volta para o login,
                // que mostra o motivo (outro aparelho, senha trocada, bloqueio)
                const body = await res.json().catch(() => ({}))
                if (body.message) sessionStorage.setItem('logoutReason', body.message)
                logout()
            }
        } catch (error) {
            console.error('Error refreshing user:', error)
        }
    }

    const isAdmin = () => user?.role === 'ADMIN'

    return (
        <AuthContext.Provider value={{ user, loading, login, register, logout, isAdmin, refreshUser }}>
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    const context = useContext(AuthContext)
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider')
    }
    return context
}
