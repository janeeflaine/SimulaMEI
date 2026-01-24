const { MercadoPagoConfig, Payment } = require('mercadopago')
const { db } = require('../db')
const { decrypt } = require('../utils/encryption')

const getAccessToken = async () => {
    try {
        const result = await db.query("SELECT value, \"isEncrypted\" FROM system_settings WHERE key = 'MERCADOPAGO_ACCESS_TOKEN'")
        const setting = result.rows[0]

        if (setting && setting.value && setting.value !== '********') {
            return setting.isEncrypted ? decrypt(setting.value) : setting.value
        }
    } catch (e) {
        console.error('Error fetching settings:', e)
    }
    return process.env.MERCADOPAGO_ACCESS_TOKEN
}

const upgradeUser = async (dbPayment) => {
    try {
        const userResult = await db.query('SELECT "planExpiresAt" FROM users WHERE id = $1', [dbPayment.userId])
        const user = userResult.rows[0]

        let expiresAt = new Date()

        // If plan is already active and future, extend it
        if (user && user.planExpiresAt && new Date(user.planExpiresAt) > new Date()) {
            expiresAt = new Date(user.planExpiresAt)
        }

        expiresAt.setDate(expiresAt.getDate() + 30) // Add 30 days

        await db.query(`
            UPDATE users 
            SET "planId" = $1, "subscriptionStatus" = 'active', "planExpiresAt" = $2, "updatedAt" = CURRENT_TIMESTAMP 
            WHERE id = $3
        `, [dbPayment.planId, expiresAt.toISOString(), dbPayment.userId])

        console.log(`✅ User ${dbPayment.userId} upgraded to plan ${dbPayment.planId} until ${expiresAt.toISOString()}`)
        return true
    } catch (error) {
        console.error('Error upgrading user:', error)
        return false
    }
}

const syncPaymentStatus = async (dbPayment) => {
    const accessToken = await getAccessToken()
    if (!accessToken || !dbPayment.externalId || dbPayment.externalId.startsWith('mock_')) {
        return dbPayment.status
    }

    try {
        console.log(`[Sync] Syncing payment ${dbPayment.id} (External: ${dbPayment.externalId})`)
        const client = new MercadoPagoConfig({ accessToken: accessToken })
        const paymentClient = new Payment(client)

        const mpPayment = await paymentClient.get({ id: dbPayment.externalId })
        const status = mpPayment.status

        if (status !== dbPayment.status) {
            console.log(`[Sync] Status changed for ${dbPayment.id}: ${dbPayment.status} -> ${status}`)
            await db.query('UPDATE payments SET status = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2', [status, dbPayment.id])

            // Update local object status for return
            dbPayment.status = status

            if (status === 'approved') {
                await upgradeUser(dbPayment)
            }
        }
        return status
    } catch (error) {
        console.error(`[Sync] Error syncing payment ${dbPayment.id}:`, error.message)
        return dbPayment.status
    }
}

module.exports = {
    getAccessToken,
    upgradeUser,
    syncPaymentStatus
}
