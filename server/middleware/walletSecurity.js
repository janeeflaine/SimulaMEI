const { db } = require('../db')

/**
 * Middleware to validate if the user owns the business_unit_id (wallet)
 * sent in the request body.
 * Also checks sourceWalletId and targetWalletId for transfers.
 */
const validateWalletOwnership = async (req, res, next) => {
    try {
        const userId = req.user.id
        const { business_unit_id, sourceWalletId, targetWalletId } = req.body

        // Collect all wallet IDs that need verification
        const walletIdsToCheck = new Set()

        if (business_unit_id) walletIdsToCheck.add(Number(business_unit_id))
        if (sourceWalletId) walletIdsToCheck.add(Number(sourceWalletId))
        if (targetWalletId) walletIdsToCheck.add(Number(targetWalletId))

        if (walletIdsToCheck.size === 0) {
            // No wallet ID in body, proceed (might be a global operation or update without moving wallet)
            return next()
        }

        // Query DB to find which of these wallets belong to the user
        const { rows } = await db.query(
            `SELECT id FROM business_units WHERE "ownerId" = $1 AND id = ANY($2::int[])`,
            [userId, Array.from(walletIdsToCheck)]
        )

        const ownedWalletIds = rows.map(r => r.id)

        // Check if all requested wallets are owned by user
        const forbiddenWallets = Array.from(walletIdsToCheck).filter(id => !ownedWalletIds.includes(id))

        if (forbiddenWallets.length > 0) {
            console.warn(`[Security] User ${userId} attempted to access forbidden wallets: ${forbiddenWallets.join(', ')}`)
            return res.status(403).json({
                message: 'Acesso negado: Você não tem permissão para operar nesta carteira.',
                code: 'WALLET_OWNERSHIP_VIOLATION'
            })
        }

        next()

    } catch (err) {
        console.error('[Security] Wallet validation error:', err)
        return res.status(500).json({ message: 'Erro interno ao validar segurança da carteira.' })
    }
}

module.exports = { validateWalletOwnership }
