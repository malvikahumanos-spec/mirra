import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore, useAppStore } from '../../services/store'
import {
  HiOutlineChat, HiOutlineHome, HiOutlineClipboardList,
  HiOutlinePencilAlt, HiOutlineCalendar, HiOutlineLightBulb,
  HiOutlineCog, HiOutlineLogout, HiOutlineMenuAlt2,
  HiOutlineShieldCheck, HiOutlineDatabase, HiOutlineFilm
} from 'react-icons/hi'

const navItems = [
  { path: '/', icon: HiOutlineHome, label: 'Dashboard' },
  { path: '/chat', icon: HiOutlineChat, label: 'Talk to Mirra' },
  { path: '/emotion-studio', icon: HiOutlineFilm, label: 'Emotion Studio', badge: '🎭' },
  { path: '/tasks', icon: HiOutlineClipboardList, label: 'Tasks' },
  { path: '/notes', icon: HiOutlinePencilAlt, label: 'Notes' },
  { path: '/calendar', icon: HiOutlineCalendar, label: 'Calendar' },
  { path: '/memory', icon: HiOutlineDatabase, label: 'Memory' },
  { path: '/training', icon: HiOutlineLightBulb, label: 'Train Mirra' },
  { path: '/settings', icon: HiOutlineCog, label: 'Settings' },
]

export default function Layout({ children }) {
  const { sidebarOpen, toggleSidebar } = useAppStore()
  const { logout, user } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? 'w-64' : 'w-20'
        } bg-dark-800 border-r border-dark-500/30 flex flex-col transition-all duration-300 ease-in-out`}
      >
        {/* Logo */}
        <div className="h-16 flex items-center px-4 border-b border-dark-500/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-twin-500 to-purple-500 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-twin-500/20">
              M
            </div>
            {sidebarOpen && (
              <div>
                <h1 className="font-bold text-white text-sm">Mirra</h1>
                <p className="text-[10px] text-dark-200 flex items-center gap-1">
                  <HiOutlineShieldCheck className="text-green-400" />
                  100% Local
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group ${
                  isActive
                    ? 'bg-twin-500/15 text-twin-400 border border-twin-500/20'
                    : 'text-dark-200 hover:text-white hover:bg-dark-600/50'
                }`
              }
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {sidebarOpen && (
                <span className="text-sm font-medium flex-1">{item.label}</span>
              )}
              {sidebarOpen && item.badge && (
                <span className="text-sm">{item.badge}</span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User & Logout */}
        <div className="p-3 border-t border-dark-500/30">
          {sidebarOpen && (
            <div className="flex items-center gap-3 px-3 py-2 mb-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-twin-400 to-purple-400 flex items-center justify-center text-white text-xs font-bold">
                {(user || localStorage.getItem('mirra_user') || 'U')[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {user || localStorage.getItem('mirra_user') || 'User'}
                </p>
                <p className="text-[10px] text-green-400">Secure Session</p>
              </div>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-dark-200 hover:text-red-400 hover:bg-red-500/10 transition-all w-full"
          >
            <HiOutlineLogout className="w-5 h-5" />
            {sidebarOpen && <span className="text-sm">Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="h-14 bg-dark-800/50 backdrop-blur-xl border-b border-dark-500/20 flex items-center px-4 gap-4">
          <button
            onClick={toggleSidebar}
            className="p-2 rounded-lg text-dark-200 hover:text-white hover:bg-dark-600/50 transition-all"
          >
            <HiOutlineMenuAlt2 className="w-5 h-5" />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-2 text-xs text-dark-300">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            System Secure — All Data Local
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {children}
        </div>
      </main>
    </div>
  )
}
