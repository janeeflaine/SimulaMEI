import { useState, useEffect } from 'react'
import './FinanceQuickActionModal.css'

export default function FinanceQuickActionModal({ onClose, onSuccess }) {
    const [step, setStep] = useState(1) // 1: Target (PF/PJ), 2: Type (Receita/Despesa), 3: Form
    const [formData, setFormData] = useState({
        target: '', // PERSONAL, BUSINESS
        type: '', // RECEITA, DESPESA
        amount: '',
        date: new Date().toISOString().split('T')[0],
        categoryId: '',
        paymentMethod: 'Dinheiro',
        description: '',
        isRecurring: false,
        isSubscription: false
    })
    const [categories, setCategories] = useState([])
    const [loading, setLoading] = useState(false)
    const [isAddingCategory, setIsAddingCategory] = useState(false)
    const [newCategoryName, setNewCategoryName] = useState('')

    useEffect(() => {
        if (step === 3) {
            fetchCategories()
        }
    }, [step])

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
        }
    }

    const handleQuickAddCategory = async () => {
        if (!newCategoryName.trim()) return
        try {
            const token = localStorage.getItem('token')
            // Determine type based on current target/type
            // RECEITA -> RECEITA
            // DESPESA + BUSINESS -> DESPESA_MEI
            // DESPESA + PERSONAL -> DESPESA_PESSOAL
            const catType = formData.type === 'RECEITA'
                ? 'RECEITA'
                : formData.target === 'BUSINESS' ? 'DESPESA_MEI' : 'DESPESA_PESSOAL'

            const res = await fetch('/api/finance/categories', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ name: newCategoryName, type: catType })
            })

            if (res.ok) {
                const newCat = await res.json()
                setCategories([...categories, newCat])
                setFormData({ ...formData, categoryId: newCat.id })
                setIsAddingCategory(false)
                setNewCategoryName('')
            } else {
                alert('Erro ao criar categoria')
            }
        } catch (err) {
            console.error(err)
            alert('Erro de conexão')
        }
    }

    const handleNext = (field, value) => {
        setFormData({ ...formData, [field]: value })
        setStep(step + 1)
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setLoading(true)
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/finance/transactions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(formData)
            })

            if (res.ok) {
                alert('Lançamento salvo com sucesso!')
                onSuccess()
            } else {
                const data = await res.json()
                alert(`Erro: ${data.message || 'Falha ao salvar'}`)
            }
        } catch (err) {
            console.error(err)
            alert('Erro de conexão ao salvar transação.')
        } finally {
            setLoading(false)
        }
    }

    const renderStep = () => {
        switch (step) {
            case 1:
                return (
                    <div className="modal-step">
                        <h3>O lançamento é para quem?</h3>
                        <div className="selection-grid">
                            <button className="selection-card" onClick={() => handleNext('target', 'PERSONAL')}>
                                <span className="icon">👤</span>
                                <strong>Pessoa Física</strong>
                                <small>Gastos e ganhos pessoais</small>
                            </button>
                            <button className="selection-card" onClick={() => handleNext('target', 'BUSINESS')}>
                                <span className="icon">🏢</span>
                                <strong>Pessoa Jurídica</strong>
                                <small>Movimentações do seu MEI</small>
                            </button>
                        </div>
                    </div>
                )
            case 2:
                return (
                    <div className="modal-step">
                        <button className="back-btn" onClick={() => setStep(1)}>← Voltar</button>
                        <h3>O que deseja registrar?</h3>
                        <div className="selection-grid">
                            <button className="selection-card card-receita" onClick={() => handleNext('type', 'RECEITA')}>
                                <span className="icon">💰</span>
                                <strong>Receita</strong>
                                <small>Dinheiro entrando</small>
                            </button>
                            <button className="selection-card card-despesa" onClick={() => handleNext('type', 'DESPESA')}>
                                <span className="icon">💸</span>
                                <strong>Despesa</strong>
                                <small>Dinheiro saindo</small>
                            </button>
                        </div>
                    </div>
                )
            case 3:
                const title = formData.type === 'RECEITA'
                    ? 'Adicionar Receita'
                    : formData.target === 'BUSINESS'
                        ? 'Adicionar Despesa da Empresa'
                        : 'Adicionar Despesa Pessoal'

                return (
                    <form className="modal-step" onSubmit={handleSubmit}>
                        <button type="button" className="back-btn" onClick={() => setStep(2)}>← Voltar</button>
                        <header className="form-header">
                            <h3>{title}</h3>
                            <div className="badge-setup">
                                <span className={`type-badge ${formData.type.toLowerCase()}`}>{formData.type === 'RECEITA' ? 'Entrada' : 'Saída'}</span>
                                <span className="target-badge">{formData.target === 'BUSINESS' ? 'PJ' : 'PF'}</span>
                            </div>
                        </header>

                        <div className="form-grid">
                            <div className="form-group">
                                <label>Valor</label>
                                <div className="input-prefix">
                                    <span>R$</span>
                                    <input
                                        type="number"
                                        step="0.01"
                                        required
                                        value={formData.amount}
                                        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                                        placeholder="0,00"
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Data</label>
                                <input
                                    type="date"
                                    required
                                    value={formData.date}
                                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                />
                            </div>

                            <div className="form-group">
                                <label className="flex justify-between">
                                    Categoria
                                    {!isAddingCategory && (
                                        <button
                                            type="button"
                                            className="quick-add-btn"
                                            onClick={() => setIsAddingCategory(true)}
                                        >
                                            + Nova
                                        </button>
                                    )}
                                </label>
                                {isAddingCategory ? (
                                    <div className="quick-add-field">
                                        <input
                                            autoFocus
                                            type="text"
                                            placeholder="Nome da categoria"
                                            value={newCategoryName}
                                            onChange={(e) => setNewCategoryName(e.target.value)}
                                        />
                                        <button type="button" onClick={handleQuickAddCategory}>✅</button>
                                        <button type="button" onClick={() => setIsAddingCategory(false)}>❌</button>
                                    </div>
                                ) : (
                                    <select
                                        required
                                        value={formData.categoryId}
                                        onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                                    >
                                        <option value="">Selecione uma categoria</option>
                                        {categories.map(c => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                )}
                            </div>

                            <div className="form-group">
                                <label>Forma de Pagamento</label>
                                <select
                                    value={formData.paymentMethod}
                                    onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                                >
                                    <option value="Dinheiro">Dinheiro</option>
                                    <option value="PIX">PIX</option>
                                    <option value="Cartão de Débito">Cartão de Débito</option>
                                    <option value="Cartão de Crédito">Cartão de Crédito</option>
                                    <option value="Boleto">Boleto</option>
                                </select>
                            </div>

                            <div className="form-group full-width">
                                <label>Descrição</label>
                                <textarea
                                    rows="2"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="Descrição da transação"
                                />
                            </div>

                            <div className="form-checkboxes">
                                <label className="checkbox-item">
                                    <input
                                        type="checkbox"
                                        checked={formData.isRecurring}
                                        onChange={(e) => setFormData({ ...formData, isRecurring: e.target.checked })}
                                    />
                                    <span>Esta transação é recorrente</span>
                                </label>
                                <label className="checkbox-item">
                                    <input
                                        type="checkbox"
                                        checked={formData.isSubscription}
                                        onChange={(e) => setFormData({ ...formData, isSubscription: e.target.checked })}
                                    />
                                    <span>Assinatura (gerar alertas mensais)</span>
                                </label>
                            </div>
                        </div>

                        <button type="submit" className={`btn btn-submit ${formData.type.toLowerCase()}`} disabled={loading}>
                            {loading ? 'Salvando...' : formData.type === 'RECEITA' ? 'Salvar Receita' : 'Salvar Despesa'}
                        </button>
                    </form>
                )
            default:
                return null
        }
    }

    return (
        <div className="finance-modal-overlay">
            <div className="finance-modal-content">
                <button className="close-x" onClick={onClose}>×</button>
                {renderStep()}
            </div>
        </div>
    )
}
