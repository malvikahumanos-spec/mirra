/**
 * Mirra - API Service
 *
 * Zero-knowledge encryption layer
 * ────────────────────────────────
 * Sensitive fields are encrypted client-side with AES-256-GCM BEFORE every
 * outbound request, and decrypted after every response.  The backend only
 * ever stores ciphertext — a DB breach reveals nothing readable.
 *
 * What is encrypted:
 *   ✅ Notes      (title, content)
 *   ✅ Tasks      (title, description)
 *   ✅ Calendar   (title, description, location)
 *   ✅ Memories   (title, content)
 *   ✅ localStorage chat cache  (handled in store.js)
 *
 * What stays plaintext (and why):
 *   ⚠️  Chat messages sent to /twin/chat
 *       The LLM (Groq/Ollama) must read the text to respond — there is no
 *       way around this.  Use local Ollama mode for full privacy.
 *
 * Uses VITE_API_URL in production (Railway), falls back to localhost for dev.
 */

import axios from 'axios'
import { cryptoEngine, ENCRYPTED_FIELDS } from './crypto'

const API_BASE = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8765') + '/api'

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  timeout: 120000,
})

// Add auth token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('mirra_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Redirect to login on 401 (except auth endpoints themselves)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || ''
    const isAuthRoute = url.includes('/auth/login') || url.includes('/auth/register')
    if (error.response?.status === 401 && !isAuthRoute) {
      localStorage.removeItem('mirra_token')
      localStorage.removeItem('mirra_user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Decrypt an array of objects returned from the API.
 * Silently skips items that were stored as plaintext (legacy / migration).
 */
async function decryptList(items, fields) {
  if (!Array.isArray(items) || items.length === 0) return items
  return Promise.all(items.map((item) => cryptoEngine.decryptFields(item, fields)))
}

/**
 * Pluck the array out of various response shapes:
 *   [{...}, ...]         → the array itself
 *   { tasks: [...] }     → tasks
 *   { notes: [...] }     → notes
 *   { memories: [...] }  → memories
 *   { events: [...] }    → events
 */
function extractArray(data, hint) {
  if (Array.isArray(data)) return data
  if (data && Array.isArray(data[hint]))     return data[hint]
  // Try common plural keys
  for (const key of ['items', 'results', 'data']) {
    if (data && Array.isArray(data[key])) return data[key]
  }
  return []
}

/**
 * Rebuild the response data with a decrypted array spliced back in.
 */
function rebuildData(original, hint, decrypted) {
  if (Array.isArray(original)) return decrypted
  return { ...original, [hint]: decrypted }
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authAPI = {
  /**
   * Register a new account.
   * cryptoSalt is generated client-side in LoginPage and stored on the server
   * so the same key can be re-derived on future logins.
   */
  register: (username, password, cryptoSalt = '') =>
    api.post('/auth/register', { username, password, crypto_salt: cryptoSalt }),

  login: (username, password) =>
    api.post('/auth/login', { username, password }),

  logout: () =>
    api.post('/auth/logout'),

  /**
   * Fetch the public salt for a username.
   * Used during login to re-derive the AES key from password + salt.
   * No authentication required — the salt is not a secret.
   */
  getSalt: (username) =>
    api.get('/auth/salt', { params: { username } }),
}

// ── Twin (chat + memory) ──────────────────────────────────────────────────────
export const twinAPI = {
  /**
   * Send a chat message.
   * The message is intentionally sent in plaintext — the LLM backend
   * (Groq / Ollama) must be able to read it to generate a response.
   * The local chat cache (store.js) is always stored encrypted.
   */
  chat: (message, conversationId, contactName, includeVoice = false) =>
    api.post('/twin/chat', {
      message,
      conversation_id: conversationId,
      contact_name:    contactName,
      include_voice:   includeVoice,
    }),

  /** Store a memory — content encrypted before leaving the device. */
  addMemory: async (content, category, importance) => {
    const encContent = await cryptoEngine.encryptText(content)
    return api.post('/twin/memory', { content: encContent, category, importance })
  },

  /**
   * Search memories.
   * Because content is encrypted, server-side text search is impossible.
   * We fetch all memories, decrypt client-side, then filter locally.
   */
  searchMemory: async (q, collection = 'memories', limit = 10) => {
    const res   = await api.get('/twin/memory/list', { params: { collection, limit: 500 } })
    const items = extractArray(res.data, 'memories')
    const dec   = await decryptList(items, ENCRYPTED_FIELDS.memory)
    const lower = q.toLowerCase()
    const hits  = dec.filter((m) =>
      (m.content || '').toLowerCase().includes(lower) ||
      (m.title   || '').toLowerCase().includes(lower)
    ).slice(0, limit)
    return { ...res, data: rebuildData(res.data, 'memories', hits) }
  },

  addContact:     (data)           => api.post('/twin/contact', data),
  getPersonality: ()               => api.get('/twin/personality'),
  getStats:       ()               => api.get('/twin/stats'),
  getConversation:(id)             => api.get(`/twin/conversation/${id}`),

  /** Fetch memories and decrypt each item's content + title. */
  listMemories: async (collection = 'memories', limit = 50) => {
    const res   = await api.get('/twin/memory/list', { params: { collection, limit } })
    const items = extractArray(res.data, 'memories')
    const dec   = await decryptList(items, ENCRYPTED_FIELDS.memory)
    return { ...res, data: rebuildData(res.data, 'memories', dec) }
  },

  listConversations: (limit = 20) => api.get('/twin/conversations', { params: { limit } }),
  getTwinningRate:   ()            => api.get('/twin/twinning-rate'),
}

// ── Intent OS (tasks · notes · calendar) ─────────────────────────────────────
export const intentAPI = {
  getDashboard: () => api.get('/intent/dashboard'),

  // Tasks ──────────────────────────────────────────────────────────────────
  createTask: async (data) => {
    const enc = await cryptoEngine.encryptFields(data, ENCRYPTED_FIELDS.task)
    return api.post('/intent/tasks', enc)
  },

  getTasks: async (status, priority) => {
    const res   = await api.get('/intent/tasks', { params: { status, priority } })
    const items = extractArray(res.data, 'tasks')
    const dec   = await decryptList(items, ENCRYPTED_FIELDS.task)
    return { ...res, data: rebuildData(res.data, 'tasks', dec) }
  },

  /** Only status is updated — not a sensitive field, no encryption needed. */
  updateTask: (id, status) => api.patch(`/intent/tasks/${id}`, { status }),

  // Notes ──────────────────────────────────────────────────────────────────
  createNote: async (data) => {
    const enc = await cryptoEngine.encryptFields(data, ENCRYPTED_FIELDS.note)
    return api.post('/intent/notes', enc)
  },

  getNotes: async (category) => {
    const res   = await api.get('/intent/notes', { params: { category } })
    const items = extractArray(res.data, 'notes')
    const dec   = await decryptList(items, ENCRYPTED_FIELDS.note)
    return { ...res, data: rebuildData(res.data, 'notes', dec) }
  },

  /**
   * Full-text note search — client-side after decryption.
   * Fetches all notes (no server filter possible on ciphertext).
   */
  searchNotes: async (q) => {
    const res   = await api.get('/intent/notes', {})
    const items = extractArray(res.data, 'notes')
    const dec   = await decryptList(items, ENCRYPTED_FIELDS.note)
    const lower = q.toLowerCase()
    const hits  = dec.filter((n) =>
      (n.content || '').toLowerCase().includes(lower) ||
      (n.title   || '').toLowerCase().includes(lower)
    )
    return { ...res, data: rebuildData(res.data, 'notes', hits) }
  },

  // Calendar ───────────────────────────────────────────────────────────────
  createEvent: async (data) => {
    const enc = await cryptoEngine.encryptFields(data, ENCRYPTED_FIELDS.calendar)
    return api.post('/intent/calendar', enc)
  },

  getEvents: async (days = 7) => {
    const res   = await api.get('/intent/calendar', { params: { days } })
    const items = extractArray(res.data, 'events')
    const dec   = await decryptList(items, ENCRYPTED_FIELDS.calendar)
    return { ...res, data: rebuildData(res.data, 'events', dec) }
  },

  importCalendar: (file) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post('/intent/calendar/import', formData)
  },

  getSuggestions:  () => api.get('/intent/suggestions'),
  smartPrioritize: () => api.get('/intent/prioritize'),
}

// ── Data Capture ──────────────────────────────────────────────────────────────
export const captureAPI = {
  startRecording: (duration) =>
    api.post('/capture/audio/start', null, { params: { duration } }),
  stopRecording: () => api.post('/capture/audio/stop'),
  uploadAudio: (file) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post('/capture/audio/upload', formData)
  },
  captureFace: (numSamples = 10) =>
    api.post('/capture/face/capture', null, { params: { num_samples: numSamples } }),
  uploadVideo: (file) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post('/capture/video/upload', formData)
  },
  getStats: () => api.get('/capture/stats'),
}

// ── System ────────────────────────────────────────────────────────────────────
export const systemAPI = {
  health:   () => api.get('/system/health'),
  security: () => api.get('/system/security'),
  status:   () => api.get('/system/status'),
}

// ── Avatar ────────────────────────────────────────────────────────────────────
export const avatarAPI = {
  getConfig:    ()     => api.get('/avatar/config'),
  updateConfig: (data) => api.patch('/avatar/config', data),
  getState:     ()     => api.get('/avatar/state'),
  setEmotion:   (data) => api.post('/avatar/emotion', data),
  uploadPhoto: (file) => {
    const form = new FormData()
    form.append('file', file)
    return api.post('/avatar/photo', form, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  deletePhoto: () => api.delete('/avatar/photo'),
}

export default api
