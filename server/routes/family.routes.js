const router = require('express').Router()
const { pool } = require('../db')
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware)

// LISTAR UNIDADES DA FAMÍLIA
router.get('/units', async (req, res) => {
    try {
        const userId = req.user.id
        const result = await pool.query(`
            SELECT b.*, p.role 
            FROM "business_units" b
            JOIN "user_permissions" p ON b."id" = p."businessUnitId"
            WHERE p."userId" = $1
            ORDER BY b."id" ASC
        `, [userId])
        res.json(result.rows)
    } catch (error) {
        res.status(500).json({ message: 'Erro ao buscar unidades' })
    }
})

// CADASTRAR NOVA MEI
router.post('/units', async (req, res) => {
    const client = await pool.connect()
    try {
        const { name, cnpj } = req.body
        const userId = req.user.id
        await client.query('BEGIN')
        const unitRes = await client.query(`
            INSERT INTO "business_units" ("ownerId", "name", "cnpj", "isPrimary")
            VALUES ($1, $2, $3, false)
            RETURNING id, name
        `, [userId, name, cnpj])
        const newUnitId = unitRes.rows[0].id
        await client.query(`
            INSERT INTO "user_permissions" ("userId", "businessUnitId", "role")
            VALUES ($1, $2, 'OWNER')
        `, [userId, newUnitId])
        await client.query('COMMIT')
        res.status(201).json({ message: 'Unidade criada', unit: unitRes.rows[0] })
    } catch (error) {
        await client.query('ROLLBACK')
        res.status(500).json({ message: 'Erro ao criar unidade' })
    } finally {
        client.release()
    }
})

// CONSOLIDADO
router.get('/consolidated', async (req, res) => {
    try {
        const userId = req.user.id
        const result = await pool.query(`
            SELECT 
                b."id", b."name", 
                COALESCE(SUM(CASE WHEN t."type" = 'RECEITA' THEN t."amount" ELSE 0 END), 0) as "currentRevenue"
            FROM "business_units" b
            JOIN "user_permissions" p ON b."id" = p."businessUnitId"
            LEFT JOIN "finance_transactions" t ON b."id" = t."businessUnitId"
            WHERE p."userId" = $1
            GROUP BY b."id"
        `, [userId])
        const units = result.rows
        const totalFamilyRevenue = units.reduce((acc, u) => acc + parseFloat(u.currentRevenue), 0)
        res.json({ units, totalFamilyRevenue, combinedLimit: units.length * 81000 })
    } catch (error) {
        res.status(500).json({ message: 'Erro na consolidação' })
    }
})

module.exports = router
