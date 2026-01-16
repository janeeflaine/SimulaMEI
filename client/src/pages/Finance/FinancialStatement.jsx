import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../context/AuthContext'
import FeatureLock from '../../components/FeatureLock'
import {
    FileText,
    Search,
    Trash2,
    Edit2,
    Filter,
    ChevronLeft,
    ChevronRight,
    ArrowUpCircle,
    ArrowDownCircle,
    Calendar,
    Briefcase,
    User,
    CreditCard
} from 'lucide-react'
import FinanceQuickActionModal from '../../components/FinanceQuickActionModal'
import './FinancialStatement.css'

export default function FinancialStatement() {
    const { user } = useAuth()
    const [transactions, setTransactions] = useState([])
    const [loading, setLoading] = useState(true)
    const [isEditModalOpen, setIsEditModalOpen] = useState(false)
    const [editingTransaction, setEditingTransaction] = useState(null)
    const [filters, setFilters] = useState({
        search: '',
        type: 'ALL', // ALL, RECEITA, DESPESA
        target: 'ALL', // ALL, PERSONAL, BUSINESS
        dateStart: '',
        dateEnd: ''
    })
    const [page, setPage] = useState(1)
    const rowsPerPage = 15

    useEffect(() => {
        fetchTransactions()
    }, [])

    const fetchTransactions = async () => {
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/finance/transactions', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (res.ok) {
                const data = await res.json()
                setTransactions(data)
            }
        } catch (error) {
            console.error('Erro ao buscar transações:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async (id) => {
        if (!window.confirm('Tem certeza que deseja excluir esta transação? Esta ação não pode ser desfeita.')) return

        try {
            const token = localStorage.getItem('token')
            const res = await fetch(`/api/finance/transactions/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (res.ok) {
                setTransactions(prev => prev.filter(t => t.id !== id))
            } else {
                const data = await res.json()
                alert(data.message || 'Erro ao excluir transação')
            }
        } catch (error) {
            console.error('Erro ao excluir:', error)
            alert('Erro de conexão ao excluir transação')
        }
    }

    const filteredTransactions = useMemo(() => {
        return transactions.filter(t => {
            const matchSearch = t.description?.toLowerCase().includes(filters.search.toLowerCase()) ||
                t.categoryName?.toLowerCase().includes(filters.search.toLowerCase())
            const matchType = filters.type === 'ALL' || t.type === filters.type
            const matchTarget = filters.target === 'ALL' || t.target === filters.target

            let matchDate = true
            // Date is now YYYY-MM-DD string, so we can compare strings directly
            if (filters.dateStart) matchDate = matchDate && t.date >= filters.dateStart
            if (filters.dateEnd) matchDate = matchDate && t.date <= filters.dateEnd

            return matchSearch && matchType && matchTarget && matchDate
        })
    }, [transactions, filters])

    const totalPages = Math.ceil(filteredTransactions.length / rowsPerPage)
    const paginatedTransactions = filteredTransactions.slice((page - 1) * rowsPerPage, page * rowsPerPage)

    const formatCurrency = (value) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(value)
    }

    const formatDate = (dateString) => {
        if (!dateString) return '-'
        if (typeof dateString === 'string' && dateString.length === 10) {
            const [year, month, day] = dateString.split('-')
            return `${day}/${month}/${year}`
        }
        return new Date(dateString).toLocaleDateString('pt-BR')
    }

    if (user?.plan !== 'Ouro' && Number(user?.planId) !== 3 && !user?.isInTrial) {
        return <FeatureLock feature="Extrato Financeiro" />
    }

    return (
        <div className="financial-statement-page">
            <div className="statement-container">
                <div className="statement-header">
                    <div className="header-title">
                        <h1>Extrato Financeiro</h1>
                        <p>Acompanhe e gerencie todas as suas movimentações.</p>
                    </div>
                </div>

                <div className="statement-controls">
                    <div className="control-group" style={{ flex: 1, minWidth: '250px' }}>
                        <label>Buscar</label>
                        <div style={{ position: 'relative' }}>
                            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-slate-400)' }} />
                            <input
                                type="text"
                                placeholder="Descrição ou categoria..."
                                style={{ paddingLeft: '40px', width: '100%' }}
                                value={filters.search}
                                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="control-group">
                        <label>Tipo</label>
                        <select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
                            <option value="ALL">Todos os Tipos</option>
                            <option value="RECEITA">Apenas Receitas</option>
                            <option value="DESPESA">Apenas Despesas</option>
                        </select>
                    </div>

                    <div className="control-group">
                        <label>Pessoa</label>
                        <select value={filters.target} onChange={(e) => setFilters({ ...filters, target: e.target.value })}>
                            <option value="ALL">PF e PJ</option>
                            <option value="BUSINESS">🏢 Jurídica (PJ)</option>
                            <option value="PERSONAL">👤 Física (PF)</option>
                        </select>
                    </div>

                    <div className="control-group">
                        <label>De</label>
                        <input type="date" value={filters.dateStart} onChange={(e) => setFilters({ ...filters, dateStart: e.target.value })} />
                    </div>

                    <div className="control-group">
                        <label>Até</label>
                        <input type="date" value={filters.dateEnd} onChange={(e) => setFilters({ ...filters, dateEnd: e.target.value })} />
                    </div>
                </div>

                <div className="statement-card">
                    <div className="table-responsive">
                        <table className="statement-table">
                            <thead>
                                <tr>
                                    <th>Data</th>
                                    <th>Categoria</th>
                                    <th>Descrição</th>
                                    <th>Destino</th>
                                    <th>Método</th>
                                    <th style={{ textAlign: 'right' }}>Valor</th>
                                    <th style={{ textAlign: 'right' }}>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan="7" style={{ textAlign: 'center', padding: '3rem' }}>Carregando transações...</td></tr>
                                ) : paginatedTransactions.length === 0 ? (
                                    <tr>
                                        <td colSpan="7">
                                            <div className="statement-empty">
                                                <FileText size={48} color="var(--color-slate-200)" />
                                                <p>Nenhuma transação encontrada.</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    paginatedTransactions.map(t => (
                                        <tr key={t.id}>
                                            <td className="td-date">
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <Calendar size={14} />
                                                    {formatDate(t.date)}
                                                </div>
                                            </td>
                                            <td className="td-category">
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    {t.type === 'RECEITA' ?
                                                        <ArrowUpCircle size={16} className="amount-positive" /> :
                                                        <ArrowDownCircle size={16} className="amount-negative" />
                                                    }
                                                    {t.categoryName || 'Outros'}
                                                </div>
                                            </td>
                                            <td className="td-description">{t.description || '-'}</td>
                                            <td className="td-target">
                                                <span className={`badge badge-${t.target === 'BUSINESS' ? 'primary' : 'secondary'}`} style={{ fontSize: '10px' }}>
                                                    {t.target === 'BUSINESS' ? <Briefcase size={10} style={{ marginRight: '4px' }} /> : <User size={10} style={{ marginRight: '4px' }} />}
                                                    {t.target === 'BUSINESS' ? 'PJ' : 'PF'}
                                                </span>
                                            </td>
                                            <td className="td-method">
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    {t.paymentMethod === 'Cartão de Crédito' && <CreditCard size={14} />}
                                                    {t.paymentMethod} {t.cardName && `(${t.cardName})`}
                                                </div>
                                            </td>
                                            <td className={`td-amount ${t.type === 'RECEITA' ? 'amount-positive' : 'amount-negative'}`}>
                                                {t.type === 'RECEITA' ? '+' : '-'} {formatCurrency(t.amount)}
                                            </td>
                                            <td className="td-actions">
                                                <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                                                    <button
                                                        className="btn-delete"
                                                        style={{ color: 'var(--color-primary)' }}
                                                        title="Editar"
                                                        onClick={() => {
                                                            setEditingTransaction(t)
                                                            setIsEditModalOpen(true)
                                                        }}
                                                    >
                                                        <Edit2 size={18} />
                                                    </button>
                                                    <button className="btn-delete" title="Excluir" onClick={() => handleDelete(t.id)}>
                                                        <Trash2 size={18} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {totalPages > 1 && (
                        <div className="statement-footer">
                            <span style={{ fontSize: '0.875rem', color: 'var(--color-slate-500)' }}>
                                Mostrando <strong>{paginatedTransactions.length}</strong> de <strong>{filteredTransactions.length}</strong> transações
                            </span>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <button
                                    className="btn btn-outline btn-sm"
                                    disabled={page === 1}
                                    onClick={() => setPage(p => p - 1)}
                                >
                                    <ChevronLeft size={16} />
                                </button>
                                <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                                    Página {page} de {totalPages}
                                </span>
                                <button
                                    className="btn btn-outline btn-sm"
                                    disabled={page === totalPages}
                                    onClick={() => setPage(p => p + 1)}
                                >
                                    <ChevronRight size={16} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {isEditModalOpen && (
                <FinanceQuickActionModal
                    initialData={editingTransaction}
                    onClose={() => {
                        setIsEditModalOpen(false)
                        setEditingTransaction(null)
                    }}
                    onSuccess={() => {
                        setIsEditModalOpen(false)
                        setEditingTransaction(null)
                        fetchTransactions()
                    }}
                />
            )}
        </div>
    )
}
