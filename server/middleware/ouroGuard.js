/**
 * Ouro Plan Guard Middleware
 * Shared between finance.routes.js and invoice.routes.js
 * Extracted to enable clean unit testing via jest.mock()
 */
const { db } = require('../db')

const ouroOnly = async (req, res, next) => {
    try {
        const planResult = await db.query(
            'SELECT p.name FROM plans p JOIN users u ON u."planId" = p.id WHERE u.id = $1',
            [req.user.id]
        )
        const planName = planResult.rows[0]?.name
        if (planName !== 'Ouro' && req.user.plan !== 'Ouro' && !req.user.isInTrial) {
            return res.status(403).json({ message: 'Recurso exclusivo do plano Ouro' })
        }
        next()
    } catch (err) {
        // If DB fails during plan check, allow based on token claim
        if (req.user.plan === 'Ouro' || req.user.isInTrial) return next()
        return res.status(403).json({ message: 'Recurso exclusivo do plano Ouro' })
    }
}

module.exports = { ouroOnly }
