import { useState, useEffect, useRef } from 'react'
import {
    Briefcase,
    User,
    Plus,
    X,
    Edit2,
    Trash2,
    ShieldCheck,
    Building2,
    Image as ImageIcon,
    Upload,
    Camera
} from 'lucide-react'
import ImageCropperModal from '../../components/ImageCropperModal'
import './AccountManager.css'

export default function AccountManager() {
    const [accounts, setAccounts] = useState([])
    const [isLoading, setIsLoading] = useState(true)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [currentAccount, setCurrentAccount] = useState(null)
    const [formData, setFormData] = useState({
        name: '',
        type: 'PF',
        document: '',
        photo_url: '',
    })

    // Image Upload State
    const [isCropperOpen, setIsCropperOpen] = useState(false)
    const [tempImageSrc, setTempImageSrc] = useState(null)
    const fileInputRef = useRef(null)

    // Fetch accounts on mount
    useEffect(() => {
        fetchAccounts()
    }, [])

    const fetchAccounts = async () => {
        setIsLoading(true)
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/business-units', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (res.ok) {
                const data = await res.json()
                setAccounts(data)
            }
        } catch (error) {
            console.error('Erro ao buscar contas:', error)
        } finally {
            setIsLoading(false)
        }
    }

    const handleOpenModal = (account = null) => {
        if (account) {
            setCurrentAccount(account)
            setFormData({
                name: account.name,
                type: account.account_type,
                document: account.cnpj,
                photo_url: account.photo_url || ''
            })
        } else {
            setCurrentAccount(null)
            setFormData({
                name: '',
                type: 'PF',
                document: '',
                photo_url: ''
            })
        }
        setIsModalOpen(true)
    }

    const handleCloseModal = () => {
        setIsModalOpen(false)
        setCurrentAccount(null)
    }

    const handleInputChange = (e) => {
        const { name, value } = e.target
        let finalValue = value

        if (name === 'document') {
            const onlyNums = value.replace(/\D/g, '')
            if (formData.type === 'PF') {
                finalValue = onlyNums
                    .replace(/(\d{3})(\d)/, '$1.$2')
                    .replace(/(\d{3})(\d)/, '$1.$2')
                    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
                    .slice(0, 14)
            } else {
                finalValue = onlyNums
                    .replace(/^(\d{2})(\d)/, '$1.$2')
                    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
                    .replace(/\.(\d{3})(\d)/, '.$1/$2')
                    .replace(/(\d{4})(\d)/, '$1-$2')
                    .slice(0, 18)
            }
        }
        setFormData(prev => ({ ...prev, [name]: finalValue }))
    }

    useEffect(() => {
        setFormData(prev => ({ ...prev, document: '' }))
    }, [formData.type])


    // File Upload Handlers
    const handleFileSelect = (e) => {
        const file = e.target.files[0]
        if (file) {
            const reader = new FileReader()
            reader.onload = () => {
                setTempImageSrc(reader.result)
                setIsCropperOpen(true)
                e.target.value = null
            }
            reader.readAsDataURL(file)
        }
    }

    const handleCropSave = (base64Image) => {
        setFormData(prev => ({ ...prev, photo_url: base64Image }))
        setIsCropperOpen(false)
        setTempImageSrc(null)
    }

    const handleCropCancel = () => {
        setIsCropperOpen(false)
        setTempImageSrc(null)
    }


    const handleSave = async (e) => {
        e.preventDefault()

        if (!formData.name || !formData.document) {
            alert('Por favor, preencha o nome e o documento.')
            return
        }

        try {
            const token = localStorage.getItem('token')
            const method = currentAccount ? 'PUT' : 'POST'
            const url = currentAccount
                ? `/api/business-units/${currentAccount.id}`
                : '/api/business-units'

            const payload = {
                name: formData.name,
                account_type: formData.type,
                cnpj: formData.document,
                photo_url: formData.photo_url
            }

            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            })

            if (res.ok) {
                fetchAccounts()
                handleCloseModal()
            } else {
                const err = await res.json()
                alert(err.message || 'Erro ao salvar conta.')
            }
        } catch (error) {
            console.error('Erro ao salvar:', error)
            alert('Erro de conexão.')
        }
    }

    const handleDelete = async (id) => {
        if (!window.confirm('Tem certeza que deseja excluir esta conta?')) return
        try {
            const token = localStorage.getItem('token')
            const res = await fetch(`/api/business-units/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (res.ok) {
                setAccounts(prev => prev.filter(acc => acc.id !== id))
            } else {
                const err = await res.json()
                alert(err.message || 'Erro ao excluir.')
            }
        } catch (error) {
            console.error('Erro ao excluir:', error)
        }
    }

    return (
        <div className="account-manager-page">
            <div className="account-manager-container">
                <div className="account-manager-header">
                    <div>
                        <h1>Gerenciar Carteiras</h1>
                        <p>Cadastre e gerencie suas entidades pessoais e empresariais.</p>
                    </div>
                    <button className="btn btn-primary" onClick={() => handleOpenModal()}>
                        <Plus size={20} /> Nova Conta
                    </button>
                </div>

                {isLoading ? (
                    <div style={{ textAlign: 'center', padding: '4rem' }}>Carregando...</div>
                ) : (
                    <div className="account-list-grid">
                        {accounts.length === 0 ? (
                            <div className="empty-state">
                                <Building2 size={48} className="empty-icon" />
                                <h3>Nenhuma conta cadastrada</h3>
                                <p>Clique em "Nova Conta" para começar.</p>
                            </div>
                        ) : (
                            accounts.map(account => (
                                <div key={account.id} className={`account-card type-${account.account_type?.toLowerCase()}`}>
                                    <div className="account-header">
                                        <div className={`account-avatar ${account.account_type?.toLowerCase()}`}>
                                            {account.photo_url ? (
                                                <img src={account.photo_url} alt={account.name} />
                                            ) : (
                                                account.account_type === 'PJ' ? <Briefcase size={24} /> : <User size={24} />
                                            )}
                                        </div>
                                        <div className="account-info">
                                            <div className="account-name">{account.name}</div>
                                            <div className="account-badges">
                                                <span className={`badge badge-${account.account_type?.toLowerCase()}`}>
                                                    {account.account_type === 'PJ' ? 'Empresa' : 'Pessoal'}
                                                </span>
                                                {account.isPrimary && (
                                                    <span className="badge badge-primary" style={{ background: '#fef3c7', color: '#d97706' }}>
                                                        Principal
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="account-details">
                                        <div className="detail-row">
                                            <ShieldCheck size={16} />
                                            <span>
                                                <strong>{account.account_type === 'PJ' ? 'CNPJ' : 'CPF'}:</strong> {account.cnpj}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="account-actions">
                                        <button className="action-btn" onClick={() => handleOpenModal(account)}>
                                            <Edit2 size={18} />
                                        </button>
                                        {!account.isPrimary && (
                                            <button className="action-btn delete" onClick={() => handleDelete(account.id)}>
                                                <Trash2 size={18} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>

            {/* Modal de Criação/Edição */}
            {isModalOpen && (
                <div className="modal-overlay" onClick={(e) => {
                    if (e.target.className === 'modal-overlay') handleCloseModal()
                }}>
                    <div className="modal-content">
                        <div className="modal-header">
                            <h2>{currentAccount ? 'Editar Conta' : 'Nova Conta'}</h2>
                            <button className="close-btn" onClick={handleCloseModal}>
                                <X size={24} />
                            </button>
                        </div>
                        <form onSubmit={handleSave}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label>Tipo de Conta</label>
                                    <div style={{ display: 'flex', gap: '1rem' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '0.5rem 1rem', border: `1px solid ${formData.type === 'PF' ? 'var(--color-primary)' : '#e2e8f0'}`, borderRadius: '8px', background: formData.type === 'PF' ? '#ecfdf5' : 'white' }}>
                                            <input
                                                type="radio"
                                                name="type"
                                                value="PF"
                                                checked={formData.type === 'PF'}
                                                onChange={(e) => setFormData(p => ({ ...p, type: e.target.value }))}
                                                style={{ accentColor: 'var(--color-primary)' }}
                                            />
                                            <User size={18} /> Pessoa Física
                                        </label>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '0.5rem 1rem', border: `1px solid ${formData.type === 'PJ' ? '#6366f1' : '#e2e8f0'}`, borderRadius: '8px', background: formData.type === 'PJ' ? '#eef2ff' : 'white' }}>
                                            <input
                                                type="radio"
                                                name="type"
                                                value="PJ"
                                                checked={formData.type === 'PJ'}
                                                onChange={(e) => setFormData(p => ({ ...p, type: e.target.value }))}
                                                style={{ accentColor: '#6366f1' }}
                                            />
                                            <Briefcase size={18} /> Pessoa Jurídica
                                        </label>
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label>Nome da Conta / Razão Social</label>
                                    <input
                                        type="text"
                                        name="name"
                                        className="form-control"
                                        placeholder={formData.type === 'PF' ? "Ex: João da Silva" : "Ex: Minha Empresa MEI"}
                                        value={formData.name}
                                        onChange={handleInputChange}
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label>{formData.type === 'PJ' ? 'CNPJ' : 'CPF'}</label>
                                    <input
                                        type="text"
                                        name="document"
                                        className="form-control"
                                        placeholder={formData.type === 'PF' ? "000.000.000-00" : "00.000.000/0000-00"}
                                        value={formData.document}
                                        onChange={handleInputChange}
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Foto do Perfil</label>
                                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                        {/* Preview Area */}
                                        <div style={{
                                            width: '80px',
                                            height: '80px',
                                            borderRadius: '50%',
                                            background: '#f1f5f9',
                                            overflow: 'hidden',
                                            border: '2px solid #e2e8f0',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}>
                                            {formData.photo_url ? (
                                                <img src={formData.photo_url} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            ) : (
                                                <Camera size={32} color="#94a3b8" />
                                            )}
                                        </div>

                                        {/* Actions */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                            <input
                                                type="file"
                                                accept="image/*"
                                                style={{ display: 'none' }}
                                                ref={fileInputRef}
                                                onChange={handleFileSelect}
                                            />
                                            <button
                                                type="button"
                                                className="btn btn-outline btn-sm"
                                                onClick={() => fileInputRef.current?.click()}
                                                style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
                                            >
                                                <Upload size={14} style={{ marginRight: '6px' }} />
                                                {formData.photo_url ? 'Alterar Foto' : 'Carregar Foto'}
                                            </button>

                                            {formData.photo_url && (
                                                <button
                                                    type="button"
                                                    onClick={() => setFormData(p => ({ ...p, photo_url: '' }))}
                                                    style={{ border: 'none', background: 'none', color: '#ef4444', fontSize: '0.8rem', cursor: 'pointer', textAlign: 'left', padding: 0 }}
                                                >
                                                    Remover foto
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={handleCloseModal}>Cancelar</button>
                                <button type="submit" className="btn btn-primary">Salvar Conta</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Cropper Modal */}
            {isCropperOpen && tempImageSrc && (
                <ImageCropperModal
                    imageSrc={tempImageSrc}
                    onCancel={handleCropCancel}
                    onSave={handleCropSave}
                />
            )}
        </div>
    )
}
