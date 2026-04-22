/**
 * Mirra — Emotion Recording Studio
 * Record your face for each emotion to train your personal digital twin.
 * Uses browser MediaRecorder API — no external service needed.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react'
import toast from 'react-hot-toast'
import api from '../services/api'

// ── Emotion config ────────────────────────────────────────────────────────────
const EMOTIONS = [
  { id: 'neutral',        emoji: '😐', label: 'Neutral',        sublabel: 'Talking normally',   color: '#6B7280', target: 300 },
  { id: 'happy',          emoji: '😊', label: 'Happy',          sublabel: 'Laughing / joyful',  color: '#F59E0B', target: 120 },
  { id: 'sad',            emoji: '😢', label: 'Sad',            sublabel: 'Emotional / teary',  color: '#3B82F6', target: 90  },
  { id: 'angry',          emoji: '😠', label: 'Angry',          sublabel: 'Frustrated / upset', color: '#EF4444', target: 90  },
  { id: 'surprised',      emoji: '😲', label: 'Surprised',      sublabel: 'Shocked / amazed',   color: '#8B5CF6', target: 60  },
  { id: 'thinking',       emoji: '🤔', label: 'Thinking',       sublabel: 'Focused / curious',  color: '#10B981', target: 60  },
  { id: 'hindi_speaking', emoji: '🗣️', label: 'Hindi/Hinglish', sublabel: 'Apni bhasha mein',   color: '#EC4899', target: 120 },
]

const TIPS = {
  neutral:        ['Introduce yourself naturally', 'Talk about your day', 'Describe your work or hobbies', 'Speak at your normal pace'],
  happy:          ['Recall your happiest memory', 'Laugh at something funny', 'Talk about your favorite thing', 'Smile genuinely — don\'t force it'],
  sad:            ['Think of something you miss', 'Talk about a tough day', 'Speak softly and slowly', 'It\'s okay if eyes get watery — that\'s good data'],
  angry:          ['Rant about a real frustration', 'Talk about something unfair', 'Be genuine — don\'t overact', 'Traffic, deadlines, annoying situations'],
  surprised:      ['"What?! Really?!"', '"Oh my God, I can\'t believe it!"', 'React to imaginary good/bad news', 'Eyebrows up, mouth open — natural'],
  thinking:       ['Solve a math problem out loud', '"Hmm, let me think..."', 'Look away, tap your chin', 'Plan something while recording'],
  hindi_speaking: ['Kuch bhi bolo — apni story', '"Aaj kya hua mujhe..."', 'Mix Hindi and English freely', 'Bilkul normal baat karo jaise ghar mein'],
}

function fmtTime(sec) {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

// ── Main component ────────────────────────────────────────────────────────────
export default function EmotionStudioPage() {
  const [status, setStatus] = useState(null)          // from backend
  const [selected, setSelected] = useState('neutral') // active emotion
  const [phase, setPhase] = useState('idle')          // idle | countdown | recording | saving
  const [countdown, setCountdown] = useState(3)
  const [elapsed, setElapsed] = useState(0)
  const [stream, setStream] = useState(null)
  const [cameraOn, setCameraOn] = useState(false)
  const [tipIndex, setTipIndex] = useState(0)

  const videoRef   = useRef(null)
  const recorderRef = useRef(null)
  const chunksRef   = useRef([])
  const timerRef    = useRef(null)
  const countRef    = useRef(null)

  // Fetch status from backend
  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.get('/training/status')
      setStatus(res.data)
    } catch {
      // backend may not be running in dev
    }
  }, [])

  useEffect(() => { fetchStatus() }, [fetchStatus])

  // Rotate tips every 4 seconds during recording
  useEffect(() => {
    if (phase !== 'recording') return
    const iv = setInterval(() => setTipIndex(i => (i + 1) % TIPS[selected].length), 4000)
    return () => clearInterval(iv)
  }, [phase, selected])

  // Start camera
  const startCamera = useCallback(async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: true,
      })
      setStream(s)
      setCameraOn(true)
      if (videoRef.current) {
        videoRef.current.srcObject = s
        videoRef.current.muted = true
      }
    } catch (err) {
      toast.error('Camera access denied. Please allow camera permissions.')
    }
  }, [])

  // Stop camera
  const stopCamera = useCallback(() => {
    if (stream) stream.getTracks().forEach(t => t.stop())
    setStream(null)
    setCameraOn(false)
    if (videoRef.current) videoRef.current.srcObject = null
  }, [stream])

  // Cleanup on unmount
  useEffect(() => () => {
    stopCamera()
    clearInterval(timerRef.current)
    clearInterval(countRef.current)
  }, [stopCamera])

  // Begin: countdown → record
  const beginRecording = useCallback(() => {
    if (!stream) return
    setPhase('countdown')
    setCountdown(3)
    setTipIndex(0)

    let c = 3
    countRef.current = setInterval(() => {
      c -= 1
      setCountdown(c)
      if (c <= 0) {
        clearInterval(countRef.current)
        // Start recording
        chunksRef.current = []
        const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
          ? 'video/webm;codecs=vp9'
          : 'video/webm'
        const recorder = new MediaRecorder(stream, { mimeType: mime })
        recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
        recorder.start(1000) // collect in 1s chunks
        recorderRef.current = recorder

        setElapsed(0)
        setPhase('recording')
        timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000)
      }
    }, 1000)
  }, [stream])

  // Stop recording & upload
  const stopRecording = useCallback(() => {
    clearInterval(timerRef.current)
    setPhase('saving')

    const recorder = recorderRef.current
    if (!recorder) return

    recorder.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' })
      const duration = elapsed

      try {
        const form = new FormData()
        form.append('file', blob, `${selected}_${Date.now()}.webm`)

        await api.post(
          `/training/emotion-video?emotion=${selected}&duration=${duration}`,
          form,
          { headers: { 'Content-Type': 'multipart/form-data' } }
        )
        toast.success(`Saved ${fmtTime(duration)} of ${selected} — great job! 🎉`)
        await fetchStatus()
      } catch (err) {
        toast.error('Failed to save. Is the backend running?')
      } finally {
        setPhase('idle')
        setElapsed(0)
      }
    }

    recorder.stop()
  }, [elapsed, selected, fetchStatus])

  const clearEmotion = async (emotion) => {
    try {
      await api.delete(`/training/emotion-video?emotion=${emotion}`)
      toast.success(`Cleared ${emotion} recordings`)
      fetchStatus()
    } catch {
      toast.error('Failed to clear')
    }
  }

  const downloadData = () => {
    window.open(`${api.defaults.baseURL}/training/download-data?token=${localStorage.getItem('mirra_token')}`, '_blank')
  }

  const em = EMOTIONS.find(e => e.id === selected)
  const st = status?.emotions?.[selected]
  const readiness = status?.readiness ?? 0

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="section-title">🎭 Emotion Recording Studio</h1>
        <p className="section-subtitle">
          Record yourself in different emotions — your twin learns to wear your face and feel your feelings.
        </p>
      </div>

      {/* Readiness Bar */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-semibold text-white">Twin Face Readiness</p>
            <p className="text-xs text-dark-300">
              {readiness < 30  ? 'Just getting started — keep recording!'
              : readiness < 60 ? 'Good progress! A few more emotions needed.'
              : readiness < 80 ? 'Almost ready to train your model!'
              : 'Ready to train! 🚀'}
            </p>
          </div>
          <div className="text-3xl font-bold text-white">{readiness}<span className="text-lg text-dark-300">%</span></div>
        </div>
        <div className="h-3 bg-dark-600 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${readiness}%`,
              background: readiness >= 80 ? '#10B981'
                        : readiness >= 60 ? '#F59E0B'
                        : readiness >= 30 ? '#3B82F6'
                        : '#6B7280',
            }}
          />
        </div>

        {readiness >= 60 && (
          <div className="mt-4 flex gap-3">
            <button
              onClick={downloadData}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-500/20 text-green-400 border border-green-500/30 text-sm font-medium hover:bg-green-500/30 transition-all"
            >
              ⬇️ Download Training Data
            </button>
            <a
              href="https://colab.research.google.com/github/mirra-ai/mirra/blob/main/notebooks/train_face_model.ipynb"
              target="_blank" rel="noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-twin-500/20 text-twin-400 border border-twin-500/30 text-sm font-medium hover:bg-twin-500/30 transition-all"
            >
              🚀 Train on Google Colab (Free GPU)
            </a>
          </div>
        )}
      </div>

      {/* Main layout: emotion grid + recorder */}
      <div className="grid lg:grid-cols-2 gap-6">

        {/* Left — Emotion selector grid */}
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-dark-400">Choose Emotion to Record</p>
          <div className="grid grid-cols-2 gap-3">
            {EMOTIONS.map(e => {
              const s = status?.emotions?.[e.id]
              const pct = s?.percent ?? 0
              const isActive = selected === e.id
              return (
                <button
                  key={e.id}
                  onClick={() => setSelected(e.id)}
                  className={`relative p-4 rounded-xl border text-left transition-all ${
                    isActive
                      ? 'border-2 bg-dark-600/80 scale-[1.02]'
                      : 'border-dark-500/30 bg-dark-700/50 hover:bg-dark-600/50'
                  }`}
                  style={isActive ? { borderColor: e.color } : {}}
                >
                  {/* Recorded fill */}
                  <div
                    className="absolute inset-0 rounded-xl opacity-10 transition-all duration-500"
                    style={{ background: e.color, width: `${pct}%` }}
                  />
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xl">{e.emoji}</span>
                      {pct >= 80
                        ? <span className="text-xs text-green-400 font-bold">✓ Ready</span>
                        : pct > 0
                          ? <span className="text-xs font-medium" style={{ color: e.color }}>{pct}%</span>
                          : <span className="text-xs text-dark-500">Not started</span>
                      }
                    </div>
                    <p className="text-sm font-semibold text-white">{e.label}</p>
                    <p className="text-[10px] text-dark-400">{e.sublabel}</p>
                    {s && s.recorded_seconds > 0 && (
                      <p className="text-[10px] mt-1" style={{ color: e.color }}>
                        {fmtTime(s.recorded_seconds)} / {fmtTime(e.target)} recorded
                      </p>
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Clear button for selected emotion */}
          {status?.emotions?.[selected]?.clips > 0 && (
            <button
              onClick={() => clearEmotion(selected)}
              className="text-xs text-red-400/70 hover:text-red-400 underline transition-all mt-1"
            >
              🗑 Clear all {selected} recordings
            </button>
          )}
        </div>

        {/* Right — Camera + recording controls */}
        <div className="space-y-4">

          {/* Camera preview */}
          <div
            className="relative rounded-2xl overflow-hidden bg-dark-800 border border-dark-500/30"
            style={{ aspectRatio: '4/3' }}
          >
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ transform: 'scaleX(-1)' }}  // mirror
            />

            {/* Overlay: not started */}
            {!cameraOn && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-dark-900/80 gap-3">
                <div className="text-4xl">{em?.emoji}</div>
                <p className="text-white font-semibold">Camera Off</p>
                <p className="text-dark-400 text-xs text-center px-8">
                  Click "Turn On Camera" to see yourself and start recording.
                </p>
              </div>
            )}

            {/* Overlay: countdown */}
            {phase === 'countdown' && (
              <div className="absolute inset-0 flex items-center justify-center bg-dark-900/60">
                <div
                  className="text-8xl font-black animate-ping"
                  style={{ color: em?.color }}
                >
                  {countdown}
                </div>
              </div>
            )}

            {/* Overlay: recording indicator */}
            {phase === 'recording' && (
              <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/60 rounded-full px-3 py-1">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-white text-xs font-mono font-bold">{fmtTime(elapsed)}</span>
              </div>
            )}

            {/* Face guide overlay */}
            {cameraOn && phase === 'idle' && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div
                  className="rounded-full border-2 border-dashed opacity-30"
                  style={{ width: '45%', height: '65%', borderColor: em?.color }}
                />
              </div>
            )}

            {/* Emotion badge */}
            {cameraOn && (
              <div
                className="absolute bottom-3 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full text-sm font-bold text-white"
                style={{ background: `${em?.color}CC` }}
              >
                {em?.emoji} {em?.label}
              </div>
            )}
          </div>

          {/* Tips */}
          {cameraOn && (
            <div
              className="rounded-xl p-3 border text-sm text-white/90 min-h-[52px] transition-all duration-500"
              style={{ background: `${em?.color}15`, borderColor: `${em?.color}40` }}
            >
              <span className="opacity-60 text-xs mr-1">💡 Tip:</span>
              {TIPS[selected]?.[tipIndex]}
            </div>
          )}

          {/* Controls */}
          <div className="space-y-2">
            {!cameraOn ? (
              <button
                onClick={startCamera}
                className="w-full py-3.5 rounded-xl font-semibold text-white transition-all"
                style={{ background: `linear-gradient(135deg, ${em?.color}99, ${em?.color}55)`, border: `1px solid ${em?.color}40` }}
              >
                📷 Turn On Camera
              </button>
            ) : phase === 'idle' ? (
              <button
                onClick={beginRecording}
                className="w-full py-3.5 rounded-xl font-semibold text-white transition-all hover:scale-[1.02] active:scale-100"
                style={{ background: `linear-gradient(135deg, ${em?.color}, ${em?.color}99)` }}
              >
                🎬 Start Recording — {em?.emoji} {em?.label}
              </button>
            ) : phase === 'countdown' ? (
              <button disabled className="w-full py-3.5 rounded-xl font-semibold text-white opacity-70 cursor-not-allowed bg-dark-600">
                Get ready… {countdown}
              </button>
            ) : phase === 'recording' ? (
              <button
                onClick={stopRecording}
                className="w-full py-3.5 rounded-xl font-semibold text-white bg-red-500/80 hover:bg-red-500 transition-all animate-pulse"
              >
                ⏹ Stop Recording ({fmtTime(elapsed)})
              </button>
            ) : (
              <button disabled className="w-full py-3.5 rounded-xl font-semibold text-dark-300 bg-dark-700 cursor-not-allowed">
                💾 Saving…
              </button>
            )}

            {cameraOn && phase === 'idle' && (
              <button
                onClick={stopCamera}
                className="w-full py-2.5 rounded-xl text-sm text-dark-400 hover:text-dark-200 bg-dark-700/50 border border-dark-600/30 transition-all"
              >
                Turn Off Camera
              </button>
            )}
          </div>

          {/* Stats for selected emotion */}
          {st && st.clips > 0 && (
            <div
              className="rounded-xl p-3 border flex items-center justify-between"
              style={{ background: `${em?.color}10`, borderColor: `${em?.color}30` }}
            >
              <div>
                <p className="text-xs text-dark-400">Total recorded</p>
                <p className="text-lg font-bold text-white">{fmtTime(st.recorded_seconds)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-dark-400">Clips</p>
                <p className="text-lg font-bold text-white">{st.clips}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-dark-400">Target</p>
                <p className="text-lg font-bold" style={{ color: em?.color }}>{fmtTime(em?.target)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-dark-400">Status</p>
                <p className={`text-sm font-bold ${st.ready ? 'text-green-400' : 'text-yellow-400'}`}>
                  {st.ready ? '✓ Ready' : 'In Progress'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* How it works */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold text-white mb-4">How Your Face Gets Trained</h3>
        <div className="grid md:grid-cols-4 gap-4">
          {[
            { step: '1', icon: '🎥', title: 'Record', desc: 'Record 13-15 minutes across all 7 emotions using your webcam.' },
            { step: '2', icon: '⬇️', title: 'Download', desc: 'Download your emotion videos as a zip file.' },
            { step: '3', icon: '🚀', title: 'Train on Colab', desc: 'Open Google Colab (free GPU), upload the zip, run training. Takes ~2 hours.' },
            { step: '4', icon: '🧠', title: 'Your Face Model', desc: 'Download your personal model file (~500MB) and place it in models/face/.' },
          ].map(s => (
            <div key={s.step} className="text-center">
              <div className="w-10 h-10 rounded-full bg-twin-500/20 border border-twin-500/30 flex items-center justify-center text-twin-400 font-bold text-sm mx-auto mb-2">
                {s.step}
              </div>
              <div className="text-2xl mb-1">{s.icon}</div>
              <p className="text-sm font-semibold text-white">{s.title}</p>
              <p className="text-xs text-dark-400 mt-1">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
