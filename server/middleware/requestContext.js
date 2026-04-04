/**
 * Request Context Middleware
 * Extracts client IP, User-Agent and Device Fingerprint from every request
 * and makes them available via req.context for use in audit logging.
 */

/**
 * Safely extract the real client IP from request headers.
 * Handles X-Forwarded-For for reverse-proxy / Vercel / Render deployments.
 */
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for']
  if (forwarded) {
    // X-Forwarded-For may be a comma-separated chain: "client, proxy1, proxy2"
    // Take only the first entry (the original client).
    const first = forwarded.split(',')[0].trim()
    // Basic sanity check: reject obviously invalid strings
    if (first && first.length < 50) return first
  }
  return (
    req.headers['x-real-ip'] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.ip ||
    'unknown'
  )
}

function requestContext(req, res, next) {
  req.context = {
    ip_address:         getClientIp(req),
    user_agent:         req.headers['user-agent'] || null,
    device_fingerprint: req.headers['x-device-fingerprint'] || null,
    session_id:         req.headers['x-session-id'] || null,
  }
  next()
}

module.exports = requestContext
