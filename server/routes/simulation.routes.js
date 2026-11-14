const express = require('express')
const { db } = require('../db')
const { getMeiLimits, currentYearBR } = require('../utils/meiLimits')
const { authMiddleware, optionalAuth } = require('../middleware/auth')

const router = express.Router()

const tax = require('../logic/meiTax')

// Regras do admin (calculation_rules) e limite do MEI de um ano
const getRulesAndLimits = async (year = currentYearBR()) => {
    const [rulesResult, limits] = await Promise.all([
        db.query('SELECT * FROM calculation_rules ORDER BY id DESC LIMIT 1'),
        getMeiLimits(year)
    ])
    const saved = rulesResult.rows[0] || {}
    return { saved, rules: tax.rulesFor(saved, year), limits }
}

const MAX_REVENUE = 100000000 // R$ 100 milhões: acima disso é erro de digitação

// Número vindo do corpo: aceita 6000 ou "6000"; o resto vira NaN
const toNumber = (v) => {
    if (typeof v === 'number') return v
    if (typeof v === 'string' && v.trim() !== '') return Number(v)
    return NaN
}

// Valores do ano para o Simulador: DAS de cada atividade e limite (público)
router.get('/info', async (req, res) => {
    try {
        const year = currentYearBR()
        const [{ rules, limits }, next] = await Promise.all([getRulesAndLimits(year), getMeiLimits(year + 1)])
        res.set('Cache-Control', 'public, max-age=600')
        res.json({
            year,
            das: tax.dasTable(rules),
            employeeCost: tax.employeeCost(rules),
            employeesAllowed: tax.employeesAllowed(year),
            limits: { annualLimit: limits.annualLimit, nextYear: year + 1, nextAnnualLimit: next.annualLimit }
        })
    } catch (error) {
        console.error('Simulation info error:', error)
        res.status(500).json({ message: 'Erro ao buscar os valores do MEI' })
    }
})

// Simulate (no auth required)
router.post('/', optionalAuth, async (req, res) => {
    try {
        const { activityType } = req.body || {}
        const revenueType = (req.body || {}).revenueType === 'anual' ? 'anual' : 'mensal'
        const hasEmployee = [true, 1, 'true', '1'].includes((req.body || {}).hasEmployee)
        const revenue = toNumber((req.body || {}).revenue)

        if (!tax.ACTIVITIES.includes(activityType)) {
            return res.status(400).json({ message: 'Escolha a atividade: comércio, serviço ou os dois.' })
        }
        if (!Number.isFinite(revenue) || revenue < 0) {
            return res.status(400).json({ message: 'Digite o faturamento em reais, por exemplo 6.000,00.' })
        }
        const annualRevenue = Math.round((revenueType === 'anual' ? revenue : revenue * 12) * 100) / 100
        if (annualRevenue > MAX_REVENUE) {
            return res.status(400).json({ message: 'Esse faturamento é alto demais para o MEI. Confira o valor digitado.' })
        }
        const monthlyRevenue = Math.round(annualRevenue / 12 * 100) / 100

        const year = currentYearBR()
        const [{ saved, rules, limits }, next] = await Promise.all([getRulesAndLimits(year), getMeiLimits(year + 1)])

        const breakdown = tax.dasFor(activityType, rules)
        const dasMonthly = breakdown.total
        const dasAnnual = Math.round(dasMonthly * 12 * 100) / 100
        const limitPercentage = limits.annualLimit > 0 ? (annualRevenue / limits.annualLimit) * 100 : 0
        const employeeCost = hasEmployee ? tax.employeeCost(rules) : 0

        const result = {
            activityType,
            dasMonthly,
            dasAnnual,
            annualRevenue,
            monthlyRevenue,
            limitPercentage,
            employeeCost,
            employeesAllowed: tax.employeesAllowed(year),
            breakdown: {
                inss: breakdown.inss,
                icms: breakdown.icms,
                iss: breakdown.iss,
                minimumWage: rules.minimumWage
            },
            limits: {
                year: limits.year,
                annualLimit: limits.annualLimit,
                warningPercentage: limits.warningPercentage,
                dangerPercentage: limits.dangerPercentage
            },
            next: {
                year: year + 1,
                annualLimit: next.annualLimit,
                limitPercentage: next.annualLimit > 0 ? (annualRevenue / next.annualLimit) * 100 : 0
            },
            excess: tax.excessFor(annualRevenue, limits.annualLimit)
        }

        // Save simulation if user is logged in ("revenue" é sempre o valor por mês)
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
                JSON.stringify({ rules: { ...saved, ...rules }, limits })
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
// Limite do MEI do ano atual e do próximo, para a calculadora da página Início
// (pública: só os valores do limite, nenhum dado de usuário)
router.get('/limits', async (req, res) => {
    try {
        const year = currentYearBR()
        const [current, next] = await Promise.all([getMeiLimits(year), getMeiLimits(year + 1)])
        res.set('Cache-Control', 'public, max-age=600')
        res.json({
            current: { year, annualLimit: current.annualLimit },
            next: { year: year + 1, annualLimit: next.annualLimit }
        })
    } catch (error) {
        console.error('Limits error:', error)
        res.status(500).json({ message: 'Erro ao buscar o limite do MEI' })
    }
})

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

// MEI x Microempresa (Simples Nacional, anexo I ou III)
router.post('/comparison', authMiddleware, async (req, res) => {
    try {
        const annualRevenue = toNumber((req.body || {}).annualRevenue)
        const activityType = tax.ACTIVITIES.includes((req.body || {}).activityType) ? req.body.activityType : 'comercio'

        if (!Number.isFinite(annualRevenue) || annualRevenue <= 0) {
            return res.status(400).json({ message: 'Faça uma simulação com o faturamento para comparar.' })
        }
        if (annualRevenue > tax.SIMPLES_LIMIT) {
            return res.status(400).json({ message: 'Acima de R$ 4,8 milhões por ano a empresa sai do Simples Nacional, e este comparativo não se aplica.' })
        }

        const year = currentYearBR()
        const { rules, limits } = await getRulesAndLimits(year)
        const meiMonthlyTax = tax.dasFor(activityType, rules).total
        const me = tax.simplesTax(annualRevenue, tax.annexFor(activityType))

        const limitPercentage = limits.annualLimit > 0 ? (annualRevenue / limits.annualLimit) * 100 : 0
        const overLimit = annualRevenue > limits.annualLimit
        let recommendation = 'mei'
        let message = 'Com esse faturamento, o MEI paga bem menos imposto e não precisa de contador.'
        if (overLimit) {
            recommendation = 'me'
            message = 'O faturamento passa do limite do MEI: a mudança para Microempresa é obrigatória.'
        } else if (limitPercentage > 80) {
            recommendation = 'me'
            message = 'Você está perto do limite do MEI. Planeje a mudança para Microempresa antes de passar.'
        }

        res.json({
            mei: {
                monthlyTax: meiMonthlyTax,
                annualTax: Math.round(meiMonthlyTax * 12 * 100) / 100,
                limit: limits.annualLimit,
                year,
                employeesAllowed: tax.employeesAllowed(year)
            },
            me: { ...me, limit: tax.SIMPLES_LIMIT },
            recommendation,
            overLimit,
            message
        })
    } catch (error) {
        console.error('Comparison error:', error)
        res.status(500).json({ message: 'Erro ao gerar comparativo' })
    }
})

module.exports = router
