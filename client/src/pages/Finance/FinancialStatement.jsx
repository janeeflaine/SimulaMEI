import { useState, useEffect, useMemo, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import {
    PlusCircle,
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
    CreditCard,
    Wallet,
    CheckSquare
} from 'lucide-react'
import FinanceQuickActionModal from '../../components/FinanceQuickActionModal'
import TransferModal from '../../components/TransferModal'
import './FinancialStatement.css'

export default function FinancialStatement() {
    const { user } = useAuth()
    const [transactions, setTransactions] = useState([])
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(1)
    const [hasMore, setHasMore] = useState(true)
    const [totalCount, setTotalCount] = useState(0) // New state for total records
    const [isEditModalOpen, setIsEditModalOpen] = useState(false)
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
    const [editingTransaction, setEditingTransaction] = useState(null)
    const [selectedIds, setSelectedIds] = useState(new Set())
    const [bulkDeleting, setBulkDeleting] = useState(false)

    // Grátis: extrato limitado aos últimos 30 dias
    const isGratuito = !user?.isInTrial && (Number(user?.planId) === 1 || (!user?.planId && user?.plan !== 'Prata' && user?.plan !== 'Ouro'))
    const isPrataPlus = user?.planFeatures?.transferencias || user?.isInTrial || user?.role === 'ADMIN'
    const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const todayStr = new Date().toISOString().split('T')[0]
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0]

    const [filters, setFilters] = useState({
        search: '',
        type: 'ALL',
        walletId: 'ALL',
        categoryId: 'ALL',
        dateStart: isGratuito ? thirtyDaysAgoStr : '',
        dateEnd: isGratuito ? todayStr : ''
    })

    // Debounce for search
    const [debouncedSearch, setDebouncedSearch] = useState('')

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(filters.search)
        }, 500)
        return () => clearTimeout(timer)
    }, [filters.search])

    const loadMoreRef = useRef(null)
    const [editingWalletTransactionId, setEditingWalletTransactionId] = useState(null)

    const [wallets, setWallets] = useState([])
    const [categories, setCategories] = useState([])
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false)

    useEffect(() => {
        setPage(1)
        setHasMore(true)
        setTransactions([]) // Clear list on filter change
        setTotalCount(0)
        setLoading(true)
    }, [debouncedSearch, filters.type, filters.walletId, filters.categoryId, filters.dateStart, filters.dateEnd])

    useEffect(() => {
        fetchTransactions()
    }, [page, debouncedSearch, filters.type, filters.walletId, filters.categoryId, filters.dateStart, filters.dateEnd])

    useEffect(() => {
        fetchWallets()
        fetchCategories()
    }, [])

    const fetchWallets = async () => {
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/finance/business-units', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (res.ok) {
                const data = await res.json()
                setWallets(data)
            }
        } catch (error) {
            console.error('Erro ao buscar carteiras:', error)
        }
    }

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
        } catch (error) {
            console.error('Erro ao buscar categorias:', error)
        }
    }

    const handleQuickWalletChange = async (transactionId, newWalletId) => {
        if (!newWalletId) return
        try {
            const token = localStorage.getItem('token')
            // Optimistic Update
            const updatedTransactions = transactions.map(t =>
                t.id === transactionId ? { ...t, business_unit_id: Number(newWalletId) } : t
            )
            setTransactions(updatedTransactions)
            setEditingWalletTransactionId(null)

            const res = await fetch(`/api/finance/transactions/${transactionId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ business_unit_id: newWalletId })
            })

            if (!res.ok) {
                // Revert on failure
                fetchTransactions()
                alert('Erro ao atualizar carteira.')
            }
        } catch (err) {
            console.error(err)
            fetchTransactions()
            alert('Erro de conexão.')
        }
    }

    const fetchTransactions = async () => {
        try {
            const token = localStorage.getItem('token')
            const params = new URLSearchParams({
                page,
                limit: 15,
                walletId: filters.walletId,
                categoryId: filters.categoryId,
                type: filters.type,
                search: debouncedSearch,
                startDate: filters.dateStart,
                endDate: filters.dateEnd
            })

            const res = await fetch(`/api/finance/transactions?${params}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })
            if (res.ok) {
                const { data, totalPages, totalCount } = await res.json()

                setTransactions(prev => {
                    if (page === 1) return data
                    // Avoid duplicates if race conditions occur
                    const newIds = new Set(data.map(d => d.id))
                    return [...(Array.isArray(prev) ? prev : []).filter(p => !newIds.has(p.id)), ...data]
                })
                setHasMore(page < totalPages)
                setTotalCount(totalCount)
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
                headers: {
                    'Authorization': `Bearer ${token}`
                }
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

    // --- BULK DELETE ---
    const toggleSelectId = (id) => {
        setSelectedIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const toggleSelectAll = () => {
        if (selectedIds.size === transactions.length) {
            setSelectedIds(new Set())
        } else {
            setSelectedIds(new Set(transactions.map(t => t.id)))
        }
    }

    const handleBulkDelete = async () => {
        if (selectedIds.size === 0) return
        if (!window.confirm(`Tem certeza que deseja excluir ${selectedIds.size} transação(ões)? Esta ação não pode ser desfeita.`)) return
        setBulkDeleting(true)
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/finance/transactions/bulk-delete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ ids: Array.from(selectedIds) })
            })
            if (res.ok) {
                const data = await res.json()
                setTransactions(prev => prev.filter(t => !selectedIds.has(t.id)))
                setSelectedIds(new Set())
                alert(data.message)
            } else {
                const data = await res.json()
                alert(data.message || 'Erro ao excluir transações')
            }
        } catch (err) {
            console.error(err)
            alert('Erro de conexão ao excluir transações.')
        } finally {
            setBulkDeleting(false)
        }
    }



    // Infinite Scroll Observer
    useEffect(() => {
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && hasMore && !loading) {
                setPage(prev => prev + 1)
            }
        }, { threshold: 1.0 })

        if (loadMoreRef.current) {
            observer.observe(loadMoreRef.current)
        }

        return () => {
            if (loadMoreRef.current) {
                observer.unobserve(loadMoreRef.current)
            }
        }
    }, [hasMore, loading])

    // paginatedTransactions was removed, use transactions directly


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

    // Função auxiliar para achar o nome da carteira pelo ID
    const getWalletName = (id) => {
        const wallet = wallets.find(w => w.id === id)
        return wallet ? wallet.name : 'Desconhecido'
    }

    return (
        <div className="financial-statement-page">
            <div className="statement-container">
                {isGratuito && (
                    <div className="alert-banner" style={{ marginBottom: '1.5rem' }}>
                        <span>📅</span>
                        <span>
                            Plano Gratuito exibe apenas os últimos 30 dias.{' '}
                            <a href="/planos" style={{ fontWeight: 600 }}>Faça upgrade para o Prata</a> e acesse todo o histórico.
                        </span>
                    </div>
                )}
                <div className="statement-header">
                    <div className="header-title">
                        <h1>Extrato Financeiro</h1>
                        <p>Visão unificada das finanças Familiares e Empresariais.</p>
                    </div>
                    <div className="header-actions">
                        {/* Botão de Transferência — Prata+ */}
                        {isPrataPlus && (
                            <button className="btn btn-outline" onClick={() => setIsTransferModalOpen(true)}>
                                <ArrowUpCircle size={18} style={{ transform: 'rotate(45deg)' }} /> Transferir
                            </button>
                        )}
                        <button className="btn btn-secondary" onClick={() => setIsCreateModalOpen(true)}>
                            <PlusCircle size={18} /> Novo Lançamento
                        </button>
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

                    {/* --- MUDANÇA 4: O Novo Dropdown de Carteiras --- */}
                    <div className="control-group">
                        <label>Carteira</label>
                        <select
                            value={filters.walletId}
                            onChange={(e) => setFilters({ ...filters, walletId: e.target.value })}
                            style={{ fontWeight: 'bold', color: filters.walletId !== 'ALL' ? 'var(--color-primary)' : 'inherit' }}
                        >
                            <option value="ALL">🏠 Visão Geral (Tudo)</option>
                            <option disabled>--- EMPRESAS ---</option>
                            {Array.isArray(wallets) && wallets.filter(w => w.type === 'PJ').map(w => (
                                <option key={w.id} value={w.id}>🏢 {w.name}</option>
                            ))}
                            <option disabled>--- PESSOAL ---</option>
                            {Array.isArray(wallets) && wallets.filter(w => w.type === 'PF').map(w => (
                                <option key={w.id} value={w.id}>👤 {w.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="control-group">
                        <label>Categoria</label>
                        <select
                            value={filters.categoryId}
                            onChange={(e) => setFilters({ ...filters, categoryId: e.target.value })}
                        >
                            <option value="ALL">Todas</option>
                            {categories.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="control-group">
                        <label>Tipo</label>
                        <select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
                            <option value="ALL">Todos</option>
                            <option value="RECEITA">Entradas (+)</option>
                            <option value="DESPESA">Saídas (-)</option>
                        </select>
                    </div>

                    <div className="control-group">
                        <label>De</label>
                        <input type="date" value={filters.dateStart} disabled={isGratuito} title={isGratuito ? 'Disponível no plano Prata ou superior' : ''} onChange={(e) => setFilters({ ...filters, dateStart: e.target.value })} />
                    </div>

                    <div className="control-group">
                        <label>Até</label>
                        <input type="date" value={filters.dateEnd} disabled={isGratuito} title={isGratuito ? 'Disponível no plano Prata ou superior' : ''} onChange={(e) => setFilters({ ...filters, dateEnd: e.target.value })} />
                    </div>
                </div>

                <div className="statement-card">
                    <div className="table-responsive">
                        <table className="statement-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '40px', textAlign: 'center' }}>
                                        <input
                                            type="checkbox"
                                            className="bulk-checkbox"
                                            checked={transactions.length > 0 && selectedIds.size === transactions.length}
                                            onChange={toggleSelectAll}
                                            title="Selecionar todos"
                                        />
                                    </th>
                                    <th>Data</th>
                                    <th>Carteira</th>
                                    <th>Categoria</th>
                                    <th>Descrição</th>
                                    <th>Método</th>
                                    <th style={{ textAlign: 'right' }}>Valor</th>
                                    <th style={{ textAlign: 'right' }}>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan="8" style={{ textAlign: 'center', padding: '3rem' }}>Carregando transações...</td></tr>
                                ) : transactions.length === 0 ? (
                                    <tr>
                                        <td colSpan="8">
                                            <div className="statement-empty">
                                                <FileText size={48} color="var(--color-slate-200)" />
                                                <p>Nenhuma transação encontrada nesta carteira.</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    transactions.map(t => (
                                        <tr key={t.id} className={selectedIds.has(t.id) ? 'row-selected' : ''}>
                                            <td style={{ textAlign: 'center', width: '40px' }}>
                                                <input
                                                    type="checkbox"
                                                    className="bulk-checkbox"
                                                    checked={selectedIds.has(t.id)}
                                                    onChange={() => toggleSelectId(t.id)}
                                                />
                                            </td>
                                            <td className="td-date">
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <Calendar size={14} />
                                                    {formatDate(t.date)}
                                                </div>
                                            </td>
                                            <td className="td-target">
                                                {editingWalletTransactionId === t.id ? (
                                                    <select
                                                        autoFocus
                                                        value={t.business_unit_id || ''}
                                                        onChange={(e) => handleQuickWalletChange(t.id, e.target.value)}
                                                        onBlur={() => setEditingWalletTransactionId(null)}
                                                        onClick={(e) => e.stopPropagation()}
                                                        style={{
                                                            padding: '2px 8px',
                                                            borderRadius: '12px',
                                                            fontSize: '11px',
                                                            border: '1px solid var(--color-primary)',
                                                            outline: 'none',
                                                            maxWidth: '140px'
                                                        }}
                                                    >
                                                        <option value="">Selecione...</option>
                                                        {wallets.map(w => (
                                                            <option key={w.id} value={w.id}>
                                                                {w.name}
                                                            </option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <span
                                                        className={`badge`}
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            setEditingWalletTransactionId(t.id)
                                                        }}
                                                        style={{
                                                            fontSize: '11px',
                                                            padding: '4px 8px',
                                                            borderRadius: '12px',
                                                            backgroundColor: t.business_unit_id === 1 ? '#eff6ff' : '#f0fdf4',
                                                            color: t.business_unit_id === 1 ? '#1d4ed8' : '#15803d',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '4px',
                                                            width: 'fit-content',
                                                            cursor: 'pointer',
                                                            border: '1px solid transparent'
                                                        }}
                                                        title="Clique para alterar a carteira"
                                                        onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--color-slate-300)'}
                                                        onMouseLeave={(e) => e.currentTarget.style.borderColor = 'transparent'}
                                                    >
                                                        {t.business_unit_id === 1 ? <Briefcase size={12} /> : <User size={12} />}
                                                        {getWalletName(t.business_unit_id)}
                                                    </span>
                                                )}
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

                    {/* SENTINEL ELEMENT FOR INFINITE SCROLL */}
                    {hasMore && (
                        <div
                            ref={loadMoreRef}
                            style={{
                                height: '20px',
                                margin: '20px 0',
                                textAlign: 'center',
                                color: 'var(--color-slate-500)',
                                fontSize: '0.875rem'
                            }}
                        >
                            Carregando mais transações...
                        </div>
                    )}

                    {/* Footer com contagem total */}
                    <div className="statement-footer">
                        <span style={{ fontSize: '0.875rem', color: 'var(--color-slate-500)' }}>
                            Mostrando <strong>{transactions.length}</strong> de <strong>{totalCount}</strong> transações
                        </span>
                    </div>
                </div>

                {/* FLOATING BULK ACTION BAR */}
                {selectedIds.size > 0 && (
                    <div className="bulk-action-bar">
                        <div className="bulk-info">
                            <CheckSquare size={18} />
                            <span><strong>{selectedIds.size}</strong> transação(ões) selecionada(s)</span>
                        </div>
                        <div className="bulk-actions">
                            <button className="btn btn-outline btn-sm" onClick={() => setSelectedIds(new Set())}>
                                Cancelar
                            </button>
                            <button
                                className="btn btn-danger btn-sm"
                                onClick={handleBulkDelete}
                                disabled={bulkDeleting}
                            >
                                <Trash2 size={16} />
                                {bulkDeleting ? 'Excluindo...' : `Excluir ${selectedIds.size}`}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {
                isEditModalOpen && (
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
                )
            }

            {
                isCreateModalOpen && (
                    <FinanceQuickActionModal
                        onClose={() => setIsCreateModalOpen(false)}
                        onSuccess={() => {
                            setIsCreateModalOpen(false)
                            fetchTransactions()
                        }}
                    />
                )
            }

            {
                isTransferModalOpen && (
                    <TransferModal
                        wallets={wallets}
                        onClose={() => setIsTransferModalOpen(false)}
                        onSuccess={() => {
                            setIsTransferModalOpen(false)
                            fetchTransactions()
                        }}
                    />
                )
            }
        </div >
    )
}
