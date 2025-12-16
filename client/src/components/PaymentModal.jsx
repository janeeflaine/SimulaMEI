import { useState, useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'

export default function PaymentModal({ plan, onClose, onSuccess }) {
    const [payment, setPayment] = useState(null)
    const [status, setStatus] = useState('loading') // loading, pending, approved, error
    const [error, setError] = useState(null)

    useEffect(() => {
        createPayment()
    }, [])

    useEffect(() => {
        let interval
        if (payment && status === 'pending') {
            interval = setInterval(checkStatus, 3000)
        }
        return () => clearInterval(interval)
    }, [payment, status])

    const createPayment = async () => {
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/payments/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ planId: plan.id })
            })

            if (!res.ok) throw new Error('Erro ao criar pagamento')

            const data = await res.json()
            setPayment(data)
            setStatus('pending')
        } catch (err) {
            console.error(err)
            setError('Não foi possível gerar o QR Code. Tente novamente.')
            setStatus('error')
        }
    }

    const checkStatus = async () => {
        if (!payment) return

        try {
            const token = localStorage.getItem('token')
            const res = await fetch(`/api/payments/${payment.paymentId}/status`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })

            if (res.ok) {
                const data = await res.json()
                if (data.status === 'approved') {
                    setStatus('approved')
                    setTimeout(() => onSuccess(), 1500)
                }
            }
        } catch (err) {
            console.error('Check status error', err)
        }
    }

    const handleCopy = () => {
        navigator.clipboard.writeText(payment.qrCode)
        alert('Código PIX Copia e Cola copiado!')
    }

    // Mock Pay Handler (Dev only)
    const handleMockPay = async () => {
        if (!payment?.mock) return
        try {
            const token = localStorage.getItem('token')
            await fetch(`/api/payments/${payment.paymentId}/mock-pay`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            })
            // Status check loop will pick it up, or we force check
            checkStatus()
        } catch (err) {
            console.error(err)
        }
    }

    if (!plan) return null

    return (
        <div className="modal-overlay" style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
            <div className="modal-content" style={{
                background: 'white', padding: '2rem', borderRadius: '1rem', width: '90%', maxWidth: '400px', textAlign: 'center', position: 'relative'
            }}>
                <button onClick={onClose} style={{
                    position: 'absolute', top: '10px', right: '15px', background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer'
                }}>×</button>

                <h2 style={{ marginBottom: '1rem', color: '#111827' }}>Upgrade para {plan.name}</h2>
                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#10b981', marginBottom: '1.5rem' }}>
                    R$ {plan.price.toFixed(2).replace('.', ',')}
                </div>

                {status === 'loading' && <div className="loader" style={{ margin: '2rem auto' }}></div>}

                {status === 'error' && (
                    <div style={{ color: 'red', marginBottom: '1rem' }}>
                        {error}
                        <button onClick={createPayment} className="btn btn-secondary btn-sm" style={{ marginTop: '1rem' }}>Tentar Novamente</button>
                    </div>
                )}

                {status === 'pending' && payment && (
                    <div className="payment-pending">
                        <div style={{ background: '#f9fafb', padding: '1rem', borderRadius: '0.5rem', marginBottom: '1rem' }}>
                            <QRCodeSVG value={payment.qrCode} size={200} style={{ margin: '0 auto' }} />
                        </div>

                        <p style={{ fontSize: '0.9rem', color: '#6b7280', marginBottom: '1rem' }}>
                            Abra o app do seu banco e escaneie o QR Code ou use a opção "Pix Copia e Cola".
                        </p>

                        <button onClick={handleCopy} className="btn btn-outline-primary" style={{ width: '100%', marginBottom: '1rem' }}>
                            📋 Copiar Código PIX
                        </button>

                        {payment.mock && (
                            <div style={{ marginTop: '1rem', padding: '0.5rem', background: '#fffbeb', borderRadius: '0.5rem', border: '1px solid #fcd34d' }}>
                                <p style={{ fontSize: '0.8rem', color: '#b45309', marginBottom: '0.5rem' }}>⚠️ Modo Teste (Mock)</p>
                                <button onClick={handleMockPay} className="btn btn-primary btn-sm" style={{ width: '100%' }}>
                                    Simular Pagamento Aprovado
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {status === 'approved' && (
                    <div className="payment-success">
                        <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🎉</div>
                        <h3 style={{ color: '#10b981', marginBottom: '0.5rem' }}>Pagamento Aprovado!</h3>
                        <p>Seu plano foi atualizado com sucesso.</p>
                    </div>
                )}
            </div>
        </div>
    )
}
