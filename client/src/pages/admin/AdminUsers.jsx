import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import './AdminPages.css'

const inputStyle = {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 8,
    color: '#f1f5f9',
    padding: '9px 13px',
    fontSize: 14,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
}

const selectStyle = {
    ...inputStyle,
    appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2393c5fd' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
    paddingRight: 34,
    cursor: 'pointer',
}

function Field({ label, children, hint }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                {label}
            </label>
            {children}
            {hint && <span style={{ fontSize: 11, color: '#475569' }}>{hint}</span>}
        </div>
    )
}

function EditUserModal({ user, plans, onClose, onSaved }) {
    const [form, setForm] = useState({
        name:        user.name        || '',
        email:       user.email       || '',
        planId:      user.planId      || '',
        role:        user.role        || 'USER',
        isBlocked:   user.isBlocked   ? '1' : '0',
        newPassword: '',
        confirmPassword: '',
    })
    const [showPassword, setShowPassword] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')

    const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }))

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        setSuccess('')

        if (form.newPassword && form.newPassword !== form.confirmPassword) {
            setError('As senhas não coincidem.')
            return
        }
        if (form.newPassword && form.newPassword.length < 8) {
            setError('A nova senha deve ter pelo menos 8 caracteres.')
            return
        }

        setSaving(true)
        try {
            const token = localStorage.getItem('token')
            const body = {
                name:      form.name.trim(),
                email:     form.email.trim(),
                planId:    form.planId || null,
                role:      form.role,
                isBlocked: form.isBlocked === '1',
            }
            if (form.newPassword) body.newPassword = form.newPassword

            const res = await fetch(`/api/admin/users/${user.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify(body),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.message || 'Erro ao salvar.')

            setSuccess('Usuário atualizado com sucesso!')
            setForm(f => ({ ...f, newPassword: '', confirmPassword: '' }))
            onSaved()
        } catch (err) {
            setError(err.message)
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" style={{ maxWidth: 520, width: '95%' }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: 18, color: '#e2e8f0' }}>Editar Usuário</h2>
                        <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>ID #{user.id}</p>
                    </div>
                    <div style={{
                        width: 40, height: 40, borderRadius: '50%', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 700,
                        background: 'linear-gradient(135deg, #2563eb, #3b82f6)', color: '#fff', flexShrink: 0,
                    }}>
                        {user.name.charAt(0).toUpperCase()}
                    </div>
                </div>

                {error && (
                    <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '10px 14px', color: '#fca5a5', fontSize: 13, marginBottom: 16 }}>
                        ⚠️ {error}
                    </div>
                )}
                {success && (
                    <div style={{ background: 'rgba(5,150,105,0.1)', border: '1px solid rgba(5,150,105,0.25)', borderRadius: 8, padding: '10px 14px', color: '#6ee7b7', fontSize: 13, marginBottom: 16 }}>
                        ✅ {success}
                    </div>
                )}

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                    {/* Dados pessoais */}
                    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: 16 }}>
                        <div style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>Dados Pessoais</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <Field label="Nome">
                                <input type="text" style={inputStyle} value={form.name} onChange={set('name')} required />
                            </Field>
                            <Field label="E-mail">
                                <input type="email" style={inputStyle} value={form.email} onChange={set('email')} required />
                            </Field>
                        </div>
                    </div>

                    {/* Conta e plano */}
                    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: 16 }}>
                        <div style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>Conta e Plano</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                            <Field label="Plano">
                                <select style={selectStyle} value={form.planId} onChange={set('planId')}>
                                    <option value="">Sem plano</option>
                                    {plans.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </Field>
                            <Field label="Papel">
                                <select style={selectStyle} value={form.role} onChange={set('role')}>
                                    <option value="USER">Usuário</option>
                                    <option value="ADMIN">Administrador</option>
                                </select>
                            </Field>
                            <Field label="Status">
                                <select
                                    style={{
                                        ...selectStyle,
                                        color: form.isBlocked === '1' ? '#fca5a5' : '#6ee7b7',
                                    }}
                                    value={form.isBlocked}
                                    onChange={set('isBlocked')}
                                >
                                    <option value="0">Ativo</option>
                                    <option value="1">Bloqueado</option>
                                </select>
                            </Field>
                        </div>
                    </div>

                    {/* Reset de senha */}
                    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <div style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Redefinir Senha</div>
                            <span style={{ fontSize: 11, color: '#475569' }}>Deixe em branco para não alterar</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <Field label="Nova Senha">
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        style={{ ...inputStyle, paddingRight: 40 }}
                                        value={form.newPassword}
                                        onChange={set('newPassword')}
                                        placeholder="Mínimo 8 caracteres"
                                        autoComplete="new-password"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(v => !v)}
                                        style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, color: '#64748b', padding: 0 }}
                                    >
                                        {showPassword ? '🙈' : '👁️'}
                                    </button>
                                </div>
                            </Field>
                            <Field label="Confirmar Senha">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    style={{
                                        ...inputStyle,
                                        borderColor: form.confirmPassword && form.confirmPassword !== form.newPassword
                                            ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.12)',
                                    }}
                                    value={form.confirmPassword}
                                    onChange={set('confirmPassword')}
                                    placeholder="Repita a senha"
                                    autoComplete="new-password"
                                />
                            </Field>
                        </div>
                        {form.newPassword && (
                            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                                <div style={{ height: 4, flex: 1, borderRadius: 4, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                                    <div style={{
                                        height: '100%', borderRadius: 4, transition: 'width 0.3s, background 0.3s',
                                        width: form.newPassword.length >= 12 ? '100%' : form.newPassword.length >= 8 ? '60%' : '30%',
                                        background: form.newPassword.length >= 12 ? '#10b981' : form.newPassword.length >= 8 ? '#f59e0b' : '#ef4444',
                                    }} />
                                </div>
                                <span style={{ color: form.newPassword.length >= 12 ? '#6ee7b7' : form.newPassword.length >= 8 ? '#fcd34d' : '#fca5a5', whiteSpace: 'nowrap' }}>
                                    {form.newPassword.length >= 12 ? 'Forte' : form.newPassword.length >= 8 ? 'Média' : 'Fraca'}
                                </span>
                            </div>
                        )}
                        {form.newPassword && (
                            <p style={{ marginTop: 8, fontSize: 11, color: '#f59e0b' }}>
                                ⚠️ Ao redefinir a senha, todas as sessões ativas deste usuário serão encerradas.
                            </p>
                        )}
                    </div>

                    <div className="modal-actions">
                        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
                            Cancelar
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={saving}>
                            {saving ? 'Salvando...' : '💾 Salvar Alterações'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

function DeleteUserModal({ user, onClose, onDeleted }) {
    const [confirmText, setConfirmText] = useState('')
    const [deleting, setDeleting] = useState(false)
    const [error, setError] = useState('')

    const isConfirmed = confirmText.trim().toUpperCase() === 'EXCLUIR'

    const handleDelete = async () => {
        if (!isConfirmed) return
        setError('')
        setDeleting(true)
        try {
            const token = localStorage.getItem('token')
            const res = await fetch(`/api/admin/users/${user.id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.message || 'Erro ao excluir usuário.')

            onDeleted()
        } catch (err) {
            setError(err.message)
            setDeleting(false)
        }
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" style={{ maxWidth: 520, width: '95%' }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                    <div style={{
                        width: 44, height: 44, borderRadius: '50%', background: 'rgba(239, 68, 68, 0.15)',
                        border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0
                    }}>
                        🗑️
                    </div>
                    <div>
                        <h2 style={{ margin: 0, fontSize: 18, color: '#f87171' }}>Excluir Usuário Definitivamente</h2>
                        <p style={{ margin: '2px 0 0', color: '#94a3b8', fontSize: 13 }}>ID #{user.id} — {user.name} ({user.email})</p>
                    </div>
                </div>

                {error && (
                    <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '10px 14px', color: '#fca5a5', fontSize: 13, marginBottom: 16 }}>
                        ⚠️ {error}
                    </div>
                )}

                <div style={{
                    background: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    borderRadius: 10,
                    padding: 16,
                    marginBottom: 20
                }}>
                    <div style={{ color: '#fca5a5', fontWeight: 600, fontSize: 14, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                        ⚠️ ATENÇÃO: Ação Irreversível!
                    </div>
                    <p style={{ color: '#cbd5e1', fontSize: 13, lineHeight: 1.5, margin: 0 }}>
                        Ao confirmar, o usuário <strong>{user.name}</strong> e <strong>TODOS os dados associados a ele serão permanentemente apagados do banco de dados</strong>.
                    </p>
                    <ul style={{ color: '#94a3b8', fontSize: 12, margin: '10px 0 0', paddingLeft: 20, lineHeight: 1.6 }}>
                        <li>Todas as transações financeiras (receitas e despesas)</li>
                        <li>Todos os cartões de crédito, faturas e lançamentos</li>
                        <li>Todas as contas e carteiras (PF/PJ)</li>
                        <li>Todas as simulações registradas</li>
                        <li>Alertas, sessões e históricos da conta</li>
                    </ul>
                </div>

                <div style={{ marginBottom: 20 }}>
                    <label style={{ display: 'block', fontSize: 13, color: '#e2e8f0', marginBottom: 8, fontWeight: 500 }}>
                        Para confirmar a exclusão de todos os dados, digite <strong>EXCLUIR</strong> abaixo:
                    </label>
                    <input
                        type="text"
                        style={inputStyle}
                        value={confirmText}
                        onChange={e => setConfirmText(e.target.value)}
                        placeholder="Digite EXCLUIR"
                        autoFocus
                    />
                </div>

                <div className="modal-actions">
                    <button type="button" className="btn btn-secondary" onClick={onClose} disabled={deleting}>
                        Cancelar
                    </button>
                    <button
                        type="button"
                        className="btn"
                        style={{
                            background: isConfirmed ? '#dc2626' : 'rgba(220, 38, 38, 0.4)',
                            color: '#fff',
                            border: 'none',
                            cursor: isConfirmed && !deleting ? 'pointer' : 'not-allowed',
                            opacity: isConfirmed && !deleting ? 1 : 0.6
                        }}
                        disabled={!isConfirmed || deleting}
                        onClick={handleDelete}
                    >
                        {deleting ? 'Excluindo...' : '🗑️ Confirmar Exclusão Definitiva'}
                    </button>
                </div>
            </div>
        </div>
    )
}

export default function AdminUsers() {
    const { user: currentUser } = useAuth()
    const [users, setUsers] = useState([])
    const [loading, setLoading] = useState(true)
    const [selectedUser, setSelectedUser] = useState(null)
    const [userToDelete, setUserToDelete] = useState(null)
    const [plans, setPlans] = useState([])
    const [search, setSearch] = useState('')

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
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ isBlocked: blocked })
            })
            fetchUsers()
        } catch (error) {
            console.error('Erro ao atualizar usuário:', error)
        }
    }

    const formatDate = (dateString) => new Date(dateString).toLocaleDateString('pt-BR')

    const filtered = users.filter(u =>
        !search ||
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase())
    )

    return (
        <div className="admin-page">
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <h1>Gestão de Usuários</h1>
                    <p className="text-secondary">Gerencie os usuários do sistema</p>
                </div>
                <input
                    type="text"
                    placeholder="🔍  Buscar por nome ou e-mail..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{
                        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 8, color: '#f1f5f9', padding: '8px 14px', fontSize: 13,
                        outline: 'none', minWidth: 260,
                    }}
                />
            </div>

            {loading ? (
                <div className="flex items-center justify-center" style={{ padding: 'var(--spacing-8)' }}>
                    <div className="loader" />
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
                                    <th>Papel</th>
                                    <th>Status</th>
                                    <th>Criado em</th>
                                    <th>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((user) => (
                                    <tr key={user.id}>
                                        <td>
                                            <div className="user-cell">
                                                <div className="user-avatar-sm">{user.name.charAt(0).toUpperCase()}</div>
                                                <span>{user.name}</span>
                                            </div>
                                        </td>
                                        <td style={{ color: '#94a3b8', fontSize: 13 }}>{user.email}</td>
                                        <td>
                                            <span className="badge badge-info">{user.plan?.name || 'Gratuito'}</span>
                                        </td>
                                        <td>
                                            <span style={{
                                                fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                                                background: user.role === 'ADMIN' ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.06)',
                                                color: user.role === 'ADMIN' ? '#c4b5fd' : '#94a3b8',
                                            }}>
                                                {user.role === 'ADMIN' ? '🛡️ Admin' : 'Usuário'}
                                            </span>
                                        </td>
                                        <td>
                                            <span className={`badge ${user.isBlocked ? 'badge-danger' : 'badge-success'}`}>
                                                {user.isBlocked ? 'Bloqueado' : 'Ativo'}
                                            </span>
                                        </td>
                                        <td style={{ color: '#64748b', fontSize: 13 }}>{formatDate(user.createdAt)}</td>
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
                                                {user.role !== 'ADMIN' && currentUser?.id !== user.id && (
                                                    <button
                                                        className="btn btn-sm"
                                                        style={{
                                                            background: 'rgba(239, 68, 68, 0.15)',
                                                            color: '#fca5a5',
                                                            border: '1px solid rgba(239, 68, 68, 0.3)',
                                                        }}
                                                        onClick={() => setUserToDelete(user)}
                                                        title="Excluir usuário e todas as suas movimentações do banco"
                                                    >
                                                        🗑️ Excluir
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {filtered.length === 0 && (
                                    <tr>
                                        <td colSpan={7} style={{ textAlign: 'center', padding: 40, color: '#475569' }}>
                                            Nenhum usuário encontrado
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {selectedUser && (
                <EditUserModal
                    user={selectedUser}
                    plans={plans}
                    onClose={() => setSelectedUser(null)}
                    onSaved={() => { fetchUsers(); }}
                />
            )}

            {userToDelete && (
                <DeleteUserModal
                    user={userToDelete}
                    onClose={() => setUserToDelete(null)}
                    onDeleted={() => {
                        setUserToDelete(null)
                        fetchUsers()
                    }}
                />
            )}
        </div>
    )
}
