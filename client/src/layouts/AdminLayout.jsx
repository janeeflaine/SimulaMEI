import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './AdminLayout.css'

export default function AdminLayout() {
    const { user, logout } = useAuth()
    const location = useLocation()
    const navigate = useNavigate()

    const handleLogout = () => {
        logout()
        navigate('/admin/login')
    }

    const menuItems = [
        { path: '/admin', icon: '📊', label: 'Dashboard' },
        { path: '/admin/usuarios', icon: '👥', label: 'Usuários' },
        { path: '/admin/regras', icon: '🧮', label: 'Regras de Cálculo' },
        { path: '/admin/limites', icon: '📏', label: 'Limites MEI' },
        { path: '/admin/planos', icon: '💎', label: 'Planos' },
        { path: '/admin/funcionalidades', icon: '🔧', label: 'Funcionalidades' },
        { path: '/admin/configuracoes', icon: '⚙️', label: 'Configurações' },
        { path: '/admin/relatorios', icon: '📈', label: 'Relatórios' },
    ]

    return (
        <div className="admin-layout" data-theme="dark">
            {/* Sidebar */}
            <aside className="admin-sidebar">
                <div className="sidebar-header">
                    <Link to="/admin" className="admin-logo">
                        <span>📊</span>
                        <span>SimulaMEI</span>
                    </Link>
                    <span className="admin-badge">Admin</span>
                </div>

                <nav className="sidebar-nav">
                    {menuItems.map((item) => (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
                        >
                            <span className="nav-icon">{item.icon}</span>
                            <span className="nav-label">{item.label}</span>
                        </Link>
                    ))}
                </nav>

                <div className="sidebar-footer">
                    <div className="admin-user">
                        <div className="user-avatar">
                            {user?.name?.charAt(0).toUpperCase() || 'A'}
                        </div>
                        <div className="user-info">
                            <span className="user-name">{user?.name}</span>
                            <span className="user-role">Administrador</span>
                        </div>
                    </div>
                    <button className="logout-btn" onClick={handleLogout}>
                        🚪 Sair
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="admin-main">
                <Outlet />
            </main>
        </div>
    )
}
