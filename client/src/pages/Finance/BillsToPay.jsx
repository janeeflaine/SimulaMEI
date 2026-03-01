import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import FeatureLock from '../../components/FeatureLock'
import './FinanceCategories.css'

export default function BillsToPay() {
    const { user } = useAuth()
    const [bills, setBills] = useState([])
    const [wallets, setWallets] = useState([])
    const [loading, setLoading] = useState(true)
    const [confirmModal, setConfirmModal] = useState(null) // { id, description, amount }
    const [selectedWallet, setSelectedWallet] = useState('')
    const isOuro = user?.plan === 'Ouro' || Number(user?.planId) === 3 || user?.isInTrial

    useEffect(() => {
        if (isOuro) {
            fetchBills()
            fetchWallets()
        }
    }, [isOuro])

    const fetchBills = async () => {
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/finance/transactions?limit=9999', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (res.ok) {
                const response = await res.json()
                // Backend returns { data: [...], totalCount, ... } — extract the array
                const data = Array.isArray(response.data) ? response.data : Array.isArray(response) ? response : []
                const pendingBills = data.filter(t => t.status === 'PENDING')
                // Ordenar por data de vencimento (as mais próximas primeiro -> crescente)
                pendingBills.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
                setBills(pendingBills)
            }
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    const fetchWallets = async () => {
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/finance/business-units', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (res.ok) {
                const data = await res.json()
                setWallets(Array.isArray(data) ? data : [])
            }
        } catch (err) {
            console.error(err)
        }
    }

    const openConfirmModal = (bill) => {
        setConfirmModal(bill)
        setSelectedWallet(bill.business_unit_id ? String(bill.business_unit_id) : '')
    }

    const handleConfirm = async () => {
        if (!confirmModal) return
        if (!selectedWallet) {
            alert('Selecione de qual carteira o dinheiro saiu.')
            return
        }
        try {
            const token = localStorage.getItem('token')
            const res = await fetch(`/api/finance/transactions/${confirmModal.id}/confirm`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ business_unit_id: selectedWallet })
            })
            if (res.ok) {
                setConfirmModal(null)
                setSelectedWallet('')
                fetchBills()
            }
        } catch (err) {
            console.error(err)
            alert('Erro ao confirmar pagamento.')
        }
    }

    const formatCurrency = (value) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
    }

    const formatDate = (dateString) => {
        if (!dateString) return '-'
        if (typeof dateString === 'string' && dateString.length === 10) {
            const [year, month, day] = dateString.split('-')
            return `${day}/${month}/${year}`
        }
        return new Date(dateString).toLocaleDateString('pt-BR')
    }

    const todayString = new Date().toLocaleDateString('sv-SE')

    if (!isOuro) {
        return (
            <div className="container py-8">
                <FeatureLock
                    featureName="Contas a Pagar (Boletos)"
                    requiredPlan="Ouro"
                    description="Nunca mais esqueça um vencimento. Gerencie seus boletos e contas futuras de forma organizada e eficiente."
                    icon="📄"
                />
            </div>
        )
    }

    return (
        <div className="finance-categories-page">
            <div className="container">
                <div className="statement-header">
                    <div className="header-title">
                        <h1>Contas a Pagar</h1>
                        <p>Boletos e compromissos aguardando confirmação</p>
                    </div>
                </div>

                <div className="section" style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
                    {loading ? (
                        <div className="text-center py-8">Carregando...</div>
                    ) : bills.length === 0 ? (
                        <div className="empty-state">
                            <span className="empty-icon">📄</span>
                            <h3>Tudo em dia!</h3>
                            <p>Você não possui boletos pendentes no momento.</p>
                        </div>
                    ) : (
                        <div className="table-container">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Vencimento</th>
                                        <th>Descrição</th>
                                        <th>Método</th>
                                        <th>Categoria</th>
                                        <th>Destino</th>
                                        <th>Valor</th>
                                        <th>Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {bills.map((bill) => (
                                        <tr key={bill.id}>
                                            <td style={{ fontWeight: 'bold', color: bill.dueDate < todayString ? '#ef4444' : bill.dueDate === todayString ? '#d97706' : 'inherit' }}>
                                                {formatDate(bill.dueDate)}
                                                {bill.dueDate < todayString && <span style={{ fontSize: '10px', display: 'block', color: '#ef4444', fontWeight: 700 }}>🚨 VENCIDO</span>}
                                                {bill.dueDate === todayString && <span style={{ fontSize: '10px', display: 'block', color: '#d97706', fontWeight: 700 }}>📅 VENCE HOJE</span>}
                                            </td>
                                            <td>{bill.description || 'S/ Descrição'}</td>
                                            <td>
                                                {bill.paymentMethod}
                                                {bill.cardName && <small style={{ display: 'block', color: '#64748b' }}>{bill.cardName}</small>}
                                            </td>
                                            <td>{bill.categoryName || 'S/ Categoria'}</td>
                                            <td>
                                                <span className="badge badge-info" style={{ backgroundColor: '#f1f5f9', color: '#475569' }}>
                                                    {bill.target === 'BUSINESS' ? '🏢 PJ' : '👤 PF'}
                                                </span>
                                            </td>
                                            <td style={{ fontWeight: 'bold' }}>{formatCurrency(bill.amount)}</td>
                                            <td>
                                                <button
                                                    onClick={() => openConfirmModal(bill)}
                                                    className="btn btn-primary btn-sm"
                                                    style={{ backgroundColor: '#10b981', borderColor: '#10b981' }}
                                                >
                                                    Confirmar Pagamento
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* Payment Confirmation Modal */}
            {confirmModal && (
                <div className="modal-overlay" style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)'
                }}>
                    <div style={{
                        background: 'white', padding: '30px', borderRadius: '20px',
                        width: '100%', maxWidth: '460px', position: 'relative',
                        boxShadow: '0 20px 50px rgba(0,0,0,0.2)'
                    }}>
                        <button
                            onClick={() => { setConfirmModal(null); setSelectedWallet('') }}
                            style={{
                                position: 'absolute', top: '15px', right: '15px',
                                background: 'none', border: 'none', fontSize: '1.5rem',
                                cursor: 'pointer', color: '#94a3b8'
                            }}
                        >×</button>

                        <h3 style={{ marginBottom: '8px', fontSize: '1.25rem', fontWeight: 700 }}>
                            💰 Confirmar Pagamento
                        </h3>
                        <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '20px' }}>
                            {confirmModal.description || 'Pagamento'} — <strong>{formatCurrency(confirmModal.amount)}</strong>
                        </p>

                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', fontWeight: 600, marginBottom: '8px', fontSize: '0.9rem' }}>
                                De qual conta/carteira o dinheiro saiu?
                            </label>
                            <select
                                value={selectedWallet}
                                onChange={e => setSelectedWallet(e.target.value)}
                                style={{
                                    width: '100%', padding: '10px 12px', borderRadius: '10px',
                                    border: '1px solid #e2e8f0', fontSize: '0.95rem',
                                    background: '#f8fafc'
                                }}
                            >
                                <option value="">Selecione uma carteira</option>
                                <optgroup label="🏢 EMPRESA (PJ)">
                                    {wallets.filter(w => w.account_type === 'PJ').map(w => (
                                        <option key={w.id} value={w.id}>🏢 {w.name}</option>
                                    ))}
                                </optgroup>
                                <optgroup label="👤 PESSOAL (PF)">
                                    {wallets.filter(w => w.account_type === 'PF').map(w => (
                                        <option key={w.id} value={w.id}>👤 {w.name}</option>
                                    ))}
                                </optgroup>
                            </select>
                        </div>

                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button
                                onClick={() => { setConfirmModal(null); setSelectedWallet('') }}
                                className="btn btn-outline"
                                style={{ flex: 1 }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleConfirm}
                                className="btn btn-primary"
                                style={{ flex: 1, backgroundColor: '#10b981', borderColor: '#10b981' }}
                            >
                                ✅ Confirmar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
