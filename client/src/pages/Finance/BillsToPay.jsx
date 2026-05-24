import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import FeatureLock from '../../components/FeatureLock'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import './FinanceCategories.css'

export default function BillsToPay() {
    const { user } = useAuth()
    const [bills, setBills] = useState([])
    const [wallets, setWallets] = useState([])
    const [loading, setLoading] = useState(true)
    const [confirmModal, setConfirmModal] = useState(null) // { id, description, amount }
    const [selectedWallet, setSelectedWallet] = useState('')
    const isPrataPlus = user?.planFeatures?.contas_pagar || user?.isInTrial || user?.role === 'ADMIN'

    useEffect(() => {
        if (isPrataPlus) {
            fetchBills()
            fetchWallets()
        }
    }, [isPrataPlus])

    const fetchBills = async () => {
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/finance/transactions?limit=9999', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (res.ok) {
                const response = await res.json()
                // Backend returns { data: [...], totalCount, ... } — extract the array
                const data = Array.isArray(response.data) ? response.data : Array.isArray(response) ? response : []
                const pendingBills = data.filter(t => t.status === 'PENDING')
                // Ordenar por data de vencimento (as mais próximas primeiro -> crescente)
                pendingBills.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
                setBills(pendingBills)
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

    const openConfirmModal = (bill) => {
        setConfirmModal(bill)
        setSelectedWallet(bill.business_unit_id ? String(bill.business_unit_id) : '')
    }

    const handleConfirm = async () => {
        if (!confirmModal) return
        if (!selectedWallet) {
            alert('Selecione de qual carteira o dinheiro saiu.')
            return
        }
        try {
            const token = localStorage.getItem('token')
            const res = await fetch(`/api/finance/transactions/${confirmModal.id}/confirm`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ business_unit_id: selectedWallet })
            })
            if (res.ok) {
                setConfirmModal(null)
                setSelectedWallet('')
                fetchBills()
            }
        } catch (err) {
            console.error(err)
            alert('Erro ao confirmar pagamento.')
        }
    }

    const formatCurrency = (value) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
    }

    const formatDate = (dateString) => {
        if (!dateString) return '-'
        if (typeof dateString === 'string' && dateString.length === 10) {
            const [year, month, day] = dateString.split('-')
            return `${day}/${month}/${year}`
        }
        return new Date(dateString).toLocaleDateString('pt-BR')
    }

    const todayString = new Date().toLocaleDateString('sv-SE')

    const generateBillsPDF = () => {
        try {
            const doc = new jsPDF('portrait', 'mm', 'a4')
            const pageWidth = doc.internal.pageSize.getWidth()
            const pageHeight = doc.internal.pageSize.getHeight()
            const margin = 14

            // ─── HEADER GRADIENT BAR ───
            doc.setFillColor(16, 185, 129) // emerald-500
            doc.rect(0, 0, pageWidth, 38, 'F')
            doc.setFillColor(5, 150, 105) // emerald-600 accent stripe
            doc.rect(0, 35, pageWidth, 3, 'F')

            // ─── HEADER TEXT ───
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(22)
            doc.setTextColor(255, 255, 255)
            doc.text('📄 Contas a Pagar', margin, 18)
            doc.setFontSize(10)
            doc.setFont('helvetica', 'normal')
            doc.text('Relatório de Boletos Pendentes', margin, 27)
            // Date on right side
            doc.setFontSize(9)
            const today = new Date()
            const dateStr = `Gerado em: ${today.toLocaleDateString('pt-BR')} às ${today.toLocaleTimeString('pt-BR')}`
            doc.text(dateStr, pageWidth - margin, 27, { align: 'right' })
            doc.text(`Usuário: ${user?.name || 'MEI'}`, pageWidth - margin, 18, { align: 'right' })

            // ─── SUMMARY CARDS ───
            const overdueBills = bills.filter(b => b.dueDate < todayString)
            const todayBills = bills.filter(b => b.dueDate === todayString)
            const upcomingBills = bills.filter(b => b.dueDate > todayString)
            const totalAmount = bills.reduce((sum, b) => sum + (b.amount || 0), 0)
            const overdueAmount = overdueBills.reduce((sum, b) => sum + (b.amount || 0), 0)

            const cardY = 46
            const cardH = 22
            const cardW = (pageWidth - margin * 2 - 12) / 4 // 4 cards with gaps
            const cardGap = 4

            const cards = [
                { label: 'Total Pendente', value: formatCurrency(totalAmount), bg: [241, 245, 249], accent: [30, 41, 59], icon: '💰' },
                { label: 'Vencidos', value: `${overdueBills.length} boleto(s)`, bg: [254, 242, 242], accent: [239, 68, 68], icon: '🚨' },
                { label: 'Vencem Hoje', value: `${todayBills.length} boleto(s)`, bg: [255, 251, 235], accent: [217, 119, 6], icon: '📅' },
                { label: 'A Vencer', value: `${upcomingBills.length} boleto(s)`, bg: [236, 253, 245], accent: [16, 185, 129], icon: '✅' },
            ]

            cards.forEach((card, i) => {
                const x = margin + i * (cardW + cardGap)
                // Card background
                doc.setFillColor(...card.bg)
                doc.roundedRect(x, cardY, cardW, cardH, 3, 3, 'F')
                // Accent left bar
                doc.setFillColor(...card.accent)
                doc.rect(x, cardY, 2.5, cardH, 'F')
                // Label
                doc.setFont('helvetica', 'normal')
                doc.setFontSize(7.5)
                doc.setTextColor(100, 116, 139) // slate-500
                doc.text(card.label, x + 6, cardY + 7)
                // Value
                doc.setFont('helvetica', 'bold')
                doc.setFontSize(10)
                doc.setTextColor(...card.accent)
                doc.text(card.value, x + 6, cardY + 16)
            })

            // ─── TABLE ───
            const tableStartY = cardY + cardH + 10

            // Section title
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(12)
            doc.setTextColor(30, 41, 59)
            doc.text('Detalhamento dos Boletos', margin, tableStartY - 2)

            const tableData = bills.map(bill => {
                let status = 'A VENCER'
                if (bill.dueDate < todayString) status = 'VENCIDO'
                else if (bill.dueDate === todayString) status = 'VENCE HOJE'

                return [
                    formatDate(bill.dueDate),
                    bill.description || 'S/ Descrição',
                    bill.paymentMethod || '-',
                    bill.categoryName || 'S/ Categoria',
                    bill.target === 'BUSINESS' ? 'PJ' : 'PF',
                    formatCurrency(bill.amount),
                    status
                ]
            })

            autoTable(doc, {
                startY: tableStartY + 2,
                head: [['Vencimento', 'Descrição', 'Método', 'Categoria', 'Tipo', 'Valor', 'Status']],
                body: tableData,
                styles: {
                    fontSize: 8.5,
                    cellPadding: 4,
                    lineColor: [226, 232, 240],
                    lineWidth: 0.3,
                    font: 'helvetica',
                },
                headStyles: {
                    fillColor: [16, 185, 129],
                    textColor: [255, 255, 255],
                    fontStyle: 'bold',
                    fontSize: 8,
                    halign: 'center',
                },
                alternateRowStyles: {
                    fillColor: [248, 250, 252], // slate-50
                },
                columnStyles: {
                    0: { halign: 'center', cellWidth: 24 },
                    1: { cellWidth: 'auto' },
                    2: { halign: 'center', cellWidth: 22 },
                    3: { cellWidth: 28 },
                    4: { halign: 'center', cellWidth: 14 },
                    5: { halign: 'right', cellWidth: 28, fontStyle: 'bold' },
                    6: { halign: 'center', cellWidth: 24 },
                },
                didParseCell: function(data) {
                    // Style the status column
                    if (data.section === 'body' && data.column.index === 6) {
                        const status = data.cell.raw
                        if (status === 'VENCIDO') {
                            data.cell.styles.textColor = [239, 68, 68]
                            data.cell.styles.fontStyle = 'bold'
                        } else if (status === 'VENCE HOJE') {
                            data.cell.styles.textColor = [217, 119, 6]
                            data.cell.styles.fontStyle = 'bold'
                        } else {
                            data.cell.styles.textColor = [16, 185, 129]
                        }
                    }
                    // Highlight overdue rows
                    if (data.section === 'body') {
                        const rowStatus = tableData[data.row.index]?.[6]
                        if (rowStatus === 'VENCIDO') {
                            if (data.column.index !== 6) {
                                data.cell.styles.fillColor = data.row.index % 2 === 0 ? [254, 242, 242] : [254, 226, 226]
                            }
                        }
                    }
                },
                margin: { left: margin, right: margin },
                tableWidth: 'auto',
            })

            // ─── TOTAL ROW below table ───
            const finalY = doc.lastAutoTable.finalY + 4
            if (overdueAmount > 0) {
                doc.setFillColor(254, 242, 242)
                doc.roundedRect(margin, finalY, pageWidth - margin * 2, 12, 2, 2, 'F')
                doc.setFont('helvetica', 'bold')
                doc.setFontSize(9)
                doc.setTextColor(239, 68, 68)
                doc.text(`⚠ Total Vencido: ${formatCurrency(overdueAmount)}`, margin + 4, finalY + 7.5)
            }

            doc.setFillColor(236, 253, 245)
            const totalRowY = overdueAmount > 0 ? finalY + 16 : finalY
            doc.roundedRect(margin, totalRowY, pageWidth - margin * 2, 12, 2, 2, 'F')
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(9)
            doc.setTextColor(5, 150, 105)
            doc.text(`💰 Total Geral Pendente: ${formatCurrency(totalAmount)}`, margin + 4, totalRowY + 7.5)
            doc.text(`${bills.length} boleto(s)`, pageWidth - margin - 4, totalRowY + 7.5, { align: 'right' })

            // ─── FOOTER ───
            const footerY = pageHeight - 12
            doc.setDrawColor(226, 232, 240)
            doc.line(margin, footerY - 4, pageWidth - margin, footerY - 4)
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(7)
            doc.setTextColor(148, 163, 184) // slate-400
            doc.text('SimulaMEI — Relatório de Contas a Pagar', margin, footerY)
            doc.text('Documento gerado automaticamente. Confira os dados com seu controle financeiro.', pageWidth / 2, footerY, { align: 'center' })
            doc.text('Pág. 1', pageWidth - margin, footerY, { align: 'right' })

            doc.save(`contas-a-pagar-${today.toISOString().split('T')[0]}.pdf`)
        } catch (error) {
            console.error('Erro ao gerar PDF:', error)
            alert('Erro ao gerar o PDF. Tente novamente.')
        }
    }

    if (!isPrataPlus) {
        return (
            <div className="container py-8">
                <FeatureLock
                    featureName="Contas a Pagar (Boletos)"
                    requiredPlan="Prata"
                    description="Nunca mais esqueça um vencimento. Gerencie seus boletos e contas futuras de forma organizada e eficiente."
                    icon="📄"
                />
            </div>
        )
    }

    return (
        <div className="finance-categories-page">
            <div className="container">
                <div className="statement-header">
                    <div className="header-title">
                        <h1>Contas a Pagar</h1>
                        <p>Boletos e compromissos aguardando confirmação</p>
                    </div>
                    <div className="header-actions">
                        {bills.length > 0 && (
                            <button
                                onClick={generateBillsPDF}
                                className="btn btn-primary btn-sm"
                                id="btn-export-bills-pdf"
                                style={{
                                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                    border: 'none',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '8px 18px',
                                    fontSize: '0.85rem',
                                    fontWeight: 600,
                                    borderRadius: '10px',
                                    boxShadow: '0 4px 14px rgba(99, 102, 241, 0.3)',
                                    transition: 'all 0.2s',
                                }}
                            >
                                📥 Exportar PDF
                            </button>
                        )}
                    </div>
                </div>

                <div className="section" style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
                    {loading ? (
                        <div className="text-center py-8">Carregando...</div>
                    ) : bills.length === 0 ? (
                        <div className="empty-state">
                            <span className="empty-icon">📄</span>
                            <h3>Tudo em dia!</h3>
                            <p>Você não possui boletos pendentes no momento.</p>
                        </div>
                    ) : (
                        <div className="table-container">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Vencimento</th>
                                        <th>Descrição</th>
                                        <th>Método</th>
                                        <th>Categoria</th>
                                        <th>Destino</th>
                                        <th>Valor</th>
                                        <th>Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {bills.map((bill) => (
                                        <tr key={bill.id}>
                                            <td style={{ fontWeight: 'bold', color: bill.dueDate < todayString ? '#ef4444' : bill.dueDate === todayString ? '#d97706' : 'inherit' }}>
                                                {formatDate(bill.dueDate)}
                                                {bill.dueDate < todayString && <span style={{ fontSize: '10px', display: 'block', color: '#ef4444', fontWeight: 700 }}>🚨 VENCIDO</span>}
                                                {bill.dueDate === todayString && <span style={{ fontSize: '10px', display: 'block', color: '#d97706', fontWeight: 700 }}>📅 VENCE HOJE</span>}
                                            </td>
                                            <td>{bill.description || 'S/ Descrição'}</td>
                                            <td>
                                                {bill.paymentMethod}
                                                {bill.cardName && <small style={{ display: 'block', color: '#64748b' }}>{bill.cardName}</small>}
                                            </td>
                                            <td>{bill.categoryName || 'S/ Categoria'}</td>
                                            <td>
                                                <span className="badge badge-info" style={{ backgroundColor: '#f1f5f9', color: '#475569' }}>
                                                    {bill.target === 'BUSINESS' ? '🏢 PJ' : '👤 PF'}
                                                </span>
                                            </td>
                                            <td style={{ fontWeight: 'bold' }}>{formatCurrency(bill.amount)}</td>
                                            <td>
                                                <button
                                                    onClick={() => openConfirmModal(bill)}
                                                    className="btn btn-primary btn-sm"
                                                    style={{ backgroundColor: '#10b981', borderColor: '#10b981' }}
                                                >
                                                    Confirmar Pagamento
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* Payment Confirmation Modal */}
            {confirmModal && (
                <div className="modal-overlay" style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)'
                }}>
                    <div style={{
                        background: 'white', padding: '30px', borderRadius: '20px',
                        width: '100%', maxWidth: '460px', position: 'relative',
                        boxShadow: '0 20px 50px rgba(0,0,0,0.2)'
                    }}>
                        <button
                            onClick={() => { setConfirmModal(null); setSelectedWallet('') }}
                            style={{
                                position: 'absolute', top: '15px', right: '15px',
                                background: 'none', border: 'none', fontSize: '1.5rem',
                                cursor: 'pointer', color: '#94a3b8'
                            }}
                        >×</button>

                        <h3 style={{ marginBottom: '8px', fontSize: '1.25rem', fontWeight: 700 }}>
                            💰 Confirmar Pagamento
                        </h3>
                        <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '20px' }}>
                            {confirmModal.description || 'Pagamento'} — <strong>{formatCurrency(confirmModal.amount)}</strong>
                        </p>

                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', fontWeight: 600, marginBottom: '8px', fontSize: '0.9rem' }}>
                                De qual conta/carteira o dinheiro saiu?
                            </label>
                            <select
                                value={selectedWallet}
                                onChange={e => setSelectedWallet(e.target.value)}
                                style={{
                                    width: '100%', padding: '10px 12px', borderRadius: '10px',
                                    border: '1px solid #e2e8f0', fontSize: '0.95rem',
                                    background: '#f8fafc'
                                }}
                            >
                                <option value="">Selecione uma carteira</option>
                                <optgroup label="🏢 EMPRESA (PJ)">
                                    {wallets.filter(w => w.account_type === 'PJ').map(w => (
                                        <option key={w.id} value={w.id}>🏢 {w.name}</option>
                                    ))}
                                </optgroup>
                                <optgroup label="👤 PESSOAL (PF)">
                                    {wallets.filter(w => w.account_type === 'PF').map(w => (
                                        <option key={w.id} value={w.id}>👤 {w.name}</option>
                                    ))}
                                </optgroup>
                            </select>
                        </div>

                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button
                                onClick={() => { setConfirmModal(null); setSelectedWallet('') }}
                                className="btn btn-outline"
                                style={{ flex: 1 }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleConfirm}
                                className="btn btn-primary"
                                style={{ flex: 1, backgroundColor: '#10b981', borderColor: '#10b981' }}
                            >
                                ✅ Confirmar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
