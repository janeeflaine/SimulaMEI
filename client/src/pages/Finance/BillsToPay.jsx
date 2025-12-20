import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import FeatureLock from '../../components/FeatureLock'
import './FinanceCategories.css' // Reuse some styles or create new ones

export default function BillsToPay() {
    const { user } = useAuth()
    const [bills, setBills] = useState([])
    const [loading, setLoading] = useState(true)
    const isOuro = user?.plan === 'Ouro' || Number(user?.planId) === 3 || user?.isInTrial

    useEffect(() => {
        if (isOuro) {
            fetchBills()
        }
    }, [isOuro])

    const fetchBills = async () => {
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/finance/transactions', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (res.ok) {
                const data = await res.json()
                // Filter only pending transactions
                setBills(data.filter(t => t.status === 'PENDING'))
            }
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    const handleConfirm = async (id) => {
        if (!confirm('Confirmar o pagamento deste boleto hoje?')) return
        try {
            const token = localStorage.getItem('token')
            const res = await fetch(`/api/finance/transactions/${id}/confirm`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (res.ok) {
                alert('Pagamento confirmado!')
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
        return new Date(dateString).toLocaleDateString('pt-BR')
    }

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
                <header className="page-header">
                    <div>
                        <h1>Contas a Pagar</h1>
                        <p className="text-secondary">Boletos e compromissos aguardando confirmação</p>
                    </div>
                </header>

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
                                            <td style={{ fontWeight: 'bold', color: new Date(bill.dueDate) < new Date() ? '#ef4444' : 'inherit' }}>
                                                {formatDate(bill.dueDate)}
                                                {new Date(bill.dueDate) < new Date() && <span style={{ fontSize: '10px', display: 'block', color: '#ef4444' }}>VENCIDO</span>}
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
                                                    onClick={() => handleConfirm(bill.id)}
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
        </div>
    )
}
