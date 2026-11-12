import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

/**
 * Assinar, trocar e cancelar plano — a mesma regra em Planos e em Minha conta.
 *
 * Regras de cobrança (decididas em 12/11/2026, aplicadas no servidor):
 *  - plano mais caro: libera na hora e o Stripe cobra a diferença proporcional;
 *  - plano mais barato: troca na hora e a diferença vira crédito na próxima fatura;
 *  - cancelar: mantém o plano até o fim do período pago, sem nova cobrança.
 */
export default function usePlanActions({ onChanged } = {}) {
    const { user, refreshUser } = useAuth()
    const [busy, setBusy] = useState(false)

    const authHeaders = () => ({
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
    })

    const finish = async (message) => {
        await refreshUser()
        if (message) alert(message)
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
            alert(body.message || 'Não foi possível abrir o pagamento. Tente de novo.')
        } catch (_) {
            alert('Erro de comunicação com o servidor. Tente novamente mais tarde.')
        }
        setBusy(false)
    }

    /** Troca o plano na assinatura que já existe (ou reativa a que ia ser cancelada). */
    const changePlan = async (plan, { currentPrice = 0, reactivate = false } = {}) => {
        const up = Number(plan.price) > Number(currentPrice)
        const question = reactivate
            ? `Manter a assinatura do ${plan.name}? A cobrança continua normalmente na renovação.`
            : up
                ? `Mudar para o ${plan.name} agora? O plano é liberado na hora e o Stripe cobra só a diferença proporcional dos dias que faltam.`
                : `Mudar para o ${plan.name} agora? A troca é imediata e a diferença vira crédito na sua próxima fatura.`
        if (!window.confirm(question)) return

        setBusy(true)
        try {
            const res = await fetch('/api/stripe/change-plan', {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ planId: plan.id })
            })
            const body = await res.json().catch(() => ({}))
            if (res.ok) {
                setBusy(false)
                return finish(reactivate ? `Pronto! Sua assinatura do ${plan.name} continua ativa.` : body.message)
            }
            if (res.status === 409 && body.code === 'NO_SUBSCRIPTION') {
                // Plano sem assinatura no Stripe (ex.: dado pelo admin): assina pelo pagamento
                setBusy(false)
                return checkout(plan)
            }
            alert(body.message || 'Não foi possível trocar de plano. Nada foi alterado.')
        } catch (_) {
            alert('Erro de comunicação com o servidor. Nada foi alterado.')
        }
        setBusy(false)
    }

    /** Cancela a assinatura: o plano vale até o fim do período já pago. */
    const cancel = async () => {
        const question = user?.hasSubscription
            ? 'Cancelar a assinatura? Você continua com o plano até o fim do período já pago e não haverá nova cobrança.'
            : 'Voltar para o plano Gratuito? Os recursos do plano atual deixam de valer agora.'
        if (!window.confirm(question)) return
        setBusy(true)
        try {
            const res = await fetch('/api/plans/downgrade', { method: 'POST', headers: authHeaders() })
            const body = await res.json().catch(() => ({}))
            setBusy(false)
            if (res.ok) return finish(body.message || 'Assinatura cancelada.')
            alert(body.message || 'Não foi possível cancelar. Nada foi alterado.')
        } catch (_) {
            setBusy(false)
            alert('Erro de comunicação com o servidor. Nada foi alterado.')
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
                return { label: 'Manter assinatura', short: 'Manter', up: true, run: () => changePlan(plan, { currentPrice, reactivate: true }) }
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
                ? { label: `Mudar para o ${plan.name}`, short: 'Mudar', up: true, run: () => changePlan(plan, { currentPrice }) }
                : { label: `Mudar para o ${plan.name}`, short: 'Mudar', up: false, run: () => changePlan(plan, { currentPrice }) }
        }
        return { label: `Assinar ${plan.name}`, short: 'Assinar', up: true, run: () => checkout(plan) }
    }

    return { busy, checkout, changePlan, cancel, actionFor }
}
