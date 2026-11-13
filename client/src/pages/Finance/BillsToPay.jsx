import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import FeatureLock from '../../components/FeatureLock'
import FinanceQuickActionModal from '../../components/FinanceQuickActionModal'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Check, CircleCheck, Download, Plus } from 'lucide-react'
import { useConfirmDialog } from '../../components/ui/ConfirmDialog'
import './FinanceCategories.css'
import './BillsToPay.css'

export default function BillsToPay() {
    const { user } = useAuth()
    const [bills, setBills] = useState([])
    const [wallets, setWallets] = useState([])
    const [loading, setLoading] = useState(true)
    const [confirmModal, setConfirmModal] = useState(null) // { id, description, amount }
    const [selectedWallet, setSelectedWallet] = useState('')
    const isPrataPlus = user?.planFeatures?.contas_pagar || user?.isInTrial || user?.role === 'ADMIN'
    const [isFinanceModalOpen, setIsFinanceModalOpen] = useState(false)
    const [confirming, setConfirming] = useState(false)
    const { notify, dialog } = useConfirmDialog()

    useEffect(() => {
        if (isPrataPlus) {
            fetchBills()
            fetchWallets()
        }
    }, [isPrataPlus])

    useEffect(() => {
        if (!confirmModal) return
        const onKey = (e) => {
            // Se um aviso estiver aberto por cima, o Esc fecha só o aviso
            if (e.key !== 'Escape' || e.defaultPrevented || confirming) return
            closeConfirmModal()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [confirmModal, confirming])

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

    const closeConfirmModal = () => {
        setConfirmModal(null)
        setSelectedWallet('')
    }

    const handleConfirm = async () => {
        if (!confirmModal || !selectedWallet) return
        setConfirming(true)
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
                closeConfirmModal()
                fetchBills()
            } else {
                const data = await res.json().catch(() => ({}))
                notify({ title: 'Não deu para confirmar o pagamento', message: data.message || 'Tente de novo em instantes.', tone: 'error' })
            }
        } catch (err) {
            console.error(err)
            notify({ title: 'Não deu para confirmar o pagamento', message: 'Verifique sua internet e tente de novo.', tone: 'error' })
        } finally {
            setConfirming(false)
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
            doc.text('Contas a pagar', margin, 18)
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
                doc.text(`Total vencido: ${formatCurrency(overdueAmount)}`, margin + 4, finalY + 7.5)
            }

            doc.setFillColor(236, 253, 245)
            const totalRowY = overdueAmount > 0 ? finalY + 16 : finalY
            doc.roundedRect(margin, totalRowY, pageWidth - margin * 2, 12, 2, 2, 'F')
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(9)
            doc.setTextColor(5, 150, 105)
            doc.text(`Total pendente: ${formatCurrency(totalAmount)}`, margin + 4, totalRowY + 7.5)
            doc.text(`${bills.length} boleto(s)`, pageWidth - margin - 4, totalRowY + 7.5, { align: 'right' })

            // ─── FOOTER ───
            const footerY = pageHeight - 12
            doc.setDrawColor(226, 232, 240)
            doc.line(margin, footerY - 4, pageWidth - margin, footerY - 4)
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(7)
            doc.setTextColor(148, 163, 184) // slate-400
            doc.text('EuSempreMEI — Relatório de Contas a Pagar', margin, footerY)
            doc.text('Documento gerado automaticamente. Confira os dados com seu controle financeiro.', pageWidth / 2, footerY, { align: 'center' })
            doc.text('Pág. 1', pageWidth - margin, footerY, { align: 'right' })

            doc.save(`contas-a-pagar-${today.toISOString().split('T')[0]}.pdf`)
        } catch (error) {
            console.error('Erro ao gerar PDF:', error)
            notify({ title: 'Não deu para gerar o PDF', message: 'Tente de novo em instantes.', tone: 'error' })
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
        <div className="finance-categories-page contas-pagar">
            <div className="container">
                <div className="statement-header">
                    <div className="header-title">
                        <h1>Contas a pagar</h1>
                        <p>Boletos e compromissos aguardando confirmação</p>
                    </div>
                    <div className="header-actions">
                        {bills.length > 0 && (
                            <button
                                type="button"
                                onClick={generateBillsPDF}
                                className="btn btn-secondary"
                                id="btn-export-bills-pdf"
                            >
                                <Download size={18} aria-hidden="true" /> Exportar PDF
                            </button>
                        )}
                        <button type="button" className="btn btn-primary" onClick={() => setIsFinanceModalOpen(true)}>
                            <Plus size={18} aria-hidden="true" /> Novo lançamento
                        </button>
                    </div>
                </div>

                <div className="section" style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
                    {loading ? (
                        <div className="text-center py-8">Carregando...</div>
                    ) : bills.length === 0 ? (
                        <div className="empty-state">
                            <span className="cp-empty-icon" aria-hidden="true"><CircleCheck size={28} /></span>
                            <h3>Tudo em dia!</h3>
                            <p>Você não possui boletos pendentes no momento.</p>
                        </div>
                    ) : (
                        <div className="table-container">
                            <table className="table cp-table">
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
                                            <td className="cp-due">
                                                <span className="cp-date">
                                                    <span className="cp-date-label">{bill.dueDate < todayString ? 'Venceu em ' : 'Vence em '}</span>
                                                    {formatDate(bill.dueDate)}
                                                </span>
                                                {bill.dueDate < todayString && <span className="cp-tag cp-tag--late">Vencida</span>}
                                                {bill.dueDate === todayString && <span className="cp-tag cp-tag--today">Vence hoje</span>}
                                            </td>
                                            <td className="cp-desc">{bill.description || 'Sem descrição'}</td>
                                            <td className="cp-method">
                                                {bill.paymentMethod}
                                                {bill.cardName && <small>{bill.cardName}</small>}
                                            </td>
                                            <td className="cp-cat">{bill.categoryName || 'Sem categoria'}</td>
                                            <td className="cp-dest">
                                                <span className="cp-tag cp-tag--wallet">
                                                    {bill.target === 'BUSINESS' ? 'MEI' : 'Pessoal'}
                                                </span>
                                            </td>
                                            <td className="cp-amount">{formatCurrency(bill.amount)}</td>
                                            <td className="cp-act">
                                                <button
                                                    type="button"
                                                    onClick={() => openConfirmModal(bill)}
                                                    className="btn btn-secondary btn-sm cp-pay"
                                                >
                                                    <Check size={16} aria-hidden="true" /> Confirmar pagamento
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

            {/* Janela de confirmar pagamento */}
            {confirmModal && (
                <div className="cd-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !confirming) closeConfirmModal() }}>
                    <form
                        className="cd-box cp-box"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="cp-title"
                        onSubmit={(e) => { e.preventDefault(); handleConfirm() }}
                    >
                        <h2 id="cp-title" className="cd-title">Confirmar pagamento</h2>
                        <p className="cd-message">Escolha de qual carteira o dinheiro saiu.</p>

                        <dl className="cd-details">
                            <div><dt>Conta</dt><dd className="cp-desc">{confirmModal.description || 'Sem descrição'}</dd></div>
                            <div><dt>Vencimento</dt><dd>{formatDate(confirmModal.dueDate)}</dd></div>
                            <div className="is-strong"><dt>Valor</dt><dd>{formatCurrency(confirmModal.amount)}</dd></div>
                        </dl>

                        <label className="cp-field">
                            <span>Carteira</span>
                            <select
                                value={selectedWallet}
                                onChange={e => setSelectedWallet(e.target.value)}
                                autoFocus
                            >
                                <option value="">Selecione a carteira</option>
                                <optgroup label="MEI (PJ)">
                                    {wallets.filter(w => w.account_type === 'PJ').map(w => (
                                        <option key={w.id} value={w.id}>{w.name}</option>
                                    ))}
                                </optgroup>
                                <optgroup label="Pessoal (PF)">
                                    {wallets.filter(w => w.account_type === 'PF').map(w => (
                                        <option key={w.id} value={w.id}>{w.name}</option>
                                    ))}
                                </optgroup>
                            </select>
                        </label>

                        <div className="cd-actions">
                            <button type="button" className="cd-btn" onClick={closeConfirmModal} disabled={confirming}>
                                Voltar
                            </button>
                            <button type="submit" className="cd-btn cd-btn--primary" disabled={!selectedWallet || confirming}>
                                {confirming ? 'Confirmando…' : 'Confirmar pagamento'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {isFinanceModalOpen && (
                <FinanceQuickActionModal
                    onClose={() => setIsFinanceModalOpen(false)}
                    onWalletCreated={fetchWallets}
                    onSuccess={() => {
                        fetchBills()
                    }}
                />
            )}

            {dialog}
        </div>
    )
}
