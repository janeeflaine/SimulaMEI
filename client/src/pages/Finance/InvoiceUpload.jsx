import { useState, useRef, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import FeatureLock from '../../components/FeatureLock'
import './InvoiceUpload.css'

const ACCEPTED_TYPES = {
    'application/pdf': { label: 'PDF', ext: '.pdf', recommended: true },
    'text/csv': { label: 'CSV', ext: '.csv', recommended: true },
    'application/vnd.ms-excel': { label: 'CSV', ext: '.csv', recommended: true },
    'text/plain': { label: 'TXT', ext: '.txt', recommended: false },
    'application/x-ofx': { label: 'OFX', ext: '.ofx', recommended: false },
    'application/ofx': { label: 'OFX', ext: '.ofx', recommended: false },
    'text/ofx': { label: 'OFX', ext: '.ofx', recommended: false },
    'image/png': { label: 'PNG', ext: '.png', recommended: false },
    'image/jpeg': { label: 'JPG', ext: '.jpg', recommended: false },
    'image/jpg': { label: 'JPG', ext: '.jpg', recommended: false },
    'image/webp': { label: 'WebP', ext: '.webp', recommended: false }
}

const ACCEPT_STRING = Object.keys(ACCEPTED_TYPES).join(',') + ',.ofx,.csv'
const MAX_SIZE_MB = 10

const CATEGORIES_DEFAULT = [
    'Alimentação', 'Transporte', 'Moradia', 'Saúde', 'Educação', 'Lazer',
    'Vestuário', 'Assinaturas', 'Mercado', 'Restaurante', 'Combustível',
    'Farmácia', 'Pets', 'Serviços', 'Outros'
]

const formatBRL = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
const formatBytes = (b) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`

export default function InvoiceUpload() {
    const { id: cardId } = useParams()
    const navigate = useNavigate()
    const { user } = useAuth()
    const fileInputRef = useRef(null)

    const API = import.meta.env.VITE_API_URL || ''
    const token = localStorage.getItem('token')
    const isOuro = user?.plan === 'Ouro' || user?.isInTrial

    // States
    const [dragOver, setDragOver] = useState(false)
    const [phase, setPhase] = useState('upload')  // upload | processing | review | error
    const [progress, setProgress] = useState(0)
    const [file, setFile] = useState(null)
    const [error, setError] = useState(null)
    const [result, setResult] = useState(null)
    const [selectedItems, setSelectedItems] = useState(new Set())
    const [categories, setCategories] = useState([])
    const [confirming, setConfirming] = useState(false)
    const [showNewCatModal, setShowNewCatModal] = useState(false)
    const [newCatName, setNewCatName] = useState('')
    const [creatingCat, setCreatingCat] = useState(false)
    const [updatedCategories, setUpdatedCategories] = useState({}) // item.id -> new category name

    // Fetch user categories for the select dropdown
    const fetchCategories = useCallback(async () => {
        try {
            const res = await fetch(`${API}/api/finance/categories`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (res.ok) {
                const data = await res.json()
                // Filter to only PF categories for credit cards, then deduplicate
                const pfCategories = data.filter(c => c.type === 'DESPESA_PESSOAL')
                const uniqueNames = [...new Set(pfCategories.map(c => c.name))]
                setCategories(uniqueNames)
            }
        } catch { /* use defaults */ }
    }, [API, token])

    // File validation
    const validateFile = (f) => {
        if (!f) return 'Nenhum arquivo selecionado'

        // Check extension for OFX files (browsers often set wrong MIME)
        const ext = f.name.toLowerCase().split('.').pop()
        const isOFX = ext === 'ofx'
        const isCSV = ext === 'csv'

        if (!isOFX && !isCSV && !ACCEPTED_TYPES[f.type]) {
            return `Formato "${f.type || ext}" não suportado. Use PDF, CSV, OFX, PNG ou JPG.`
        }

        if (f.size > MAX_SIZE_MB * 1024 * 1024) {
            return `Arquivo muito grande (${formatBytes(f.size)}). Limite: ${MAX_SIZE_MB}MB.`
        }

        return null
    }

    // Upload to backend
    const handleUpload = async (selectedFile) => {
        const validationError = validateFile(selectedFile)
        if (validationError) {
            setError(validationError)
            setPhase('error')
            return
        }

        setFile(selectedFile)
        setPhase('processing')
        setProgress(0)
        setError(null)

        // Simulate progress (real progress comes from XHR)
        const progressInterval = setInterval(() => {
            setProgress(prev => {
                if (prev >= 85) { clearInterval(progressInterval); return prev }
                return prev + Math.random() * 8
            })
        }, 400)

        try {
            const formData = new FormData()
            formData.append('file', selectedFile)
            formData.append('cardId', cardId)

            const res = await fetch(`${API}/api/finance/invoices/upload`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            })

            clearInterval(progressInterval)

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}))
                throw new Error(errData.message || errData.error || `Erro ${res.status}`)
            }

            const data = await res.json()
            setProgress(100)
            setResult(data)

            // Select all items by default
            setSelectedItems(new Set(data.items.map(item => item.id)))

            // Fetch categories for the editing dropdown
            await fetchCategories()

            setTimeout(() => setPhase('review'), 500)
        } catch (err) {
            clearInterval(progressInterval)
            setError(err.message)
            setPhase('error')
        }
    }

    // Drag & Drop handlers
    const handleDragOver = (e) => { e.preventDefault(); setDragOver(true) }
    const handleDragLeave = () => setDragOver(false)
    const handleDrop = (e) => {
        e.preventDefault()
        setDragOver(false)
        const droppedFile = e.dataTransfer.files?.[0]
        if (droppedFile) handleUpload(droppedFile)
    }

    const handleFileSelect = (e) => {
        const selected = e.target.files?.[0]
        if (selected) handleUpload(selected)
    }

    // Safe number parser (handles R$, spaces, commas and dots)
    const parseAmount = (val) => {
        if (typeof val === 'number') return val
        if (!val) return 0
        const clean = String(val).replace(/[R$\s]/g, '').replace(/,/g, '.')
        return parseFloat(clean) || 0
    }

    // Review actions
    const toggleItem = (itemId) => {
        setSelectedItems(prev => {
            const next = new Set(prev)
            if (next.has(itemId)) next.delete(itemId)
            else next.add(itemId)
            return next
        })
    }

    const toggleAll = () => {
        if (!result?.items) return
        if (selectedItems.size === result.items.length) {
            setSelectedItems(new Set())
        } else {
            setSelectedItems(new Set(result.items.map(it => it.id)))
        }
    }

    const handleConfirm = async () => {
        if (selectedItems.size === 0) return
        setConfirming(true)

        try {
            // Confirm selected items
            for (const itemId of selectedItems) {
                const item = result.items.find(i => i.id === itemId)
                const finalCategory = updatedCategories[itemId] || item.aiCategory || 'Outros'

                await fetch(`${API}/api/finance/invoices/items/${itemId}`, {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        isConfirmed: true,
                        categoryName: finalCategory
                    })
                })
            }

            // Delete unselected items
            const unselectedItems = result.items.filter(i => !selectedItems.has(i.id))
            for (const item of unselectedItems) {
                await fetch(`${API}/api/finance/invoices/items/${item.id}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                })
            }

            // Navigate to the card dashboard
            navigate(`/financas/cartoes/${cardId}`)
        } catch (err) {
            setError('Erro ao confirmar itens: ' + err.message)
        } finally {
            setConfirming(false)
        }
    }

    const [discarding, setDiscarding] = useState(false)

    const handleDiscard = async () => {
        if (!result || !result.items || result.items.length === 0) {
            resetUploadState()
            return
        }

        setDiscarding(true)
        try {
            const invoiceId = result.items[0].invoiceId

            // Call API to delete the pending invoice and all its items
            await fetch(`${API}/api/finance/invoices/${invoiceId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            })

            resetUploadState()
        } catch (err) {
            console.error('Erro ao descartar fatura:', err)
            setError('Erro ao descartar fatura. Tente novamente.')
        } finally {
            setDiscarding(false)
        }
    }

    const resetUploadState = () => {
        setPhase('upload')
        setFile(null)
        setResult(null)
        setError(null)
        setProgress(0)
        setSelectedItems(new Set())
        setUpdatedCategories({})
    }

    const handleCategoryChange = (itemId, newCat) => {
        if (newCat === 'NEW_CATEGORY') {
            setShowNewCatModal(true)
            // Revert select back to previous value to prevent it showing "NEW_CATEGORY"
            const select = document.getElementById(`cat-select-${itemId}`)
            if (select) select.value = updatedCategories[itemId] || result.items.find(i => i.id === itemId)?.aiCategory || 'Outros'
        } else {
            setUpdatedCategories(prev => ({ ...prev, [itemId]: newCat }))
        }
    }

    const handleCreateCategory = async () => {
        if (!newCatName.trim()) return

        setCreatingCat(true)
        try {
            const res = await fetch(`${API}/api/finance/categories`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name: newCatName.trim(), type: 'DESPESA_PESSOAL' })
            })

            if (res.ok) {
                const newCat = await res.json()
                setCategories(prev => [...prev, newCat.name])
                setShowNewCatModal(false)
                setNewCatName('')
            } else {
                const data = await res.json()
                alert(data.message || 'Erro ao criar categoria')
            }
        } catch (err) {
            alert('Erro de conexão ao criar categoria')
        } finally {
            setCreatingCat(false)
        }
    }

    const getFileIcon = (f) => {
        if (!f) return '📄'
        const ext = f.name.toLowerCase().split('.').pop()
        if (ext === 'pdf') return '📕'
        if (ext === 'csv') return '📊'
        if (ext === 'ofx') return '🏦'
        if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) return '🖼️'
        return '📄'
    }

    if (!isOuro) {
        return (
            <div className="container py-8">
                <FeatureLock
                    featureName="Upload de Faturas"
                    requiredPlan="Ouro"
                    description="Faça upload de faturas e deixe a IA extrair os itens automaticamente."
                    icon="📤"
                />
            </div>
        )
    }

    // ========== REVIEW PHASE ==========
    if (phase === 'review' && result) {
        const allCats = categories.length > 0 ? categories : CATEGORIES_DEFAULT

        return (
            <div className="invoice-upload-page">
                <div className="review-container">
                    <Link to={`/financas/cartoes/${cardId}`} className="dashboard-back-link">
                        ← Voltar ao Dashboard
                    </Link>

                    <div className="review-header">
                        <h2>🔍 Revisão da Fatura</h2>
                        <span className="badge badge-warning">IA • Revisão necessária</span>
                    </div>

                    {/* AI Notice */}
                    <div className="ai-notice">
                        <span className="notice-icon">🤖</span>
                        <div className="notice-text">
                            A IA extraiu <strong>{result.items.length} itens</strong> da fatura.
                            Revise as categorias e valores antes de confirmar.
                            Itens desmarcados serão descartados.
                        </div>
                    </div>

                    {/* Summary Stats */}
                    <div className="review-summary">
                        <div className="review-stat">
                            <div className="review-stat-value">{result.totalItems}</div>
                            <div className="review-stat-label">Itens Extraídos</div>
                        </div>
                        <div className="review-stat">
                            <div className="review-stat-value" style={{ color: 'var(--color-danger)' }}>
                                {formatBRL(
                                    result?.items
                                        ? result.items.filter(item => selectedItems.has(item.id)).reduce((sum, item) => sum + parseAmount(item.amount), 0)
                                        : 0
                                )}
                            </div>
                            <div className="review-stat-label">Total da Fatura</div>
                        </div>
                        <div className="review-stat">
                            <div className="review-stat-value" style={{ color: 'var(--color-primary)' }}>
                                {selectedItems.size}
                            </div>
                            <div className="review-stat-label">Itens Selecionados</div>
                        </div>
                    </div>

                    {/* Items Table */}
                    <div className="review-table-card">
                        <div style={{ overflowX: 'auto' }}>
                            <table className="review-table">
                                <thead>
                                    <tr>
                                        <th className="td-checkbox">
                                            <input
                                                type="checkbox"
                                                checked={selectedItems.size === result.items.length}
                                                onChange={toggleAll}
                                            />
                                        </th>
                                        <th>Descrição</th>
                                        <th>Valor</th>
                                        <th>Data</th>
                                        <th>Categoria</th>
                                        <th>Confiança</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {result.items.map(item => {
                                        const conf = parseFloat(item.aiConfidence) || 0
                                        const confClass = conf >= 0.8 ? 'conf-high' : conf >= 0.5 ? 'conf-medium' : 'conf-low'
                                        return (
                                            <tr key={item.id} style={{ opacity: selectedItems.has(item.id) ? 1 : 0.4 }}>
                                                <td className="td-checkbox">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedItems.has(item.id)}
                                                        onChange={() => toggleItem(item.id)}
                                                    />
                                                </td>
                                                <td>
                                                    <div style={{ fontWeight: 500, color: 'var(--color-slate-900)' }}>
                                                        {item.description}
                                                    </div>
                                                    {item.installment && (
                                                        <span style={{
                                                            fontSize: '0.6875rem', color: 'var(--color-indigo-600)',
                                                            background: 'rgba(99,102,241,0.08)', padding: '0.125rem 0.5rem',
                                                            borderRadius: '999px', fontWeight: 600
                                                        }}>
                                                            {item.installment}
                                                        </span>
                                                    )}
                                                </td>
                                                <td style={{ fontWeight: 700, color: 'var(--color-danger)', whiteSpace: 'nowrap' }}>
                                                    {formatBRL(item.amount)}
                                                </td>
                                                <td style={{ fontSize: '0.8125rem', color: 'var(--color-slate-500)' }}>
                                                    {item.transactionDate
                                                        ? new Date(item.transactionDate).toLocaleDateString('pt-BR')
                                                        : '—'}
                                                </td>
                                                <td>
                                                    <select
                                                        id={`cat-select-${item.id}`}
                                                        className="review-category-select"
                                                        value={updatedCategories[item.id] || item.aiCategory || 'Outros'}
                                                        onChange={(e) => handleCategoryChange(item.id, e.target.value)}
                                                    >
                                                        {allCats.map((cat, idx) => (
                                                            <option key={`${cat}-${idx}`} value={cat}>{cat}</option>
                                                        ))}
                                                        <option disabled>──────</option>
                                                        <option value="NEW_CATEGORY">+ Nova Categoria...</option>
                                                    </select>
                                                </td>
                                                <td>
                                                    <span className={`review-confidence ${confClass}`}>
                                                        <span className="conf-dot"></span>
                                                        {conf > 0 ? `${(conf * 100).toFixed(0)}%` : '—'}
                                                    </span>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="review-actions">
                        <div className="left-actions">
                            <button className="btn-discard" onClick={handleDiscard} disabled={discarding || confirming}>
                                {discarding ? '⏳ Descartando...' : 'Descartar e Refazer'}
                            </button>
                        </div>
                        <button
                            className="btn-confirm-all"
                            onClick={handleConfirm}
                            disabled={selectedItems.size === 0 || confirming}
                        >
                            {confirming ? '⏳ Confirmando...' : `✅ Confirmar ${selectedItems.size} itens`}
                        </button>
                    </div>

                    {/* New Category Modal */}
                    {showNewCatModal && (
                        <div className="modal-overlay" onClick={() => setShowNewCatModal(false)}>
                            <div className="modal-content" onClick={e => e.stopPropagation()}>
                                <h3>Nova Categoria</h3>
                                <div className="form-group" style={{ marginTop: '1rem' }}>
                                    <label>Nome da Categoria</label>
                                    <input
                                        type="text"
                                        value={newCatName}
                                        onChange={e => setNewCatName(e.target.value)}
                                        placeholder="Ex: Assinaturas"
                                        autoFocus
                                    />
                                    <small className="form-help">
                                        Será criada automaticamente como categoria Pessoal (PF).
                                    </small>
                                </div>
                                <div className="modal-actions">
                                    <button className="btn-cancel" onClick={() => setShowNewCatModal(false)}>
                                        Cancelar
                                    </button>
                                    <button
                                        className="btn-save"
                                        onClick={handleCreateCategory}
                                        disabled={creatingCat || !newCatName.trim()}
                                    >
                                        {creatingCat ? 'Criando...' : 'Criar Categoria'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        )
    }

    // ========== UPLOAD / PROCESSING / ERROR PHASE ==========
    return (
        <div className="invoice-upload-page">
            <div className="upload-container">
                <Link to={`/financas/cartoes/${cardId}`} className="dashboard-back-link">
                    ← Voltar ao Dashboard
                </Link>

                <div className="statement-header">
                    <div className="header-title">
                        <h1>Upload de Fatura</h1>
                        <p>Envie a fatura do cartão e a IA extrairá os itens automaticamente</p>
                    </div>
                </div>

                {/* Upload Zone */}
                {phase === 'upload' && (
                    <div
                        className={`upload-zone ${dragOver ? 'drag-over' : ''}`}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <span className="upload-icon">📤</span>
                        <h3>Arraste a fatura aqui</h3>
                        <p>ou clique para selecionar o arquivo</p>

                        <button className="upload-btn" type="button">
                            📂 Selecionar Arquivo
                        </button>

                        <input
                            ref={fileInputRef}
                            type="file"
                            accept={ACCEPT_STRING}
                            onChange={handleFileSelect}
                        />

                        <div className="upload-formats">
                            <span className="format-badge recommended">
                                <span className="rec-star">⭐</span> PDF
                            </span>
                            <span className="format-badge recommended">
                                <span className="rec-star">⭐</span> CSV
                            </span>
                            <span className="format-badge">OFX</span>
                            <span className="format-badge">PNG</span>
                            <span className="format-badge">JPG</span>
                        </div>
                    </div>
                )}

                {/* Processing State */}
                {phase === 'processing' && file && (
                    <div className="upload-progress">
                        <div className="progress-header">
                            <div className="progress-file-icon">{getFileIcon(file)}</div>
                            <div className="progress-file-info">
                                <div className="file-name">{file.name}</div>
                                <div className="file-size">{formatBytes(file.size)}</div>
                            </div>
                        </div>
                        <div className="progress-bar-wrapper">
                            <div className="progress-bar-track">
                                <div
                                    className="progress-bar-indicator"
                                    style={{ width: `${Math.min(100, progress)}%` }}
                                ></div>
                            </div>
                        </div>
                        <div className="progress-status">
                            <span className="status-dot"></span>
                            {progress < 30
                                ? 'Enviando arquivo...'
                                : progress < 70
                                    ? '🤖 IA analisando fatura...'
                                    : progress < 100
                                        ? '📊 Extraindo itens...'
                                        : '✅ Concluído!'
                            }
                        </div>
                    </div>
                )}

                {/* Error State */}
                {phase === 'error' && (
                    <div className="upload-error">
                        <span className="error-icon">❌</span>
                        <div className="error-text">
                            <strong>Erro no processamento</strong>
                            <p>{error}</p>
                        </div>
                        <button className="btn-retry" onClick={handleDiscard}>
                            Tentar novamente
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}
