import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuthStore, useChatStore } from '../services/store'
import { authAPI } from '../services/api'
import { cryptoEngine, CryptoEngine } from '../services/crypto'
import { HiOutlineShieldCheck, HiOutlineEye, HiOutlineEyeOff, HiOutlineLockClosed } from 'react-icons/hi'

export default function LoginPage() {
  const [isRegister, setIsRegister] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [cryptoStatus, setCryptoStatus] = useState('')   // show key derivation progress
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)
  const loadFromStorage = useChatStore((s) => s.loadFromStorage)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      let salt

      if (isRegister) {
        // ── Registration ───────────────────────────────────────────────────
        // 1. Generate salt client-side before sending anything to server
        salt = CryptoEngine.generateSalt()

        const regRes = await authAPI.register(username, password, salt)
        // Server echoes back the salt it stored — use that as canonical
        salt = regRes.data.crypto_salt || salt
        toast.success('Account created!')
      } else {
        // ── Login ──────────────────────────────────────────────────────────
        // 1. Fetch the user's salt (public — needed to re-derive the key)
        setCryptoStatus('Fetching encryption salt…')
        const saltRes = await authAPI.getSalt(username)
        salt = saltRes.data.crypto_salt
      }

      // 2. Authenticate with the server
      const res = await authAPI.login(username, password)
      const token = res.data.access_token

      // 3. Derive the AES-256-GCM key from password + salt
      //    This runs entirely in the browser — the key NEVER leaves this tab.
      setCryptoStatus('Deriving encryption key…')
      await cryptoEngine.deriveKey(password, username, salt)
      setCryptoStatus('')

      // 4. Store token and mark as authenticated
      login(token, username)
      // 5. Hydrate encrypted chat cache now that the key is ready
      loadFromStorage()
      toast.success('Welcome to Mirra! 🔐 Your data is encrypted.')
      navigate('/')

    } catch (err) {
      setCryptoStatus('')
      const msg = err.response?.data?.detail || err.message || 'Authentication failed'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-900 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-twin-500/10 rounded-full blur-3xl animate-pulse-slow" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '1.5s' }} />
      </div>

      <div className="relative z-10 w-full max-w-md px-4">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-twin-500 to-purple-500 flex items-center justify-center text-white text-3xl font-bold shadow-2xl shadow-twin-500/30 mb-4">
            M
          </div>
          <h1 className="text-3xl font-bold gradient-text mb-2">Mirra</h1>
          <p className="text-dark-200 text-sm">Your Digital Twin — End-to-End Encrypted</p>
        </div>

        {/* Login Card */}
        <div className="glass-card p-8 glow-twin">
          <h2 className="text-xl font-bold text-white mb-6">
            {isRegister ? 'Create Your Twin' : 'Welcome Back'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-dark-100 mb-1.5">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input-field"
                placeholder="Enter username"
                required
                autoComplete="username"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-100 mb-1.5">
                Password{' '}
                {isRegister && <span className="text-dark-300">(min 12 chars)</span>}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field pr-12"
                  placeholder="Enter password"
                  required
                  minLength={isRegister ? 12 : 1}
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-300 hover:text-white"
                >
                  {showPassword
                    ? <HiOutlineEyeOff className="w-5 h-5" />
                    : <HiOutlineEye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Key derivation status */}
            {cryptoStatus && (
              <div className="flex items-center gap-2 text-xs text-twin-400 bg-twin-500/10 rounded-lg px-3 py-2">
                <div className="w-3 h-3 border border-twin-400 border-t-transparent rounded-full animate-spin" />
                {cryptoStatus}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {loading
                ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <>{isRegister ? 'Create Account & Encrypt' : 'Login & Decrypt'}</>
              }
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => setIsRegister(!isRegister)}
              className="text-sm text-twin-400 hover:text-twin-300 transition-colors"
            >
              {isRegister ? 'Already have an account? Login' : 'First time? Create account'}
            </button>
          </div>

          {/* Encryption info */}
          <div className="mt-6 p-3 rounded-xl bg-dark-700/50 border border-dark-600/30 space-y-2">
            <div className="flex items-center gap-2 text-xs text-green-400 font-medium">
              <HiOutlineLockClosed className="w-3.5 h-3.5" />
              Zero-Knowledge Encryption
            </div>
            <div className="text-xs text-dark-300 space-y-1">
              <p>• AES-256-GCM key derived from your password in-browser</p>
              <p>• Key never leaves your device — not even to the server</p>
              <p>• Server stores only encrypted ciphertext</p>
              <p>• If you forget your password, data cannot be recovered</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-dark-400 pt-1 border-t border-dark-600/30">
              <HiOutlineShieldCheck className="w-3.5 h-3.5 text-yellow-500" />
              <span>AI responses use Groq API (plaintext) — use local mode for full privacy</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
