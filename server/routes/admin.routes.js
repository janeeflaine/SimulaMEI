const express = require('express')
const { db } = require('../db')
const { authMiddleware, adminMiddleware } = require('../middleware/auth')

const router = express.Router()

// Apply auth middleware to all admin routes
router.use(authMiddleware)
router.use(adminMiddleware)

// ========== STATS ==========
router.get('/stats', async (req, res) => {
    try {
        const totalUsersResult = await db.query("SELECT COUNT(*) as count FROM users WHERE role = 'USER' AND \"deletedAt\" IS NULL")
        const activeUsersResult = await db.query("SELECT COUNT(*) as count FROM users WHERE role = 'USER' AND \"isBlocked\" = 0 AND \"deletedAt\" IS NULL")
        const totalSimulationsResult = await db.query('SELECT COUNT(*) as count FROM simulations')

        // Revenue calculation (sum of paid plan users)
        const paidUsersResult = await db.query(`
      SELECT COUNT(*) as count, p.price 
      FROM users u 
      JOIN plans p ON u."planId" = p.id 
      WHERE p.price > 0 AND u."deletedAt" IS NULL
      GROUP BY p.id, p.price
    `)
        const paidUsers = paidUsersResult.rows

        const monthlyRevenue = paidUsers.reduce((sum, p) => sum + (parseInt(p.count) * p.price), 0)

        // Users by plan
        const usersByPlanResult = await db.query(`
      SELECT COALESCE(p.name, 'Gratuito') as name, COUNT(*) as count
      FROM users u
      LEFT JOIN plans p ON u."planId" = p.id
      WHERE u.role = 'USER' AND u."deletedAt" IS NULL
      GROUP BY p.name
    `)
        const usersByPlan = usersByPlanResult.rows

        // Recent simulations
        const recentSimulationsResult = await db.query(`
      SELECT s.*, u.name as "userName"
      FROM simulations s
      LEFT JOIN users u ON s."userId" = u.id
      ORDER BY s."createdAt" DESC
      LIMIT 10
    `)
        const recentSimulations = recentSimulationsResult.rows

        res.json({
            totalUsers: totalUsersResult.rows[0].count,
            activeUsers: activeUsersResult.rows[0].count,
            monthlyRevenue,
            totalSimulations: totalSimulationsResult.rows[0].count,
            usersByPlan,
            recentSimulations
        })
    } catch (error) {
        console.error('Stats error:', error)
        res.status(500).json({ message: 'Erro ao carregar estatísticas' })
    }
})

// ========== USERS ==========
router.get('/users', async (req, res) => {
    try {
        const usersResult = await db.query(`
      SELECT u.id, u.name, u.email, u.role, u."isBlocked", u."createdAt", u."planId",
             p.name as "planName"
      FROM users u
      LEFT JOIN plans p ON u."planId" = p.id
      WHERE u."deletedAt" IS NULL
      ORDER BY u."createdAt" DESC
    `)

        res.json(usersResult.rows.map(u => ({
            ...u,
            plan: { name: u.planName || 'Gratuito' }
        })))
    } catch (error) {
        console.error('Get users error:', error)
        res.status(500).json({ message: 'Erro ao carregar usuários' })
    }
})

router.put('/users/:id', async (req, res) => {
    try {
        const { id } = req.params
        const { isBlocked, planId, role } = req.body

        const updates = []
        const params = []
        let paramIndex = 1

        if (isBlocked !== undefined) {
            updates.push(`"isBlocked" = $${paramIndex++}`)
            params.push(isBlocked ? 1 : 0)
        }

        if (planId !== undefined) {
            updates.push(`"planId" = $${paramIndex++}`)
            params.push(planId || null)
        }

        if (role !== undefined) {
            updates.push(`role = $${paramIndex++}`)
            params.push(role)
        }

        if (updates.length > 0) {
            updates.push(`"updatedAt" = CURRENT_TIMESTAMP`)
            params.push(id)

            await db.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`, params)

            // Log the action
            await db.query(`
                INSERT INTO admin_logs ("userId", action, details)
                VALUES ($1, 'UPDATE_USER', $2)
            `, [req.user.id, JSON.stringify({ targetUserId: id, changes: req.body })])
        }

        res.json({ message: 'Usuário atualizado com sucesso' })
    } catch (error) {
        console.error('Update user error:', error)
        res.status(500).json({ message: 'Erro ao atualizar usuário' })
    }
})

// ========== RULES ==========
router.get('/rules', async (req, res) => {
    try {
        const rulesResult = await db.query('SELECT * FROM calculation_rules ORDER BY id DESC LIMIT 1')
        const rules = rulesResult.rows[0]
        res.json(rules || { inssPercentage: 5, icmsValue: 1, issValue: 5, employeeCost: 1412 })
    } catch (error) {
        console.error('Get rules error:', error)
        res.status(500).json({ message: 'Erro ao carregar regras' })
    }
})

router.put('/rules', async (req, res) => {
    try {
        const { inssPercentage, icmsValue, issValue, employeeCost } = req.body

        await db.query(`
      INSERT INTO calculation_rules ("inssPercentage", "icmsValue", "issValue", "employeeCost", "updatedBy")
      VALUES ($1, $2, $3, $4, $5)
    `, [inssPercentage, icmsValue, issValue, employeeCost, req.user.id])

        // Log the action
        await db.query(`
      INSERT INTO admin_logs ("userId", action, details)
      VALUES ($1, 'UPDATE_RULES', $2)
    `, [req.user.id, JSON.stringify(req.body)])

        res.json({ message: 'Regras atualizadas com sucesso' })
    } catch (error) {
        console.error('Update rules error:', error)
        res.status(500).json({ message: 'Erro ao atualizar regras' })
    }
})

// ========== LIMITS ==========
router.get('/limits', async (req, res) => {
    try {
        const limitsResult = await db.query('SELECT * FROM mei_limits ORDER BY id DESC LIMIT 1')
        const limits = limitsResult.rows[0]
        res.json(limits || { annualLimit: 81000, warningPercentage: 70, dangerPercentage: 90 })
    } catch (error) {
        console.error('Get limits error:', error)
        res.status(500).json({ message: 'Erro ao carregar limites' })
    }
})

router.put('/limits', async (req, res) => {
    try {
        const { annualLimit, warningPercentage, dangerPercentage } = req.body

        await db.query(`
      INSERT INTO mei_limits ("annualLimit", "warningPercentage", "dangerPercentage", "updatedBy")
      VALUES ($1, $2, $3, $4, $5)
    `, [annualLimit, warningPercentage, dangerPercentage, req.user.id])

        // Log the action
        await db.query(`
      INSERT INTO admin_logs ("userId", action, details)
      VALUES ($1, 'UPDATE_LIMITS', $2)
    `, [req.user.id, JSON.stringify(req.body)])

        res.json({ message: 'Limites atualizados com sucesso' })
    } catch (error) {
        console.error('Update limits error:', error)
        res.status(500).json({ message: 'Erro ao atualizar limites' })
    }
})

// ========== PLANS ==========
router.get('/plans', async (req, res) => {
    try {
        const plansResult = await db.query('SELECT * FROM plans ORDER BY price ASC')
        res.json(plansResult.rows.map(p => ({ ...p, features: JSON.parse(p.features || '{}') })))
    } catch (error) {
        console.error('Get plans error:', error)
        res.status(500).json({ message: 'Erro ao carregar planos' })
    }
})

router.post('/plans', async (req, res) => {
    try {
        const { name, price, features, isActive } = req.body

        const result = await db.query(`
      INSERT INTO plans (name, price, features, "isActive")
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `, [name, price || 0, JSON.stringify(features || {}), isActive ? 1 : 0])

        res.json({ id: result.rows[0].id, message: 'Plano criado com sucesso' })
    } catch (error) {
        console.error('Create plan error:', error)
        res.status(500).json({ message: 'Erro ao criar plano' })
    }
})

router.put('/plans/:id', async (req, res) => {
    try {
        const { id } = req.params
        const { name, price, features, isActive } = req.body

        await db.query(`
      UPDATE plans 
      SET name = $1, price = $2, features = $3, "isActive" = $4, "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = $5
    `, [name, price || 0, JSON.stringify(features || {}), isActive ? 1 : 0, id])

        res.json({ message: 'Plano atualizado com sucesso' })
    } catch (error) {
        console.error('Update plan error:', error)
        res.status(500).json({ message: 'Erro ao atualizar plano' })
    }
})

// ========== REPORTS ==========
router.get('/reports', async (req, res) => {
    try {
        const { period } = req.query

        // Default: last month
        let interval = "INTERVAL '1 month'"
        if (period === 'week') interval = "INTERVAL '7 days'"
        if (period === 'year') interval = "INTERVAL '1 year'"

        // Users by plan
        const usersByPlanResult = await db.query(`
      SELECT COALESCE(p.name, 'Gratuito') as name, COUNT(*) as count
      FROM users u
      LEFT JOIN plans p ON u."planId" = p.id
      WHERE u.role = 'USER' AND u."deletedAt" IS NULL
      GROUP BY p.name
    `)
        const usersByPlan = usersByPlanResult.rows

        // Revenue by period
        const paidUsersResult = await db.query(`
      SELECT p.name as period, p.price * COUNT(*) as revenue, COUNT(*) as subscriptions
      FROM users u
      JOIN plans p ON u."planId" = p.id
      WHERE p.price > 0 AND u."createdAt" >= NOW() - ${interval}
      GROUP BY p.id, p.name, p.price
    `)
        const paidUsers = paidUsersResult.rows

        // Summary stats
        const newUsersResult = await db.query(`
      SELECT COUNT(*) as count FROM users WHERE "createdAt" >= NOW() - ${interval} AND "deletedAt" IS NULL
    `)
        const newUsersCount = newUsersResult.rows[0].count

        const totalSimulationsResult = await db.query(`
      SELECT COUNT(*) as count FROM simulations WHERE "createdAt" >= NOW() - ${interval}
    `)
        const totalSimulationsCount = totalSimulationsResult.rows[0].count

        const totalRevenue = paidUsers.reduce((sum, p) => sum + p.revenue, 0)

        res.json({
            usersByPlan,
            revenueByPeriod: paidUsers,
            totalRevenue,
            newUsers: newUsersCount,
            totalSimulations: totalSimulationsCount,
            conversionRate: newUsersCount > 0 ? paidUsers.reduce((sum, p) => sum + parseInt(p.subscriptions), 0) / newUsersCount : 0
        })
    } catch (error) {
        console.error('Reports error:', error)
        res.status(500).json({ message: 'Erro ao gerar relatórios' })
    }
})

module.exports = router
