import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import FeatureLock from '../../components/FeatureLock'
import './FinanceCategories.css'

export default function FinanceCategories() {
    const { user } = useAuth()
    const [categories, setCategories] = useState([])
    const [loading, setLoading] = useState(true)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingCategory, setEditingCategory] = useState(null)
    const [newCategory, setNewCategory] = useState({ name: '', type: 'RECEITA' })

    const isPrataPlus = user?.planFeatures?.categorias || user?.isInTrial || user?.role === 'ADMIN'

    useEffect(() => {
        fetchCategories()
    }, [])

    const fetchCategories = async () => {
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/finance/categories', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (res.ok) {
                const data = await res.json()
                setCategories(data)
            }
        } catch (err) {
            console.error('Erro ao buscar categorias:', err)
        } finally {
            setLoading(false)
        }
    }

    const openAddModal = (type = 'RECEITA') => {
        setEditingCategory(null)
        setNewCategory({ name: '', type })
        setIsModalOpen(true)
    }

    const openEditModal = (cat) => {
        setEditingCategory(cat)
        setNewCategory({ name: cat.name, type: cat.type })
        setIsModalOpen(true)
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        try {
            const token = localStorage.getItem('token')
            const url = editingCategory
                ? `/api/finance/categories/${editingCategory.id}`
                : '/api/finance/categories'
            const method = editingCategory ? 'PATCH' : 'POST'

            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(newCategory)
            })

            if (res.ok) {
                fetchCategories()
                setIsModalOpen(false)
            } else {
                const errorData = await res.json().catch(() => ({}))
                alert(errorData.message || 'Erro ao salvar categoria')

                // If 403, we might need to refresh background state
                if (res.status === 403) {
                    console.log('Permission denied. Debug info:', errorData.debug)
                    const { refreshUser } = useAuth()
                    if (refreshUser) refreshUser()
                }
            }
        } catch (err) {
            console.error(err)
            alert('Erro na conexão com o servidor')
        }
    }

    const handleDelete = async (id) => {
        if (!confirm('Tem certeza que deseja excluir esta categoria? Isso pode afetar lançamentos existentes.')) return
        try {
            const token = localStorage.getItem('token')
            const res = await fetch(`/api/finance/categories/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (res.ok) fetchCategories()
        } catch (err) {
            console.error(err)
        }
    }


    const renderList = (type, title, icon) => {
        const filtered = categories.filter(c => c.type === type)
        return (
            <div className="category-list-card">
                <div className="list-header">
                    <div className="title-area">
                        <span className="icon">{icon}</span>
                        <h3>{title}</h3>
                    </div>
                    <button className="add-btn-circle" onClick={() => openAddModal(type)} title="Nova Categoria">+</button>
                </div>
                <div className="list-content">
                    {filtered.length === 0 ? (
                        <p className="empty-msg">Nenhuma categoria registrada.</p>
                    ) : (
                        filtered.map(cat => (
                            <div key={cat.id} className="category-item">
                                <span>{cat.name}</span>
                                <div className="actions">
                                    <button onClick={() => openEditModal(cat)} className="action-btn edit" title="Editar">✏️</button>
                                    <button onClick={() => handleDelete(cat.id)} className="action-btn delete" title="Excluir">🗑️</button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        )
    }

    if (!isPrataPlus) {
        return (
            <div className="container py-8 finance-categories-page">
                <FeatureLock
                    featureName="Categorias Personalizadas"
                    requiredPlan="Prata"
                    description="Organize seus lançamentos com categorias próprias: Receitas, Despesas MEI e Despesas Pessoais."
                    icon="🏷️"
                />
            </div>
        )
    }

    return (
        <div className="container py-8 finance-categories-page">
            <div className="statement-header">
                <div className="header-title">
                    <h1>Categorias Financeiras</h1>
                    <p>Mantenha seu controle organizado e personalizado</p>
                </div>
                <div className="header-actions">
                    <button className="btn btn-primary" onClick={() => openAddModal()}>
                        ➕ Nova Categoria
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center p-12"><div className="loader"></div></div>
            ) : (
                <div className="categories-grid">
                    {renderList('RECEITA', 'Receitas', '💰')}
                    {renderList('DESPESA_MEI', 'Despesas MEI (PJ)', '🏢')}
                    {renderList('DESPESA_PESSOAL', 'Despesas Pessoais (PF)', '👤')}
                </div>
            )}

            {isModalOpen && (
                <div className="cat-modal-overlay">
                    <div className="cat-modal-content">
                        <h2>{editingCategory ? 'Editar Categoria' : 'Nova Categoria'}</h2>
                        <form onSubmit={handleSubmit}>
                            <div className="form-group">
                                <label>Nome da Categoria</label>
                                <input
                                    autoFocus
                                    required
                                    type="text"
                                    className="form-input"
                                    value={newCategory.name}
                                    onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                                    placeholder="Ex: Consultoria, Aluguel, Alimentação..."
                                />
                            </div>
                            <div className="form-group">
                                <label>Tipo</label>
                                <select
                                    className="form-input"
                                    value={newCategory.type}
                                    onChange={(e) => setNewCategory({ ...newCategory, type: e.target.value })}
                                >
                                    <option value="RECEITA">Receita</option>
                                    <option value="DESPESA_MEI">Despesa MEI (PJ)</option>
                                    <option value="DESPESA_PESSOAL">Despesa Pessoal (PF)</option>
                                </select>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Cancelar</button>
                                <button type="submit" className="btn btn-primary">Salvar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
