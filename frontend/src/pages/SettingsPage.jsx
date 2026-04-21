import React, { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { systemAPI } from '../services/api'
import {
  HiOutlineShieldCheck, HiOutlineServer, HiOutlineCog,
  HiOutlineDatabase, HiOutlineLockClosed, HiOutlineRefresh
} from 'react-icons/hi'

export default function SettingsPage() {
  const [status, setStatus] = useState(null)
  const [security, setSecurity] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadStatus() }, [])

  const loadStatus = async () => {
    try {
      const [statusRes, secRes] = await Promise.allSettled([
        systemAPI.status(),
        systemAPI.security(),
      ])
      if (statusRes.status === 'fulfilled') setStatus(statusRes.value.data)
      if (secRes.status === 'fulfilled') setSecurity(secRes.value.data)
    } catch (err) {
      toast.error('Failed to load settings')
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

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="section-title">Settings & Security</h1>
          <p className="section-subtitle">Your system is 100% local. Nothing leaves this machine.</p>
        </div>
        <button onClick={loadStatus} className="btn-secondary flex items-center gap-2">
          <HiOutlineRefresh className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Security Status */}
      <div className="glass-card p-6 glow-twin">
        <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
          <HiOutlineShieldCheck className="text-green-400" /> Security Status
        </h2>
        <div className="grid md:grid-cols-3 gap-4">
          <div className="bg-dark-600/30 rounded-xl p-4 border border-green-500/20">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-full bg-green-400" />
              <span className="text-sm font-medium text-white">Firewall</span>
            </div>
            <p className="text-xs text-dark-200">
              Status: {security?.firewall_active ? 'Active' : 'Inactive'}<br />
              Blocked: {security?.total_blocked || 0} attempts<br />
              {security?.status === 'SECURE' ? 'All clear - No threats' : 'Check alerts'}
            </p>
          </div>
          <div className="bg-dark-600/30 rounded-xl p-4 border border-green-500/20">
            <div className="flex items-center gap-2 mb-2">
              <HiOutlineLockClosed className="text-green-400 w-4 h-4" />
              <span className="text-sm font-medium text-white">Encryption</span>
            </div>
            <p className="text-xs text-dark-200">
              AES-256 Encryption<br />
              PBKDF2 Key Derivation<br />
              Local-only key storage
            </p>
          </div>
          <div className="bg-dark-600/30 rounded-xl p-4 border border-green-500/20">
            <div className="flex items-center gap-2 mb-2">
              <HiOutlineServer className="text-green-400 w-4 h-4" />
              <span className="text-sm font-medium text-white">Network</span>
            </div>
            <p className="text-xs text-dark-200">
              Bound to: 127.0.0.1 only<br />
              No external connections<br />
              No cloud, no telemetry
            </p>
          </div>
        </div>

        {security?.recent_blocked?.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-medium text-yellow-400 mb-2">Recent Blocked Connections</h3>
            <div className="space-y-1">
              {security.recent_blocked.map((b, i) => (
                <div key={i} className="text-xs text-dark-300 bg-dark-700/50 rounded px-3 py-1.5">
                  {b.time} — {b.destination} — {b.reason}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* System Components */}
      <div className="glass-card p-6">
        <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
          <HiOutlineCog className="text-twin-400" /> System Components
        </h2>
        <div className="space-y-3">
          {[
            {
              name: 'Local LLM (Ollama)',
              active: status?.llm?.available,
              detail: status?.llm?.model || 'Not loaded',
              help: 'Run: ollama serve && ollama pull llama3.1:8b',
            },
            {
              name: 'Speech-to-Text (Whisper)',
              active: status?.stt?.available,
              detail: 'OpenAI Whisper (runs locally)',
              help: 'pip install openai-whisper',
            },
            {
              name: 'Text-to-Speech (Coqui)',
              active: status?.tts?.available,
              detail: status?.tts?.voice_cloned ? 'Voice cloned!' : 'Default voice',
              help: 'pip install TTS',
            },
          ].map((comp) => (
            <div key={comp.name} className="flex items-center justify-between py-3 border-b border-dark-500/20 last:border-0">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${comp.active ? 'bg-green-400' : 'bg-red-400'}`} />
                <div>
                  <p className="text-sm font-medium text-white">{comp.name}</p>
                  <p className="text-xs text-dark-300">{comp.detail}</p>
                </div>
              </div>
              {!comp.active && (
                <div className="text-xs text-dark-400 font-mono bg-dark-700 rounded px-2 py-1">
                  {comp.help}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Data Stats */}
      <div className="glass-card p-6">
        <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
          <HiOutlineDatabase className="text-cyan-400" /> Data Storage
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Object.entries(status?.vector_store || {}).map(([name, count]) => (
            <div key={name} className="bg-dark-600/30 rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-white">{count}</p>
              <p className="text-xs text-dark-300 capitalize">{name}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Privacy Notice */}
      <div className="glass-card p-5 border border-green-500/20">
        <h3 className="text-sm font-semibold text-green-400 mb-2">Privacy Guarantee</h3>
        <ul className="text-xs text-dark-200 space-y-1.5">
          <li>All data is stored locally on YOUR machine in the /data directory</li>
          <li>All AI inference runs through Ollama on YOUR hardware — no API calls</li>
          <li>Voice processing (Whisper) runs completely offline</li>
          <li>The server only binds to 127.0.0.1 (localhost) — inaccessible from network</li>
          <li>All sensitive data is AES-256 encrypted at rest</li>
          <li>No telemetry, no analytics, no cloud sync, no third-party services</li>
          <li>Network firewall actively blocks any outgoing connections</li>
          <li>You own your data. Delete /data to erase everything.</li>
        </ul>
      </div>
    </div>
  )
}
