import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useConfirmDialog } from '../components/ui/ConfirmDialog'

const brlFromCents = (cents) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((Number(cents) || 0) / 100)

const shortDate = (value) => {
    if (!value) return ''
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR')
}

const CONNECTION_ERROR = 'Erro de comunicação com o servidor. Nada foi alterado. Tente de novo em instantes.'

/**
 * Assinar, trocar e cancelar plano — a mesma regra em Planos e em Minha conta.
 *
 * Regras de cobrança (decididas em 12/11/2026, aplicadas no servidor):
 *  - plano mais caro: libera na hora e o Stripe cobra a diferença proporcional;
 *  - plano mais barato: troca na hora e a diferença vira crédito na próxima fatura;
 *  - cancelar: mantém o plano até o fim do período pago, sem nova cobrança.
 *
 * As confirmações e avisos aparecem na janela do site (ConfirmDialog):
 * a página que usa este hook precisa renderizar o `dialog` devolvido.
 */
export default function usePlanActions({ onChanged } = {}) {
    const { user, refreshUser } = useAuth()
    const [busy, setBusy] = useState(false)
    const { confirm, notify, dialog } = useConfirmDialog()

    const authHeaders = () => ({
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
    })

    const showError = (title, message) => notify({ tone: 'error', title, message })

    const finish = async (success) => {
        await refreshUser()
        if (success) await notify({ tone: 'success', ...success })
        if (onChanged) onChanged()
    }

    /** Abre o pagamento do Stripe. Quem já assina é levado para a troca de plano. */
    const checkout = async (plan) => {
        setBusy(true)
        try {
            const res = await fetch('/api/stripe/create-checkout-session', {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ planId: plan.id })
            })
            const body = await res.json().catch(() => ({}))
            if (res.ok && body.url) {
                window.location.href = body.url
                return
            }
            if (res.status === 409 && body.code === 'HAS_SUBSCRIPTION') {
                setBusy(false)
                return changePlan(plan)
            }
            setBusy(false)
            return showError('Não foi possível abrir o pagamento', body.message || 'Tente de novo em instantes.')
        } catch (_) {
            setBusy(false)
            return showError('Não foi possível abrir o pagamento', CONNECTION_ERROR)
        }
    }

    /** Pede ao servidor quanto a troca custa (ou quanto vira crédito). Não muda nada. */
    const previewChange = async (plan) => {
        const res = await fetch('/api/stripe/preview-change', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ planId: plan.id })
        })
        const body = await res.json().catch(() => ({}))
        return { res, body }
    }

    /**
     * Troca o plano na assinatura que já existe (ou reativa a que ia ser cancelada).
     * Antes de confirmar, mostra o valor exato calculado pelo Stripe; a troca usa
     * o mesmo instante do cálculo, então o valor cobrado é o que apareceu.
     */
    const changePlan = async (plan, { reactivate = false } = {}) => {
        let question = {
            title: `Manter a assinatura do ${plan.name}?`,
            message: 'A cobrança continua normalmente na renovação.',
            confirmLabel: 'Manter assinatura'
        }
        let success = { title: `Pronto! Sua assinatura do ${plan.name} continua ativa` }
        let prorationDate = null

        if (!reactivate) {
            setBusy(true)
            let preview
            try {
                preview = await previewChange(plan)
            } catch (_) {
                setBusy(false)
                return showError('Não foi possível trocar de plano', CONNECTION_ERROR)
            }
            setBusy(false)
            const { res, body } = preview
            if (res.status === 409 && body.code === 'NO_SUBSCRIPTION') {
                // Plano sem assinatura no Stripe (ex.: dado pelo admin): assina pelo pagamento
                return checkout(plan)
            }
            if (!res.ok) {
                return showError('Não foi possível calcular a troca', body.message || 'Nada foi alterado. Tente de novo em instantes.')
            }
            prorationDate = body.prorationDate
            const monthly = `${brlFromCents(body.monthlyPrice)} por mês`
            const nextDate = shortDate(body.nextBillingDate)
            if (body.upgrade) {
                const now = brlFromCents(body.chargeNow)
                question = {
                    title: `Mudar para o ${plan.name}`,
                    message: 'O plano é liberado na hora e a diferença é cobrada no cartão da assinatura.',
                    details: [
                        { label: 'Cobrado hoje no cartão', value: now, strong: true },
                        ...(nextDate ? [{ label: 'Diferença proporcional até', value: nextDate }] : []),
                        { label: 'Depois', value: monthly }
                    ],
                    confirmLabel: `Mudar para o ${plan.name}`
                }
                success = {
                    title: `Pronto! Você agora está no ${plan.name}`,
                    details: [{ label: 'Cobrado hoje', value: now }]
                }
            } else {
                const credit = brlFromCents(body.credit)
                question = {
                    title: `Mudar para o ${plan.name}`,
                    message: 'A troca é imediata. O que você já pagou a mais vira desconto.',
                    details: [
                        { label: 'Crédito na próxima fatura', value: credit, strong: true },
                        ...(nextDate ? [{ label: 'Próxima fatura', value: nextDate }] : []),
                        { label: 'Depois', value: monthly }
                    ],
                    confirmLabel: `Mudar para o ${plan.name}`
                }
                success = {
                    title: `Pronto! Você agora está no ${plan.name}`,
                    details: [{ label: 'Crédito na próxima fatura', value: credit }]
                }
            }
        }
        if (!(await confirm(question))) return

        setBusy(true)
        try {
            const res = await fetch('/api/stripe/change-plan', {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ planId: plan.id, ...(prorationDate ? { prorationDate } : {}) })
            })
            const body = await res.json().catch(() => ({}))
            setBusy(false)
            if (res.ok) return finish(success)
            if (res.status === 409 && body.code === 'NO_SUBSCRIPTION') return checkout(plan)
            return showError('Não foi possível trocar de plano', body.message || 'Nada foi alterado. Tente de novo em instantes.')
        } catch (_) {
            setBusy(false)
            return showError('Não foi possível trocar de plano', CONNECTION_ERROR)
        }
    }

    /** Cancela a assinatura: o plano vale até o fim do período já pago. */
    const cancel = async () => {
        const currentName = user?.plan || 'plano atual'
        const endsOn = shortDate(user?.planExpiresAt)
        const question = user?.hasSubscription
            ? {
                title: 'Cancelar a assinatura?',
                message: `Você continua com o ${currentName} ${endsOn ? `até ${endsOn}` : 'até o fim do período já pago'} e não haverá nova cobrança. Depois, sua conta volta para o Gratuito.`,
                confirmLabel: 'Cancelar assinatura'
            }
            : {
                title: 'Voltar para o Gratuito?',
                message: `Os recursos do ${currentName} deixam de valer agora.`,
                confirmLabel: 'Voltar ao Gratuito'
            }
        if (!(await confirm({ ...question, tone: 'danger', cancelLabel: 'Manter meu plano' }))) return

        setBusy(true)
        try {
            const res = await fetch('/api/plans/downgrade', { method: 'POST', headers: authHeaders() })
            const body = await res.json().catch(() => ({}))
            setBusy(false)
            if (res.ok) {
                return finish({
                    title: user?.hasSubscription ? 'Assinatura cancelada' : 'Pronto! Você está no Gratuito',
                    message: body.message
                })
            }
            return showError('Não foi possível cancelar', body.message || 'Nada foi alterado. Tente de novo em instantes.')
        } catch (_) {
            setBusy(false)
            return showError('Não foi possível cancelar', CONNECTION_ERROR)
        }
    }

    /**
     * Ação de um plano para o usuário logado, comparando com o plano atual:
     * { label, short, up, run } ou null quando é o plano atual sem nada a fazer.
     */
    const actionFor = (plan, currentPlan) => {
        if (!user) return null
        const isPaid = Number(plan.price) > 0
        const currentPrice = Number(currentPlan?.price ?? 0)
        const isCurrent = currentPlan && Number(currentPlan.id) === Number(plan.id)
        const status = user.subscriptionStatus

        if (isCurrent) {
            if (status === 'pending_payment' && isPaid) {
                return { label: 'Pagar agora', short: 'Pagar', up: true, run: () => checkout(plan) }
            }
            if (status === 'canceling' && isPaid && user.hasSubscription) {
                return { label: 'Manter assinatura', short: 'Manter', up: true, run: () => changePlan(plan, { reactivate: true }) }
            }
            return null
        }
        if (!isPaid) {
            // Gratuito: para quem paga, é cancelar; quem já cancelou só espera a data
            if (status === 'canceling') return null
            if (!user.hasSubscription) return { label: 'Voltar ao Gratuito', short: 'Voltar', up: false, run: cancel }
            return { label: 'Cancelar assinatura', short: 'Cancelar', up: false, run: cancel }
        }
        const hasPaidPlan = currentPrice > 0 && ['active', 'canceling'].includes(status) && !!user.hasSubscription
        const up = Number(plan.price) > currentPrice
        if (hasPaidPlan) {
            return up
                ? { label: `Mudar para o ${plan.name}`, short: 'Mudar', up: true, run: () => changePlan(plan) }
                : { label: `Mudar para o ${plan.name}`, short: 'Mudar', up: false, run: () => changePlan(plan) }
        }
        return { label: `Assinar ${plan.name}`, short: 'Assinar', up: true, run: () => checkout(plan) }
    }

    return { busy, checkout, changePlan, cancel, actionFor, notify, dialog }
}
