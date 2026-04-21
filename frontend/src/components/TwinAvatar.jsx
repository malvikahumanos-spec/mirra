/**
 * TwinAvatar - Animated avatar for Mirra
 * No GPU needed - pure CSS/SVG animations with lip-sync and emotions.
 */

import React, { useEffect, useRef, useState } from 'react'

const EMOTION_STYLES = {
  happy:      { eyebrowY: 38, eyebrowCurve: 5,  mouthCurve: 8,  mouthWidth: 22, eyeOpen: 10, blushOpacity: 0.3, skinTone: '#f4c2a1' },
  sad:        { eyebrowY: 44, eyebrowCurve: -4, mouthCurve: -7, mouthWidth: 16, eyeOpen: 7,  blushOpacity: 0,   skinTone: '#e8b898' },
  angry:      { eyebrowY: 42, eyebrowCurve: -6, mouthCurve: -4, mouthWidth: 18, eyeOpen: 8,  blushOpacity: 0,   skinTone: '#f0a090' },
  surprised:  { eyebrowY: 34, eyebrowCurve: 3,  mouthCurve: 0,  mouthWidth: 14, eyeOpen: 14, blushOpacity: 0.1, skinTone: '#f4c2a1' },
  neutral:    { eyebrowY: 40, eyebrowCurve: 0,  mouthCurve: 1,  mouthWidth: 18, eyeOpen: 9,  blushOpacity: 0,   skinTone: '#f0b896' },
  excited:    { eyebrowY: 35, eyebrowCurve: 4,  mouthCurve: 10, mouthWidth: 24, eyeOpen: 13, blushOpacity: 0.4, skinTone: '#f4c2a1' },
  loving:     { eyebrowY: 38, eyebrowCurve: 4,  mouthCurve: 6,  mouthWidth: 20, eyeOpen: 9,  blushOpacity: 0.5, skinTone: '#f4c2a1' },
  thoughtful: { eyebrowY: 41, eyebrowCurve: 2,  mouthCurve: 1,  mouthWidth: 16, eyeOpen: 8,  blushOpacity: 0,   skinTone: '#f0b896' },
}

export default function TwinAvatar({ emotion = 'neutral', isSpeaking = false, isThinking = false, size = 180 }) {
  const [blink, setBlink] = useState(false)
  const [lipOpen, setLipOpen] = useState(0)
  const [headTilt, setHeadTilt] = useState(0)
  const blinkTimer = useRef(null)
  const lipTimer = useRef(null)
  const tiltTimer = useRef(null)

  const style = EMOTION_STYLES[emotion] || EMOTION_STYLES.neutral

  // Blinking
  useEffect(() => {
    const scheduleBlink = () => {
      const delay = 2000 + Math.random() * 4000
      blinkTimer.current = setTimeout(() => {
        setBlink(true)
        setTimeout(() => setBlink(false), 120)
        scheduleBlink()
      }, delay)
    }
    scheduleBlink()
    return () => clearTimeout(blinkTimer.current)
  }, [])

  // Lip sync while speaking
  useEffect(() => {
    if (isSpeaking) {
      const animateLips = () => {
        lipTimer.current = setInterval(() => {
          setLipOpen(Math.random() * 8)
        }, 100)
      }
      animateLips()
    } else {
      clearInterval(lipTimer.current)
      setLipOpen(0)
    }
    return () => clearInterval(lipTimer.current)
  }, [isSpeaking])

  // Subtle head tilt when thinking
  useEffect(() => {
    if (isThinking) {
      setHeadTilt(5)
    } else {
      const t = setTimeout(() => setHeadTilt(0), 300)
      return () => clearTimeout(t)
    }
  }, [isThinking])

  const eyeH = blink ? 1 : style.eyeOpen
  const cx = size / 2
  const scale = size / 200

  // Mouth path
  const mouthY = 130 * scale
  const mouthX = cx
  const mw = style.mouthWidth * scale
  const mc = style.mouthCurve * scale
  const mouthPath = isSpeaking && lipOpen > 0
    ? `M ${mouthX - mw} ${mouthY} Q ${mouthX} ${mouthY + mc + lipOpen * scale} ${mouthX + mw} ${mouthY}`
    : `M ${mouthX - mw} ${mouthY} Q ${mouthX} ${mouthY + mc} ${mouthX + mw} ${mouthY}`

  return (
    <div
      style={{
        width: size,
        height: size,
        transition: 'transform 0.4s ease',
        transform: `rotate(${headTilt}deg)`,
        filter: isThinking ? 'brightness(0.95)' : 'brightness(1)',
      }}
    >
      <svg width={size} height={size} viewBox={`0 0 200 200`} xmlns="http://www.w3.org/2000/svg">

        {/* Glow ring */}
        <defs>
          <radialGradient id="glowGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="faceGrad" cx="40%" cy="35%" r="60%">
            <stop offset="0%" stopColor="#fde8d0" />
            <stop offset="100%" stopColor={style.skinTone} />
          </radialGradient>
        </defs>

        {/* Outer glow */}
        <circle cx="100" cy="100" r="95" fill="url(#glowGrad)" />

        {/* Neck */}
        <rect x="82" y="148" width="36" height="24" rx="10" fill={style.skinTone} />

        {/* Shoulders / shirt */}
        <ellipse cx="100" cy="185" rx="55" ry="25" fill="#7c3aed" opacity="0.9" />
        <text x="100" y="190" textAnchor="middle" fontSize="10" fill="white" fontFamily="sans-serif" fontWeight="bold">MIRRA</text>

        {/* Hair */}
        <ellipse cx="100" cy="68" rx="52" ry="44" fill="#2d1b5e" />
        <ellipse cx="100" cy="52" rx="48" ry="30" fill="#3d2b7e" />
        {/* Hair strands */}
        <path d="M 52 80 Q 44 100 48 118" stroke="#2d1b5e" strokeWidth="8" fill="none" strokeLinecap="round" />
        <path d="M 148 80 Q 156 100 152 118" stroke="#2d1b5e" strokeWidth="8" fill="none" strokeLinecap="round" />

        {/* Face */}
        <ellipse cx="100" cy="105" rx="48" ry="52" fill="url(#faceGrad)" />

        {/* Blush */}
        <ellipse cx="72" cy="118" rx="12" ry="8" fill="#f87171" opacity={style.blushOpacity} />
        <ellipse cx="128" cy="118" rx="12" ry="8" fill="#f87171" opacity={style.blushOpacity} />

        {/* Eyebrows */}
        <path
          d={`M 72 ${style.eyebrowY} Q 82 ${style.eyebrowY - style.eyebrowCurve} 90 ${style.eyebrowY}`}
          stroke="#2d1b5e" strokeWidth="2.5" fill="none" strokeLinecap="round"
          style={{ transition: 'all 0.3s ease' }}
        />
        <path
          d={`M 110 ${style.eyebrowY} Q 118 ${style.eyebrowY - style.eyebrowCurve} 128 ${style.eyebrowY}`}
          stroke="#2d1b5e" strokeWidth="2.5" fill="none" strokeLinecap="round"
          style={{ transition: 'all 0.3s ease' }}
        />

        {/* Eyes - whites */}
        <ellipse cx="81" cy="95" rx="11" ry={eyeH} fill="white" style={{ transition: 'ry 0.08s' }} />
        <ellipse cx="119" cy="95" rx="11" ry={eyeH} fill="white" style={{ transition: 'ry 0.08s' }} />

        {/* Pupils */}
        {!blink && (
          <>
            <circle cx="81" cy="96" r="6" fill="#2d1b5e" />
            <circle cx="119" cy="96" r="6" fill="#2d1b5e" />
            {/* Iris highlight */}
            <circle cx="83" cy="93" r="2" fill="white" opacity="0.8" />
            <circle cx="121" cy="93" r="2" fill="white" opacity="0.8" />
            {/* Iris color */}
            <circle cx="81" cy="96" r="3.5" fill="#7c3aed" opacity="0.6" />
            <circle cx="119" cy="96" r="3.5" fill="#7c3aed" opacity="0.6" />
          </>
        )}

        {/* Nose */}
        <path d="M 97 108 Q 100 115 103 108" stroke={style.skinTone === '#f0a090' ? '#d4806a' : '#d4906a'} strokeWidth="1.5" fill="none" strokeLinecap="round" />

        {/* Mouth */}
        <path
          d={mouthPath}
          stroke="#c0605a"
          strokeWidth={isSpeaking && lipOpen > 2 ? "2" : "2.5"}
          fill={isSpeaking && lipOpen > 2 ? '#8b1a1a' : 'none'}
          strokeLinecap="round"
          style={{ transition: 'd 0.05s' }}
        />

        {/* Lip line when open */}
        {isSpeaking && lipOpen > 2 && (
          <path
            d={`M ${mouthX - mw * 0.7} ${mouthY + 1} Q ${mouthX} ${mouthY + mc + 1} ${mouthX + mw * 0.7} ${mouthY + 1}`}
            stroke="#e08080" strokeWidth="1" fill="none" strokeLinecap="round"
          />
        )}

        {/* Thinking dots */}
        {isThinking && (
          <g>
            <circle cx="140" cy="72" r="4" fill="#7c3aed" opacity="0.9">
              <animate attributeName="opacity" values="0.9;0.3;0.9" dur="0.8s" repeatCount="indefinite" />
            </circle>
            <circle cx="152" cy="65" r="4" fill="#7c3aed" opacity="0.9">
              <animate attributeName="opacity" values="0.9;0.3;0.9" dur="0.8s" begin="0.2s" repeatCount="indefinite" />
            </circle>
            <circle cx="164" cy="58" r="4" fill="#7c3aed" opacity="0.9">
              <animate attributeName="opacity" values="0.9;0.3;0.9" dur="0.8s" begin="0.4s" repeatCount="indefinite" />
            </circle>
          </g>
        )}

        {/* Speaking wave indicator */}
        {isSpeaking && (
          <g transform="translate(135, 138)">
            {[0,1,2,3].map(i => (
              <rect key={i} x={i * 6} y="0" width="4" rx="2" fill="#7c3aed" opacity="0.8">
                <animate
                  attributeName="height"
                  values={`${4 + Math.random() * 10};${10 + Math.random() * 8};${4 + Math.random() * 10}`}
                  dur={`${0.3 + i * 0.1}s`}
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="y"
                  values={`${-2};${-8};${-2}`}
                  dur={`${0.3 + i * 0.1}s`}
                  repeatCount="indefinite"
                />
              </rect>
            ))}
          </g>
        )}
      </svg>
    </div>
  )
}
