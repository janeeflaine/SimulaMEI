const express = require('express')
const { db } = require('../db')
const { authMiddleware, optionalAuth } = require('../middleware/auth')

const router = express.Router()

// Get calculation rules and limits
const getRulesAndLimits = async () => {
    const rulesResult = await db.query('SELECT * FROM calculation_rules ORDER BY id DESC LIMIT 1')
    const limitsResult = await db.query('SELECT * FROM mei_limits ORDER BY id DESC LIMIT 1')
    return {
        rules: rulesResult.rows[0],
        limits: limitsResult.rows[0]
    }
}

// Calculate DAS based on activity type and rules
const calculateDAS = (activityType, rules) => {
    // Base: 5% of minimum wage for INSS (fixed)
    const salarioMinimo = 1412 // 2024 value
    const inss = salarioMinimo * (rules.inssPercentage / 100)

    let icms = 0
    let iss = 0

    switch (activityType) {
        case 'comercio':
            icms = rules.icmsValue
            break
        case 'servico':
            iss = rules.issValue
            break
        case 'ambos':
            icms = rules.icmsValue
            iss = rules.issValue
            break
    }

    return {
        inss,
        icms,
        iss,
        total: inss + icms + iss
    }
}

// Simulate (no auth required)
router.post('/', optionalAuth, async (req, res) => {
    try {
        const { activityType, revenue, revenueType, hasEmployee } = req.body

        if (!activityType || revenue === undefined) {
            return res.status(400).json({ message: 'Tipo de atividade e faturamento são obrigatórios' })
        }

        const { rules, limits } = await getRulesAndLimits()

        // Calculate annual revenue
        const annualRevenue = revenueType === 'anual' ? revenue : revenue * 12
        const monthlyRevenue = revenueType === 'anual' ? revenue / 12 : revenue

        // Calculate DAS
        const breakdown = calculateDAS(activityType, rules)
        const dasMonthly = breakdown.total
        const dasAnnual = dasMonthly * 12

        // Calculate limit percentage
        const limitPercentage = (annualRevenue / limits.annualLimit) * 100

        // Calculate employee cost if applicable
        const employeeCost = hasEmployee ? rules.employeeCost : 0

        const result = {
            dasMonthly,
            dasAnnual,
            annualRevenue,
            monthlyRevenue,
            limitPercentage,
            employeeCost,
            breakdown: {
                inss: breakdown.inss,
                icms: breakdown.icms,
                iss: breakdown.iss
            },
            limits: {
                annualLimit: limits.annualLimit,
                warningPercentage: limits.warningPercentage,
                dangerPercentage: limits.dangerPercentage
            }
        }

        // Save simulation if user is logged in
        if (req.user) {
            await db.query(`
                INSERT INTO simulations ("userId", "activityType", revenue, "revenueType", "hasEmployee", "dasMonthly", "dasAnnual", "limitPercentage", "rulesSnapshot")
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `, [
                req.user.id,
                activityType,
                monthlyRevenue,
                revenueType,
                hasEmployee ? 1 : 0,
                dasMonthly,
                dasAnnual,
                limitPercentage,
                JSON.stringify({ rules, limits })
            ])
        }

        res.json(result)
    } catch (error) {
        console.error('Simulation error:', error)
        res.status(500).json({ message: 'Erro ao realizar simulação' })
    }
})

// Get user stats only (auth required) - Available for all plans
// This route MUST come before '/' to avoid being caught by the general route
router.get('/stats', authMiddleware, async (req, res) => {
    try {
        const resultStats = await db.query(`
            SELECT 
                COUNT(*) as "totalSimulations",
                AVG(revenue) as "avgRevenue",
                MAX("limitPercentage") as "maxLimitPercentage"
            FROM simulations 
            WHERE "userId" = $1
        `, [req.user.id])
        const result = resultStats.rows[0]

        const lastSimResult = await db.query(`
            SELECT "limitPercentage" 
            FROM simulations 
            WHERE "userId" = $1 
            ORDER BY "createdAt" DESC 
            LIMIT 1
        `, [req.user.id])
        const lastSim = lastSimResult.rows[0]

        const stats = {
            totalSimulations: result.totalSimulations || 0,
            avgRevenue: result.avgRevenue || 0,
            limitStatus: lastSim
                ? (lastSim.limitPercentage < 70 ? 'success' : lastSim.limitPercentage < 90 ? 'warning' : 'danger')
                : 'success'
        }

        res.json(stats)
    } catch (error) {
        console.error('Get stats error:', error)
        res.status(500).json({ message: 'Erro ao buscar estatísticas' })
    }
})

// Get user simulations (auth required)
router.get('/', authMiddleware, async (req, res) => {
    try {
        const simulationsResult = await db.query(`
      SELECT * FROM simulations 
      WHERE "userId" = $1 
      ORDER BY "createdAt" DESC 
      LIMIT 50
    `, [req.user.id])
        const simulations = simulationsResult.rows

        const stats = {
            totalSimulations: simulations.length,
            avgRevenue: simulations.length > 0
                ? simulations.reduce((sum, s) => sum + s.revenue, 0) / simulations.length
                : 0,
            limitStatus: simulations.length > 0
                ? (simulations[0].limitPercentage < 70 ? 'success' : simulations[0].limitPercentage < 90 ? 'warning' : 'danger')
                : 'success'
        }

        res.json({ simulations, stats })
    } catch (error) {
        console.error('Get simulations error:', error)
        res.status(500).json({ message: 'Erro ao buscar simulações' })
    }
})

// MEI vs ME Comparison
router.post('/comparison', authMiddleware, async (req, res) => {
    try {
        const { annualRevenue } = req.body
        const { limits } = await getRulesAndLimits()

        // MEI calculation (already done)
        const meiMonthlyTax = 71.60 // Current fixed value approximation
        const meiAnnualTax = meiMonthlyTax * 12

        // ME (Simples Nacional) estimation - simplified
        // Anexo I (Comércio) starts at 4%, Anexo III (Serviços) starts at 6%
        const simplesRate = 0.06 // 6% as average
        const meMonthlyTax = (annualRevenue / 12) * simplesRate
        const meAnnualTax = annualRevenue * simplesRate

        const limitPercentage = (annualRevenue / limits.annualLimit) * 100

        let recommendation = 'mei'
        let message = 'Com seu faturamento atual, o MEI é mais vantajoso financeiramente.'

        if (limitPercentage > 80) {
            recommendation = 'me'
            message = 'Você está próximo do limite MEI. Considere migrar para ME para evitar problemas futuros.'
        }

        if (annualRevenue > limits.annualLimit) {
            recommendation = 'me'
            message = 'Seu faturamento já ultrapassa o limite MEI. A migração para ME é necessária.'
        }

        res.json({
            mei: {
                monthlyTax: meiMonthlyTax,
                annualTax: meiAnnualTax,
                limit: limits.annualLimit
            },
            me: {
                monthlyTax: meMonthlyTax,
                annualTax: meAnnualTax,
                limit: 4800000 // ME limit in Simples Nacional
            },
            recommendation,
            message
        })
    } catch (error) {
        console.error('Comparison error:', error)
        res.status(500).json({ message: 'Erro ao gerar comparativo' })
    }
})

module.exports = router
