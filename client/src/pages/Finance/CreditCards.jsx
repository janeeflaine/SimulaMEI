import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import FeatureLock from '../../components/FeatureLock'
import './CreditCards.css'

export default function CreditCards() {
    const { user } = useAuth()
    const [cards, setCards] = useState([])
    const [loading, setLoading] = useState(true)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [formData, setFormData] = useState({
        name: '',
        lastFour: '',
        brand: 'Visa',
        closingDay: '',
        dueDate: '',
        imageUrl: ''
    })

    const isOuro = user?.plan === 'Ouro' || Number(user?.planId) === 3 || user?.isInTrial

    useEffect(() => {
        if (isOuro) {
            fetchCards()
        }
    }, [isOuro])

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
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    const handleImageUpload = (e) => {
        const file = e.target.files[0]
        if (file) {
            const reader = new FileReader()
            reader.onloadend = () => {
                setFormData({ ...formData, imageUrl: reader.result })
            }
            reader.readAsDataURL(file)
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/finance/cards', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(formData)
            })
            if (res.ok) {
                setIsModalOpen(false)
                setFormData({ name: '', lastFour: '', brand: 'Visa', closingDay: '', dueDate: '', imageUrl: '' })
                fetchCards()
            }
        } catch (err) {
            console.error(err)
        }
    }

    const handleDelete = async (id) => {
        if (!confirm('Excluir este cartão? Todas as despesas vinculadas perderão a referência.')) return
        try {
            const token = localStorage.getItem('token')
            const res = await fetch(`/api/finance/cards/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (res.ok) {
                fetchCards()
            }
        } catch (err) {
            console.error(err)
        }
    }

    if (!isOuro) {
        return (
            <div className="container py-8">
                <FeatureLock
                    featureName="Gestão de Cartões"
                    requiredPlan="Ouro"
                    description="Controle todos os seus cartões de crédito em um só lugar, com acompanhamento de faturas e datas de vencimento."
                    icon="💳"
                />
            </div>
        )
    }

    return (
        <div className="credit-cards-page">
            <div className="container">
                <header className="page-header">
                    <div>
                        <h1>Seus Cartões de Crédito</h1>
                        <p className="text-secondary">Gerencie limites e vencimentos das suas faturas</p>
                    </div>
                    <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
                        ➕ Novo Cartão
                    </button>
                </header>

                {loading ? (
                    <div className="text-center py-8">Carregando...</div>
                ) : cards.length === 0 ? (
                    <div className="empty-state">
                        <span className="empty-icon">💳</span>
                        <h3>Nenhum cartão cadastrado</h3>
                        <p>Adicione seu primeiro cartão para começar a organizar suas despesas fixas.</p>
                        <button className="btn btn-outline" onClick={() => setIsModalOpen(true)}>Cadastrar Agora</button>
                    </div>
                ) : (
                    <div className="cards-grid">
                        {cards.map(card => (
                            <div key={card.id} className="card-item">
                                <div className="card-visual" style={{
                                    backgroundImage: card.imageUrl ? `url(${card.imageUrl})` : 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                                    backgroundColor: '#1e293b'
                                }}>
                                    <div className="card-brand">{card.brand}</div>
                                    <div className="card-number">**** **** **** {card.lastFour || '0000'}</div>
                                    <div className="card-holder">{card.name}</div>
                                </div>
                                <div className="card-info">
                                    <div className="info-row">
                                        <span>Fechamento:</span>
                                        <strong>Dia {card.closingDay}</strong>
                                    </div>
                                    <div className="info-row">
                                        <span>Vencimento:</span>
                                        <strong>Dia {card.dueDate}</strong>
                                    </div>
                                    <button className="btn-delete" onClick={() => handleDelete(card.id)}>Excluir</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {isModalOpen && (
                    <div className="modal-overlay">
                        <div className="modal-content">
                            <button className="close-x" onClick={() => setIsModalOpen(false)}>×</button>
                            <h3>Novo Cartão de Crédito</h3>
                            <form onSubmit={handleSubmit}>
                                <div className="form-group">
                                    <label>Apelido do Cartão (ex: Nubank PJ)</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        placeholder="Nome para identificação"
                                    />
                                </div>
                                <div className="form-grid">
                                    <div className="form-group">
                                        <label>Últimos 4 Dígitos</label>
                                        <input
                                            type="text"
                                            maxLength="4"
                                            value={formData.lastFour}
                                            onChange={e => setFormData({ ...formData, lastFour: e.target.value })}
                                            placeholder="1234"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Bandeira</label>
                                        <select
                                            value={formData.brand}
                                            onChange={e => setFormData({ ...formData, brand: e.target.value })}
                                        >
                                            <option value="Visa">Visa</option>
                                            <option value="Mastercard">Mastercard</option>
                                            <option value="Elo">Elo</option>
                                            <option value="Amex">American Express</option>
                                            <option value="Outro">Outro</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>Dia Fechamento</label>
                                        <input
                                            type="number"
                                            min="1" max="31"
                                            required
                                            value={formData.closingDay}
                                            onChange={e => setFormData({ ...formData, closingDay: e.target.value })}
                                            placeholder="Ex: 5"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Dia Vencimento</label>
                                        <input
                                            type="number"
                                            min="1" max="31"
                                            required
                                            value={formData.dueDate}
                                            onChange={e => setFormData({ ...formData, dueDate: e.target.value })}
                                            placeholder="Ex: 12"
                                        />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Imagem do Cartão (Opcional)</label>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={handleImageUpload}
                                    />
                                    {formData.imageUrl && (
                                        <div className="image-preview">
                                            <img src={formData.imageUrl} alt="Preview" style={{ width: '100px', marginTop: '10px', borderRadius: '8px' }} />
                                        </div>
                                    )}
                                </div>
                                <button type="submit" className="btn btn-primary w-full mt-4">Salvar Cartão</button>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
