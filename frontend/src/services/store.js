/**
 * Mirra - Global State Management (Zustand)
 */

import { create } from 'zustand'

export const useAuthStore = create((set) => ({
  user: null,
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
    set({ token: null, user: null, isAuthenticated: false })
  },
}))

// Restore saved chat from localStorage
const savedChat = JSON.parse(localStorage.getItem('mirra_chat') || 'null')

export const useChatStore = create((set, get) => ({
  messages: savedChat?.messages || [],
  conversationId: savedChat?.conversationId || null,
  isLoading: false,
  currentContact: savedChat?.currentContact || null,

  addMessage: (message) =>
    set((state) => {
      const updated = [...state.messages, message]
      localStorage.setItem('mirra_chat', JSON.stringify({
        messages: updated,
        conversationId: state.conversationId,
        currentContact: state.currentContact,
      }))
      return { messages: updated }
    }),

  setConversationId: (id) => {
    set({ conversationId: id })
    const state = get()
    localStorage.setItem('mirra_chat', JSON.stringify({
      messages: state.messages,
      conversationId: id,
      currentContact: state.currentContact,
    }))
  },
  setLoading: (loading) => set({ isLoading: loading }),
  setCurrentContact: (contact) => {
    set({ currentContact: contact })
    const state = get()
    localStorage.setItem('mirra_chat', JSON.stringify({
      messages: state.messages,
      conversationId: state.conversationId,
      currentContact: contact,
    }))
  },
  clearChat: () => {
    localStorage.removeItem('mirra_chat')
    set({ messages: [], conversationId: null, currentContact: null })
  },
}))

export const useAppStore = create((set) => ({
  sidebarOpen: true,
  currentPage: 'chat',
  systemStatus: null,
  darkMode: true,

  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setCurrentPage: (page) => set({ currentPage: page }),
  setSystemStatus: (status) => set({ systemStatus: status }),
}))
