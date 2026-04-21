import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useAuthStore } from './services/store'

import Layout from './components/shared/Layout'
import LoginPage from './pages/LoginPage'
import ChatPage from './pages/ChatPage'
import DashboardPage from './pages/DashboardPage'
import TasksPage from './pages/TasksPage'
import NotesPage from './pages/NotesPage'
import CalendarPage from './pages/CalendarPage'
import MemoryPage from './pages/MemoryPage'
import TrainingPage from './pages/TrainingPage'
import SettingsPage from './pages/SettingsPage'

function ProtectedRoute({ children }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return isAuthenticated ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#25262B',
            color: '#C1C2C5',
            border: '1px solid #373A40',
            borderRadius: '12px',
          },
        }}
      />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <Layout>
                <Routes>
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/chat" element={<ChatPage />} />
                  <Route path="/tasks" element={<TasksPage />} />
                  <Route path="/notes" element={<NotesPage />} />
                  <Route path="/calendar" element={<CalendarPage />} />
                  <Route path="/memory" element={<MemoryPage />} />
                  <Route path="/training" element={<TrainingPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                </Routes>
              </Layout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </>
  )
}
