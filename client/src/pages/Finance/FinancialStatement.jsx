import { useState, useEffect, useMemo, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import FeatureLock from '../../components/FeatureLock'
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
    Wallet // Ícone novo para Carteira
} from 'lucide-react'
import FinanceQuickActionModal from '../../components/FinanceQuickActionModal'
import TransferModal from '../../components/TransferModal'
import './FinancialStatement.css'

export default function FinancialStatement() {
    const { user } = useAuth()
    const [transactions, setTransactions] = useState([])
    const [loading, setLoading] = useState(true)
    const [isEditModalOpen, setIsEditModalOpen] = useState(false)
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
    const [editingTransaction, setEditingTransaction] = useState(null)

    // --- MUDANÇA 1: Estado do filtro atualizado para usar walletId (ID da Carteira) ---
    const [filters, setFilters] = useState({
        search: '',
        type: 'ALL',
        walletId: 'ALL', // Novo filtro de Carteira
        dateStart: '',
        dateEnd: ''
    })


    // --- INFINITE SCROLL ---
    const [visibleCount, setVisibleCount] = useState(15)
    const loadMoreRef = useRef(null)

    const [wallets, setWallets] = useState([])
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false)

    useEffect(() => {
        fetchTransactions()
        fetchWallets()
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

    const fetchTransactions = async () => {
        try {
            const token = localStorage.getItem('token')

            const res = await fetch('/api/finance/transactions', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
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

    // --- MUDANÇA 3: Lógica de Filtragem atualizada ---
    const filteredTransactions = useMemo(() => {
        return transactions.filter(t => {
            const matchSearch = t.description?.toLowerCase().includes(filters.search.toLowerCase()) ||
                t.categoryName?.toLowerCase().includes(filters.search.toLowerCase())

            const matchType = filters.type === 'ALL' || t.type === filters.type

            // Filtro novo: Compara o ID da unidade de negocio (Carteira)
            // Se walletId for 'ALL', mostra tudo. Senão, compara o ID.
            const matchWallet = filters.walletId === 'ALL' || t.business_unit_id === Number(filters.walletId)

            let matchDate = true
            if (filters.dateStart) matchDate = matchDate && t.date >= filters.dateStart
            if (filters.dateEnd) matchDate = matchDate && t.date <= filters.dateEnd

            return matchSearch && matchType && matchWallet && matchDate
        })
    }, [transactions, filters])

    // Reset pagination when filters change
    useEffect(() => {
        setVisibleCount(15)
    }, [filters])

    // Infinite Scroll Observer
    useEffect(() => {
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                setVisibleCount(prev => prev + 15)
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
    }, [filteredTransactions])

    const paginatedTransactions = filteredTransactions.slice(0, visibleCount)

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

    if (user?.plan !== 'Ouro' && Number(user?.planId) !== 3 && !user?.isInTrial) {
        return <FeatureLock feature="Extrato Financeiro" />
    }

    return (
        <div className="financial-statement-page">
            <div className="statement-container">
                <div className="statement-header">
                    <div className="header-title">
                        <h1>Extrato Financeiro</h1>
                        <p>Visão unificada das finanças Familiares e Empresariais.</p>
                    </div>
                    <div className="header-actions">
                        {/* Botão de Transferência */}
                        <button className="btn btn-outline" onClick={() => setIsTransferModalOpen(true)}>
                            <ArrowUpCircle size={18} style={{ transform: 'rotate(45deg)' }} /> Transferir
                        </button>
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
                        <label>Carteira / Conta</label>
                        <select
                            value={filters.walletId}
                            onChange={(e) => setFilters({ ...filters, walletId: e.target.value })}
                            style={{ fontWeight: 'bold', color: filters.walletId !== 'ALL' ? 'var(--color-primary)' : 'inherit' }}
                        >
                            <option value="ALL">🏠 Visão Geral (Tudo)</option>
                            <option disabled>--- EMPRESAS ---</option>
                            {wallets.filter(w => w.type === 'PJ').map(w => (
                                <option key={w.id} value={w.id}>🏢 {w.name}</option>
                            ))}
                            <option disabled>--- PESSOAL ---</option>
                            {wallets.filter(w => w.type === 'PF').map(w => (
                                <option key={w.id} value={w.id}>👤 {w.name}</option>
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
                                    <th>Carteira</th> {/* Nova Coluna */}
                                    <th>Categoria</th>
                                    <th>Descrição</th>
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
                                                <p>Nenhuma transação encontrada nesta carteira.</p>
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
                                            {/* --- MUDANÇA 5: Exibição da Carteira na linha --- */}
                                            <td className="td-target">
                                                <span className={`badge`} style={{
                                                    fontSize: '11px',
                                                    padding: '4px 8px',
                                                    borderRadius: '12px',
                                                    backgroundColor: t.business_unit_id === 1 ? '#eff6ff' : '#f0fdf4',
                                                    color: t.business_unit_id === 1 ? '#1d4ed8' : '#15803d',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    width: 'fit-content'
                                                }}>
                                                    {t.business_unit_id === 1 ? <Briefcase size={12} /> : <User size={12} />}
                                                    {getWalletName(t.business_unit_id)}
                                                </span>
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
                    {visibleCount < filteredTransactions.length && (
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
                            Mostrando <strong>{Math.min(visibleCount, filteredTransactions.length)}</strong> de <strong>{filteredTransactions.length}</strong> transações
                        </span>
                    </div>
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

            {isCreateModalOpen && (
                <FinanceQuickActionModal
                    onClose={() => setIsCreateModalOpen(false)}
                    onSuccess={() => {
                        setIsCreateModalOpen(false)
                        fetchTransactions()
                    }}
                />
            )}

            {isTransferModalOpen && (
                <TransferModal
                    wallets={wallets}
                    onClose={() => setIsTransferModalOpen(false)}
                    onSuccess={() => {
                        setIsTransferModalOpen(false)
                        fetchTransactions()
                    }}
                />
            )}
        </div>
    )
}
