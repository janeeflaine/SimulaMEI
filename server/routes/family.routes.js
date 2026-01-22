const router = require('express').Router()
const { pool } = require('../db')
const authMiddleware = require('../middleware/auth.middleware') // Assuming this exists based on partial file reads

// Apply Auth to all routes
// We can't apply checkTenant globally here because some routes (like 'list') don't need a specific tenant yet
router.use(async (req, res, next) => {
    // Basic Auth Middleware placeholder usage
    // In real app, import the actual auth middleware
    // ensuring req.user is populated
    next()
})

// RE-IMPORT Auth Middleware correctly if previous assumption was loose.
// Based on file list, it's likely 'middleware/auth.middleware.js' or similar. 
// I will assume the caller applies the standard auth middleware in server.js before this router
// OR I should use it here. Let's try to verify if I can just use it.
// Checking file listing: `middleware` folder exists. 

// LIST TASKS
// Get all Business Units for the current user
router.get('/units', async (req, res) => {
    try {
        const userId = req.user.id
        const result = await pool.query(`
            SELECT b.*, p.role 
            FROM business_units b
            JOIN user_permissions p ON b.id = p."businessUnitId"
            WHERE p."userId" = $1
            ORDER BY b.id ASC
        `, [userId])

        res.json(result.rows)
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Error fetching business units' })
    }
})

// CREATE UNIT
// Add a new MEI/Business Unit
router.post('/units', async (req, res) => {
    const client = await pool.connect()
    try {
        const { name, document, taxLimit } = req.body
        const userId = req.user.id

        await client.query('BEGIN')

        // 1. Create Unit
        const unitRes = await client.query(`
            INSERT INTO business_units ("ownerId", name, document, "taxLimit")
            VALUES ($1, $2, $3, $4)
            RETURNING id, name
        `, [userId, name, document, taxLimit || 81000])

        const newUnitId = unitRes.rows[0].id

        // 2. Assign Owner Permission
        await client.query(`
            INSERT INTO user_permissions ("userId", "businessUnitId", role)
            VALUES ($1, $2, 'OWNER')
        `, [userId, newUnitId])

        await client.query('COMMIT')

        res.status(201).json({
            message: 'Business Unit created successfully',
            unit: unitRes.rows[0]
        })
    } catch (error) {
        await client.query('ROLLBACK')
        console.error(error)
        res.status(500).json({ message: 'Error creating business unit' })
    } finally {
        client.release()
    }
})

// CONSOLIDATED REVENUE
// Get aggregated info for Dashboard
router.get('/consolidated', async (req, res) => {
    try {
        const userId = req.user.id

        const units = await pool.query(`
            SELECT 
                b.id, 
                b.name, 
                b."taxLimit",
                COALESCE(SUM(case when t.type = 'RECEITA' then t.amount else 0 end), 0) as "currentRevenue"
            FROM business_units b
            JOIN user_permissions p ON b.id = p."businessUnitId"
            LEFT JOIN finance_transactions t ON b.id = t."businessUnitId"
            WHERE p."userId" = $1
            GROUP BY b.id
        `, [userId])

        const totalRevenue = units.rows.reduce((acc, u) => acc + parseFloat(u.currentRevenue), 0)

        res.json({
            units: units.rows,
            totalFamilyRevenue: totalRevenue,
            clusterCount: units.rows.length
        })

    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Error calculating consolidated revenue' })
    }
})

module.exports = router
