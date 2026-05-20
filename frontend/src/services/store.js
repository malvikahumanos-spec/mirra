/**
 * Mirra - Global State Management (Zustand)
 *
 * Zero-knowledge integration:
 *   - Chat history cache is stored encrypted in localStorage (AES-256-GCM)
 *   - The encryption key lives in memory only; it is wiped on logout
 *   - loadFromStorage() must be called after login once the key is ready
 *   - All setLocalItem / getLocalItem calls fall back to plaintext gracefully
 *     if the key is not yet initialised (i.e. during first-ever page load
 *     before login).
 */

import { create } from 'zustand'
import { cryptoEngine } from './crypto'

// ── Auth store ────────────────────────────────────────────────────────────────
// The JWT token and username are NOT personally sensitive — they carry no
// readable private data.  Keeping them in plaintext localStorage is fine; the
// server validates the JWT on every request.

export const useAuthStore = create((set) => ({
  user: localStorage.getItem('mirra_user'),
  token: localStorage.getItem('mirra_token'),
  isAuthenticated: !!localStorage.getItem('mirra_token'),

  login: (token, username) => {
    localStorage.setItem('mirra_token', token)
    localStorage.setItem('mirra_user', username)
    set({ token, user: username, isAuthenticated: true })
  },

  logout: () => {
    localStorage.removeItem('mirra_token')
    localStorage.removeItem('mirra_user')
    // Wipe the AES key from memory — nobody can decrypt local data after this
    cryptoEngine.clearKey()
    set({ token: null, user: null, isAuthenticated: false })
  },
}))

// ── Chat store ────────────────────────────────────────────────────────────────
// Chat messages are cached locally for instant restore on page refresh.
// The entire cache blob is encrypted as one AES-256-GCM ciphertext so that
// even if someone gains physical access to this device they cannot read
// conversation history.
//
// Startup flow:
//   1. Module loads  → state starts empty (key not ready yet).
//   2. User logs in  → key derived in LoginPage → loadFromStorage() called.
//   3. Store hydrates from encrypted localStorage.

export const useChatStore = create((set, get) => ({
  messages: [],
  conversationId: null,
  isLoading: false,
  currentContact: null,

  /**
   * Hydrate store from encrypted localStorage.
   * Call this once immediately after the crypto key is derived (post-login).
   */
  loadFromStorage: async () => {
    try {
      const saved = await cryptoEngine.getLocalItem('mirra_chat')
      if (saved) {
        set({
          messages:       saved.messages       || [],
          conversationId: saved.conversationId || null,
          currentContact: saved.currentContact || null,
        })
      }
    } catch {
      /* corrupted / not present — silently ignore */
    }
  },

  /** Persist current state to encrypted localStorage (fire-and-forget). */
  _persist: (messages, conversationId, currentContact) => {
    cryptoEngine.setLocalItem('mirra_chat', { messages, conversationId, currentContact })
      .catch(() => {/* ignore cache write errors */})
  },

  addMessage: (message) =>
    set((state) => {
      const updated = [...state.messages, message]
      get()._persist(updated, state.conversationId, state.currentContact)
      return { messages: updated }
    }),

  setConversationId: (id) => {
    set({ conversationId: id })
    const { messages, currentContact } = get()
    get()._persist(messages, id, currentContact)
  },

  setLoading: (loading) => set({ isLoading: loading }),

  setCurrentContact: (contact) => {
    set({ currentContact: contact })
    const { messages, conversationId } = get()
    get()._persist(messages, conversationId, contact)
  },

  clearChat: () => {
    cryptoEngine.removeLocalItem('mirra_chat')
    set({ messages: [], conversationId: null, currentContact: null })
  },
}))

// ── App store ─────────────────────────────────────────────────────────────────
export const useAppStore = create((set) => ({
  sidebarOpen:  true,
  currentPage:  'chat',
  systemStatus: null,
  darkMode:     true,

  toggleSidebar:   () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setCurrentPage:  (page)   => set({ currentPage: page }),
  setSystemStatus: (status) => set({ systemStatus: status }),
}))
