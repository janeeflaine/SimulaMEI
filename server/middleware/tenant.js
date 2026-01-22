const { pool } = require('../db')

/**
 * Middleware to check if the authenticated user has access to the requested Business Unit.
 * Expects 'x-tenant-id' header or 'businessUnitId' in body/query.
 */
const checkTenant = async (req, res, next) => {
    try {
        const userId = req.user.id // Assumes authMiddleware has already run

        // Get Tenant ID from Header, Body, or Query
        const tenantId = req.headers['x-tenant-id'] || req.body.businessUnitId || req.query.businessUnitId

        if (!tenantId) {
            return res.status(400).json({ message: 'Business Unit ID (x-tenant-id) is required.' })
        }

        // Check Permissions
        const result = await pool.query(`
            SELECT role FROM user_permissions 
            WHERE "userId" = $1 AND "businessUnitId" = $2
        `, [userId, tenantId])

        if (result.rows.length === 0) {
            return res.status(403).json({ message: 'Access denied to this Business Unit.' })
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
