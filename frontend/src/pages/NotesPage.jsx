import React, { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { intentAPI } from '../services/api'
import { HiOutlinePlus, HiOutlineSearch, HiOutlineTag, HiOutlineBookmark } from 'react-icons/hi'

export default function NotesPage() {
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState(null)
  const [newNote, setNewNote] = useState({ title: '', content: '', category: 'general', tags: '' })

  useEffect(() => { loadNotes() }, [])

  const loadNotes = async () => {
    try {
      const res = await intentAPI.getNotes()
      setNotes(res.data)
    } catch (err) {
      toast.error('Failed to load notes')
    } finally {
      setLoading(false)
    }
  }

  const createNote = async (e) => {
    e.preventDefault()
    if (!newNote.title.trim() || !newNote.content.trim()) return
    try {
      await intentAPI.createNote({
        ...newNote,
        tags: newNote.tags.split(',').map((t) => t.trim()).filter(Boolean),
      })
      toast.success('Note created')
      setNewNote({ title: '', content: '', category: 'general', tags: '' })
      setShowAdd(false)
      loadNotes()
    } catch (err) {
      toast.error('Failed to create note')
    }
  }

  const searchNotes = async () => {
    if (!searchQuery.trim()) { setSearchResults(null); return }
    try {
      const res = await intentAPI.searchNotes(searchQuery)
      setSearchResults(res.data)
    } catch (err) {
      toast.error('Search failed')
    }
  }

  const displayNotes = searchResults || notes

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="section-title">Notes</h1>
          <p className="section-subtitle">AI-searchable knowledge base with semantic search</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="btn-primary flex items-center gap-2">
          <HiOutlinePlus className="w-4 h-4" /> New Note
        </button>
      </div>

      {/* Search */}
      <div className="flex gap-2 mb-6">
        <div className="flex-1 relative">
          <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-300 w-5 h-5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && searchNotes()}
            placeholder="Search notes semantically..."
            className="input-field pl-10"
          />
        </div>
        <button onClick={searchNotes} className="btn-secondary">Search</button>
        {searchResults && (
          <button onClick={() => { setSearchResults(null); setSearchQuery('') }} className="btn-ghost">Clear</button>
        )}
      </div>

      {/* Add Note Form */}
      {showAdd && (
        <form onSubmit={createNote} className="glass-card p-5 mb-6 space-y-3">
          <input
            type="text"
            value={newNote.title}
            onChange={(e) => setNewNote({ ...newNote, title: e.target.value })}
            placeholder="Note title..."
            className="input-field"
            autoFocus
          />
          <textarea
            value={newNote.content}
            onChange={(e) => setNewNote({ ...newNote, content: e.target.value })}
            placeholder="Write your note..."
            className="input-field resize-none"
            rows={6}
          />
          <div className="flex gap-3">
            <input
              type="text"
              value={newNote.category}
              onChange={(e) => setNewNote({ ...newNote, category: e.target.value })}
              placeholder="Category"
              className="input-field"
            />
            <input
              type="text"
              value={newNote.tags}
              onChange={(e) => setNewNote({ ...newNote, tags: e.target.value })}
              placeholder="Tags (comma-separated)"
              className="input-field flex-1"
            />
            <button type="submit" className="btn-primary">Save</button>
            <button type="button" onClick={() => setShowAdd(false)} className="btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      {/* Notes Grid */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-twin-500/30 border-t-twin-500 rounded-full animate-spin" />
        </div>
      ) : displayNotes.length === 0 ? (
        <div className="text-center py-16">
          <HiOutlineBookmark className="w-12 h-12 text-dark-400 mx-auto mb-3" />
          <p className="text-dark-300">{searchResults ? 'No matching notes found' : 'No notes yet. Create your first note!'}</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {displayNotes.map((note, i) => (
            <div key={note.id || i} className="glass-card-hover p-5">
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-sm font-semibold text-white">{note.title}</h3>
                {note.is_pinned && <HiOutlineBookmark className="w-4 h-4 text-twin-400 flex-shrink-0" />}
              </div>
              <p className="text-sm text-dark-200 line-clamp-4 whitespace-pre-wrap mb-3">
                {note.content}
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                {note.category && <span className="badge-primary">{note.category}</span>}
                {(note.tags || []).map((tag, j) => (
                  <span key={j} className="badge bg-dark-600 text-dark-200 flex items-center gap-1">
                    <HiOutlineTag className="w-3 h-3" />{tag}
                  </span>
                ))}
                {note.relevance !== undefined && (
                  <span className="badge-success ml-auto">{(note.relevance * 100).toFixed(0)}% match</span>
                )}
              </div>
              {note.created_at && (
                <p className="text-[10px] text-dark-400 mt-2">
                  {new Date(note.created_at).toLocaleDateString()}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
