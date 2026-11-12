import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

const brlFromCents = (cents) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((Number(cents) || 0) / 100)

const shortDate = (value) => {
    if (!value) return ''
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR')
}

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
        let question = `Manter a assinatura do ${plan.name}? A cobrança continua normalmente na renovação.`
        let prorationDate = null
        let summary = null

        if (!reactivate) {
            setBusy(true)
            let preview
            try {
                preview = await previewChange(plan)
            } catch (_) {
                setBusy(false)
                alert('Erro de comunicação com o servidor. Nada foi alterado.')
                return
            }
            setBusy(false)
            const { res, body } = preview
            if (res.status === 409 && body.code === 'NO_SUBSCRIPTION') {
                // Plano sem assinatura no Stripe (ex.: dado pelo admin): assina pelo pagamento
                return checkout(plan)
            }
            if (!res.ok) {
                alert(body.message || 'Não foi possível calcular o valor da troca. Nada foi alterado.')
                return
            }
            prorationDate = body.prorationDate
            const monthly = brlFromCents(body.monthlyPrice)
            const nextDate = shortDate(body.nextBillingDate)
            if (body.upgrade) {
                const now = brlFromCents(body.chargeNow)
                question = `Mudar para o ${plan.name} agora?\n\n` +
                    `Hoje será cobrado ${now} no cartão da assinatura (diferença proporcional${nextDate ? ` até ${nextDate}` : ''}).\n` +
                    `Depois, ${monthly} por mês.`
                summary = `Foram cobrados ${now}.`
            } else {
                const credit = brlFromCents(body.credit)
                question = `Mudar para o ${plan.name} agora?\n\n` +
                    `Você fica com ${credit} de crédito, descontado na próxima fatura${nextDate ? ` (${nextDate})` : ''}.\n` +
                    `Depois, ${monthly} por mês.`
                summary = `${credit} de crédito na próxima fatura.`
            }
        }
        if (!window.confirm(question)) return

        setBusy(true)
        try {
            const res = await fetch('/api/stripe/change-plan', {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ planId: plan.id, ...(prorationDate ? { prorationDate } : {}) })
            })
            const body = await res.json().catch(() => ({}))
            if (res.ok) {
                setBusy(false)
                return finish(reactivate
                    ? `Pronto! Sua assinatura do ${plan.name} continua ativa.`
                    : `Pronto! Você agora está no ${plan.name}. ${summary}`)
            }
            if (res.status === 409 && body.code === 'NO_SUBSCRIPTION') {
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

    return { busy, checkout, changePlan, cancel, actionFor }
}
