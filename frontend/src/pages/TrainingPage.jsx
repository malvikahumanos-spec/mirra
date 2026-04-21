import React, { useState } from 'react'
import toast from 'react-hot-toast'
import { captureAPI, twinAPI } from '../services/api'
import {
  HiOutlineMicrophone, HiOutlineVideoCamera, HiOutlineUpload,
  HiOutlineUserGroup, HiOutlineLightBulb, HiOutlineStop,
  HiOutlinePhotograph, HiOutlineDocumentText
} from 'react-icons/hi'

export default function TrainingPage() {
  const [recording, setRecording] = useState(false)
  const [uploadingAudio, setUploadingAudio] = useState(false)
  const [uploadingVideo, setUploadingVideo] = useState(false)
  const [capturingFace, setCapturingFace] = useState(false)
  const [showContactForm, setShowContactForm] = useState(false)
  const [contact, setContact] = useState({
    name: '', relationship_type: 'family', label: '', language: 'en', tone: 'warm', topics: '', notes: ''
  })

  const startRecording = async () => {
    try {
      await captureAPI.startRecording()
      setRecording(true)
      toast.success('Recording started - speak naturally!')
    } catch (err) {
      toast.error('Failed to start recording')
    }
  }

  const stopRecording = async () => {
    try {
      const res = await captureAPI.stopRecording()
      setRecording(false)
      toast.success(`Recording saved: ${res.data.file_path}`)
    } catch (err) {
      toast.error('Failed to stop recording')
    }
  }

  const handleAudioUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploadingAudio(true)
    try {
      const res = await captureAPI.uploadAudio(file)
      toast.success(`Audio uploaded! Transcription: ${res.data.transcription?.substring(0, 50)}...`)
    } catch (err) {
      toast.error('Upload failed')
    } finally {
      setUploadingAudio(false)
    }
  }

  const handleVideoUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploadingVideo(true)
    try {
      const res = await captureAPI.uploadVideo(file)
      toast.success(`Video processed! ${res.data.face_samples_extracted} face samples extracted`)
    } catch (err) {
      toast.error('Upload failed')
    } finally {
      setUploadingVideo(false)
    }
  }

  const captureFace = async () => {
    setCapturingFace(true)
    toast('Look at the camera... capturing face samples', { duration: 3000 })
    try {
      const res = await captureAPI.captureFace(10)
      toast.success(`Captured ${res.data.captured} face samples!`)
    } catch (err) {
      toast.error('Face capture failed. Is webcam connected?')
    } finally {
      setCapturingFace(false)
    }
  }

  const addContact = async (e) => {
    e.preventDefault()
    try {
      await twinAPI.addContact({
        ...contact,
        topics: contact.topics.split(',').map(t => t.trim()).filter(Boolean),
      })
      toast.success(`Contact "${contact.name}" added!`)
      setContact({ name: '', relationship_type: 'family', label: '', language: 'en', tone: 'warm', topics: '', notes: '' })
      setShowContactForm(false)
    } catch (err) {
      toast.error('Failed to add contact')
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="section-title">Train Your Twin</h1>
        <p className="section-subtitle">Feed your twin with voice, video, and personality data to make it more like you</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Voice Training */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-pink-500 flex items-center justify-center">
              <HiOutlineMicrophone className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Voice Training</h2>
              <p className="text-xs text-dark-300">Record or upload your voice for cloning</p>
            </div>
          </div>

          <div className="space-y-3">
            {/* Live Recording */}
            <button
              onClick={recording ? stopRecording : startRecording}
              className={`w-full py-3 rounded-xl flex items-center justify-center gap-2 transition-all ${
                recording
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse'
                  : 'bg-dark-600/50 text-dark-100 hover:bg-dark-500/50 border border-dark-500/30'
              }`}
            >
              {recording ? (
                <><HiOutlineStop className="w-5 h-5" /> Stop Recording</>
              ) : (
                <><HiOutlineMicrophone className="w-5 h-5" /> Start Recording</>
              )}
            </button>

            {/* Upload Audio */}
            <label className={`w-full py-3 rounded-xl flex items-center justify-center gap-2 cursor-pointer border border-dark-500/30 transition-all ${
              uploadingAudio ? 'opacity-50' : 'bg-dark-600/50 text-dark-100 hover:bg-dark-500/50'
            }`}>
              <HiOutlineUpload className="w-5 h-5" />
              {uploadingAudio ? 'Uploading...' : 'Upload Audio File'}
              <input type="file" accept="audio/*" onChange={handleAudioUpload} className="hidden" disabled={uploadingAudio} />
            </label>
          </div>

          <p className="text-xs text-dark-400 mt-3">
            Tip: Upload calls, voice notes, or record yourself talking naturally for best results.
            More samples = better voice clone.
          </p>
        </div>

        {/* Face/Video Training */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-twin-500 flex items-center justify-center">
              <HiOutlineVideoCamera className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Face & Expression</h2>
              <p className="text-xs text-dark-300">Capture your face and expressions</p>
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={captureFace}
              disabled={capturingFace}
              className={`w-full py-3 rounded-xl flex items-center justify-center gap-2 border border-dark-500/30 transition-all ${
                capturingFace ? 'opacity-50' : 'bg-dark-600/50 text-dark-100 hover:bg-dark-500/50'
              }`}
            >
              <HiOutlinePhotograph className="w-5 h-5" />
              {capturingFace ? 'Capturing...' : 'Capture from Webcam'}
            </button>

            <label className={`w-full py-3 rounded-xl flex items-center justify-center gap-2 cursor-pointer border border-dark-500/30 transition-all ${
              uploadingVideo ? 'opacity-50' : 'bg-dark-600/50 text-dark-100 hover:bg-dark-500/50'
            }`}>
              <HiOutlineUpload className="w-5 h-5" />
              {uploadingVideo ? 'Processing...' : 'Upload Video'}
              <input type="file" accept="video/*" onChange={handleVideoUpload} className="hidden" disabled={uploadingVideo} />
            </label>
          </div>

          <p className="text-xs text-dark-400 mt-3">
            Upload videos of yourself — calls, livestreams, vlogs. The system extracts your facial expressions automatically.
          </p>
        </div>

        {/* Relationships / Contacts */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-teal-500 flex items-center justify-center">
              <HiOutlineUserGroup className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Relationships</h2>
              <p className="text-xs text-dark-300">Teach your twin how you talk to different people</p>
            </div>
          </div>

          {showContactForm ? (
            <form onSubmit={addContact} className="space-y-2">
              <input type="text" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })}
                placeholder="Name (e.g., Mummy)" className="input-field text-sm" required autoFocus />
              <div className="grid grid-cols-2 gap-2">
                <select value={contact.relationship_type} onChange={(e) => setContact({ ...contact, relationship_type: e.target.value })}
                  className="input-field text-sm">
                  <option value="family">Family</option>
                  <option value="friend">Friend</option>
                  <option value="colleague">Colleague</option>
                  <option value="professional">Professional</option>
                  <option value="other">Other</option>
                </select>
                <input type="text" value={contact.label} onChange={(e) => setContact({ ...contact, label: e.target.value })}
                  placeholder="Label (Mummy, Papa...)" className="input-field text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select value={contact.language} onChange={(e) => setContact({ ...contact, language: e.target.value })}
                  className="input-field text-sm">
                  <option value="en">English</option>
                  <option value="hi">Hindi</option>
                  <option value="hinglish">Hinglish</option>
                </select>
                <select value={contact.tone} onChange={(e) => setContact({ ...contact, tone: e.target.value })}
                  className="input-field text-sm">
                  <option value="warm">Warm & Loving</option>
                  <option value="casual">Casual</option>
                  <option value="formal">Formal</option>
                  <option value="playful">Playful</option>
                </select>
              </div>
              <input type="text" value={contact.topics} onChange={(e) => setContact({ ...contact, topics: e.target.value })}
                placeholder="Common topics (comma-separated)" className="input-field text-sm" />
              <textarea value={contact.notes} onChange={(e) => setContact({ ...contact, notes: e.target.value })}
                placeholder="How do you talk to them? Any special behaviors?" className="input-field text-sm resize-none" rows={2} />
              <div className="flex gap-2">
                <button type="submit" className="btn-primary text-sm flex-1">Add Contact</button>
                <button type="button" onClick={() => setShowContactForm(false)} className="btn-secondary text-sm">Cancel</button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setShowContactForm(true)}
              className="w-full py-3 rounded-xl bg-dark-600/50 text-dark-100 hover:bg-dark-500/50 border border-dark-500/30 flex items-center justify-center gap-2"
            >
              <HiOutlinePlus className="w-5 h-5" /> Add Contact / Relationship
            </button>
          )}
        </div>

        {/* Memory Teaching */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center">
              <HiOutlineLightBulb className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Teach Memories</h2>
              <p className="text-xs text-dark-300">Share facts, stories, and preferences</p>
            </div>
          </div>

          <MemoryTeacher />
        </div>
      </div>

      {/* Training Tips */}
      <div className="glass-card p-5 mt-6">
        <h3 className="text-sm font-semibold text-white mb-3">Training Tips for a Better Twin</h3>
        <div className="grid md:grid-cols-3 gap-4 text-xs text-dark-200">
          <div className="bg-dark-600/30 rounded-lg p-3">
            <p className="font-medium text-twin-400 mb-1">Voice</p>
            <p>Upload 5+ audio clips of yourself speaking naturally in different moods. Include calls with family, work meetings, casual chats.</p>
          </div>
          <div className="bg-dark-600/30 rounded-lg p-3">
            <p className="font-medium text-purple-400 mb-1">Relationships</p>
            <p>Add all important people. Describe HOW you talk to them - language mix, tone, pet names, inside jokes.</p>
          </div>
          <div className="bg-dark-600/30 rounded-lg p-3">
            <p className="font-medium text-green-400 mb-1">Memories</p>
            <p>Share your stories, opinions, favorite things, pet peeves. The more your twin knows, the more "you" it becomes.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function MemoryTeacher() {
  const [memory, setMemory] = useState('')
  const [category, setCategory] = useState('personal')
  const [saving, setSaving] = useState(false)

  const saveMemory = async () => {
    if (!memory.trim()) return
    setSaving(true)
    try {
      await twinAPI.addMemory(memory, category, 0.7)
      toast.success('Memory saved!')
      setMemory('')
    } catch (err) {
      toast.error('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2">
      <textarea
        value={memory}
        onChange={(e) => setMemory(e.target.value)}
        placeholder="Teach something... e.g., 'I always call mummy before sleeping', 'I prefer tea over coffee', 'My favorite movie is...'"
        className="input-field text-sm resize-none"
        rows={3}
      />
      <div className="flex gap-2">
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="input-field text-sm w-auto">
          {['personal', 'family', 'work', 'health', 'hobbies', 'opinions', 'habits'].map(c =>
            <option key={c} value={c}>{c}</option>
          )}
        </select>
        <button onClick={saveMemory} disabled={saving || !memory.trim()} className="btn-primary text-sm flex-1">
          {saving ? 'Saving...' : 'Teach Twin'}
        </button>
      </div>
    </div>
  )
}

function HiOutlinePlus(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  )
}
