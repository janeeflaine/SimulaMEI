import { useState, useEffect } from 'react'
import { X, ArrowRightCircle, Wallet } from 'lucide-react'
import './TransferModal.css'

export default function TransferModal({ onClose, onSuccess, wallets }) {
    const [formData, setFormData] = useState({
        sourceWalletId: '',
        targetWalletId: '',
        amount: '',
        date: new Date().toISOString().split('T')[0],
        description: ''
    })
    const [loading, setLoading] = useState(false)

    // Pre-select first wallet if available
    useEffect(() => {
        if (wallets && wallets.length > 0 && !formData.sourceWalletId) {
            setFormData(prev => ({ ...prev, sourceWalletId: wallets[0].id }))
        }
    }, [wallets])

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (formData.sourceWalletId === formData.targetWalletId) {
            alert('A carteira de origem e destino não podem ser as mesmas.')
            return
        }
        if (!formData.amount || Number(formData.amount) <= 0) {
            alert('Digite um valor válido.')
            return
        }

        setLoading(true)
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/finance/transfers', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(formData)
            })

            if (res.ok) {
                alert('Transferência realizada com sucesso!')
                onSuccess()
            } else {
                const err = await res.json()
                alert(err.message || 'Erro ao realizar transferência.')
            }
        } catch (error) {
            console.error(error)
            alert('Erro de conexão.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="modal-overlay">
            <div className="modal-content transfer-modal">
                <div className="modal-header">
                    <h2><ArrowRightCircle size={24} className="icon-transfer" /> Nova Transferência</h2>
                    <button className="close-btn" onClick={onClose}><X size={24} /></button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        <div className="form-row">
                            <div className="form-group">
                                <label>De (Origem)</label>
                                <div className="select-wrapper">
                                    <Wallet size={18} />
                                    <select
                                        value={formData.sourceWalletId}
                                        onChange={e => setFormData({ ...formData, sourceWalletId: Number(e.target.value) })}
                                        required
                                    >
                                        <option value="">Selecione...</option>
                                        {wallets.map(w => (
                                            <option key={w.id} value={w.id}>{w.name} ({w.account_type})</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="arrow-separator">➔</div>

                            <div className="form-group">
                                <label>Para (Destino)</label>
                                <div className="select-wrapper">
                                    <Wallet size={18} />
                                    <select
                                        value={formData.targetWalletId}
                                        onChange={e => setFormData({ ...formData, targetWalletId: Number(e.target.value) })}
                                        required
                                    >
                                        <option value="">Selecione...</option>
                                        {wallets.map(w => (
                                            <option key={w.id} value={w.id} disabled={w.id === Number(formData.sourceWalletId)}>
                                                {w.name} ({w.account_type})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="form-group">
                            <label>Valor (R$)</label>
                            <input
                                type="number"
                                step="0.01"
                                min="0.01"
                                placeholder="0,00"
                                value={formData.amount}
                                onChange={e => setFormData({ ...formData, amount: e.target.value })}
                                required
                                className="input-amount"
                            />
                        </div>

                        <div className="form-group">
                            <label>Data</label>
                            <input
                                type="date"
                                value={formData.date}
                                onChange={e => setFormData({ ...formData, date: e.target.value })}
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label>Descrição (Opcional)</label>
                            <input
                                type="text"
                                placeholder="Ex: Aporte mensal, Pagamento de empréstimo..."
                                value={formData.description}
                                onChange={e => setFormData({ ...formData, description: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="modal-footer">
                        <button type="button" className="btn btn-outline" onClick={onClose}>Cancelar</button>
                        <button type="submit" className="btn btn-primary" disabled={loading}>
                            {loading ? 'Processando...' : 'Confirmar Transferência'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
