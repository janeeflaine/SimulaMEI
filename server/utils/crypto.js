// server/utils/crypto.js
const crypto = require('crypto');

// In a real app, store the key securely (env var). For demo, a static key is used.
const algorithm = 'aes-256-cbc';
const key = crypto.createHash('sha256').update(String(process.env.CRYPTO_KEY || 'simulamei_secret')).digest('base64').substr(0, 32);
const iv = Buffer.alloc(16, 0); // zero IV for simplicity (not recommended for production)

function encrypt(text) {
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
}

function decrypt(encrypted) {
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

module.exports = { encrypt, decrypt };
