import { useState, useEffect } from 'react'
import './AdminPages.css'

export default function AdminUsers() {
    const [users, setUsers] = useState([])
    const [loading, setLoading] = useState(true)
    const [selectedUser, setSelectedUser] = useState(null)
    const [plans, setPlans] = useState([])

    useEffect(() => {
        fetchUsers()
        fetchPlans()
    }, [])

    const fetchUsers = async () => {
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/admin/users', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await res.json()
            setUsers(data)
        } catch (error) {
            console.error('Erro ao carregar usuários:', error)
        } finally {
            setLoading(false)
        }
    }

    const fetchPlans = async () => {
        try {
            const res = await fetch('/api/plans')
            const data = await res.json()
            setPlans(data)
        } catch (error) {
            console.error('Erro ao carregar planos:', error)
        }
    }

    const handleBlockUser = async (userId, blocked) => {
        try {
            const token = localStorage.getItem('token')
            await fetch(`/api/admin/users/${userId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ isBlocked: blocked })
            })
            fetchUsers()
        } catch (error) {
            console.error('Erro ao atualizar usuário:', error)
        }
    }

    const handleChangePlan = async (userId, planId) => {
        try {
            const token = localStorage.getItem('token')
            await fetch(`/api/admin/users/${userId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ planId })
            })
            fetchUsers()
            setSelectedUser(null)
        } catch (error) {
            console.error('Erro ao alterar plano:', error)
        }
    }

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('pt-BR')
    }

    return (
        <div className="admin-page">
            <div className="page-header">
                <h1>Gestão de Usuários</h1>
                <p className="text-secondary">Gerencie os usuários do sistema</p>
            </div>

            {loading ? (
                <div className="flex items-center justify-center" style={{ padding: 'var(--spacing-8)' }}>
                    <div className="loader"></div>
                </div>
            ) : (
                <div className="admin-card">
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Usuário</th>
                                    <th>E-mail</th>
                                    <th>Plano</th>
                                    <th>Status</th>
                                    <th>Criado em</th>
                                    <th>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((user) => (
                                    <tr key={user.id}>
                                        <td>
                                            <div className="user-cell">
                                                <div className="user-avatar-sm">
                                                    {user.name.charAt(0).toUpperCase()}
                                                </div>
                                                <span>{user.name}</span>
                                            </div>
                                        </td>
                                        <td>{user.email}</td>
                                        <td>
                                            <span className="badge badge-info">{user.plan?.name || 'Gratuito'}</span>
                                        </td>
                                        <td>
                                            <span className={`badge ${user.isBlocked ? 'badge-danger' : 'badge-success'}`}>
                                                {user.isBlocked ? 'Bloqueado' : 'Ativo'}
                                            </span>
                                        </td>
                                        <td>{formatDate(user.createdAt)}</td>
                                        <td>
                                            <div className="action-buttons">
                                                <button
                                                    className="btn btn-sm btn-secondary"
                                                    onClick={() => setSelectedUser(user)}
                                                >
                                                    ✏️ Editar
                                                </button>
                                                <button
                                                    className={`btn btn-sm ${user.isBlocked ? 'btn-primary' : 'btn-secondary'}`}
                                                    onClick={() => handleBlockUser(user.id, !user.isBlocked)}
                                                >
                                                    {user.isBlocked ? '🔓 Desbloquear' : '🔒 Bloquear'}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Edit User Modal */}
            {selectedUser && (
                <div className="modal-overlay" onClick={() => setSelectedUser(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <h2>Editar Usuário</h2>
                        <p className="text-secondary mb-4">{selectedUser.name} ({selectedUser.email})</p>

                        <div className="form-group">
                            <label className="form-label">Plano</label>
                            <select
                                className="form-select"
                                value={selectedUser.planId || ''}
                                onChange={(e) => handleChangePlan(selectedUser.id, e.target.value)}
                            >
                                <option value="">Selecione um plano</option>
                                {plans.map(plan => (
                                    <option key={plan.id} value={plan.id}>{plan.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="modal-actions">
                            <button className="btn btn-secondary" onClick={() => setSelectedUser(null)}>
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
