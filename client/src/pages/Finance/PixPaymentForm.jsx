import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import axios from 'axios';
import './PixPaymentForm.css';
import { QrCode, User, CreditCard, DollarSign } from 'lucide-react';

export default function PixPaymentForm() {
    const { user } = useAuth();

    const [form, setForm] = useState({
        amount: '',
        payer_name: '',
        payer_cpf: '',
    });
    const [qrCode, setQrCode] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleChange = (e) => {
        let value = e.target.value;
        if (e.target.name === 'payer_cpf') {
            // Basic mask for CPF
            value = value.replace(/\D/g, '');
            if (value.length <= 11) {
                value = value.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
            }
        }
        setForm({ ...form, [e.target.name]: value });
    };

    const validateCpf = (cpf) => {
        const cleanCpf = cpf.replace(/\D/g, '');
        return cleanCpf.length === 11;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!form.amount || Number(form.amount) <= 0) {
            setError('Valor inválido');
            return;
        }
        if (!form.payer_name.trim()) {
            setError('Nome completo é obrigatório');
            return;
        }
        if (!validateCpf(form.payer_cpf)) {
            setError('CPF inválido (deve ter 11 dígitos)');
            return;
        }

        setLoading(true);
        try {
            const res = await axios.post(
                '/api/payments/pix',
                {
                    amount: Number(form.amount),
                    payer_name: form.payer_name,
                    payer_cpf: form.payer_cpf.replace(/\D/g, ''),
                    planId: user?.planId || null,
                },
                { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
            );
            setQrCode(res.data.qrCodeBase64);
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.message || 'Erro ao gerar PIX');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="pix-container">
            <div className="pix-card">
                <div className="pix-header">
                    <QrCode className="pix-icon" size={32} />
                    <h2 className="pix-title">Pagamento via PIX</h2>
                    <p className="pix-subtitle">Preencha os dados do pagador para gerar o QR Code</p>
                </div>

                {error && <div className="pix-error-banner">{error}</div>}

                {!qrCode ? (
                    <form className="pix-form" onSubmit={handleSubmit}>
                        <div className="input-group">
                            <label>
                                <DollarSign size={16} /> Valor do Depósito (R$)
                            </label>
                            <input
                                type="number"
                                name="amount"
                                step="0.01"
                                placeholder="0,00"
                                value={form.amount}
                                onChange={handleChange}
                                required
                            />
                        </div>

                        <div className="input-group">
                            <label>
                                <User size={16} /> Nome Completo do Pagador
                            </label>
                            <input
                                type="text"
                                name="payer_name"
                                placeholder="Ex: João Silva Santos"
                                value={form.payer_name}
                                onChange={handleChange}
                                required
                            />
                        </div>

                        <div className="input-group">
                            <label>
                                <CreditCard size={16} /> CPF do Pagador
                            </label>
                            <input
                                type="text"
                                name="payer_cpf"
                                placeholder="000.000.000-00"
                                maxLength="14"
                                value={form.payer_cpf}
                                onChange={handleChange}
                                required
                            />
                        </div>

                        <button type="submit" className="pix-btn-primary" disabled={loading}>
                            {loading ? 'Gerando...' : 'Gerar QR Code de Pagamento'}
                        </button>
                    </form>
                ) : (
                    <div className="pix-qr-section">
                        <div className="qr-container">
                            {/* In a real scenario, this would be the actual QR base64 */}
                            {qrCode ? (
                                <img src={`data:image/png;base64,${qrCode}`} alt="PIX QR Code" className="qr-image" />
                            ) : (
                                <div className="qr-placeholder">QR Code Gerado</div>
                            )}
                        </div>
                        <p className="qr-instruction">
                            Escaneie o código acima usando o aplicativo do seu banco para concluir o pagamento.
                        </p>
                        <div className="pix-summary">
                            <div className="summary-item">
                                <span>Pagador:</span> <strong>{form.payer_name}</strong>
                            </div>
                            <div className="summary-item">
                                <span>Valor:</span> <strong>R$ {Number(form.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                            </div>
                        </div>
                        <button className="pix-btn-outline" onClick={() => setQrCode(null)}>
                            Gerar Novo Pagamento
                        </button>
                    </div>
                )}
            </div>

            <div className="pix-info-card">
                <h3>Por que pedimos esses dados?</h3>
                <p>
                    Para atender às normas de fiscalização e conformidade com órgãos públicos,
                    é necessário identificar a origem dos recursos depositados via PIX.
                    Seus dados são armazenados de forma segura e criptografada.
                </p>
            </div>
        </div>
    );
}
