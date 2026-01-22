const { pool } = require('../db')

/**
 * Middleware to check if the authenticated user has access to the requested Business Unit.
 * Expects 'x-tenant-id' header or 'businessUnitId' in body/query.
 */
const checkTenant = async (req, res, next) => {
    try {
        const userId = req.user.id // Assumes authMiddleware has already run

        // Get Tenant ID from Header, Body, or Query
        let tenantId = req.headers['x-business-unit-id'] || req.headers['x-tenant-id'] || req.body.businessUnitId || req.query.businessUnitId


        // Auto-resolve if no tenantId provided (Fallback to Primary)
        if (!tenantId || tenantId === 'undefined' || tenantId === 'null') {
            console.log(`⚠️ Tenant Middleware: Nenhum ID fornecido. Tentando fallback para usuário ${userId}...`)

            // 1. Tenta encontrar a Principal
            const primaryRes = await pool.query(`
                SELECT id FROM business_units WHERE "ownerId" = $1 AND "isPrimary" = true LIMIT 1
            `, [userId])

            if (primaryRes.rows.length > 0) {
                tenantId = primaryRes.rows[0].id
                // console.log(`✅ Fallback: Usando unidade Principal (${tenantId})`)
            } else {
                // 2. Tenta encontrar QUALQUER uma
                const anyRes = await pool.query(`
                    SELECT id FROM business_units WHERE "ownerId" = $1 ORDER BY id ASC LIMIT 1
                `, [userId])
                if (anyRes.rows.length > 0) {
                    tenantId = anyRes.rows[0].id
                    // console.log(`⚠️ Fallback: Usando primeira unidade disponível (${tenantId})`)
                }
            }
        }

        if (!tenantId) {
            console.warn(`❌ Tenant Middleware: Nenhuma unidade encontrada para usuário ${userId}.`)
            return res.status(400).json({ message: 'Crie sua primeira MEI/Empresa para começar.', code: 'NO_UNIT_FOUND' })
        }

        if (tenantId === 'consolidated') {
            req.tenant = { id: 'consolidated', role: 'VIEWER' } // specific role logic can be discussed
            return next()
        }

        // Check Permissions
        const result = await pool.query(`
            SELECT role FROM user_permissions 
            WHERE "userId" = $1 AND "businessUnitId" = $2
        `, [userId, tenantId])

        if (result.rows.length === 0) {
            return res.status(403).json({ message: 'Acesso negado a esta unidade.' })
        }

        // Attach Tenant Context to Request
        req.tenant = {
            id: tenantId,
            role: result.rows[0].role
        }

        next()
    } catch (error) {
        console.error('Tenant Middleware Error:', error)
        res.status(500).json({ message: 'Internal Server Error verifying tenant.' })
    }
}

module.exports = checkTenant
