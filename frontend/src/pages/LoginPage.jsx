import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuthStore } from '../services/store'
import { authAPI } from '../services/api'
import { HiOutlineShieldCheck, HiOutlineEye, HiOutlineEyeOff } from 'react-icons/hi'

export default function LoginPage() {
  const [isRegister, setIsRegister] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (isRegister) {
        await authAPI.register(username, password)
        toast.success('Account created! Logging in...')
      }
      const res = await authAPI.login(username, password)
      login(res.data.access_token, username)
      toast.success('Welcome to Mirra!')
      navigate('/')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Authentication failed')
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
          <p className="text-dark-200 text-sm">Your Mirra - 100% Local & Private</p>
        </div>

        {/* Login Card */}
        <div className="glass-card p-8 glow-twin">
          <h2 className="text-xl font-bold text-white mb-6">
            {isRegister ? 'Create Your Mirra' : 'Welcome Back'}
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
                Password {isRegister && <span className="text-dark-300">(min 12 chars)</span>}
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
                  {showPassword ? <HiOutlineEyeOff className="w-5 h-5" /> : <HiOutlineEye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  {isRegister ? 'Create Account' : 'Login'}
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => setIsRegister(!isRegister)}
              className="text-sm text-twin-400 hover:text-twin-300 transition-colors"
            >
              {isRegister ? 'Already have an account? Login' : "First time? Create account"}
            </button>
          </div>

          {/* Security badge */}
          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-dark-300">
            <HiOutlineShieldCheck className="text-green-400 w-4 h-4" />
            AES-256 Encrypted | Localhost Only | Zero Cloud
          </div>
        </div>
      </div>
    </div>
  )
}
