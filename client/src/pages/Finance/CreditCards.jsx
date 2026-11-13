import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { CreditCard, Plus, Pencil, Trash2, ReceiptText, ImagePlus, X } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import FeatureLock from '../../components/FeatureLock'
import CardsSummaryPanel from '../../components/cards/CardsSummaryPanel'
import Select from '../../components/ui/Select'
import { useConfirmDialog } from '../../components/ui/ConfirmDialog'
import './CreditCards.css'

const BRANDS = [
    { value: 'Visa', label: 'Visa' },
    { value: 'Mastercard', label: 'Mastercard' },
    { value: 'Elo', label: 'Elo' },
    { value: 'Amex', label: 'American Express' },
    { value: 'Outro', label: 'Outra' }
]

const brandLabel = (brand) => {
    if (!brand || brand === 'Outro') return ''
    return BRANDS.find(b => b.value === brand)?.label || brand
}

const defaultFormData = { name: '', lastFour: '', brand: 'Visa', closingDay: '', dueDate: '', imageUrl: '', business_unit_id: '' }

export default function CreditCards() {
    const navigate = useNavigate()
    const { user } = useAuth()
    const { confirm, notify, dialog } = useConfirmDialog()
    const [cards, setCards] = useState([])
    const [wallets, setWallets] = useState([])
    const [loading, setLoading] = useState(true)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingCardId, setEditingCardId] = useState(null) // null = criando, número = editando
    const [formData, setFormData] = useState(defaultFormData)
    const [saving, setSaving] = useState(false)
    const [formError, setFormError] = useState('')
    const [summaryKey, setSummaryKey] = useState(0)

    const hasCartoes = user?.planFeatures?.cartoes || user?.isInTrial || user?.role === 'ADMIN'

    useEffect(() => {
        if (hasCartoes) {
            fetchCards()
            fetchWallets()
        }
    }, [hasCartoes])

    // Esc fecha a janela (se um aviso estiver por cima, o Esc é dele)
    useEffect(() => {
        if (!isModalOpen) return undefined
        const onKey = (e) => {
            if (e.key !== 'Escape' || e.defaultPrevented || saving) return
            closeModal()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [isModalOpen, saving])

    const fetchCards = async () => {
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/finance/cards', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (res.ok) {
                const data = await res.json()
                setCards(Array.isArray(data) ? data : [])
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

    const setField = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }))
        setFormError('')
    }

    const handleImageUpload = (e) => {
        const file = e.target.files[0]
        if (file) {
            const reader = new FileReader()
            reader.onloadend = () => setField('imageUrl', reader.result)
            reader.readAsDataURL(file)
        }
        e.target.value = ''
    }

    const openCreateModal = () => {
        setEditingCardId(null)
        setFormData(defaultFormData)
        setFormError('')
        setIsModalOpen(true)
    }

    const openEditModal = (card) => {
        setEditingCardId(card.id)
        setFormData({
            name: card.name || '',
            lastFour: card.lastFour || '',
            brand: card.brand || 'Visa',
            closingDay: card.closingDay || '',
            dueDate: card.dueDate || '',
            imageUrl: card.imageUrl || '',
            business_unit_id: card.business_unit_id ? String(card.business_unit_id) : ''
        })
        setFormError('')
        setIsModalOpen(true)
    }

    const closeModal = () => {
        setIsModalOpen(false)
        setEditingCardId(null)
        setFormData(defaultFormData)
        setFormError('')
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (saving) return
        setSaving(true)
        try {
            const token = localStorage.getItem('token')
            const isEditing = editingCardId !== null
            const url = isEditing ? `/api/finance/cards/${editingCardId}` : '/api/finance/cards'
            const method = isEditing ? 'PATCH' : 'POST'

            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(formData)
            })
            if (res.ok) {
                closeModal()
                fetchCards()
                setSummaryKey(k => k + 1)
            } else {
                const data = await res.json().catch(() => ({}))
                setFormError(data.message || 'Não deu para salvar o cartão. Tente de novo.')
            }
        } catch (err) {
            console.error(err)
            setFormError('Sem conexão. Verifique a internet e tente de novo.')
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async (card) => {
        const ok = await confirm({
            title: `Excluir o cartão ${card.name}?`,
            message: 'As compras feitas nele continuam no Extrato, só deixam de mostrar o cartão. As faturas enviadas desse cartão são apagadas. Isso não pode ser desfeito.',
            confirmLabel: 'Excluir cartão',
            tone: 'danger'
        })
        if (!ok) return
        try {
            const token = localStorage.getItem('token')
            const res = await fetch(`/api/finance/cards/${card.id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (res.ok) {
                fetchCards()
                setSummaryKey(k => k + 1)
            } else {
                const data = await res.json().catch(() => ({}))
                notify({ title: 'Não deu para excluir o cartão', message: data.message || 'Tente de novo em instantes.', tone: 'error' })
            }
        } catch (err) {
            console.error(err)
            notify({ title: 'Sem conexão', message: 'Não deu para excluir o cartão. Tente de novo.', tone: 'error' })
        }
    }

    const walletOptions = [
        { value: '', label: 'Sem carteira' },
        ...[
            { group: 'MEI', options: wallets.filter(w => w.account_type === 'PJ').map(w => ({ value: String(w.id), label: w.name })) },
            { group: 'Pessoal', options: wallets.filter(w => w.account_type === 'PF').map(w => ({ value: String(w.id), label: w.name })) }
        ].filter(g => g.options.length > 0)
    ]

    if (!hasCartoes) {
        return (
            <div className="container py-8">
                <FeatureLock
                    featureName="Cartões de crédito"
                    requiredPlan="Prata"
                    description="Cadastre seus cartões, acompanhe as faturas e veja quanto gastou em cada um."
                    icon={<CreditCard size={28} aria-hidden="true" />}
                />
            </div>
        )
    }

    return (
        <div className="credit-cards-page cartoes">
            <div className="cc-container">
                <header className="cc-head">
                    <div>
                        <h1 className="cc-title">Cartões</h1>
                        <p className="cc-sub">Fechamento, vencimento e gastos de cada cartão de crédito.</p>
                    </div>
                    <button type="button" className="btn btn-primary" onClick={openCreateModal}>
                        <Plus size={18} aria-hidden="true" /> Novo cartão
                    </button>
                </header>

                {loading ? (
                    <p className="cc-loading">Carregando cartões…</p>
                ) : cards.length === 0 ? (
                    <div className="cc-empty">
                        <span className="cc-empty__icon" aria-hidden="true"><CreditCard size={26} /></span>
                        <h2>Nenhum cartão cadastrado</h2>
                        <p>Cadastre um cartão para lançar compras nele e acompanhar as faturas.</p>
                        <button type="button" className="btn btn-primary" onClick={openCreateModal}>
                            <Plus size={18} aria-hidden="true" /> Cadastrar cartão
                        </button>
                    </div>
                ) : (
                    <ul className="cc-grid">
                        {cards.map(card => {
                            const brand = brandLabel(card.brand)
                            const isPJ = card.walletType === 'PJ'
                            return (
                                <li key={card.id} className="cc-item">
                                    <button
                                        type="button"
                                        className={`cc-plastic ${card.imageUrl ? 'has-image' : ''}`}
                                        style={card.imageUrl ? { backgroundImage: `url("${String(card.imageUrl).replace(/["\\\n]/g, '')}")` } : undefined}
                                        onClick={() => navigate(`/financas/cartoes/${card.id}`)}
                                        aria-label={`Abrir as faturas do cartão ${card.name}`}
                                    >
                                        <span className="cc-plastic__top">
                                            <span className="cc-plastic__name">{card.name}</span>
                                            {brand && <span className="cc-plastic__brand">{brand}</span>}
                                        </span>
                                        <span className="cc-plastic__chip" aria-hidden="true" />
                                        <span className="cc-plastic__number">
                                            {card.lastFour ? `•••• ${card.lastFour}` : 'Final não informado'}
                                        </span>
                                    </button>

                                    <div className="cc-meta">
                                        <p className="cc-wallet">
                                            {card.walletName ? (
                                                <>
                                                    <span className="cc-tag">{isPJ ? 'MEI' : 'Pessoal'}</span>
                                                    <span className="cc-wallet__name">{card.walletName}</span>
                                                </>
                                            ) : (
                                                <span className="cc-tag cc-tag--warn">Sem carteira</span>
                                            )}
                                        </p>
                                        <dl className="cc-days">
                                            <div>
                                                <dt>Fecha</dt>
                                                <dd>dia {card.closingDay}</dd>
                                            </div>
                                            <div>
                                                <dt>Vence</dt>
                                                <dd>dia {card.dueDate}</dd>
                                            </div>
                                        </dl>
                                    </div>

                                    <div className="cc-actions">
                                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate(`/financas/cartoes/${card.id}`)}>
                                            <ReceiptText size={16} aria-hidden="true" /> Ver faturas
                                        </button>
                                        <button type="button" className="cc-icon-btn" onClick={() => openEditModal(card)} aria-label={`Editar o cartão ${card.name}`} title="Editar">
                                            <Pencil size={18} aria-hidden="true" />
                                        </button>
                                        <button type="button" className="cc-icon-btn cc-icon-btn--danger" onClick={() => handleDelete(card)} aria-label={`Excluir o cartão ${card.name}`} title="Excluir">
                                            <Trash2 size={18} aria-hidden="true" />
                                        </button>
                                    </div>
                                </li>
                            )
                        })}
                    </ul>
                )}

                {!loading && cards.length > 0 && <CardsSummaryPanel key={summaryKey} />}
            </div>

            {isModalOpen && (
                <div className="cd-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) closeModal() }}>
                    <form
                        className="cd-box cc-box"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="cc-form-title"
                        onSubmit={handleSubmit}
                    >
                        <h2 id="cc-form-title" className="cd-title">{editingCardId ? 'Editar cartão' : 'Novo cartão'}</h2>
                        <p className="cd-message">O fechamento decide em qual fatura cada compra entra.</p>

                        <label className="cc-field">
                            <span>Nome do cartão</span>
                            <input
                                type="text"
                                required
                                autoFocus
                                value={formData.name}
                                onChange={e => setField('name', e.target.value)}
                                placeholder="Ex.: Nubank, Inter PJ"
                            />
                        </label>

                        <div className="cc-field">
                            <label htmlFor="cc-wallet">Carteira</label>
                            <Select
                                id="cc-wallet"
                                ariaLabel="Carteira"
                                value={formData.business_unit_id}
                                onChange={(v) => setField('business_unit_id', String(v))}
                                options={walletOptions}
                            />
                            <small>As compras das faturas desse cartão entram nessa carteira.</small>
                        </div>

                        <div className="cc-grid-2">
                            <label className="cc-field">
                                <span>Final do cartão <em>(opcional)</em></span>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    maxLength="4"
                                    value={formData.lastFour}
                                    onChange={e => setField('lastFour', e.target.value.replace(/\D/g, '').slice(0, 4))}
                                    placeholder="1234"
                                />
                            </label>
                            <div className="cc-field">
                                <label htmlFor="cc-brand">Bandeira</label>
                                <Select
                                    id="cc-brand"
                                    ariaLabel="Bandeira"
                                    value={formData.brand}
                                    onChange={(v) => setField('brand', v)}
                                    options={BRANDS}
                                />
                            </div>
                            <label className="cc-field">
                                <span>Dia do fechamento</span>
                                <input
                                    type="number"
                                    inputMode="numeric"
                                    min="1"
                                    max="31"
                                    required
                                    value={formData.closingDay}
                                    onChange={e => setField('closingDay', e.target.value)}
                                    placeholder="Ex.: 5"
                                />
                            </label>
                            <label className="cc-field">
                                <span>Dia do vencimento</span>
                                <input
                                    type="number"
                                    inputMode="numeric"
                                    min="1"
                                    max="31"
                                    required
                                    value={formData.dueDate}
                                    onChange={e => setField('dueDate', e.target.value)}
                                    placeholder="Ex.: 12"
                                />
                            </label>
                        </div>

                        <div className="cc-field cc-photo">
                            <span className="cc-photo__label">Imagem do cartão <em>(opcional)</em></span>
                            <div className="cc-photo__row">
                                <span className={`cc-photo__preview ${formData.imageUrl ? 'has-image' : ''}`} aria-hidden="true">
                                    {formData.imageUrl ? <img src={formData.imageUrl} alt="" /> : <CreditCard size={22} />}
                                </span>
                                <label className="cc-photo__btn">
                                    <ImagePlus size={16} aria-hidden="true" />
                                    {formData.imageUrl ? 'Trocar imagem' : 'Escolher imagem'}
                                    <input type="file" accept="image/*" onChange={handleImageUpload} />
                                </label>
                                {formData.imageUrl && (
                                    <button type="button" className="cc-photo__remove" onClick={() => setField('imageUrl', '')}>
                                        <X size={16} aria-hidden="true" /> Remover
                                    </button>
                                )}
                            </div>
                        </div>

                        {formError && <p className="cc-notice" role="alert">{formError}</p>}

                        <div className="cd-actions">
                            <button type="button" className="cd-btn" onClick={closeModal} disabled={saving}>Cancelar</button>
                            <button type="submit" className="cd-btn cd-btn--primary" disabled={saving}>
                                {saving ? 'Salvando…' : editingCardId ? 'Salvar alterações' : 'Salvar cartão'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {dialog}
        </div>
    )
}
