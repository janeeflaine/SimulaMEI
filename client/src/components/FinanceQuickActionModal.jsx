import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, X, User, Building2, ArrowDownLeft, ArrowUpRight, ChevronRight, Plus } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { showToast } from '../utils/toast'
import Select from './ui/Select'
import './ui/ConfirmDialog.css'
import './FinanceQuickActionModal.css'

// Máscara de CPF (PF) ou CNPJ (PJ) enquanto a pessoa digita
const maskDocument = (value, accountType) => {
    const n = value.replace(/\D/g, '')
    if (accountType === 'PJ') {
        return n
            .replace(/^(\d{2})(\d)/, '$1.$2')
            .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
            .replace(/\.(\d{3})(\d)/, '.$1/$2')
            .replace(/(\d{4})(\d)/, '$1-$2')
            .slice(0, 18)
    }
    return n
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
        .slice(0, 14)
}

// name: null = ainda não mexeu (usa a sugestão); string = o que a pessoa digitou
const EMPTY_NEW_WALLET = { name: null, document: '' }

const TOTAL_STEPS = 4

// Uma linha de escolha: ícone, título, detalhe e seta
function Option({ icon, tone, title, detail, onClick, badge, extraClass = '' }) {
    return (
        <button type="button" className={`nl-option ${extraClass}`} onClick={onClick}>
            <span className={`nl-option__icon ${tone ? `nl-option__icon--${tone}` : ''}`} aria-hidden="true">{icon}</span>
            <span className="nl-option__text">
                <strong>{title}{badge}</strong>
                <small>{detail}</small>
            </span>
            <ChevronRight className="nl-option__go" size={18} aria-hidden="true" />
        </button>
    )
}

export default function FinanceQuickActionModal({ onClose, onSuccess, onWalletCreated, initialData }) {
    const { user } = useAuth()
    const isEditing = Boolean(initialData?.id)
    const [step, setStep] = useState(initialData ? 4 : 1) // 1: Para quem (PF/PJ), 2: Receita/Despesa, 3: Carteira, 4: Formulário
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
    const [wallets, setWallets] = useState([])
    const [walletsStatus, setWalletsStatus] = useState('idle') // idle | loading | ready | error
    const [loading, setLoading] = useState(false)
    const [isAddingCategory, setIsAddingCategory] = useState(false)
    const [isAddingCard, setIsAddingCard] = useState(false)
    const [newCategoryName, setNewCategoryName] = useState('')
    const [newCardName, setNewCardName] = useState('')
    // Criar carteira sem sair do lançamento (passo 3)
    const [isCreatingWallet, setIsCreatingWallet] = useState(false)
    const [newWallet, setNewWallet] = useState(EMPTY_NEW_WALLET)
    const [walletError, setWalletError] = useState(null) // { message, limit }
    const [savingWallet, setSavingWallet] = useState(false)
    const [justCreatedWalletId, setJustCreatedWalletId] = useState(null)
    const [formError, setFormError] = useState('')

    // Sempre a partir do valor mais recente do formulário: criar categoria/cartão
    // é assíncrono e, sem isso, a resposta podia apagar o que foi escolhido nesse meio-tempo
    const setField = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }))
        setFormError('')
    }

    const overlayRef = useRef(null)
    const boxRef = useRef(null)
    const onCloseRef = useRef(onClose)
    onCloseRef.current = onClose

    useEffect(() => {
        if ((step === 3 || step === 4) && walletsStatus === 'idle') {
            fetchWallets()
        }
        if (step === 4) {
            fetchCategories()
            fetchCards()
        }
    }, [step])

    // Trocou PF/PJ: o formulário de carteira aberto não vale mais
    useEffect(() => {
        setIsCreatingWallet(false)
        setNewWallet(EMPTY_NEW_WALLET)
        setWalletError(null)
    }, [formData.target])

    // Trava a rolagem da página, Esc fecha e o foco volta para onde estava
    useEffect(() => {
        const previouslyFocused = document.activeElement
        const { overflow } = document.body.style
        document.body.style.overflow = 'hidden'
        const onKey = (e) => {
            if (e.key !== 'Escape') return
            // Se um aviso do site estiver aberto por cima, o Esc fecha só o aviso
            const overlays = document.querySelectorAll('.cd-overlay')
            if (overlays[overlays.length - 1] !== overlayRef.current) return
            e.preventDefault()
            onCloseRef.current()
        }
        document.addEventListener('keydown', onKey)
        return () => {
            document.removeEventListener('keydown', onKey)
            document.body.style.overflow = overflow
            if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus()
        }
    }, [])

    // A cada passo, o foco vai para o primeiro campo ou opção e a janela volta ao topo
    useEffect(() => {
        const box = boxRef.current
        if (!box) return
        box.scrollTop = 0
        const target = box.querySelector('[data-autofocus]') || box.querySelector('.nl-option')
        if (target) target.focus({ preventScroll: true })
    }, [step, isCreatingWallet, walletsStatus])

    const fetchWallets = async () => {
        setWalletsStatus('loading')
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/finance/business-units', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (res.ok) {
                const data = await res.json()
                setWallets(Array.isArray(data) ? data : [])
                setWalletsStatus('ready')
            } else {
                setWalletsStatus('error')
            }
        } catch (err) {
            console.error('Erro ao buscar carteiras:', err)
            setWalletsStatus('error')
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
                setCards(prev => [...prev, newCard])
                setField('cardId', newCard.id)
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
                setCategories(prev => [...prev, newCat])
                setField('categoryId', newCat.id)
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

    const walletTypeForTarget = formData.target === 'BUSINESS' ? 'PJ' : 'PF'
    // Sugestão de nome: na carteira pessoal, o nome da pessoa
    const suggestedWalletName = walletTypeForTarget === 'PF' ? (user?.name || '') : ''
    const newWalletName = newWallet.name ?? suggestedWalletName

    const openWalletForm = () => {
        setNewWallet(EMPTY_NEW_WALLET)
        setWalletError(null)
        setIsCreatingWallet(true)
    }

    const closeWalletForm = () => {
        setIsCreatingWallet(false)
        setNewWallet(EMPTY_NEW_WALLET)
        setWalletError(null)
    }

    const handleCreateWallet = async (e) => {
        e.preventDefault()
        if (savingWallet) return

        const accountType = walletTypeForTarget
        const name = newWalletName.trim()
        const digits = newWallet.document.replace(/\D/g, '')

        if (!name) {
            setWalletError({ message: accountType === 'PJ' ? 'Digite o nome da empresa.' : 'Dê um nome para a carteira.' })
            return
        }
        if (digits && digits.length !== (accountType === 'PJ' ? 14 : 11)) {
            setWalletError({ message: accountType === 'PJ' ? 'O CNPJ precisa ter 14 números, ou deixe em branco.' : 'O CPF precisa ter 11 números, ou deixe em branco.' })
            return
        }

        setSavingWallet(true)
        setWalletError(null)
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/finance/business-units', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    name,
                    account_type: accountType,
                    cnpj: newWallet.document || null,
                    photo_url: null
                })
            })

            if (res.ok) {
                const created = await res.json()
                setWallets(prev => [...prev, created])
                setJustCreatedWalletId(created.id)
                closeWalletForm()
                showToast('Carteira criada! Agora é só escolher.', 'success')
                if (onWalletCreated) onWalletCreated(created)
            } else {
                const data = await res.json().catch(() => ({}))
                setWalletError({
                    message: data.message || 'Não foi possível criar a carteira. Tente de novo.',
                    limit: res.status === 403
                })
            }
        } catch (err) {
            console.error('Erro ao criar carteira:', err)
            setWalletError({ message: 'Sem conexão no momento. Tente de novo.' })
        } finally {
            setSavingWallet(false)
        }
    }

    const handleNext = (field, value) => {
        setFormData({ ...formData, [field]: value })
        setStep(step + 1)
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (loading) return
        // Com "Nova categoria"/"Novo cartão" aberto a lista some e o navegador não cobra
        // o campo obrigatório; sem esta conferência o lançamento ia sem categoria/cartão
        if (!formData.categoryId) {
            setFormError(isAddingCategory
                ? 'Termine de criar a categoria (botão Criar) ou use Cancelar e escolha uma da lista.'
                : 'Escolha uma categoria.')
            return
        }
        if (formData.paymentMethod === 'Cartão de Crédito' && !formData.cardId) {
            setFormError(isAddingCard
                ? 'Termine de criar o cartão (botão Criar) ou use Cancelar e escolha um da lista.'
                : 'Escolha o cartão.')
            return
        }
        setFormError('')
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
                if (!initialData?.id) {
                    setStep(1)
                    setFormData({
                        ...formData,
                        target: '',
                        type: '',
                        business_unit_id: '',
                        amount: '',
                        categoryId: '',
                        paymentMethod: 'Dinheiro',
                        cardId: '',
                        description: '',
                        dueDate: ''
                    })
                }
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

    // ── Navegação ────────────────────────────────────────────────────────
    const isFirstWalletOfType = walletsStatus === 'ready'
        && !wallets.some(w => w.account_type === walletTypeForTarget)
    const showingWalletForm = step === 3 && walletsStatus === 'ready' && (isCreatingWallet || isFirstWalletOfType)

    const goBack = () => {
        if (step === 3 && isCreatingWallet && !isFirstWalletOfType) {
            closeWalletForm()
            return
        }
        setStep(step - 1)
    }

    // Tocar fora fecha só nos passos de escolha; com formulário aberto, não (para não perder o que foi digitado)
    const closesOnOutside = step < 4 && !showingWalletForm

    // ── Textos de contexto (o que já foi escolhido) ──────────────────────
    const targetLabel = formData.target === 'BUSINESS' ? 'Pessoa Jurídica' : 'Pessoa Física'
    const typeLabel = formData.type === 'RECEITA' ? 'Receita' : 'Despesa'
    const selectedWallet = wallets.find(w => String(w.id) === String(formData.business_unit_id))
    const trail = [
        step >= 2 && formData.target ? targetLabel : null,
        step >= 3 && formData.type ? typeLabel : null,
        step >= 4 && selectedWallet ? selectedWallet.name : null,
    ].filter(Boolean)

    const walletDetail = (wallet) => {
        if (wallet.cnpj) return `${wallet.account_type === 'PJ' ? 'CNPJ' : 'CPF'} ${wallet.cnpj}`
        return wallet.account_type === 'PJ' ? 'Empresa' : 'Pessoal'
    }

    const renderStep = () => {
        switch (step) {
            case 1:
                return (
                    <>
                        <h2 id="nl-title" className="cd-title">O lançamento é para quem?</h2>
                        <div className="nl-options">
                            <Option
                                icon={<User size={20} />}
                                title="Pessoa Física"
                                detail="Gastos e ganhos pessoais"
                                onClick={() => handleNext('target', 'PERSONAL')}
                            />
                            <Option
                                icon={<Building2 size={20} />}
                                title="Pessoa Jurídica"
                                detail="Movimentações do seu MEI"
                                onClick={() => handleNext('target', 'BUSINESS')}
                            />
                        </div>
                    </>
                )
            case 2:
                return (
                    <>
                        <h2 id="nl-title" className="cd-title">O que deseja registrar?</h2>
                        <div className="nl-options">
                            <Option
                                icon={<ArrowDownLeft size={20} />}
                                tone="in"
                                title="Receita"
                                detail="Dinheiro entrando"
                                onClick={() => handleNext('type', 'RECEITA')}
                            />
                            <Option
                                icon={<ArrowUpRight size={20} />}
                                title="Despesa"
                                detail="Dinheiro saindo"
                                onClick={() => handleNext('type', 'DESPESA')}
                            />
                        </div>
                    </>
                )
            case 3: {
                const isPJ = walletTypeForTarget === 'PJ'
                const filteredWallets = wallets.filter(w => w.account_type === walletTypeForTarget)

                if (walletsStatus !== 'ready') {
                    return (
                        <>
                            <h2 id="nl-title" className="cd-title">De quem é a transação?</h2>
                            {walletsStatus === 'error' ? (
                                <div className="nl-notice" role="alert">
                                    <span>Não conseguimos carregar suas carteiras.</span>
                                    <button type="button" className="nl-link" onClick={fetchWallets} data-autofocus>Tentar de novo</button>
                                </div>
                            ) : (
                                <p className="cd-message nl-loading" aria-live="polite">Carregando suas carteiras...</p>
                            )}
                        </>
                    )
                }

                // Sem carteira desse tipo (recém-chegado) ou pediu "Nova carteira":
                // cria aqui mesmo e, ao salvar, volta para a lista
                if (showingWalletForm) {
                    return (
                        <form onSubmit={handleCreateWallet} noValidate>
                            <h2 id="nl-title" className="cd-title">
                                {isFirstWalletOfType
                                    ? (isPJ ? 'Crie a carteira do seu MEI' : 'Crie sua carteira pessoal')
                                    : (isPJ ? 'Nova carteira de empresa' : 'Nova carteira pessoal')}
                            </h2>
                            <p className="cd-message">
                                {isFirstWalletOfType
                                    ? (isPJ
                                        ? 'Você ainda não tem uma carteira para o MEI. Crie agora e depois continue o lançamento.'
                                        : 'Você ainda não tem uma carteira pessoal. Crie agora e depois continue o lançamento.')
                                    : 'Depois de criar, ela aparece na lista para você escolher.'}
                            </p>

                            <label className="nl-field">
                                <span>{isPJ ? 'Nome da empresa' : 'Nome da carteira'}</span>
                                <input
                                    type="text"
                                    data-autofocus
                                    maxLength={120}
                                    placeholder={isPJ ? 'Ex.: Doces da Ana' : 'Ex.: Conta pessoal'}
                                    value={newWalletName}
                                    onChange={(e) => {
                                        setNewWallet(prev => ({ ...prev, name: e.target.value }))
                                        if (walletError) setWalletError(null)
                                    }}
                                />
                            </label>

                            <label className="nl-field">
                                <span>{isPJ ? 'CNPJ' : 'CPF'} <em>(opcional)</em></span>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="off"
                                    placeholder={isPJ ? '00.000.000/0000-00' : '000.000.000-00'}
                                    value={newWallet.document}
                                    onChange={(e) => {
                                        setNewWallet(prev => ({ ...prev, document: maskDocument(e.target.value, walletTypeForTarget) }))
                                        if (walletError) setWalletError(null)
                                    }}
                                />
                                <small>Pode deixar em branco e preencher depois.</small>
                            </label>

                            {walletError && (
                                <div className="nl-notice" role="alert">
                                    <span>{walletError.message}</span>
                                    {walletError.limit && (
                                        <Link to="/planos" className="nl-link" onClick={onClose}>Ver planos</Link>
                                    )}
                                </div>
                            )}

                            <div className="cd-actions">
                                {!isFirstWalletOfType && (
                                    <button type="button" className="cd-btn" onClick={closeWalletForm}>Cancelar</button>
                                )}
                                <button
                                    type="submit"
                                    className="cd-btn cd-btn--primary"
                                    disabled={savingWallet || !newWalletName.trim()}
                                >
                                    {savingWallet ? 'Criando...' : 'Criar carteira'}
                                </button>
                            </div>
                            <p className="nl-foot">Foto e outros detalhes você ajusta depois em Gerenciar carteiras.</p>
                        </form>
                    )
                }

                return (
                    <>
                        <h2 id="nl-title" className="cd-title">De quem é a transação?</h2>
                        <div className="nl-options">
                            {filteredWallets.map(wallet => {
                                const photo = wallet.logo_url || wallet.photo_url
                                const initial = (wallet.name || '').trim().charAt(0).toUpperCase()
                                return (
                                    <Option
                                        key={wallet.id}
                                        icon={photo ? <img src={photo} alt="" /> : (initial || <User size={20} />)}
                                        tone="wallet"
                                        title={wallet.name}
                                        detail={walletDetail(wallet)}
                                        badge={wallet.id === justCreatedWalletId ? <span className="nl-chip">Nova</span> : null}
                                        extraClass={wallet.id === justCreatedWalletId ? 'is-new' : ''}
                                        onClick={() => handleNext('business_unit_id', wallet.id)}
                                    />
                                )
                            })}
                            <button type="button" className="nl-add" onClick={openWalletForm}>
                                <Plus size={18} aria-hidden="true" />
                                Nova carteira
                            </button>
                        </div>
                    </>
                )
            }

            case 4: {
                const title = isEditing
                    ? 'Editar lançamento'
                    : formData.type === 'RECEITA' ? 'Nova receita' : 'Nova despesa'
                const submitLabel = isEditing
                    ? 'Salvar alterações'
                    : formData.type === 'RECEITA' ? 'Salvar receita' : 'Salvar despesa'

                return (
                    <form onSubmit={handleSubmit}>
                        <h2 id="nl-title" className="cd-title">{title}</h2>

                        <div className="nl-grid">
                            <label className="nl-field nl-field--full">
                                <span>Valor</span>
                                <span className="nl-money">
                                    <span aria-hidden="true">R$</span>
                                    <input
                                        type="number"
                                        step="0.01"
                                        inputMode="decimal"
                                        required
                                        data-autofocus
                                        aria-label="Valor em reais"
                                        value={formData.amount}
                                        onChange={(e) => setField('amount', e.target.value)}
                                        placeholder="0,00"
                                    />
                                </span>
                            </label>

                            <label className="nl-field">
                                <span>Data</span>
                                <input
                                    type="date"
                                    required
                                    value={formData.date}
                                    onChange={(e) => setField('date', e.target.value)}
                                />
                            </label>

                            <div className="nl-field">
                                <label htmlFor="nl-method">Forma de pagamento</label>
                                <Select
                                    id="nl-method"
                                    ariaLabel="Forma de pagamento"
                                    value={formData.paymentMethod}
                                    onChange={(v) => setField('paymentMethod', v)}
                                    options={[
                                        { value: 'Dinheiro', label: 'Dinheiro' },
                                        { value: 'PIX', label: 'Pix' },
                                        { value: 'Cartão de Débito', label: 'Cartão de débito' },
                                        { value: 'Cartão de Crédito', label: 'Cartão de crédito' },
                                        { value: 'Boleto', label: 'Boleto (vai para Contas a pagar)' }
                                    ]}
                                />
                            </div>

                            <div className="nl-field nl-field--full">
                                <span className="nl-field__row">
                                    <label htmlFor="nl-category">Categoria</label>
                                    {!isAddingCategory && (
                                        <button type="button" className="nl-link" onClick={() => setIsAddingCategory(true)}>
                                            Nova categoria
                                        </button>
                                    )}
                                </span>
                                {isAddingCategory ? (
                                    <span className="nl-inline-add">
                                        <input
                                            autoFocus
                                            type="text"
                                            aria-label="Nome da nova categoria"
                                            placeholder="Nome da categoria"
                                            value={newCategoryName}
                                            onChange={(e) => setNewCategoryName(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleQuickAddCategory() } }}
                                        />
                                        <button type="button" className="cd-btn cd-btn--primary" onClick={handleQuickAddCategory}>Criar</button>
                                        <button type="button" className="cd-btn" onClick={() => setIsAddingCategory(false)}>Cancelar</button>
                                    </span>
                                ) : (
                                    <Select
                                        id="nl-category"
                                        ariaLabel="Categoria"
                                        placeholder="Selecione uma categoria"
                                        value={formData.categoryId ? String(formData.categoryId) : ''}
                                        onChange={(v) => setField('categoryId', v)}
                                        options={categories
                                            .filter(c => {
                                                if (formData.type === 'RECEITA') return c.type === 'RECEITA'
                                                if (formData.target === 'BUSINESS') return c.type === 'DESPESA_MEI'
                                                return c.type === 'DESPESA_PESSOAL'
                                            })
                                            .map(c => ({ value: String(c.id), label: c.name }))}
                                    />
                                )}
                            </div>

                            {formData.paymentMethod === 'Cartão de Crédito' && (
                                <div className="nl-field nl-field--full">
                                    <span className="nl-field__row">
                                        <label htmlFor="nl-card">Qual cartão?</label>
                                        {!isAddingCard && (
                                            <button type="button" className="nl-link" onClick={() => setIsAddingCard(true)}>
                                                Novo cartão
                                            </button>
                                        )}
                                    </span>
                                    {isAddingCard ? (
                                        <span className="nl-inline-add">
                                            <input
                                                autoFocus
                                                type="text"
                                                aria-label="Nome do novo cartão"
                                                placeholder="Nome do cartão"
                                                value={newCardName}
                                                onChange={(e) => setNewCardName(e.target.value)}
                                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleQuickAddCard() } }}
                                            />
                                            <button type="button" className="cd-btn cd-btn--primary" onClick={handleQuickAddCard}>Criar</button>
                                            <button type="button" className="cd-btn" onClick={() => setIsAddingCard(false)}>Cancelar</button>
                                        </span>
                                    ) : (
                                        <Select
                                            id="nl-card"
                                            ariaLabel="Cartão"
                                            placeholder="Selecione o cartão"
                                            value={formData.cardId ? String(formData.cardId) : ''}
                                            onChange={(v) => setField('cardId', v)}
                                            options={cards.map(c => ({ value: String(c.id), label: c.lastFour ? `${c.name} (final ${c.lastFour})` : c.name }))}
                                        />
                                    )}
                                </div>
                            )}

                            {formData.paymentMethod === 'Boleto' && (
                                <label className="nl-field nl-field--full">
                                    <span>Data de vencimento</span>
                                    <input
                                        type="date"
                                        required
                                        value={formData.dueDate || ''}
                                        onChange={(e) => setField('dueDate', e.target.value)}
                                    />
                                </label>
                            )}

                            <label className="nl-field nl-field--full">
                                <span>Descrição <em>(opcional)</em></span>
                                <textarea
                                    rows="2"
                                    value={formData.description}
                                    onChange={(e) => setField('description', e.target.value)}
                                    placeholder="Ex.: venda de 20 brigadeiros"
                                />
                            </label>
                        </div>

                        {formError && (
                            <div className="nl-notice" role="alert">
                                <span>{formError}</span>
                            </div>
                        )}

                        <div className="cd-actions nl-submit">
                            <button type="submit" className="cd-btn cd-btn--primary" disabled={loading}>
                                {loading ? 'Salvando...' : submitLabel}
                            </button>
                        </div>
                    </form>
                )
            }
            default:
                return null
        }
    }

    const canGoBack = step > 1

    return (
        <div
            ref={overlayRef}
            className="cd-overlay nl-overlay"
            onMouseDown={(e) => { if (closesOnOutside && e.target === e.currentTarget) onClose() }}
        >
            <div
                ref={boxRef}
                className="cd-box nl-box"
                role="dialog"
                aria-modal="true"
                aria-labelledby="nl-title"
            >
                <div className="nl-top">
                    {canGoBack ? (
                        <button type="button" className="nl-back" onClick={goBack}>
                            <ArrowLeft size={18} aria-hidden="true" /> Voltar
                        </button>
                    ) : <span />}
                    {!isEditing && <span className="nl-progress">Passo {step} de {TOTAL_STEPS}</span>}
                    <button type="button" className="nl-close" onClick={onClose} aria-label="Fechar">
                        <X size={20} aria-hidden="true" />
                    </button>
                </div>
                {trail.length > 0 && !showingWalletForm && (
                    <p className="nl-trail">{trail.join(' · ')}</p>
                )}
                <div className="nl-step" key={`${step}-${showingWalletForm}`}>
                    {renderStep()}
                </div>
            </div>
        </div>
    )
}
