const router = require('express').Router()
const { pool } = require('../db')
const { authMiddleware } = require('../middleware/auth')

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

// BUSCAR UNIDADE POR ID
router.get('/units/:id', async (req, res) => {
    try {
        const unitId = req.params.id
        const userId = req.user.id

        // Verificar permissão
        const permRes = await pool.query(`
            SELECT role FROM user_permissions WHERE "userId" = $1 AND "businessUnitId" = $2
        `, [userId, unitId])

        if (permRes.rows.length === 0) {
            return res.status(403).json({ message: 'Acesso negado.' })
        }

        const unitRes = await pool.query('SELECT * FROM business_units WHERE id = $1', [unitId])
        if (unitRes.rows.length === 0) {
            return res.status(404).json({ message: 'Unidade não encontrada.' })
        }

        res.json(unitRes.rows[0])
    } catch (error) {
        res.status(500).json({ message: 'Erro ao buscar unidade' })
    }
})

// EDITAR UNIDADE
router.put('/units/:id', async (req, res) => {
    const client = await pool.connect()
    try {
        const { name, cnpj } = req.body
        const unitId = req.params.id
        const userId = req.user.id

        // Verificar permissão (apenas OWNER)
        const permRes = await client.query(`
            SELECT role FROM user_permissions WHERE "userId" = $1 AND "businessUnitId" = $2
        `, [userId, unitId])

        if (permRes.rows.length === 0 || permRes.rows[0].role !== 'OWNER') {
            return res.status(403).json({ message: 'Apenas o proprietário pode editar a unidade.' })
        }

        await client.query(`
            UPDATE business_units SET name = $1, cnpj = $2 WHERE id = $3
        `, [name, cnpj, unitId])

        res.json({ message: 'Unidade atualizada com sucesso' })
    } catch (error) {
        console.error('Erro ao editar unidade:', error)
        res.status(500).json({ message: 'Erro ao editar unidade' })
    } finally {
        client.release()
    }
})

// OBTER DADOS PARA BACKUP (Antes de excluir)
router.get('/units/:id/backup', async (req, res) => {
    try {
        const unitId = req.params.id
        const userId = req.user.id

        // Check permission
        const permRes = await pool.query(`
            SELECT role FROM user_permissions WHERE "userId" = $1 AND "businessUnitId" = $2
        `, [userId, unitId])
        if (permRes.rows.length === 0 || permRes.rows[0].role !== 'OWNER') {
            return res.status(403).json({ message: 'Acesso negado.' })
        }

        const transactions = await pool.query('SELECT * FROM finance_transactions WHERE "businessUnitId" = $1 ORDER BY date DESC', [unitId])
        const bills = await pool.query('SELECT * FROM bills_to_pay WHERE "businessUnitId" = $1', [unitId])
        const categories = await pool.query('SELECT * FROM finance_categories WHERE "userId" = $1', [userId]) // Shared categories usually

        res.json({
            transactions: transactions.rows,
            bills: bills.rows,
            categories: categories.rows
        })
    } catch (error) {
        console.error('Erro backup:', error)
        res.status(500).json({ message: 'Erro ao gerar backup' })
    }
})

// EXCLUIR UNIDADE (Cascading Delete)
router.delete('/units/:id', async (req, res) => {
    const client = await pool.connect()
    try {
        const unitId = req.params.id
        const userId = req.user.id

        // Verificar permissão
        const permRes = await client.query(`
            SELECT role FROM user_permissions WHERE "userId" = $1 AND "businessUnitId" = $2
        `, [userId, unitId])

        // Prevent deleting the primary unit (optional safety, or just allow it if intended)
        const unitRes = await client.query('SELECT "isPrimary" FROM business_units WHERE id = $1', [unitId])
        if (unitRes.rows.length > 0 && unitRes.rows[0].isPrimary) {
            return res.status(400).json({ message: 'Não é possível excluir a unidade principal.' })
        }

        if (permRes.rows.length === 0 || permRes.rows[0].role !== 'OWNER') {
            return res.status(403).json({ message: 'Apenas o proprietário pode excluir a unidade.' })
        }

        await client.query('BEGIN')

        // 1. Transactions
        await client.query('DELETE FROM finance_transactions WHERE "businessUnitId" = $1', [unitId])

        // 2. Bills
        await client.query('DELETE FROM bills_to_pay WHERE "businessUnitId" = $1', [unitId])

        // 3. Permissions
        await client.query('DELETE FROM user_permissions WHERE "businessUnitId" = $1', [unitId])

        // 4. Units
        await client.query('DELETE FROM business_units WHERE id = $1', [unitId])

        await client.query('COMMIT')
        res.json({ message: 'Unidade e dados excluídos com sucesso' })
    } catch (error) {
        await client.query('ROLLBACK')
        console.error('Erro ao excluir unidade:', error)
        res.status(500).json({ message: 'Erro ao excluir unidade' })
    } finally {
        client.release()
    }
})

module.exports = router
