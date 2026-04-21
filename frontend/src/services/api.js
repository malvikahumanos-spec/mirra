/**
 * Mirra - API Service
 * Uses VITE_API_URL in production (Railway), falls back to localhost for dev.
 */

import axios from 'axios'

const API_BASE = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8765') + '/api'

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  timeout: 120000,
})

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('mirra_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Handle auth errors — skip redirect for login/register endpoints
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

// Auth
export const authAPI = {
  register: (username, password) => api.post('/auth/register', { username, password }),
  login: (username, password) => api.post('/auth/login', { username, password }),
  logout: () => api.post('/auth/logout'),
}

// Twin
export const twinAPI = {
  chat: (message, conversationId, contactName, includeVoice = false) =>
    api.post('/twin/chat', {
      message,
      conversation_id: conversationId,
      contact_name: contactName,
      include_voice: includeVoice,
    }),
  addMemory: (content, category, importance) =>
    api.post('/twin/memory', { content, category, importance }),
  searchMemory: (q, collection = 'memories', limit = 10) =>
    api.get('/twin/memory/search', { params: { q, collection, limit } }),
  addContact: (data) => api.post('/twin/contact', data),
  getPersonality: () => api.get('/twin/personality'),
  getStats: () => api.get('/twin/stats'),
  getConversation: (id) => api.get(`/twin/conversation/${id}`),
  listMemories: (collection = 'memories', limit = 50) =>
    api.get('/twin/memory/list', { params: { collection, limit } }),
  listConversations: (limit = 20) => api.get('/twin/conversations', { params: { limit } }),
  getTwinningRate: () => api.get('/twin/twinning-rate'),
}

// Intent OS
export const intentAPI = {
  getDashboard: () => api.get('/intent/dashboard'),
  // Tasks
  createTask: (data) => api.post('/intent/tasks', data),
  getTasks: (status, priority) => api.get('/intent/tasks', { params: { status, priority } }),
  updateTask: (id, status) => api.patch(`/intent/tasks/${id}`, { status }),
  // Notes
  createNote: (data) => api.post('/intent/notes', data),
  getNotes: (category) => api.get('/intent/notes', { params: { category } }),
  searchNotes: (q) => api.get('/intent/notes/search', { params: { q } }),
  // Calendar
  createEvent: (data) => api.post('/intent/calendar', data),
  getEvents: (days = 7) => api.get('/intent/calendar', { params: { days } }),
  importCalendar: (file) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post('/intent/calendar/import', formData)
  },
  // AI
  getSuggestions: () => api.get('/intent/suggestions'),
  smartPrioritize: () => api.get('/intent/prioritize'),
}

// Data Capture
export const captureAPI = {
  startRecording: (duration) => api.post('/capture/audio/start', null, { params: { duration } }),
  stopRecording: () => api.post('/capture/audio/stop'),
  uploadAudio: (file) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post('/capture/audio/upload', formData)
  },
  captureFace: (numSamples = 10) => api.post('/capture/face/capture', null, { params: { num_samples: numSamples } }),
  uploadVideo: (file) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post('/capture/video/upload', formData)
  },
  getStats: () => api.get('/capture/stats'),
}

// System
export const systemAPI = {
  health: () => api.get('/system/health'),
  security: () => api.get('/system/security'),
  status: () => api.get('/system/status'),
}

export default api
