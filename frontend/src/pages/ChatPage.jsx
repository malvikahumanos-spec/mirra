import React, { useState, useRef, useEffect } from 'react'
import toast from 'react-hot-toast'
import { useChatStore } from '../services/store'
import { twinAPI } from '../services/api'
import TwinAvatar from '../components/TwinAvatar'
import {
  HiOutlinePaperAirplane, HiOutlineMicrophone,
  HiOutlineVolumeUp, HiOutlineUser, HiOutlineSparkles,
  HiOutlineTrash, HiOutlineUserGroup
} from 'react-icons/hi'

export default function ChatPage() {
  const { messages, addMessage, conversationId, setConversationId, isLoading, setLoading, currentContact, setCurrentContact, clearChat } = useChatStore()
  const [input, setInput] = useState('')
  const [contactInput, setContactInput] = useState('')
  const [showContactSelect, setShowContactSelect] = useState(false)
  const [voiceEnabled, setVoiceEnabled] = useState(false)
  const [playingAudio, setPlayingAudio] = useState(false)
  const [currentEmotion, setCurrentEmotion] = useState('neutral')
  const [showAvatar, setShowAvatar] = useState(true)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const audioRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || isLoading) return

    setInput('')
    addMessage({ role: 'user', content: text, timestamp: new Date().toISOString() })
    setLoading(true)

    try {
      const res = await twinAPI.chat(text, conversationId, currentContact, voiceEnabled)
      if (res.data.conversation_id && !conversationId) {
        setConversationId(res.data.conversation_id)
      }
      const twinEmotion = res.data.emotion || 'neutral'
      setCurrentEmotion(twinEmotion)
      addMessage({
        role: 'twin',
        content: res.data.response,
        emotion: twinEmotion,
        confidence: res.data.confidence,
        timestamp: new Date().toISOString(),
        voiceAudio: res.data.voice_audio || null,
      })
      // Auto-play voice if available
      if (res.data.voice_audio) {
        playVoice(res.data.voice_audio)
      } else if (voiceEnabled) {
        speakText(res.data.response)
      }
    } catch (err) {
      toast.error('Failed to get response from twin')
      addMessage({
        role: 'twin',
        content: "I'm having trouble connecting. Make sure Ollama is running locally.",
        emotion: 'neutral',
        timestamp: new Date().toISOString(),
      })
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const playVoice = (base64Audio) => {
    try {
      if (audioRef.current) {
        audioRef.current.pause()
      }
      const audio = new Audio(`data:audio/wav;base64,${base64Audio}`)
      audioRef.current = audio
      setPlayingAudio(true)
      audio.onended = () => setPlayingAudio(false)
      audio.onerror = () => setPlayingAudio(false)
      audio.play()
    } catch (e) {
      console.error('Audio playback failed:', e)
    }
  }

  const speakText = (text) => {
    // Browser TTS fallback when voice cloning isn't available
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 0.95
      utterance.pitch = 1.0
      setPlayingAudio(true)
      utterance.onend = () => setPlayingAudio(false)
      window.speechSynthesis.speak(utterance)
    } else {
      toast.error('Voice not available on this browser')
    }
  }

  const getEmotionEmoji = (emotion) => {
    const map = {
      happy: '😊', sad: '😢', angry: '😠', surprised: '😲',
      neutral: '😐', excited: '🤩', loving: '🥰', thoughtful: '🤔',
      fearful: '😨', disgusted: '😤',
    }
    return map[emotion] || '💬'
  }

  return (
    <div className="flex gap-4 h-[calc(100vh-8rem)] max-w-6xl mx-auto">
      {/* Avatar Panel */}
      {showAvatar && (
        <div className="hidden md:flex flex-col items-center gap-4 w-52 flex-shrink-0">
          <div className="glass-card p-4 flex flex-col items-center gap-3 w-full">
            <TwinAvatar
              emotion={currentEmotion}
              isSpeaking={playingAudio}
              isThinking={isLoading}
              size={160}
            />
            <div className="text-center">
              <p className="text-sm font-semibold text-white">Your Twin</p>
              <p className="text-xs text-dark-300 capitalize">{isLoading ? 'thinking...' : playingAudio ? 'speaking...' : currentEmotion}</p>
            </div>
            {currentContact && (
              <div className="text-xs text-twin-400 text-center">
                Speaking to <span className="font-medium">{currentContact}</span>
              </div>
            )}
          </div>
          <button
            onClick={() => setShowAvatar(false)}
            className="text-xs text-dark-400 hover:text-dark-200"
          >Hide avatar</button>
        </div>
      )}

      {/* Chat Area */}
      <div className="flex flex-col flex-1 min-w-0">

      {/* Chat Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-twin-500 to-purple-500 flex items-center justify-center shadow-lg shadow-twin-500/20">
            <HiOutlineSparkles className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Talk to Mirra</h1>
            <p className="text-xs text-dark-200">
              {currentContact ? `Speaking as you to ${currentContact}` : 'Your Mirra is ready'}
              {isLoading && ' — thinking...'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Contact selector */}
          <div className="relative">
            <button
              onClick={() => setShowContactSelect(!showContactSelect)}
              className={`btn-ghost flex items-center gap-2 text-sm ${currentContact ? 'text-twin-400' : ''}`}
            >
              <HiOutlineUserGroup className="w-4 h-4" />
              {currentContact || 'Select Contact'}
            </button>
            {showContactSelect && (
              <div className="absolute right-0 top-full mt-2 w-64 glass-card p-3 z-50">
                <p className="text-xs text-dark-300 mb-2">Who is talking to the twin?</p>
                <input
                  type="text"
                  value={contactInput}
                  onChange={(e) => setContactInput(e.target.value)}
                  placeholder="e.g., Mummy, Papa, Bhai..."
                  className="input-field text-sm mb-2"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setCurrentContact(contactInput || null)
                      setShowContactSelect(false)
                    }
                  }}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => { setCurrentContact(contactInput || null); setShowContactSelect(false) }}
                    className="btn-primary text-xs py-1.5 px-3 flex-1"
                  >Set</button>
                  <button
                    onClick={() => { setCurrentContact(null); setContactInput(''); setShowContactSelect(false) }}
                    className="btn-secondary text-xs py-1.5 px-3"
                  >Clear</button>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => setVoiceEnabled(!voiceEnabled)}
            className={`btn-ghost text-sm flex items-center gap-1 ${voiceEnabled ? 'text-twin-400' : ''}`}
            title={voiceEnabled ? 'Voice replies ON' : 'Voice replies OFF'}
          >
            <HiOutlineVolumeUp className="w-4 h-4" />
            {voiceEnabled ? 'Voice ON' : 'Voice'}
          </button>

          <button onClick={clearChat} className="btn-ghost text-sm flex items-center gap-1">
            <HiOutlineTrash className="w-4 h-4" /> New Chat
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-2 mb-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-twin-500/20 to-purple-500/20 flex items-center justify-center mb-6 animate-float">
              <HiOutlineSparkles className="w-12 h-12 text-twin-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Your Twin is Ready</h2>
            <p className="text-dark-200 max-w-md text-sm">
              Start a conversation. Your twin learns from every interaction to become more like you.
              Select a contact name to make it speak as you would to that person.
            </p>
            <div className="flex gap-2 mt-6 flex-wrap justify-center">
              {['How are you?', 'Tell me about my day', 'What should I focus on?'].map((q) => (
                <button
                  key={q}
                  onClick={() => { setInput(q); inputRef.current?.focus() }}
                  className="btn-ghost text-sm border border-dark-500/30 rounded-xl"
                >{q}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] ${msg.role === 'user' ? 'order-2' : 'order-1'}`}>
              <div className={`flex items-end gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  msg.role === 'user'
                    ? 'bg-dark-600'
                    : 'bg-gradient-to-br from-twin-500 to-purple-500'
                }`}>
                  {msg.role === 'user'
                    ? <HiOutlineUser className="w-4 h-4 text-dark-200" />
                    : <HiOutlineSparkles className="w-4 h-4 text-white" />
                  }
                </div>
                <div className={msg.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-twin'}>
                  <p className="text-sm text-white whitespace-pre-wrap">{msg.content}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[10px] text-dark-300">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {msg.emotion && msg.role === 'twin' && (
                      <span className="text-[10px] text-dark-300">{getEmotionEmoji(msg.emotion)} {msg.emotion}</span>
                    )}
                    {msg.role === 'twin' && (
                      <button
                        onClick={() => msg.voiceAudio ? playVoice(msg.voiceAudio) : speakText(msg.content)}
                        className="text-dark-400 hover:text-twin-400 transition-colors ml-1"
                        title="Listen to this message"
                      >
                        <HiOutlineVolumeUp className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="chat-bubble-twin">
              <div className="flex gap-1.5">
                <div className="w-2 h-2 bg-twin-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-twin-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-twin-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="glass-card p-3">
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message..."
              className="w-full bg-transparent text-white placeholder:text-dark-300 resize-none outline-none text-sm min-h-[40px] max-h-[120px]"
              rows={1}
              style={{ height: 'auto', overflowY: input.split('\n').length > 3 ? 'auto' : 'hidden' }}
              onInput={(e) => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px' }}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={sendMessage}
              disabled={!input.trim() || isLoading}
              className="w-10 h-10 rounded-xl bg-gradient-to-r from-twin-600 to-twin-500 flex items-center justify-center text-white disabled:opacity-30 hover:from-twin-500 hover:to-twin-400 transition-all shadow-lg shadow-twin-500/20"
            >
              <HiOutlinePaperAirplane className="w-5 h-5 rotate-90" />
            </button>
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}
