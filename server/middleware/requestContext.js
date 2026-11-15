/**
 * Request Context Middleware
 * Extracts client IP, User-Agent and Device Fingerprint from every request
 * and makes them available via req.context for use in audit logging.
 */

/**
 * IP de quem fez o pedido.
 * - Na Vercel (process.env.VERCEL): os cabeçalhos x-vercel-forwarded-for / x-real-ip /
 *   x-forwarded-for são escritos pela própria Vercel, que apaga o que o visitante mandar
 *   (não dá para fingir outro IP).
 * - Fora da Vercel (servidor local): o cabeçalho pode ser inventado por quem chama, então
 *   vale o endereço da conexão.
 */
function firstIp(value) {
  if (!value || typeof value !== 'string') return null
  const first = value.split(',')[0].trim()
  return first && first.length < 50 ? first : null
}

function getClientIp(req) {
  if (process.env.VERCEL) {
    const fromEdge =
      firstIp(req.headers['x-vercel-forwarded-for']) ||
      firstIp(req.headers['x-real-ip']) ||
      firstIp(req.headers['x-forwarded-for'])
    if (fromEdge) return fromEdge
  }
  return req.socket?.remoteAddress || req.ip || 'unknown'
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
module.exports.getClientIp = getClientIp
