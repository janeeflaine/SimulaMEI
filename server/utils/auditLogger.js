/**
 * Audit Logger — Structured JSON logging to audit_logs table
 * All security-relevant events must use this logger.
 */
const { pool } = require('../db')

const SENSITIVE_KEYS = [
  'password', 'senha', 'token', 'authorization', 'credit_card',
  'cvv', 'secret', 'key', 'hash', 'resetpasswordtoken'
]

/**
 * Recursively sanitizes an object, masking sensitive fields with '***'
 */
function sanitize(obj, depth = 0) {
  if (depth > 5 || !obj || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map(item => sanitize(item, depth + 1))

  const result = {}
  for (const [k, v] of Object.entries(obj)) {
    const lk = k.toLowerCase()
    if (SENSITIVE_KEYS.some(sk => lk.includes(sk))) {
      result[k] = '***'
    } else if (v && typeof v === 'object') {
      result[k] = sanitize(v, depth + 1)
    } else {
      result[k] = v
    }
  }
  return result
}

/**
 * Write a structured audit log entry to the database.
 *
 * @param {object} opts
 * @param {'INFO'|'WARN'|'ERROR'|'CRITICAL'} opts.level
 * @param {string}  opts.event_type  e.g. 'USER_LOGIN_SUCCESS'
 * @param {object}  opts.actor       { user_id, role }
 * @param {object}  opts.context     from req.context: { ip_address, user_agent, device_fingerprint, session_id }
 * @param {object}  [opts.target]    { resource_type, resource_id }
 * @param {object}  [opts.changes]   { old_value, new_value }
 * @param {object}  [opts.metadata]  any extra data
 */
async function log({ level = 'INFO', event_type, actor = {}, context = {}, target = {}, changes = {}, metadata = {} }) {
  try {
    const safeChanges  = sanitize(changes)
    const safeMetadata = sanitize(metadata)

    await pool.query(`
      INSERT INTO audit_logs
        (level, event_type, user_id, user_role, ip_address, user_agent,
         device_fingerprint, resource_type, resource_id, old_value, new_value, metadata)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    `, [
      level,
      event_type,
      actor.user_id   || null,
      actor.role      || null,
      context.ip_address        || null,
      context.user_agent        ? context.user_agent.substring(0, 512) : null,
      context.device_fingerprint || null,
      target.resource_type || null,
      target.resource_id   ? String(target.resource_id) : null,
      safeChanges?.old_value != null ? JSON.stringify(safeChanges.old_value) : null,
      safeChanges?.new_value != null ? JSON.stringify(safeChanges.new_value) : null,
      Object.keys(safeMetadata).length > 0 ? JSON.stringify(safeMetadata) : null,
    ])
  } catch (err) {
    // Logging must never crash the app
    console.error('[AuditLogger] Write failed:', err.message)
  }
}

module.exports = { log, sanitize }
