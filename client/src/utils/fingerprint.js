/**
 * Device Fingerprint Utility
 * Generates a stable browser fingerprint based on device characteristics.
 * Persisted in localStorage so it survives page reloads and sessions.
 *
 * Usage:
 *   import { getDeviceFingerprint } from '../utils/fingerprint'
 *   headers: { 'X-Device-Fingerprint': getDeviceFingerprint() }
 */

const STORAGE_KEY = '_simulamei_dfp'

function buildComponents() {
  try {
    return [
      navigator.userAgent || '',
      navigator.language  || '',
      `${screen.width}x${screen.height}`,
      String(screen.colorDepth || ''),
      String(new Date().getTimezoneOffset()),
      String(navigator.hardwareConcurrency || ''),
      navigator.platform || '',
      navigator.vendor   || '',
    ].join('||')
  } catch {
    return 'unknown'
  }
}

function djb2Hash(str) {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i)
    hash = hash >>> 0 // keep unsigned 32-bit
  }
  return hash.toString(16).padStart(8, '0')
}

export function getDeviceFingerprint() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && /^[a-f0-9]{8}-[a-f0-9]+$/.test(stored)) return stored

    const components = buildComponents()
    const hash = djb2Hash(components)
    // Append a random suffix so two identical machines get different fingerprints
    const salt = Math.random().toString(36).substring(2, 8)
    const fingerprint = `${hash}-${salt}`

    localStorage.setItem(STORAGE_KEY, fingerprint)
    return fingerprint
  } catch {
    return 'fallback-' + Math.random().toString(36).substring(2, 10)
  }
}
