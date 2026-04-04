import { useState, useEffect } from 'react'
import { showToast } from '../utils/toast'
import './FinanceQuickActionModal.css'

export default function FinanceQuickActionModal({ onClose, onSuccess, initialData }) {
    const [step, setStep] = useState(initialData ? 4 : 1) // 1: Target (PF/PJ), 2: Type (Receita/Despesa), 3: Wallet Selection, 4: Form
    const [formData, setFormData] = useState({
        target: initialData?.target || '', // PERSONAL, BUSINESS
        type: initialData?.type || '', // RECEITA, DESPESA
        business_unit_id: initialData?.business_unit_id || '', // Wallet ID
        amount: initialData?.amount || '',
        date: initialData?.date ? initialData.date.substring(0, 10) : new Date().toLocaleDateString('sv-SE'),
        categoryId: initialData?.categoryId || '',
        paymentMethod: initialData?.paymentMethod || 'Dinheiro',
        cardId: initialData?.cardId || '',
        description: initialData?.description || '',
        dueDate: initialData?.dueDate ? initialData.dueDate.substring(0, 10) : '',
    })
    const [categories, setCategories] = useState([])
    const [cards, setCards] = useState([])
    const [wallets, setWallets] = useState([]) // New state for wallets
    const [loading, setLoading] = useState(false)
    const [isAddingCategory, setIsAddingCategory] = useState(false)
    const [isAddingCard, setIsAddingCard] = useState(false)
    const [newCategoryName, setNewCategoryName] = useState('')
    const [newCardName, setNewCardName] = useState('')

    useEffect(() => {
        if (step === 3 && wallets.length === 0) {
            fetchWallets()
        }
        if (step === 4) {
            fetchCategories()
            fetchCards()
        }
    }, [step])

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
        } catch (err) {
            console.error('Erro ao buscar carteiras:', err)
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
        } catch (err) {
            console.error('Erro ao buscar categorias:', err)
        }
    }

    const fetchCards = async () => {
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/finance/cards', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (res.ok) {
                const data = await res.json()
                setCards(data)
            }
        } catch (err) {
            console.error('Erro ao buscar cartões:', err)
        }
    }

    const handleQuickAddCard = async () => {
        if (!newCardName.trim()) return
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/finance/cards', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ name: newCardName })
            })

            if (res.ok) {
                const newCard = await res.json()
                setCards([...cards, newCard])
                setFormData({ ...formData, cardId: newCard.id })
                setIsAddingCard(false)
                setNewCardName('')
            } else {
                showToast('Erro ao criar cartão', 'error')
            }
        } catch (err) {
            console.error(err)
            showToast('Erro de conexão', 'error')
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
                showToast('Erro ao criar categoria', 'error')
            }
        } catch (err) {
            console.error(err)
            showToast('Erro de conexão', 'error')
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
            const url = initialData?.id
                ? `/api/finance/transactions/${initialData.id}`
                : '/api/finance/transactions'
            const method = initialData?.id ? 'PATCH' : 'POST'

            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(formData)
            })

            if (res.ok) {
                showToast(initialData?.id ? 'Lançamento atualizado!' : 'Lançamento salvo!', 'success')
                onSuccess()
            } else {
                const data = await res.json()
                showToast(`Erro: ${data.message || 'Falha ao processar'}`, 'error')
            }
        } catch (err) {
            console.error(err)
            showToast('Erro de conexão ao processar transação.', 'error')
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
                const filteredWallets = wallets.filter(w => {
                    if (formData.target === 'BUSINESS') return w.account_type === 'PJ'
                    return w.account_type === 'PF'
                })

                return (
                    <div className="modal-step">
                        <button className="back-btn" onClick={() => setStep(2)}>← Voltar</button>
                        <h3>De quem é a transação?</h3>
                        <div className="selection-grid wallets-grid">
                            {filteredWallets.map(wallet => (
                                <button className="selection-card wallet-card" key={wallet.id} onClick={() => handleNext('business_unit_id', wallet.id)}>
                                    <div className="wallet-avatar">
                                        {wallet.logo_url || wallet.photo_url ? (
                                            <img src={wallet.logo_url || wallet.photo_url} alt={wallet.name} />
                                        ) : (
                                            <span className="icon">
                                                {wallet.account_type === 'PJ' ? '🏢' : '👤'}
                                            </span>
                                        )}
                                    </div>
                                    <strong>{wallet.name}</strong>
                                    <small>{wallet.account_type} • {wallet.cnpj || 'Pessoal'}</small>
                                </button>
                            ))}
                        </div>
                    </div>
                )

            case 4:
                const title = formData.type === 'RECEITA'
                    ? 'Adicionar Receita'
                    : formData.target === 'BUSINESS'
                        ? 'Adicionar Despesa da Empresa'
                        : 'Adicionar Despesa Pessoal'

                return (
                    <form className="modal-step" onSubmit={handleSubmit}>
                        <button type="button" className="back-btn" onClick={() => setStep(3)}>← Voltar</button>
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
                                        {categories
                                            .filter(c => {
                                                if (formData.type === 'RECEITA') return c.type === 'RECEITA'
                                                if (formData.target === 'BUSINESS') return c.type === 'DESPESA_MEI'
                                                return c.type === 'DESPESA_PESSOAL'
                                            })
                                            .map(c => (
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
                                    <option value="Boleto">Boleto (Contas a Pagar)</option>
                                </select>
                            </div>

                            {formData.paymentMethod === 'Cartão de Crédito' && (
                                <div className="form-group">
                                    <label className="flex justify-between">
                                        Qual Cartão?
                                        {!isAddingCard && (
                                            <button
                                                type="button"
                                                className="quick-add-btn"
                                                onClick={() => setIsAddingCard(true)}
                                            >
                                                + Novo
                                            </button>
                                        )}
                                    </label>
                                    {isAddingCard ? (
                                        <div className="quick-add-field">
                                            <input
                                                autoFocus
                                                type="text"
                                                placeholder="Nome do cartão"
                                                value={newCardName}
                                                onChange={(e) => setNewCardName(e.target.value)}
                                            />
                                            <button type="button" onClick={handleQuickAddCard}>✅</button>
                                            <button type="button" onClick={() => setIsAddingCard(false)}>❌</button>
                                        </div>
                                    ) : (
                                        <select
                                            required
                                            value={formData.cardId || ''}
                                            onChange={(e) => setFormData({ ...formData, cardId: e.target.value })}
                                        >
                                            <option value="">Selecione o cartão</option>
                                            {cards.map(c => (
                                                <option key={c.id} value={c.id}>{c.name} {c.lastFour ? `(**** ${c.lastFour})` : ''}</option>
                                            ))}
                                        </select>
                                    )}
                                </div>
                            )}

                            {formData.paymentMethod === 'Boleto' && (
                                <div className="form-group">
                                    <label>Data de Vencimento</label>
                                    <input
                                        type="date"
                                        required
                                        value={formData.dueDate || ''}
                                        onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                                    />
                                </div>
                            )}

                            <div className="form-group full-width">
                                <label>Descrição</label>
                                <textarea
                                    rows="1"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="Descrição da transação"
                                />
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
