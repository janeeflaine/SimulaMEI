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
                    gap: 1.5rem;
                }
                .setting-card {
                    background: #f8fafc;
                    border: 1px solid #e2e8f0;
                    border-radius: 12px;
                    padding: 1.5rem;
                    display: grid;
                    gap: 1rem;
                    transition: all 0.2s;
                }
                .setting-card:hover {
                    border-color: #cbd5e1;
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
                }
                .setting-label {
                    font-weight: 600;
                    font-size: 1rem;
                    color: #1e293b;
                    display: block;
                    margin-bottom: 0.25rem;
                }
                .status-badge {
                    display: inline-flex;
                    align-items: center;
                    padding: 0.25rem 0.75rem;
                    border-radius: 9999px;
                    font-size: 0.75rem;
                    font-weight: 600;
                }
                .status-badge.secure {
                    background: #dcfce7;
                    color: #166534;
                }
                .status-badge.warning {
                    background: #fef9c3;
                    color: #854d0e;
                }
                .setting-actions {
                    display: flex;
                    gap: 1rem;
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
                    left: 1rem;
                    top: 50%;
                    transform: translateY(-50%);
                    pointer-events: none;
                }
                .admin-input {
                    width: 100%;
                    padding: 0.75rem 1rem 0.75rem 2.5rem;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    font-family: monospace;
                    font-size: 0.9rem;
                    transition: border-color 0.2s;
                }
                .admin-input:focus {
                    border-color: #3b82f6;
                    outline: none;
                    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
                }
                .setting-footer small {
                    color: #94a3b8;
                    font-size: 0.8rem;
                }
            `}</style>
        </div>
    )
}
