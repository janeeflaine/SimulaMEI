import { useState, useEffect } from 'react'

// Nome que o cliente entende para cada recurso do plano (as chaves vêm do painel admin).
// A ordem padrão é a da comparação: do que mais pesa na escolha para o básico.
// Recursos fora desta lista não aparecem para o cliente.
export const DEFAULT_FEATURE_LABELS = [
    ['whatsapp', 'Assistente no WhatsApp'],
    ['whatsapp_midia', 'Áudio, foto e PDF no WhatsApp'],
    ['contas_pagar', 'Contas a pagar com lembrete'],
    ['upload_faturas', 'Leitura de faturas com IA'],
    ['multi_carteiras', 'Várias carteiras (PF e MEI)'],
    ['transferencias', 'Transferência entre carteiras'],
    ['pdf', 'Relatórios em PDF'],
    ['historico', 'Histórico de simulações'],
    ['cartoes', 'Cartões de crédito'],
    ['categorias', 'Categorias personalizadas'],
    ['alertas', 'Alerta do limite anual do MEI'],
    ['comparativo', 'Comparativo MEI x ME']
]

export const FEATURE_LABELS = [...DEFAULT_FEATURE_LABELS]

/**
 * Ordena a lista de recursos baseando-se em um array de chaves.
 * Chaves não encontradas ou faltantes são adicionadas ao final.
 */
export function orderFeatures(keysOrder = []) {
    if (!Array.isArray(keysOrder) || !keysOrder.length) return [...DEFAULT_FEATURE_LABELS]
    const labelMap = new Map(DEFAULT_FEATURE_LABELS)
    const ordered = []
    const seen = new Set()

    for (const key of keysOrder) {
        if (labelMap.has(key) && !seen.has(key)) {
            ordered.push([key, labelMap.get(key)])
            seen.add(key)
        }
    }

    for (const [key, label] of DEFAULT_FEATURE_LABELS) {
        if (!seen.has(key)) {
            ordered.push([key, label])
        }
    }

    return ordered
}

let cachedOrder = null
const listeners = new Set()

/**
 * Hook para carregar e sincronizar a ordem das funcionalidades em tempo real.
 */
export function useFeatureOrder() {
    const [features, setFeatures] = useState(() => orderFeatures(cachedOrder))

    useEffect(() => {
        const handler = (newOrder) => setFeatures(orderFeatures(newOrder))
        listeners.add(handler)

        if (!cachedOrder) {
            fetch('/api/plans/features-order')
                .then(r => r.ok ? r.json() : null)
                .then(data => {
                    if (Array.isArray(data?.order)) {
                        cachedOrder = data.order
                        listeners.forEach(fn => fn(cachedOrder))
                    }
                })
                .catch(() => {})
        } else {
            setFeatures(orderFeatures(cachedOrder))
        }

        return () => listeners.delete(handler)
    }, [])

    const updateOrder = (newOrder) => {
        cachedOrder = newOrder
        listeners.forEach(fn => fn(newOrder))
    }

    return { features, setFeaturesOrder: updateOrder, orderFeatures }
}

/** "ouro", "prata" ou "gratuito", para a cor do cartão. */
export const tierOf = (planName) => {
    const name = String(planName || '').toLowerCase()
    if (name.includes('ouro')) return 'ouro'
    if (name.includes('prata')) return 'prata'
    return 'gratuito'
}

export const formatBRL = (value) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0)

/** Planos ativos do mais barato para o mais caro. */
export const sortPlans = (plans) =>
    [...plans].filter(p => p.isActive).sort((a, b) => Number(a.price) - Number(b.price))
