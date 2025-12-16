const crypto = require('crypto')

const algorithm = 'aes-256-cbc'
const secret = process.env.JWT_SECRET || 'simulamei-secret-key-change-in-production'
// Ensure key is 32 bytes
const key = crypto.createHash('sha256').update(String(secret)).digest()

const encrypt = (text) => {
    if (!text) return null
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv(algorithm, key, iv)
    let encrypted = cipher.update(text)
    encrypted = Buffer.concat([encrypted, cipher.final()])
    return iv.toString('hex') + ':' + encrypted.toString('hex')
}

const decrypt = (text) => {
    if (!text) return null
    try {
        const textParts = text.split(':')
        const iv = Buffer.from(textParts.shift(), 'hex')
        const encryptedText = Buffer.from(textParts.join(':'), 'hex')
        const decipher = crypto.createDecipheriv(algorithm, key, iv)
        let decrypted = decipher.update(encryptedText)
        decrypted = Buffer.concat([decrypted, decipher.final()])
        return decrypted.toString()
    } catch (e) {
        console.error('Decryption failed', e)
        return null
    }
}

module.exports = { encrypt, decrypt }
