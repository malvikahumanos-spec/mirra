import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { intentAPI, systemAPI, twinAPI } from '../services/api'
import {
  HiOutlineClipboardList, HiOutlineCalendar, HiOutlinePencilAlt,
  HiOutlineMail, HiOutlineDatabase, HiOutlineSparkles,
  HiOutlineShieldCheck, HiOutlineLightBulb, HiOutlineClock,
  HiOutlineCheckCircle, HiOutlineChat
} from 'react-icons/hi'

function StatCard({ icon: Icon, label, value, color, onClick }) {
  return (
    <button onClick={onClick} className="glass-card-hover p-5 text-left w-full">
      <div className="flex items-center justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-sm text-dark-200 mt-1">{label}</p>
    </button>
  )
}

export default function DashboardPage() {
  const [dashboard, setDashboard] = useState(null)
  const [status, setStatus] = useState(null)
  const [twinStats, setTwinStats] = useState(null)
  const [twinningRate, setTwinningRate] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    loadDashboard()
  }, [])

  const loadDashboard = async () => {
    try {
      const [dashRes, statusRes, statsRes, rateRes] = await Promise.allSettled([
        intentAPI.getDashboard(),
        systemAPI.status(),
        twinAPI.getStats(),
        twinAPI.getTwinningRate(),
      ])
      if (dashRes.status === 'fulfilled') setDashboard(dashRes.value.data)
      if (statusRes.status === 'fulfilled') setStatus(statusRes.value.data)
      if (statsRes.status === 'fulfilled') setTwinStats(statsRes.value.data)
      if (rateRes.status === 'fulfilled') setTwinningRate(rateRes.value.data)
    } catch (err) {
      toast.error('Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-twin-500/30 border-t-twin-500 rounded-full animate-spin" />
      </div>
    )
  }

  const tasks = dashboard?.tasks || {}
  const memStats = dashboard?.memory_stats || {}

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Welcome Section */}
      <div className="glass-card p-6 glow-twin">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-twin-500 to-purple-500 flex items-center justify-center shadow-xl shadow-twin-500/20 animate-float">
            <HiOutlineSparkles className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold gradient-text">Welcome to Mirra</h1>
            <p className="text-dark-200 mt-1">Your personal AI operating system. Everything runs locally on your machine.</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${status?.llm?.available ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
            <span className="text-sm text-dark-200">
              {status?.llm?.available ? 'Mirra Active' : 'Start Ollama'}
            </span>
          </div>
        </div>
      </div>

      {/* Twinning Rate */}
      {twinningRate && (
        <div className="glass-card p-6 glow-twin">
          <div className="flex items-start gap-6">
            {/* Circular Progress */}
            <div className="relative w-28 h-28 flex-shrink-0">
              <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="8" className="text-dark-600" />
                <circle cx="50" cy="50" r="42" fill="none" strokeWidth="8"
                  strokeDasharray={`${twinningRate.twinning_rate * 2.64} 264`}
                  strokeLinecap="round"
                  className={twinningRate.twinning_rate >= 60 ? 'text-green-400' : twinningRate.twinning_rate >= 30 ? 'text-twin-400' : 'text-orange-400'}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-white">{twinningRate.twinning_rate}%</span>
                <span className="text-[9px] text-dark-300 uppercase tracking-wider">Twinning</span>
              </div>
            </div>

            {/* Breakdown */}
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-white mb-3">Twinning Rate</h2>
              <div className="space-y-2">
                {Object.entries(twinningRate.breakdown).map(([key, item]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="text-xs text-dark-200 w-36 truncate">{item.label}</span>
                    <div className="flex-1 h-1.5 bg-dark-600 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-twin-500 to-purple-500 rounded-full transition-all"
                        style={{ width: `${(item.score / item.max) * 100}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-dark-300 w-10 text-right">{item.score}/{item.max}</span>
                  </div>
                ))}
              </div>

              {/* Tips */}
              {twinningRate.tips?.length > 0 && (
                <div className="mt-3 pt-3 border-t border-dark-600/50">
                  <p className="text-[10px] text-dark-300 uppercase tracking-wider mb-1">Improve your Mirra</p>
                  <p className="text-xs text-dark-200">{twinningRate.tips[0]}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={HiOutlineClipboardList}
          label="Pending Tasks"
          value={tasks.pending || 0}
          color="bg-twin-500/20 text-twin-400"
          onClick={() => navigate('/tasks')}
        />
        <StatCard
          icon={HiOutlineCalendar}
          label="Upcoming Events"
          value={dashboard?.upcoming_events || 0}
          color="bg-purple-500/20 text-purple-400"
          onClick={() => navigate('/calendar')}
        />
        <StatCard
          icon={HiOutlinePencilAlt}
          label="Notes"
          value={dashboard?.notes_count || 0}
          color="bg-pink-500/20 text-pink-400"
          onClick={() => navigate('/notes')}
        />
        <StatCard
          icon={HiOutlineDatabase}
          label="Memories"
          value={Object.values(memStats).reduce((a, b) => a + b, 0)}
          color="bg-cyan-500/20 text-cyan-400"
          onClick={() => navigate('/memory')}
        />
      </div>

      {/* Two Column Layout */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Task Overview */}
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-title flex items-center gap-2">
              <HiOutlineClipboardList className="text-twin-400" /> Tasks
            </h2>
            <button onClick={() => navigate('/tasks')} className="text-xs text-twin-400 hover:text-twin-300">
              View All
            </button>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2">
                <HiOutlineClock className="text-yellow-400 w-4 h-4" />
                <span className="text-sm text-dark-100">To Do</span>
              </div>
              <span className="badge-warning">{tasks.pending || 0}</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2">
                <HiOutlineSparkles className="text-twin-400 w-4 h-4" />
                <span className="text-sm text-dark-100">In Progress</span>
              </div>
              <span className="badge-primary">{tasks.in_progress || 0}</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2">
                <HiOutlineCheckCircle className="text-green-400 w-4 h-4" />
                <span className="text-sm text-dark-100">Completed</span>
              </div>
              <span className="badge-success">{tasks.completed || 0}</span>
            </div>
          </div>
        </div>

        {/* System Status */}
        <div className="glass-card p-5">
          <h2 className="section-title flex items-center gap-2 mb-4">
            <HiOutlineShieldCheck className="text-green-400" /> System Status
          </h2>
          <div className="space-y-3">
            {[
              { label: 'LLM Engine', active: status?.llm?.available, detail: status?.llm?.model },
              { label: 'Speech-to-Text', active: status?.stt?.available, detail: 'Whisper' },
              { label: 'Text-to-Speech', active: status?.tts?.available, detail: status?.tts?.voice_cloned ? 'Voice Cloned' : 'Default' },
              { label: 'Security', active: true, detail: status?.security?.status },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between py-2">
                <span className="text-sm text-dark-100">{item.label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-dark-300">{item.detail || ''}</span>
                  <div className={`w-2.5 h-2.5 rounded-full ${item.active ? 'bg-green-400' : 'bg-dark-400'}`} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Upcoming Events Preview */}
      {dashboard?.events_preview?.length > 0 && (
        <div className="glass-card p-5">
          <h2 className="section-title flex items-center gap-2 mb-4">
            <HiOutlineCalendar className="text-purple-400" /> Upcoming Events
          </h2>
          <div className="grid md:grid-cols-3 gap-3">
            {dashboard.events_preview.map((event, i) => (
              <div key={i} className="bg-dark-600/30 rounded-xl p-3 border border-dark-500/20">
                <h3 className="text-sm font-medium text-white truncate">{event.title}</h3>
                <p className="text-xs text-dark-300 mt-1">
                  {new Date(event.start_time).toLocaleDateString()} {new Date(event.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
                {event.location && <p className="text-xs text-dark-300">{event.location}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Chat with Mirra', icon: HiOutlineChat, path: '/chat', color: 'from-twin-500 to-twin-600' },
          { label: 'Add Task', icon: HiOutlineClipboardList, path: '/tasks', color: 'from-purple-500 to-purple-600' },
          { label: 'Write Note', icon: HiOutlinePencilAlt, path: '/notes', color: 'from-pink-500 to-pink-600' },
          { label: 'Train Mirra', icon: HiOutlineLightBulb, path: '/training', color: 'from-cyan-500 to-cyan-600' },
        ].map((action) => (
          <button
            key={action.label}
            onClick={() => navigate(action.path)}
            className="glass-card-hover p-4 flex items-center gap-3"
          >
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${action.color} flex items-center justify-center`}>
              <action.icon className="w-5 h-5 text-white" />
            </div>
            <span className="text-sm font-medium text-dark-100">{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
