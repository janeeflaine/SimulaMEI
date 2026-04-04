const express = require('express')
const bcrypt = require('bcryptjs')
const { db, pool } = require('../db')
const { authMiddleware, adminMiddleware } = require('../middleware/auth')
const auditLogger = require('../utils/auditLogger')

const router = express.Router()

// Apply auth middleware to all admin routes
router.use(authMiddleware)
router.use(adminMiddleware)

// ========== STATS ==========
router.get('/stats', async (req, res) => {
    try {
        const totalUsersResult  = await db.query("SELECT COUNT(*) as count FROM users WHERE role = 'USER' AND \"deletedAt\" IS NULL")
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

        // Recent activity from audit_logs (last 10 significant events)
        const recentActivityResult = await db.query(`
            SELECT al.id, al.timestamp, al.level, al.event_type, al.user_id,
                   al.ip_address, al.metadata, u.name as user_name, u.email as user_email
            FROM audit_logs al
            LEFT JOIN users u ON al.user_id = u.id
            WHERE al.event_type NOT IN ('USER_LOGIN_SUCCESS')
               OR al.level IN ('WARN', 'ERROR', 'CRITICAL')
            ORDER BY al.timestamp DESC
            LIMIT 10
        `)

        // Count suspicious events in last 24h
        const suspiciousResult = await db.query(`
            SELECT COUNT(*) as count FROM audit_logs
            WHERE level IN ('WARN', 'ERROR', 'CRITICAL')
              AND timestamp >= NOW() - INTERVAL '24 hours'
        `)

        res.json({
            totalUsers: totalUsersResult.rows[0].count,
            activeUsers: activeUsersResult.rows[0].count,
            monthlyRevenue,
            totalSimulations: totalSimulationsResult.rows[0].count,
            usersByPlan: usersByPlanResult.rows,
            recentActivity: recentActivityResult.rows,
            suspiciousCount: parseInt(suspiciousResult.rows[0].count) || 0,
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
        const { isBlocked, planId, role, name, email, newPassword } = req.body

        // Fetch old values for audit
        const oldUserResult = await db.query('SELECT "isBlocked", "planId", role, name, email FROM users WHERE id = $1', [id])
        const oldUser = oldUserResult.rows[0]
        if (!oldUser) return res.status(404).json({ message: 'Usuário não encontrado' })

        // Validate email uniqueness if changing
        if (email && email !== oldUser.email) {
            const emailCheck = await db.query('SELECT id FROM users WHERE email = $1 AND id != $2', [email, id])
            if (emailCheck.rows.length > 0) {
                return res.status(400).json({ message: 'Este e-mail já está em uso por outro usuário.' })
            }
        }

        const updates = []
        const params = []
        let paramIndex = 1

        if (name !== undefined && name.trim()) {
            updates.push(`name = $${paramIndex++}`)
            params.push(name.trim())
        }

        if (email !== undefined && email.trim()) {
            updates.push(`email = $${paramIndex++}`)
            params.push(email.trim().toLowerCase())
        }

        if (isBlocked !== undefined) {
            updates.push(`"isBlocked" = $${paramIndex++}`)
            params.push(isBlocked ? 1 : 0)
        }

        if (planId !== undefined) {
            updates.push(`"planId" = $${paramIndex++}`)
            params.push(planId || null)
        }

        if (role !== undefined) {
            const allowedRoles = ['USER', 'ADMIN']
            if (!allowedRoles.includes(role)) {
                return res.status(400).json({ message: 'Role inválida. Valores permitidos: USER, ADMIN' })
            }
            updates.push(`role = $${paramIndex++}`)
            params.push(role)
        }

        // Admin password reset — no old password required
        if (newPassword) {
            if (newPassword.length < 8) {
                return res.status(400).json({ message: 'A nova senha deve ter pelo menos 8 caracteres.' })
            }
            const hashed = await bcrypt.hash(newPassword, 10)
            updates.push(`password = $${paramIndex++}`)
            params.push(hashed)
            // Invalidate all existing sessions/tokens for this user
            updates.push(`"sessionVersion" = COALESCE("sessionVersion", 1) + 1`)
            await pool.query(
                `UPDATE user_sessions SET is_active = 0, invalidated_at = NOW() WHERE user_id = $1`,
                [id]
            )
        }

        if (updates.length > 0) {
            updates.push(`"updatedAt" = CURRENT_TIMESTAMP`)
            params.push(id)

            await db.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`, params)

            // Determine primary event type for audit
            let eventType = 'USER_UPDATED'
            if (newPassword)              eventType = 'ADMIN_PASSWORD_RESET'
            else if (isBlocked !== undefined) eventType = isBlocked ? 'USER_BLOCKED' : 'USER_UNBLOCKED'
            else if (planId !== undefined) eventType = 'USER_PLAN_CHANGED'
            else if (role !== undefined)   eventType = 'USER_ROLE_CHANGED'

            const safeBody = { ...req.body }
            delete safeBody.newPassword // never log passwords

            await auditLogger.log({
                level: newPassword ? 'WARN' : 'INFO',
                event_type: eventType,
                actor: { user_id: req.user.id, role: req.user.role },
                context: req.context || {},
                target: { resource_type: 'USER', resource_id: id },
                changes: {
                    old_value: { isBlocked: oldUser.isBlocked, planId: oldUser.planId, role: oldUser.role, name: oldUser.name, email: oldUser.email },
                    new_value: safeBody
                }
            })

            await db.query(`
                INSERT INTO admin_logs ("userId", action, details)
                VALUES ($1, 'UPDATE_USER', $2)
            `, [req.user.id, JSON.stringify({ targetUserId: id, changes: safeBody })])
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

        const oldResult = await db.query('SELECT * FROM calculation_rules ORDER BY id DESC LIMIT 1')

        await db.query(`
            INSERT INTO calculation_rules ("inssPercentage", "icmsValue", "issValue", "employeeCost", "updatedBy")
            VALUES ($1, $2, $3, $4, $5)
        `, [inssPercentage, icmsValue, issValue, employeeCost, req.user.id])

        await auditLogger.log({
            level: 'INFO',
            event_type: 'RULES_UPDATED',
            actor: { user_id: req.user.id, role: req.user.role },
            context: req.context || {},
            target: { resource_type: 'CALCULATION_RULES' },
            changes: { old_value: oldResult.rows[0] || {}, new_value: req.body }
        })

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

        const oldResult = await db.query('SELECT * FROM mei_limits ORDER BY id DESC LIMIT 1')

        await db.query(`
            INSERT INTO mei_limits ("annualLimit", "warningPercentage", "dangerPercentage", "updatedBy")
            VALUES ($1, $2, $3, $4)
        `, [annualLimit, warningPercentage, dangerPercentage, req.user.id])

        await auditLogger.log({
            level: 'INFO',
            event_type: 'LIMITS_UPDATED',
            actor: { user_id: req.user.id, role: req.user.role },
            context: req.context || {},
            target: { resource_type: 'MEI_LIMITS' },
            changes: { old_value: oldResult.rows[0] || {}, new_value: req.body }
        })

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

        await auditLogger.log({
            level: 'INFO',
            event_type: 'PLAN_CREATED',
            actor: { user_id: req.user.id, role: req.user.role },
            context: req.context || {},
            target: { resource_type: 'PLAN', resource_id: result.rows[0].id },
            changes: { new_value: req.body }
        })

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

        const oldResult = await db.query('SELECT * FROM plans WHERE id = $1', [id])

        await db.query(`
            UPDATE plans
            SET name = $1, price = $2, features = $3, "isActive" = $4, "updatedAt" = CURRENT_TIMESTAMP
            WHERE id = $5
        `, [name, price || 0, JSON.stringify(features || {}), isActive ? 1 : 0, id])

        await auditLogger.log({
            level: 'INFO',
            event_type: 'PLAN_UPDATED',
            actor: { user_id: req.user.id, role: req.user.role },
            context: req.context || {},
            target: { resource_type: 'PLAN', resource_id: id },
            changes: { old_value: oldResult.rows[0] || {}, new_value: req.body }
        })

        res.json({ message: 'Plano atualizado com sucesso' })
    } catch (error) {
        console.error('Update plan error:', error)
        res.status(500).json({ message: 'Erro ao atualizar plano' })
    }
})

// ========== SETTINGS ==========
router.put('/settings/:key', async (req, res) => {
    try {
        const { key } = req.params
        const { value } = req.body

        const oldResult = await db.query('SELECT value FROM system_settings WHERE key = $1', [key])

        await db.query(`
            INSERT INTO system_settings (key, value, "updatedAt")
            VALUES ($1, $2, NOW())
            ON CONFLICT (key) DO UPDATE SET value = $2, "updatedAt" = NOW()
        `, [key, value])

        await auditLogger.log({
            level: 'INFO',
            event_type: 'SETTINGS_UPDATED',
            actor: { user_id: req.user.id, role: req.user.role },
            context: req.context || {},
            target: { resource_type: 'SYSTEM_SETTINGS', resource_id: key },
            changes: { old_value: oldResult.rows[0]?.value, new_value: value }
        })

        res.json({ message: 'Configuração atualizada' })
    } catch (error) {
        console.error('Update setting error:', error)
        res.status(500).json({ message: 'Erro ao atualizar configuração' })
    }
})

// ========== REPORTS ==========
router.get('/reports', async (req, res) => {
    try {
        const { period } = req.query

        let interval = "INTERVAL '1 month'"
        if (period === 'week') interval = "INTERVAL '7 days'"
        if (period === 'year') interval = "INTERVAL '1 year'"

        const usersByPlanResult = await db.query(`
            SELECT COALESCE(p.name, 'Gratuito') as name, COUNT(*) as count
            FROM users u
            LEFT JOIN plans p ON u."planId" = p.id
            WHERE u.role = 'USER' AND u."deletedAt" IS NULL
            GROUP BY p.name
        `)

        const paidUsersResult = await db.query(`
            SELECT p.name as period, p.price * COUNT(*) as revenue, COUNT(*) as subscriptions
            FROM users u
            JOIN plans p ON u."planId" = p.id
            WHERE p.price > 0 AND u."createdAt" >= NOW() - ${interval}
            GROUP BY p.id, p.name, p.price
        `)

        const newUsersResult = await db.query(`
            SELECT COUNT(*) as count FROM users WHERE "createdAt" >= NOW() - ${interval} AND "deletedAt" IS NULL
        `)

        const totalSimulationsResult = await db.query(`
            SELECT COUNT(*) as count FROM simulations WHERE "createdAt" >= NOW() - ${interval}
        `)

        const paidUsers = paidUsersResult.rows
        const totalRevenue = paidUsers.reduce((sum, p) => sum + p.revenue, 0)
        const newUsersCount = newUsersResult.rows[0].count

        res.json({
            usersByPlan: usersByPlanResult.rows,
            revenueByPeriod: paidUsers,
            totalRevenue,
            newUsers: newUsersCount,
            totalSimulations: totalSimulationsResult.rows[0].count,
            conversionRate: newUsersCount > 0 ? paidUsers.reduce((sum, p) => sum + parseInt(p.subscriptions), 0) / newUsersCount : 0
        })
    } catch (error) {
        console.error('Reports error:', error)
        res.status(500).json({ message: 'Erro ao gerar relatórios' })
    }
})

// ========== AUDIT LOGS ==========

/**
 * GET /api/admin/logs
 * Query params: level, event_type, user_id, search, from, to, page, limit, suspicious
 */
router.get('/logs', async (req, res) => {
    try {
        const {
            level,
            event_type,
            user_id,
            search,
            from,
            to,
            suspicious,
            page = 1,
            limit = 50,
        } = req.query

        const conditions = []
        const params = []
        let idx = 1

        if (level)      { conditions.push(`al.level = $${idx++}`);              params.push(level) }
        if (event_type) { conditions.push(`al.event_type = $${idx++}`);         params.push(event_type) }
        if (user_id)    { conditions.push(`al.user_id = $${idx++}`);            params.push(parseInt(user_id)) }
        if (from)       { conditions.push(`al.timestamp >= $${idx++}`);         params.push(new Date(from)) }
        if (to)         { conditions.push(`al.timestamp <= $${idx++}`);         params.push(new Date(to)) }

        if (suspicious === 'true') {
            conditions.push(`(al.level IN ('WARN','ERROR','CRITICAL') OR al.event_type IN ('CONCURRENT_LOGIN_PREVENTED','USER_LOGIN_FAILED','USER_BLOCKED','USER_LOGIN_BLOCKED'))`)
        }

        if (search) {
            conditions.push(`(u.name ILIKE $${idx} OR u.email ILIKE $${idx} OR al.event_type ILIKE $${idx} OR al.ip_address ILIKE $${idx})`)
            params.push(`%${search}%`)
            idx++
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

        const pageNum  = Math.max(1, parseInt(page))
        const pageSize = Math.min(200, Math.max(1, parseInt(limit)))
        const offset   = (pageNum - 1) * pageSize

        const countResult = await pool.query(
            `SELECT COUNT(*) as total FROM audit_logs al LEFT JOIN users u ON al.user_id = u.id ${where}`,
            params
        )
        const total = parseInt(countResult.rows[0].total)

        params.push(pageSize)
        params.push(offset)

        const logsResult = await pool.query(`
            SELECT al.id, al.timestamp, al.level, al.event_type,
                   al.user_id, al.user_role, al.ip_address, al.user_agent,
                   al.device_fingerprint, al.resource_type, al.resource_id,
                   al.old_value, al.new_value, al.metadata,
                   u.name as user_name, u.email as user_email
            FROM audit_logs al
            LEFT JOIN users u ON al.user_id = u.id
            ${where}
            ORDER BY al.timestamp DESC
            LIMIT $${idx++} OFFSET $${idx++}
        `, params)

        res.json({
            logs:  logsResult.rows,
            total,
            page:  pageNum,
            pages: Math.ceil(total / pageSize),
        })
    } catch (error) {
        console.error('Logs error:', error)
        res.status(500).json({ message: 'Erro ao carregar logs' })
    }
})

/**
 * GET /api/admin/logs/event-types
 * Returns distinct event_types for filter dropdown
 */
router.get('/logs/event-types', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT DISTINCT event_type FROM audit_logs ORDER BY event_type`
        )
        res.json(result.rows.map(r => r.event_type))
    } catch (error) {
        res.status(500).json({ message: 'Erro ao carregar tipos de evento' })
    }
})

/**
 * GET /api/admin/logs/sessions
 * Returns active sessions (for monitoring who is online)
 */
router.get('/logs/sessions', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT us.id, us.user_id, us.ip_address, us.user_agent,
                   us.device_fingerprint, us.created_at, us.last_activity,
                   u.name as user_name, u.email as user_email
            FROM user_sessions us
            LEFT JOIN users u ON us.user_id = u.id
            WHERE us.is_active = 1
            ORDER BY us.last_activity DESC
            LIMIT 100
        `)
        res.json(result.rows)
    } catch (error) {
        res.status(500).json({ message: 'Erro ao carregar sessões' })
    }
})

module.exports = router
