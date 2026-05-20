/**
 * TwinAvatar — Real-time digital twin face renderer
 *
 * Three progressive tiers (switches automatically):
 *   1. placeholder  — high-quality SVG face with full animations
 *   2. photo        — your real face photo with live emotion overlays
 *   3. trained      — generated face frames from trained model
 *
 * All tiers share: blink, lip-sync, emotion transitions, holographic ring.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { avatarAPI } from '../services/api'

// ── Emotion configs ────────────────────────────────────────────────────────────
const EMOTIONS = {
  neutral:    { browLift: 0,   browFurrow: 0,  eyeScale: 1,    mouthCurve: 0,  mouthW: 18, blush: 0,    glow: '#7c3aed' },
  happy:      { browLift: -4,  browFurrow: 0,  eyeScale: 0.85, mouthCurve: 9,  mouthW: 22, blush: 0.35, glow: '#f59e0b' },
  sad:        { browLift: 3,   browFurrow: 4,  eyeScale: 0.88, mouthCurve: -7, mouthW: 15, blush: 0,    glow: '#3b82f6' },
  angry:      { browLift: 2,   browFurrow: 7,  eyeScale: 0.82, mouthCurve: -4, mouthW: 17, blush: 0,    glow: '#ef4444' },
  surprised:  { browLift: -7,  browFurrow: 0,  eyeScale: 1.25, mouthCurve: 0,  mouthW: 13, blush: 0.1,  glow: '#8b5cf6' },
  excited:    { browLift: -5,  browFurrow: 0,  eyeScale: 1.15, mouthCurve: 11, mouthW: 24, blush: 0.45, glow: '#f97316' },
  loving:     { browLift: -3,  browFurrow: 0,  eyeScale: 0.9,  mouthCurve: 7,  mouthW: 20, blush: 0.5,  glow: '#ec4899' },
  thoughtful: { browLift: 1,   browFurrow: 2,  eyeScale: 0.92, mouthCurve: 1,  mouthW: 15, blush: 0,    glow: '#10b981' },
  fearful:    { browLift: -5,  browFurrow: 5,  eyeScale: 1.2,  mouthCurve: -2, mouthW: 14, blush: 0,    glow: '#6366f1' },
  disgusted:  { browLift: 2,   browFurrow: 6,  eyeScale: 0.85, mouthCurve: -5, mouthW: 16, blush: 0,    glow: '#84cc16' },
}

const DEFAULT_CONFIG = {
  skin_tone:        '#C68642',
  skin_tone_light:  '#E8A870',
  hair_color:       '#1A0800',
  hair_highlight:   '#3D1F0A',
  eye_color:        '#2C1A0E',
  lip_color:        '#A0524A',
  blush_color:      '#C97050',
}

export default function TwinAvatar({
  emotion = 'neutral',
  isSpeaking = false,
  isThinking = false,
  size = 220,
  useWebSocket = false,   // when true, ignores props and uses WS state
  token = null,
}) {
  // ── State ──────────────────────────────────────────────────────────────────
  const [blink, setBlink]           = useState(false)
  const [lipOpen, setLipOpen]       = useState(0)
  const [headBob, setHeadBob]       = useState(0)
  const [breathe, setBreathe]       = useState(1)
  const [modelStatus, setModelStatus] = useState('placeholder')
  const [photoUrl, setPhotoUrl]     = useState(null)
  const [config, setConfig]         = useState(DEFAULT_CONFIG)

  // Live state from WebSocket (overrides props when useWebSocket=true)
  const [liveEmotion, setLiveEmotion]     = useState(emotion)
  const [liveSpeaking, setLiveSpeaking]   = useState(isSpeaking)
  const [liveThinking, setLiveThinking]   = useState(isThinking)

  const wsRef      = useRef(null)
  const blinkRef   = useRef(null)
  const lipRef     = useRef(null)
  const bobRef     = useRef(null)
  const breatheRef = useRef(null)

  const activeEmotion  = useWebSocket ? liveEmotion  : emotion
  const activeSpeaking = useWebSocket ? liveSpeaking : isSpeaking
  const activeThinking = useWebSocket ? liveThinking : isThinking
  const emo = EMOTIONS[activeEmotion] || EMOTIONS.neutral

  // ── Load config from backend ───────────────────────────────────────────────
  useEffect(() => {
    avatarAPI.getConfig()
      .then(r => {
        setConfig({ ...DEFAULT_CONFIG, ...r.data })
        setModelStatus(r.data.model_status || 'placeholder')
        if (r.data.photo_path && r.data.model_status === 'photo') {
          // Cache-bust so photo changes are reflected
          setPhotoUrl(`/api/avatar/photo?t=${Date.now()}`)
        }
      })
      .catch(() => {})
  }, [])

  // ── WebSocket connection ───────────────────────────────────────────────────
  useEffect(() => {
    if (!useWebSocket || !token) return
    const proto  = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const host   = import.meta.env.VITE_API_URL
      ? import.meta.env.VITE_API_URL.replace(/^https?/, proto)
      : `${proto}://${window.location.host}`
    const ws = new WebSocket(`${host}/api/avatar/live`)
    wsRef.current = ws

    ws.onopen  = () => ws.send(JSON.stringify({ token }))
    ws.onmessage = e => {
      try {
        const d = JSON.parse(e.data)
        if (d.emotion)      setLiveEmotion(d.emotion)
        if (d.is_speaking !== undefined) setLiveSpeaking(d.is_speaking)
        if (d.is_thinking !== undefined) setLiveThinking(d.is_thinking)
        if (d.model_status) setModelStatus(d.model_status)
      } catch {}
    }
    ws.onerror = ws.onclose = () => {}
    return () => ws.close()
  }, [useWebSocket, token])

  // ── Blink every 3-5 s ─────────────────────────────────────────────────────
  useEffect(() => {
    const schedule = () => {
      blinkRef.current = setTimeout(() => {
        setBlink(true)
        setTimeout(() => setBlink(false), 130)
        schedule()
      }, 3000 + Math.random() * 2500)
    }
    schedule()
    return () => clearTimeout(blinkRef.current)
  }, [])

  // ── Lip sync ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (activeSpeaking) {
      let t = 0
      lipRef.current = setInterval(() => {
        t += 0.35
        // Natural speech rhythm: mix of sine waves
        setLipOpen(
          Math.max(0, Math.sin(t) * 6 + Math.sin(t * 2.3) * 3 + Math.random() * 2)
        )
      }, 90)
    } else {
      clearInterval(lipRef.current)
      setLipOpen(0)
    }
    return () => clearInterval(lipRef.current)
  }, [activeSpeaking])

  // ── Idle head bob ──────────────────────────────────────────────────────────
  useEffect(() => {
    let t = 0
    bobRef.current = setInterval(() => {
      t += 0.04
      setHeadBob(Math.sin(t) * 1.5)
    }, 50)
    return () => clearInterval(bobRef.current)
  }, [])

  // ── Breathing (scale) ──────────────────────────────────────────────────────
  useEffect(() => {
    let t = 0
    breatheRef.current = setInterval(() => {
      t += 0.025
      setBreathe(1 + Math.sin(t) * 0.008)
    }, 50)
    return () => clearInterval(breatheRef.current)
  }, [])

  // ── SVG measurements ───────────────────────────────────────────────────────
  const s   = size / 220           // scale factor
  const cx  = 110                   // centre x in 220-unit viewBox
  const cy  = 110

  const eyeRy   = blink ? 0.5 : 9 * emo.eyeScale
  const mouthY  = 145
  const mouthX  = cx
  const mw      = emo.mouthW * s * (220 / 220)  // already in 220-unit space
  const mc      = emo.mouthCurve
  const lo      = activeSpeaking ? lipOpen : 0

  const mouthPath = lo > 1.5
    ? `M ${mouthX - mw} ${mouthY} Q ${mouthX} ${mouthY + mc + lo} ${mouthX + mw} ${mouthY}`
    : `M ${mouthX - mw} ${mouthY} Q ${mouthX} ${mouthY + mc} ${mouthX + mw} ${mouthY}`

  // Upper lip (only when mouth open)
  const upperLipPath = lo > 1.5
    ? `M ${mouthX - mw} ${mouthY} Q ${mouthX} ${mouthY - 3} ${mouthX + mw} ${mouthY}`
    : null

  const lBrowY  = 75 + emo.browLift
  const rBrowY  = 75 + emo.browLift
  const lBrowFx = 68 + emo.browFurrow * 0.5   // left brow inner x (furrow pulls inward)
  const rBrowFx = 152 - emo.browFurrow * 0.5

  const glowColor   = emo.glow
  const pulseRingR  = 100 + (activeSpeaking ? 2 : 0)

  // ── Photo mode ─────────────────────────────────────────────────────────────
  if (modelStatus === 'photo' && photoUrl) {
    return (
      <PhotoAvatar
        photoUrl={photoUrl}
        emotion={activeEmotion}
        isSpeaking={activeSpeaking}
        isThinking={activeThinking}
        blink={blink}
        lipOpen={lo}
        headBob={headBob}
        breathe={breathe}
        glowColor={glowColor}
        emo={emo}
        size={size}
      />
    )
  }

  // ── SVG placeholder avatar ─────────────────────────────────────────────────
  return (
    <div style={{
      width: size, height: size,
      transform: `translateY(${headBob}px) scale(${breathe})`,
      transition: 'transform 0.1s linear',
    }}>
      <svg
        width={size} height={size}
        viewBox="0 0 220 220"
        xmlns="http://www.w3.org/2000/svg"
        style={{ overflow: 'visible' }}
      >
        <defs>
          {/* Holographic glow */}
          <radialGradient id="outerGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor={glowColor} stopOpacity="0.18" />
            <stop offset="100%" stopColor={glowColor} stopOpacity="0" />
          </radialGradient>

          {/* Skin gradient */}
          <radialGradient id="skinGrad" cx="38%" cy="30%" r="65%">
            <stop offset="0%"   stopColor={config.skin_tone_light} />
            <stop offset="100%" stopColor={config.skin_tone} />
          </radialGradient>

          {/* Hair gradient */}
          <radialGradient id="hairGrad" cx="50%" cy="20%" r="70%">
            <stop offset="0%"   stopColor={config.hair_highlight} />
            <stop offset="100%" stopColor={config.hair_color} />
          </radialGradient>

          {/* Eye iris gradient */}
          <radialGradient id="irisGrad" cx="35%" cy="30%" r="65%">
            <stop offset="0%"   stopColor="#7c3aed" stopOpacity="0.5" />
            <stop offset="100%" stopColor={config.eye_color} />
          </radialGradient>

          {/* Clip for face */}
          <clipPath id="faceClip">
            <ellipse cx={cx} cy="118" rx="52" ry="60" />
          </clipPath>

          {/* Glow filter */}
          <filter id="glowFilter" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>

          {/* Speaking glow */}
          <filter id="speakGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* ── Outer atmosphere glow ── */}
        <circle cx={cx} cy={cy} r="105" fill="url(#outerGlow)" />

        {/* ── Holographic ring ── */}
        <circle
          cx={cx} cy={cy} r={pulseRingR}
          fill="none"
          stroke={glowColor}
          strokeWidth="1.2"
          strokeOpacity="0.5"
          strokeDasharray="6 4"
          style={{ transition: 'stroke 0.4s ease' }}
        >
          <animateTransform attributeName="transform" type="rotate"
            from={`0 ${cx} ${cy}`} to={`360 ${cx} ${cy}`}
            dur="12s" repeatCount="indefinite" />
        </circle>

        {/* Inner ring (counter-rotating) */}
        <circle
          cx={cx} cy={cy} r="93"
          fill="none"
          stroke={glowColor}
          strokeWidth="0.6"
          strokeOpacity="0.3"
          strokeDasharray="3 8"
        >
          <animateTransform attributeName="transform" type="rotate"
            from={`0 ${cx} ${cy}`} to={`-360 ${cx} ${cy}`}
            dur="18s" repeatCount="indefinite" />
        </circle>

        {/* ── Neck ── */}
        <rect x="96" y="168" width="28" height="22" rx="8"
          fill={config.skin_tone} />

        {/* ── Shoulders ── */}
        <ellipse cx={cx} cy="202" rx="62" ry="22"
          fill="#4c1d95" opacity="0.95" />
        <text x={cx} y="207" textAnchor="middle"
          fontSize="9" fill="#a78bfa" fontFamily="monospace" fontWeight="bold"
          letterSpacing="2">MIRRA</text>

        {/* ── Hair (back layer) ── */}
        <ellipse cx={cx} cy="80" rx="57" ry="50"
          fill="url(#hairGrad)" />
        {/* Side hair strands */}
        <path d={`M 58 95 Q 48 125 52 155`}
          stroke={config.hair_color} strokeWidth="12" fill="none"
          strokeLinecap="round" />
        <path d={`M 162 95 Q 172 125 168 155`}
          stroke={config.hair_color} strokeWidth="12" fill="none"
          strokeLinecap="round" />

        {/* ── Face ── */}
        <ellipse cx={cx} cy="118" rx="52" ry="60"
          fill="url(#skinGrad)" />

        {/* ── Blush ── */}
        <ellipse cx="78"  cy="128" rx="14" ry="9"
          fill={config.blush_color} opacity={emo.blush}
          style={{ transition: 'opacity 0.4s ease' }} />
        <ellipse cx="142" cy="128" rx="14" ry="9"
          fill={config.blush_color} opacity={emo.blush}
          style={{ transition: 'opacity 0.4s ease' }} />

        {/* ── Eyebrows ── */}
        <path
          d={`M 72 ${lBrowY} Q ${lBrowFx} ${lBrowY - 3} 94 ${lBrowY + 1}`}
          stroke={config.hair_color} strokeWidth="3" fill="none"
          strokeLinecap="round"
          style={{ transition: 'd 0.35s ease' }}
        />
        <path
          d={`M 126 ${rBrowY + 1} Q ${rBrowFx} ${rBrowY - 3} 148 ${rBrowY}`}
          stroke={config.hair_color} strokeWidth="3" fill="none"
          strokeLinecap="round"
          style={{ transition: 'd 0.35s ease' }}
        />

        {/* ── Eyes ── */}
        {/* Left eye */}
        <ellipse cx="86"  cy="102" rx="13" ry={eyeRy}
          fill="white" style={{ transition: 'ry 0.08s' }} />
        {/* Right eye */}
        <ellipse cx="134" cy="102" rx="13" ry={eyeRy}
          fill="white" style={{ transition: 'ry 0.08s' }} />

        {!blink && (
          <>
            {/* Irises */}
            <circle cx="86"  cy="103" r="8" fill="url(#irisGrad)" />
            <circle cx="134" cy="103" r="8" fill="url(#irisGrad)" />
            {/* Pupils */}
            <circle cx="86"  cy="104" r="4.5" fill={config.eye_color} />
            <circle cx="134" cy="104" r="4.5" fill={config.eye_color} />
            {/* Reflections */}
            <circle cx="88"  cy="100" r="2.2" fill="white" opacity="0.85" />
            <circle cx="136" cy="100" r="2.2" fill="white" opacity="0.85" />
            <circle cx="84"  cy="106" r="1"   fill="white" opacity="0.4" />
            <circle cx="132" cy="106" r="1"   fill="white" opacity="0.4" />
          </>
        )}

        {/* Upper eyelashes */}
        {[[-4,-2],[0,-2.5],[4,-2]].map(([dx, dy], i) => (
          <line key={i}
            x1={86+dx}  y1={102-9*emo.eyeScale}
            x2={86+dx*1.3} y2={102-9*emo.eyeScale+dy}
            stroke={config.hair_color} strokeWidth="1.2"
            strokeLinecap="round" opacity="0.9"
          />
        ))}
        {[[-4,-2],[0,-2.5],[4,-2]].map(([dx, dy], i) => (
          <line key={i}
            x1={134+dx}  y1={102-9*emo.eyeScale}
            x2={134+dx*1.3} y2={102-9*emo.eyeScale+dy}
            stroke={config.hair_color} strokeWidth="1.2"
            strokeLinecap="round" opacity="0.9"
          />
        ))}

        {/* ── Nose ── */}
        <path
          d={`M ${cx-4} 124 Q ${cx} 133 ${cx+4} 124`}
          stroke={config.skin_tone} strokeWidth="2"
          fill="none" strokeLinecap="round"
          style={{ filter: 'brightness(0.75)' }}
        />
        {/* Nostril hints */}
        <ellipse cx={cx-7}  cy="132" rx="4" ry="2.5"
          fill="none" stroke={config.skin_tone} strokeWidth="1.3"
          style={{ filter: 'brightness(0.7)' }} />
        <ellipse cx={cx+7} cy="132" rx="4" ry="2.5"
          fill="none" stroke={config.skin_tone} strokeWidth="1.3"
          style={{ filter: 'brightness(0.7)' }} />

        {/* ── Mouth ── */}
        {/* Upper lip */}
        {upperLipPath && (
          <path d={upperLipPath}
            stroke={config.lip_color} strokeWidth="2.5"
            fill={config.lip_color} fillOpacity="0.6"
            strokeLinecap="round" />
        )}
        {/* Main mouth / lower lip */}
        <path
          d={mouthPath}
          stroke={config.lip_color}
          strokeWidth={lo > 1.5 ? "2" : "2.8"}
          fill={lo > 1.5 ? '#5c1a1a' : 'none'}
          fillOpacity={lo > 1.5 ? '0.7' : '0'}
          strokeLinecap="round"
          style={{ transition: 'd 0.06s linear, stroke 0.35s' }}
        />

        {/* ── Hair (front layer — covers sides of face) ── */}
        <ellipse cx={cx} cy="62" rx="54" ry="32"
          fill="url(#hairGrad)" />
        {/* Centre part */}
        <path d={`M ${cx} 42 Q ${cx-3} 55 ${cx-2} 70`}
          stroke={config.hair_highlight} strokeWidth="2"
          fill="none" strokeLinecap="round" opacity="0.6" />

        {/* ── Thinking dots ── */}
        {activeThinking && [0,1,2].map(i => (
          <circle key={i}
            cx={148 + i*11} cy={72 - i*7} r="4.5"
            fill={glowColor} opacity="0.9"
            filter="url(#glowFilter)"
          >
            <animate attributeName="opacity"
              values="0.9;0.2;0.9" dur="0.7s"
              begin={`${i*0.22}s`} repeatCount="indefinite" />
            <animate attributeName="r"
              values="4.5;5.5;4.5" dur="0.7s"
              begin={`${i*0.22}s`} repeatCount="indefinite" />
          </circle>
        ))}

        {/* ── Speaking waveform bars ── */}
        {activeSpeaking && (
          <g filter="url(#speakGlow)">
            {[0,1,2,3,4].map(i => (
              <rect key={i}
                x={83 + i*12} y="185" width="5" rx="2.5"
                fill={glowColor} opacity="0.85"
              >
                <animate attributeName="height"
                  values={`3;${6 + (i%3)*5};3`}
                  dur={`${0.25 + i*0.07}s`} repeatCount="indefinite" />
                <animate attributeName="y"
                  values={`185;${185-(6+(i%3)*5)};185`}
                  dur={`${0.25 + i*0.07}s`} repeatCount="indefinite" />
              </rect>
            ))}
          </g>
        )}

        {/* ── Status label ── */}
        <text x={cx} y="215" textAnchor="middle"
          fontSize="8" fill={glowColor} fontFamily="monospace"
          opacity="0.7" letterSpacing="1"
        >
          {activeThinking ? 'THINKING...' : activeSpeaking ? 'SPEAKING' : activeEmotion.toUpperCase()}
        </text>
      </svg>
    </div>
  )
}


// ── Photo mode overlay ─────────────────────────────────────────────────────────
function PhotoAvatar({ photoUrl, emotion, isSpeaking, isThinking, blink, lipOpen,
                       headBob, breathe, glowColor, emo, size }) {
  return (
    <div style={{
      width: size, height: size, position: 'relative',
      transform: `translateY(${headBob}px) scale(${breathe})`,
      transition: 'transform 0.1s linear',
    }}>
      {/* Holographic ring behind photo */}
      <svg width={size} height={size} style={{ position: 'absolute', top: 0, left: 0, zIndex: 1 }}
        viewBox="0 0 220 220">
        <circle cx="110" cy="110" r="105" fill="none"
          stroke={glowColor} strokeWidth="1.5" strokeOpacity="0.6"
          strokeDasharray="8 4">
          <animateTransform attributeName="transform" type="rotate"
            from="0 110 110" to="360 110 110" dur="10s" repeatCount="indefinite" />
        </circle>
        <circle cx="110" cy="110" r="108"
          fill="none" stroke={glowColor} strokeWidth="0.5" strokeOpacity="0.2" />
      </svg>

      {/* Circular photo */}
      <div style={{
        width: size, height: size, borderRadius: '50%',
        overflow: 'hidden', position: 'relative', zIndex: 2,
        boxShadow: `0 0 24px 4px ${glowColor}55, 0 0 60px 8px ${glowColor}22`,
        border: `2px solid ${glowColor}88`,
        transition: 'box-shadow 0.4s ease',
      }}>
        <img
          src={photoUrl} alt="Your Twin"
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }}
        />

        {/* Emotion tint overlay */}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          backgroundColor: glowColor,
          opacity: emo.blush * 0.12,
          transition: 'opacity 0.4s ease, background-color 0.4s ease',
          mixBlendMode: 'screen',
          pointerEvents: 'none',
        }} />

        {/* Blink overlay */}
        {blink && (
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            background: 'rgba(0,0,0,0.25)',
            pointerEvents: 'none',
          }} />
        )}

        {/* Scanline overlay — digital effect */}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.04) 3px, rgba(0,0,0,0.04) 4px)',
          pointerEvents: 'none',
        }} />
      </div>

      {/* Speaking waveform */}
      {isSpeaking && (
        <svg width={size} height={30}
          style={{ position: 'absolute', bottom: -10, left: 0, zIndex: 3 }}
          viewBox={`0 0 ${size} 30`}>
          {[0,1,2,3,4].map(i => (
            <rect key={i}
              x={size/2 - 30 + i*14} y="10" width="6" rx="3"
              fill={glowColor} opacity="0.85">
              <animate attributeName="height" values={`4;${8+(i%3)*8};4`}
                dur={`${0.28+i*0.07}s`} repeatCount="indefinite" />
              <animate attributeName="y" values={`10;${10-(8+(i%3)*8)/2};10`}
                dur={`${0.28+i*0.07}s`} repeatCount="indefinite" />
            </rect>
          ))}
        </svg>
      )}

      {/* Thinking dots */}
      {isThinking && (
        <svg width={size} height={30}
          style={{ position: 'absolute', bottom: -10, left: 0, zIndex: 3 }}
          viewBox={`0 0 ${size} 30`}>
          {[0,1,2].map(i => (
            <circle key={i} cx={size/2 - 14 + i*14} cy="15" r="5"
              fill={glowColor} opacity="0.9">
              <animate attributeName="opacity" values="0.9;0.2;0.9"
                dur="0.7s" begin={`${i*0.22}s`} repeatCount="indefinite" />
            </circle>
          ))}
        </svg>
      )}
    </div>
  )
}
