import { useState, useEffect } from 'react'
import './AdminPages.css'

export default function AdminSettings() {
    const [settings, setSettings] = useState([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [editValues, setEditValues] = useState({})

    useEffect(() => {
        fetchSettings()
    }, [])

    const fetchSettings = async () => {
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/settings', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await res.json()
            setSettings(data)

            // Init edit values
            const initialEdits = {}
            if (Array.isArray(data)) {
                data.forEach(s => initialEdits[s.key] = s.value)
                setEditValues(initialEdits)
            }
        } catch (error) {
            console.error(error)
            alert('Erro ao carregar configurações')
        } finally {
            setLoading(false)
        }
    }

    const handleSave = async (key) => {
        try {
            setSaving(true)
            const token = localStorage.getItem('token')
            const res = await fetch('/api/settings', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ key, value: editValues[key] })
            })

            if (res.ok) {
                alert('Configuração salva com sucesso!')
                fetchSettings() // Refresh
            } else {
                alert('Erro ao salvar')
            }
        } catch (error) {
            console.error(error)
            alert('Erro ao salvar')
        } finally {
            setSaving(false)
        }
    }

    const handleChange = (key, value) => {
        setEditValues(prev => ({ ...prev, [key]: value }))
    }

    return (
        <div className="admin-page">
            <header className="page-header">
                <div>
                    <h1>⚙️ Configurações do Sistema</h1>
                    <p className="subtitle">Gerencie chaves de API e variáveis de ambiente sensíveis.</p>
                </div>
            </header>

            <div className="admin-content">
                <div className="card full-width">
                    <div className="card-header">
                        <h2>💳 Provedores de Pagamento</h2>
                    </div>

                    {loading ? (
                        <div className="loading-state">
                            <div className="loader"></div>
                            <p>Carregando configurações...</p>
                        </div>
                    ) : (
                        <div className="settings-grid">
                            {settings.map(setting => (
                                <div key={setting.key} className="setting-card">
                                    <div className="setting-info">
                                        <label className="setting-label">
                                            {setting.key.replace(/_/g, ' ')}
                                        </label>
                                        <p className="setting-desc">
                                            {setting.isEncrypted
                                                ? <span className="status-badge secure">🔒 Criptografado</span>
                                                : <span className="status-badge warning">⚠️ Texto Plano</span>}
                                        </p>
                                    </div>

                                    <div className="setting-actions">
                                        <div className="input-with-icon">
                                            <span className="input-icon">🔑</span>
                                            <input
                                                type="text"
                                                value={editValues[setting.key] || ''}
                                                onChange={(e) => handleChange(setting.key, e.target.value)}
                                                placeholder={setting.value === '********' ? '•••••••• (Valor seguro)' : 'Digite o valor...'}
                                                className="admin-input"
                                            />
                                        </div>
                                        <button
                                            onClick={() => handleSave(setting.key)}
                                            className="btn btn-primary"
                                            disabled={saving}
                                        >
                                            {saving ? '...' : 'Salvar Alterações'}
                                        </button>
                                    </div>

                                    <div className="setting-footer">
                                        <small>
                                            Última atualização: {setting.updatedAt ? new Date(setting.updatedAt).toLocaleDateString() + ' às ' + new Date(setting.updatedAt).toLocaleTimeString() : 'N/A'}
                                        </small>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <style>{`
                .settings-grid {
                    display: grid;
                    gap: 14px;
                }
                .setting-card {
                    background: rgba(255,255,255,0.03);
                    border: 1px solid rgba(255,255,255,0.07);
                    border-radius: 12px;
                    padding: 20px 22px;
                    display: grid;
                    gap: 14px;
                    transition: all 0.2s;
                }
                .setting-card:hover {
                    border-color: rgba(37,99,235,0.25);
                    box-shadow: 0 4px 16px rgba(0,0,0,0.2);
                }
                .setting-label {
                    font-weight: 600;
                    font-size: 0.95rem;
                    color: #e2e8f0;
                    display: block;
                    margin-bottom: 6px;
                    text-transform: uppercase;
                    letter-spacing: 0.04em;
                    font-size: 0.78rem;
                }
                .status-badge {
                    display: inline-flex;
                    align-items: center;
                    padding: 3px 10px;
                    border-radius: 20px;
                    font-size: 0.72rem;
                    font-weight: 600;
                }
                .status-badge.secure {
                    background: rgba(5,150,105,0.15);
                    color: #6ee7b7;
                }
                .status-badge.warning {
                    background: rgba(180,130,20,0.13);
                    color: #fde68a;
                }
                .setting-actions {
                    display: flex;
                    gap: 12px;
                    align-items: center;
                    flex-wrap: wrap;
                }
                .input-with-icon {
                    flex: 1;
                    position: relative;
                    min-width: 200px;
                }
                .input-icon {
                    position: absolute;
                    left: 12px;
                    top: 50%;
                    transform: translateY(-50%);
                    pointer-events: none;
                    font-size: 0.9rem;
                    opacity: 0.6;
                }
                .admin-input {
                    width: 100%;
                    padding: 11px 14px 11px 36px;
                    background: rgba(255,255,255,0.05);
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 9px;
                    color: #f1f5f9;
                    font-family: 'Fira Code', 'Courier New', monospace;
                    font-size: 0.875rem;
                    transition: all 0.2s;
                    box-sizing: border-box;
                }
                .admin-input:focus {
                    border-color: #2563eb;
                    outline: none;
                    background: rgba(37,99,235,0.07);
                    box-shadow: 0 0 0 3px rgba(37,99,235,0.12);
                }
                .admin-input::placeholder {
                    color: rgba(255,255,255,0.25);
                }
                .setting-footer small {
                    color: rgba(255,255,255,0.3);
                    font-size: 0.775rem;
                }
            `}</style>
        </div>
    )
}
