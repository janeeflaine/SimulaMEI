/**
 * planGuard.js — Middleware unificado de controle de plano
 *
 * Hierarquia de planos:
 *   1 = Gratuito
 *   2 = Prata
 *   3 = Ouro
 *
 * Trial sempre recebe acesso equivalente ao Ouro (planId 3).
 * Admin sempre passa.
 */

const PLAN_NAMES = { 1: 'Gratuito', 2: 'Prata', 3: 'Ouro' }

/**
 * Exige que o usuário tenha pelo menos o plano indicado.
 * @param {number} minPlanId - 1 (Gratuito), 2 (Prata) ou 3 (Ouro)
 */
const minPlan = (minPlanId) => (req, res, next) => {
    const isAdmin   = req.user?.role === 'ADMIN'
    const inTrial   = req.user?.isInTrial === true
    const planId    = Number(req.user?.planId) || 1

    if (isAdmin || inTrial || planId >= minPlanId) return next()

    return res.status(403).json({
        message: `Funcionalidade disponível a partir do plano ${PLAN_NAMES[minPlanId] || 'superior'}.`
    })
}

/**
 * Verifica se a feature está habilitada nas planFeatures do usuário.
 * Permite acesso se: admin, trial, ou planFeatures[key] === true.
 * Fallback para minPlan(minPlanId) se o plano não tiver features definidas.
 */
const featureGuard = (featureKey, fallbackMinPlanId = 2) => (req, res, next) => {
    const isAdmin = req.user?.role === 'ADMIN'
    const inTrial = req.user?.isInTrial === true
    if (isAdmin || inTrial) return next()

    const features = req.user?.planFeatures || {}
    // Se a feature está explicitamente configurada no plano, usa ela
    if (typeof features[featureKey] === 'boolean') {
        if (features[featureKey]) return next()
        return res.status(403).json({
            message: `Funcionalidade "${featureKey}" não disponível no seu plano atual.`,
            debug: { planId: req.user?.planId, planFeatures: features }
        })
    }
    // Fallback: comportamento por planId (planos sem features configuradas)
    const planId = Number(req.user?.planId) || 1
    if (planId >= fallbackMinPlanId) return next()
    return res.status(403).json({
        message: `Funcionalidade disponível a partir do plano ${PLAN_NAMES[fallbackMinPlanId] || 'superior'}.`
    })
}

/** Atalhos semânticos */
const prataPlusOnly = minPlan(2)
const ouroOnly      = minPlan(3)

module.exports = { minPlan, prataPlusOnly, ouroOnly, featureGuard }
