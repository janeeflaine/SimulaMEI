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

/** Atalhos semânticos */
const prataPlusOnly = minPlan(2)
const ouroOnly      = minPlan(3)

module.exports = { minPlan, prataPlusOnly, ouroOnly }
