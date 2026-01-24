const { db } = require('../db')

/**
 * Checks all active alerts for a user and returns triggered notifications.
 * @param {number} userId 
 * @returns {Promise<Array>} List of triggered alerts with messages.
 */
async function checkUserAlerts(userId) {
    try {
        const { rows: alerts } = await db.query(
            'SELECT * FROM user_alerts WHERE "userId" = $1 AND enabled = TRUE',
            [userId]
        )

        const triggered = []

        for (const alert of alerts) {
            const config = JSON.parse(alert.config || '{}')

            if (alert.type === 'REVENUE_LIMIT') {
                const triggerPercentage = config.trigger_at_percentage || 80

                // Get latest simulation
                const { rows: [sim] } = await db.query(
                    'SELECT * FROM simulations WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT 1',
                    [userId]
                )

                if (sim) {
                    // Get current MEI limits
                    const { rows: [limits] } = await db.query('SELECT * FROM mei_limits ORDER BY "updatedAt" DESC LIMIT 1')
                    const annualLimit = limits ? limits.annualLimit : 81000

                    // Logic: If monthly simulation * 12 or annual simulation > threshold
                    const estimatedAnnualRevenue = sim.revenueType === 'mensal' ? sim.revenue * 12 : sim.revenue
                    const usagePercentage = (estimatedAnnualRevenue / annualLimit) * 100

                    if (usagePercentage >= triggerPercentage) {
                        triggered.push({
                            id: alert.id,
                            type: 'REVENUE_LIMIT',
                            severity: usagePercentage >= 95 ? 'danger' : 'warning',
                            message: `Atenção: Seu faturamento estimado está em ${usagePercentage.toFixed(1)}% do limite anual do MEI.`,
                            usage: usagePercentage
                        })
                    }
                }
            }

            if (alert.type === 'DAS_EXPIRY') {
                const now = new Date()
                const day = now.getDate()
                const daysBefore = config.days_before || 5

                // DAS expires on the 20th of each month
                if (day >= (20 - daysBefore) && day <= 20) {
                    triggered.push({
                        id: alert.id,
                        type: 'DAS_EXPIRY',
                        severity: day >= 18 ? 'danger' : 'warning',
                        message: `Lembrete: O vencimento do seu DAS é no dia 20. Faltam ${20 - day} dias.`,
                        day: day
                    })
                }
            }

            if (alert.type === 'ANNUAL_DECLARATION') {
                const now = new Date()
                const month = now.getMonth() // 0-indexed (April is 3, May is 4)

                // DASN-SIMEI deadline is May 31st
                if (month === 3 || month === 4) { // April or May
                    triggered.push({
                        id: alert.id,
                        type: 'ANNUAL_DECLARATION',
                        severity: month === 4 ? 'danger' : 'warning',
                        message: `Importante: O prazo para entregar a Declaração Anual (DASN-SIMEI) termina em 31 de Maio.`,
                        month: month
                    })
                }
            }
        }

        return triggered
    } catch (err) {
        console.error('Error checking alerts logic:', err)
        return []
    }
}

module.exports = { checkUserAlerts }
