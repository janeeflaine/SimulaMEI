const router = require('express').Router()
const { pool } = require('../db') // Garanta que seu db.js exporta o 'pool'
const authMiddleware = require('../middleware/auth.middleware')

// Aplicar autenticação em todas as rotas de família
router.use(authMiddleware)

// LISTAR UNIDADES (MEIs) DA FAMÍLIA
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
        console.error('Erro ao buscar unidades:', error)
        res.status(500).json({ message: 'Erro ao buscar unidades de negócio' })
    }
})

// CADASTRAR NOVA MEI FAMILIAR
router.post('/units', async (req, res) => {
    const client = await pool.connect()
    try {
        const { name, cnpj } = req.body
        const userId = req.user.id

        await client.query('BEGIN')

        // 1. Inserir a nova unidade (Usando os nomes corretos do banco)
        const unitRes = await client.query(`
            INSERT INTO "business_units" ("ownerId", "name", "cnpj", "isPrimary")
            VALUES ($1, $2, $3, false)
            RETURNING id, name
        `, [userId, name, cnpj])

        const newUnitId = unitRes.rows[0].id

        // 2. Atribuir permissão de DONO
        await client.query(`
            INSERT INTO "user_permissions" ("userId", "businessUnitId", "role")
            VALUES ($1, $2, 'OWNER')
        `, [userId, newUnitId])

        await client.query('COMMIT')

        res.status(201).json({
            message: 'Unidade de Negócio familiar criada com sucesso',
            unit: unitRes.rows[0]
        })
    } catch (error) {
        await client.query('ROLLBACK')
        console.error('Erro ao criar unidade:', error)
        res.status(500).json({ message: 'Erro ao criar unidade de negócio' })
    } finally {
        client.release()
    }
})

// CONSULTA DE FATURAMENTO CONSOLIDADO (A soma dos 162 mil)
router.get('/consolidated', async (req, res) => {
    try {
        const userId = req.user.id

        const result = await pool.query(`
            SELECT 
                b."id", 
                b."name", 
                COALESCE(SUM(CASE WHEN t."type" = 'RECEITA' THEN t."amount" ELSE 0 END), 0) as "currentRevenue"
            FROM "business_units" b
            JOIN "user_permissions" p ON b."id" = p."businessUnitId"
            LEFT JOIN "finance_transactions" t ON b."id" = t."businessUnitId"
            WHERE p."userId" = $1
            GROUP BY b."id"
        `, [userId])

        const units = result.rows
        const totalFamilyRevenue = units.reduce((acc, u) => acc + parseFloat(u.currentRevenue), 0)

        res.json({
            units,
            totalFamilyRevenue,
            clusterCount: units.length,
            combinedLimit: units.length * 81000
        })

    } catch (error) {
        console.error('Erro na consolidação:', error)
        res.status(500).json({ message: 'Erro ao calcular faturamento consolidado' })
    }
})

module.exports = router
