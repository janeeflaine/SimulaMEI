import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'

export default function Alerts() {
    const { user } = useAuth()
    const [alerts, setAlerts] = useState([])
    const [loading, setLoading] = useState(true)
    const [message, setMessage] = useState('')

    useEffect(() => {
        fetchAlerts()
    }, [])

    const fetchAlerts = async () => {
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/alerts', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (res.ok) {
                const data = await res.json()
                setAlerts(data)
            }
        } catch (err) {
            console.error('Error fetching alerts:', err)
        } finally {
            setLoading(false)
        }
    }

    const toggleAlert = async (id, enabled) => {
        try {
            const token = localStorage.getItem('token')
            const res = await fetch(`/api/alerts/${id}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ enabled })
            })

            if (res.ok) {
                fetchAlerts()
                setMessage('Configuração atualizada!')
                setTimeout(() => setMessage(''), 3000)
            }
        } catch (err) {
            console.error('Error toggling alert:', err)
        }
    }

    const updateConfig = async (id, config) => {
        try {
            const token = localStorage.getItem('token')
            await fetch(`/api/alerts/${id}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ config })
            })
            fetchAlerts()
            setMessage('Configuração salva!')
            setTimeout(() => setMessage(''), 3000)
        } catch (err) {
            console.error('Error updating config:', err)
        }
    }

    if (loading) return <div style={{ padding: '20px' }}>Carregando...</div>

    return (
        <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto' }}>
            <h1 style={{ color: '#1a365d', marginBottom: '10px' }}>🔔 Gerenciamento de Alertas</h1>
            <p style={{ color: '#4a5568', marginBottom: '30px' }}>
                Ative e personalize seus alertas inteligentes para manter seu MEI em dia.
            </p>

            {message && (
                <div style={{ backgroundColor: '#c6f6d5', color: '#22543d', padding: '10px', borderRadius: '8px', marginBottom: '20px' }}>
                    {message}
                </div>
            )}

            <div style={{ display: 'grid', gap: '20px' }}>
                {alerts.map(alert => (
                    <div key={alert.id} style={{
                        backgroundColor: 'white',
                        padding: '20px',
                        borderRadius: '12px',
                        boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
                        border: '1px solid #e2e8f0',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '15px'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 style={{ margin: 0, color: '#2d3748' }}>
                                    {alert.type === 'REVENUE_LIMIT' && 'Limite de Faturamento'}
                                    {alert.type === 'DAS_EXPIRY' && 'Vencimento do DAS'}
                                    {alert.type === 'ANNUAL_DECLARATION' && 'Declaração Anual (DASN-SIMEI)'}
                                </h3>
                                <p style={{ margin: '5px 0 0', color: '#718096', fontSize: '14px' }}>
                                    {alert.type === 'REVENUE_LIMIT' && 'Avisa quando você atinge uma porcentagem específica do limite anual.'}
                                    {alert.type === 'DAS_EXPIRY' && 'Lembrete automático dias antes do vencimento no dia 20.'}
                                    {alert.type === 'ANNUAL_DECLARATION' && 'Lembrete para o prazo final de entrega em Maio.'}
                                </p>
                            </div>
                            <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '50px', height: '24px' }}>
                                <input
                                    type="checkbox"
                                    checked={alert.enabled}
                                    onChange={(e) => toggleAlert(alert.id, e.target.checked)}
                                    style={{ opacity: 0, width: 0, height: 0 }}
                                />
                                <span style={{
                                    position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                                    backgroundColor: alert.enabled ? '#48bb78' : '#cbd5e0',
                                    transition: '.4s', borderRadius: '34px'
                                }}>
                                    <span style={{
                                        position: 'absolute', height: '18px', width: '18px', left: alert.enabled ? '28px' : '4px', bottom: '3px',
                                        backgroundColor: 'white', transition: '.4s', borderRadius: '50%'
                                    }}></span>
                                </span>
                            </label>
                        </div>

                        {alert.enabled && (
                            <div style={{ borderTop: '1px solid #edf2f7', pt: '15px', marginTop: '5px', paddingTop: '15px' }}>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#4a5568', marginBottom: '8px' }}>
                                    Personalizar:
                                </label>

                                {alert.type === 'REVENUE_LIMIT' && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span style={{ fontSize: '14px' }}>Me avisar quando atingir</span>
                                        <input
                                            type="number"
                                            value={JSON.parse(alert.config).trigger_at_percentage}
                                            onChange={(e) => updateConfig(alert.id, { trigger_at_percentage: parseInt(e.target.value) })}
                                            style={{ width: '60px', padding: '5px', borderRadius: '4px', border: '1px solid #cbd5e0' }}
                                        />
                                        <span style={{ fontSize: '14px' }}>% do limite.</span>
                                    </div>
                                )}

                                {alert.type === 'DAS_EXPIRY' && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span style={{ fontSize: '14px' }}>Me avisar</span>
                                        <input
                                            type="number"
                                            value={JSON.parse(alert.config).days_before}
                                            onChange={(e) => updateConfig(alert.id, { days_before: parseInt(e.target.value) })}
                                            style={{ width: '60px', padding: '5px', borderRadius: '4px', border: '1px solid #cbd5e0' }}
                                        />
                                        <span style={{ fontSize: '14px' }}>dias antes do vencimento.</span>
                                    </div>
                                )}

                                {alert.type === 'ANNUAL_DECLARATION' && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span style={{ fontSize: '14px' }}>Manter lembrete ativo durante os meses de Abril e Maio.</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <div style={{ marginTop: '40px', padding: '20px', backgroundColor: '#ebf8ff', borderRadius: '12px', color: '#2c5282' }}>
                <p style={{ margin: 0, fontSize: '14px' }}>
                    <strong>Dica Ouro:</strong> Os alertas aparecem diretamente no seu Painel de Controle e também podem ser enviados por e-mail no futuro.
                </p>
            </div>
        </div>
    )
}
