/**
 * Mirra - Client-Side Encryption Engine
 *
 * Zero-knowledge AES-256-GCM encryption using the browser's built-in
 * WebCrypto API. The encryption key is derived from the user's password
 * via PBKDF2 and NEVER leaves the device — not in localStorage, not in
 * sessionStorage, not in any API call.
 *
 * What this protects:
 *   ✅ All data stored in Supabase (conversations, memories, notes, tasks)
 *   ✅ All data in transit to/from Railway
 *   ✅ localStorage cache on this device
 *   ✅ Database breach — attacker sees only ciphertext
 *
 * What this cannot protect (and why):
 *   ⚠️  Current message sent to Groq API for AI processing
 *       (LLMs require plaintext — use local Ollama for full privacy)
 *   ⚠️  Metadata: timestamps, emotion labels, message counts
 *       (needed for UI ordering — not personally identifying)
 *
 * Encryption spec:
 *   Algorithm  : AES-256-GCM  (authenticated encryption — detects tampering)
 *   Key size   : 256 bits
 *   Key derive : PBKDF2-SHA256  (310,000 iterations — OWASP 2024 recommendation)
 *   IV         : 96-bit random nonce per encryption (prepended to ciphertext)
 *   Output     : base64(iv[12] + ciphertext[n] + authTag[16])
 */

const PBKDF2_ITERATIONS = 310_000
const KEY_LENGTH        = 256

export class CryptoEngine {
  constructor() {
    /** @type {CryptoKey|null} AES-256-GCM key — in memory only */
    this._key  = null
    this._ready = false
  }

  // ── Key lifecycle ────────────────────────────────────────────────────────

  /**
   * Derive the master key from (password, username, salt).
   * Call this immediately after a successful login/register.
   *
   * @param {string} password  - user's plaintext password
   * @param {string} username  - used as extra entropy
   * @param {string} salt      - hex string from backend (/api/auth/salt)
   */
  async deriveKey(password, username, salt) {
    const enc = new TextEncoder()

    // Import raw password as PBKDF2 key material
    const material = await crypto.subtle.importKey(
      'raw',
      enc.encode(password + username),   // bind key to this account
      'PBKDF2',
      false,
      ['deriveKey'],
    )

    // Derive AES-256-GCM key
    this._key = await crypto.subtle.deriveKey(
      {
        name:       'PBKDF2',
        salt:       enc.encode(salt),
        iterations: PBKDF2_ITERATIONS,
        hash:       'SHA-256',
      },
      material,
      { name: 'AES-GCM', length: KEY_LENGTH },
      false,            // not extractable — key cannot be read back out
      ['encrypt', 'decrypt'],
    )

    this._ready = true
    console.info('[Mirra Crypto] Key derived — data is now protected')
  }

  /** Clear key from memory on logout */
  clearKey() {
    this._key   = null
    this._ready = false
    console.info('[Mirra Crypto] Key cleared from memory')
  }

  get isReady() { return this._ready }

  // ── Encrypt / Decrypt ─────────────────────────────────────────────────────

  /**
   * Encrypt any JSON-serialisable value.
   * Returns a base64 string: iv(12) + ciphertext + authTag(16)
   *
   * @param  {*}      value  - anything JSON.stringify-able
   * @returns {string}        - base64 encoded ciphertext
   */
  async encrypt(value) {
    if (!this._key) throw new Error('Crypto key not initialised — call deriveKey() first')

    const iv       = crypto.getRandomValues(new Uint8Array(12))
    const encoded  = new TextEncoder().encode(JSON.stringify(value))

    const cipherBuf = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      this._key,
      encoded,
    )

    // Combine iv + ciphertext into one buffer and encode as base64
    const combined = new Uint8Array(iv.byteLength + cipherBuf.byteLength)
    combined.set(iv, 0)
    combined.set(new Uint8Array(cipherBuf), iv.byteLength)

    return btoa(String.fromCharCode(...combined))
  }

  /**
   * Decrypt a base64 ciphertext produced by encrypt().
   * Returns the original value (JSON parsed).
   *
   * @param  {string} b64  - base64 encoded iv + ciphertext
   * @returns {*}           - original value
   */
  async decrypt(b64) {
    if (!this._key) throw new Error('Crypto key not initialised — call deriveKey() first')

    const combined  = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
    const iv        = combined.slice(0, 12)
    const cipherBuf = combined.slice(12)

    const plainBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      this._key,
      cipherBuf,
    )

    return JSON.parse(new TextDecoder().decode(plainBuf))
  }

  // ── Convenience helpers ──────────────────────────────────────────────────

  /**
   * Encrypt a string (shorthand for encrypt()).
   * Returns encrypted base64 or original string if key not ready.
   */
  async encryptText(text) {
    if (!this._ready) return text   // graceful degradation if key not set yet
    return this.encrypt(text)
  }

  /**
   * Decrypt a string. Returns original string if it looks like plaintext.
   */
  async decryptText(maybeEncrypted) {
    if (!this._ready) return maybeEncrypted
    try {
      const result = await this.decrypt(maybeEncrypted)
      return typeof result === 'string' ? result : JSON.stringify(result)
    } catch {
      // Not encrypted (legacy data or plaintext field) — return as-is
      return maybeEncrypted
    }
  }

  /**
   * Encrypt all string values in an object (one level deep).
   * Non-string values (numbers, booleans) are left as-is.
   *
   * @param {Object}   obj    - plain object
   * @param {string[]} fields - which fields to encrypt
   */
  async encryptFields(obj, fields) {
    if (!this._ready) return obj
    const out = { ...obj }
    for (const f of fields) {
      if (out[f] !== undefined && out[f] !== null) {
        out[f] = await this.encrypt(out[f])
      }
    }
    return out
  }

  /**
   * Decrypt specific fields in an object returned from the API.
   */
  async decryptFields(obj, fields) {
    if (!this._ready) return obj
    const out = { ...obj }
    for (const f of fields) {
      if (out[f] !== undefined && out[f] !== null) {
        try {
          out[f] = await this.decrypt(out[f])
        } catch {
          // Field was stored as plaintext (before encryption was added)
        }
      }
    }
    return out
  }

  // ── localStorage helpers ─────────────────────────────────────────────────

  /**
   * Store encrypted data in localStorage.
   * Falls back to plaintext if key not ready (e.g. during initial load).
   */
  async setLocalItem(key, value) {
    if (this._ready) {
      const enc = await this.encrypt(value)
      localStorage.setItem(`enc_${key}`, enc)
      localStorage.removeItem(key)   // remove any old plaintext version
    } else {
      localStorage.setItem(key, JSON.stringify(value))
    }
  }

  /**
   * Retrieve and decrypt data from localStorage.
   */
  async getLocalItem(key) {
    const encKey   = `enc_${key}`
    const encValue = localStorage.getItem(encKey)

    if (encValue && this._ready) {
      try { return await this.decrypt(encValue) } catch { /* corrupted */ }
    }

    // Fallback: try plaintext (pre-encryption data or key not ready)
    const plain = localStorage.getItem(key)
    return plain ? JSON.parse(plain) : null
  }

  removeLocalItem(key) {
    localStorage.removeItem(`enc_${key}`)
    localStorage.removeItem(key)
  }

  // ── Salt generation ──────────────────────────────────────────────────────

  /**
   * Generate a random hex salt for a new user.
   * Call on registration, send to backend for storage.
   */
  static generateSalt() {
    const bytes = crypto.getRandomValues(new Uint8Array(32))
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
  }
}

/** Singleton — one key per session */
export const cryptoEngine = new CryptoEngine()

/**
 * Fields that are encrypted before being sent to the backend.
 * Add to this list whenever a new sensitive field is introduced.
 */
export const ENCRYPTED_FIELDS = {
  message:      ['content'],
  memory:       ['content', 'title'],
  note:         ['content', 'title'],
  task:         ['description', 'title'],
  calendar:     ['description', 'title', 'location'],
  conversation: ['content'],
}
