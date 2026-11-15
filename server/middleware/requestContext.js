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

// Na Vercel: variável VERCEL/VERCEL_ENV (quando o projeto expõe as variáveis do sistema)
// ou o cabeçalho x-vercel-id, que a Vercel põe em todo pedido. Antes só a variável era
// olhada; sem ela, valia o endereço interno da conexão, que muda de servidor para
// servidor, e a trava de senha por IP podia não segurar.
const onVercel = (req) => !!(process.env.VERCEL || process.env.VERCEL_ENV || req.headers['x-vercel-id'])

// IPv4 dentro de IPv6 (::ffff:1.2.3.4) vira o IPv4
const tidy = (ip) => (typeof ip === 'string' && ip.startsWith('::ffff:') && ip.includes('.') ? ip.slice(7) : ip)

function getClientIp(req) {
  if (onVercel(req)) {
    const fromEdge =
      firstIp(req.headers['x-vercel-forwarded-for']) ||
      firstIp(req.headers['x-real-ip']) ||
      firstIp(req.headers['x-forwarded-for'])
    if (fromEdge) return tidy(fromEdge)
  }
  return tidy(req.socket?.remoteAddress || req.ip || 'unknown')
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
