import React, { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { twinAPI } from '../services/api'
import {
  HiOutlineSearch, HiOutlinePlus, HiOutlineDatabase,
  HiOutlineLightBulb, HiOutlineChat, HiOutlineHeart
} from 'react-icons/hi'

const collections = [
  { value: 'memories', label: 'Long-term Memories', icon: HiOutlineDatabase },
  { value: 'conversations', label: 'Conversations', icon: HiOutlineChat },
  { value: 'personality', label: 'Personality', icon: HiOutlineHeart },
  { value: 'decisions', label: 'Decision Patterns', icon: HiOutlineLightBulb },
  { value: 'notes', label: 'Notes', icon: HiOutlineDatabase },
]

const categories = ['personal', 'work', 'family', 'health', 'finance', 'learning', 'other']

export default function MemoryPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCollection, setSelectedCollection] = useState('conversations')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newMemory, setNewMemory] = useState({ content: '', category: 'personal', importance: 0.5 })
  const [personality, setPersonality] = useState(null)
  const [collectionCounts, setCollectionCounts] = useState({})

  // Load counts for all collections on page open
  useEffect(() => {
    const loadCounts = async () => {
      try {
        const res = await twinAPI.getStats()
        const stats = res.data?.memory_stats || {}
        setCollectionCounts(stats)
        // Auto-select first collection with data
        const firstWithData = collections.find(c => (stats[c.value] || 0) > 0)
        if (firstWithData) setSelectedCollection(firstWithData.value)
      } catch (err) { /* ignore */ }
    }
    loadCounts()
  }, [])

  // Auto-load memories when collection changes
  useEffect(() => {
    loadMemories()
  }, [selectedCollection])

  const loadMemories = async () => {
    setLoading(true)
    try {
      const res = await twinAPI.listMemories(selectedCollection, 50)
      setResults(res.data.results || [])
    } catch (err) {
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  const search = async () => {
    if (!searchQuery.trim()) return
    setSearching(true)
    try {
      const res = await twinAPI.searchMemory(searchQuery, selectedCollection, 15)
      setResults(res.data.results || [])
    } catch (err) {
      toast.error('Search failed')
    } finally {
      setSearching(false)
    }
  }

  const addMemory = async (e) => {
    e.preventDefault()
    if (!newMemory.content.trim()) return
    try {
      await twinAPI.addMemory(newMemory.content, newMemory.category, newMemory.importance)
      toast.success('Memory added to twin')
      setNewMemory({ content: '', category: 'personal', importance: 0.5 })
      setShowAdd(false)
      loadMemories()
    } catch (err) {
      toast.error('Failed to add memory')
    }
  }

  const loadPersonality = async () => {
    try {
      const res = await twinAPI.getPersonality()
      setPersonality(res.data)
    } catch (err) {
      toast.error('Failed to load personality')
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="section-title">Twin Memory</h1>
          <p className="section-subtitle">Everything your twin knows and remembers</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadPersonality} className="btn-secondary flex items-center gap-2">
            <HiOutlineHeart className="w-4 h-4" /> View Personality
          </button>
          <button onClick={() => setShowAdd(!showAdd)} className="btn-primary flex items-center gap-2">
            <HiOutlinePlus className="w-4 h-4" /> Add Memory
          </button>
        </div>
      </div>

      {/* Add Memory Form */}
      {showAdd && (
        <form onSubmit={addMemory} className="glass-card p-5 mb-6 space-y-3">
          <textarea
            value={newMemory.content}
            onChange={(e) => setNewMemory({ ...newMemory, content: e.target.value })}
            placeholder="What should your twin remember? (e.g., 'I love chai with adrak', 'My mummy's birthday is March 15')"
            className="input-field resize-none"
            rows={3}
            autoFocus
          />
          <div className="flex gap-3 items-center">
            <select
              value={newMemory.category}
              onChange={(e) => setNewMemory({ ...newMemory, category: e.target.value })}
              className="input-field w-auto"
            >
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className="flex items-center gap-2 flex-1">
              <span className="text-xs text-dark-300">Importance:</span>
              <input
                type="range" min="0" max="1" step="0.1"
                value={newMemory.importance}
                onChange={(e) => setNewMemory({ ...newMemory, importance: parseFloat(e.target.value) })}
                className="flex-1 accent-twin-500"
              />
              <span className="text-xs text-twin-400 w-8">{(newMemory.importance * 100).toFixed(0)}%</span>
            </div>
            <button type="submit" className="btn-primary">Save</button>
          </div>
        </form>
      )}

      {/* Search */}
      <div className="glass-card p-4 mb-6">
        <div className="flex gap-2 mb-3 flex-wrap">
          {collections.map((col) => (
            <button
              key={col.value}
              onClick={() => setSelectedCollection(col.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all ${
                selectedCollection === col.value
                  ? 'bg-twin-500/20 text-twin-400 border border-twin-500/30'
                  : 'text-dark-300 hover:bg-dark-600/50'
              }`}
            >
              <col.icon className="w-3.5 h-3.5" />
              {col.label}
              {(collectionCounts[col.value] || 0) > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-dark-600 text-[10px]">
                  {collectionCounts[col.value]}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-300 w-5 h-5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && search()}
              placeholder="Search twin's memories semantically..."
              className="input-field pl-10"
            />
          </div>
          <button onClick={search} disabled={searching} className="btn-primary">
            {searching ? 'Searching...' : 'Search'}
          </button>
        </div>
      </div>

      {/* Results */}
      {loading && (
        <div className="text-center py-12 text-dark-300">Loading memories...</div>
      )}
      {!loading && results.length === 0 && !searchQuery && (
        <div className="text-center py-12">
          <HiOutlineDatabase className="w-12 h-12 text-dark-400 mx-auto mb-3" />
          <p className="text-dark-300">No memories yet in this collection.</p>
          <p className="text-dark-400 text-sm mt-1">Add memories or chat with your twin to build its knowledge.</p>
        </div>
      )}
      {results.length > 0 && (
        <div className="space-y-3 mb-8">
          <h3 className="text-sm font-medium text-dark-200">{searchQuery ? 'Found' : 'Showing'} {results.length} memories</h3>
          {results.map((r, i) => (
            <div key={i} className="glass-card-hover p-4">
              <p className="text-sm text-white whitespace-pre-wrap">{r.content}</p>
              <div className="flex items-center gap-3 mt-2">
                {r.metadata?.source && <span className="badge-primary">{r.metadata.source}</span>}
                {r.metadata?.category && <span className="badge bg-dark-600 text-dark-200">{r.metadata.category}</span>}
                <span className="text-xs text-dark-400 ml-auto">
                  Relevance: {((1 - (r.distance || 0)) * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Personality Profile */}
      {personality && (
        <div className="glass-card p-5">
          <h2 className="section-title flex items-center gap-2 mb-4">
            <HiOutlineHeart className="text-pink-400" /> Learned Personality
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            {/* Traits */}
            {Object.keys(personality.traits).length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-dark-100 mb-3">Personality Traits</h3>
                <div className="space-y-2">
                  {Object.entries(personality.traits).map(([trait, value]) => (
                    <div key={trait} className="flex items-center gap-3">
                      <span className="text-xs text-dark-200 w-28 truncate">{trait}</span>
                      <div className="flex-1 h-2 bg-dark-600 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-twin-500 to-purple-500 rounded-full transition-all"
                          style={{ width: `${Math.abs(value) * 100}%`, marginLeft: value < 0 ? 'auto' : 0 }}
                        />
                      </div>
                      <span className="text-xs text-dark-300 w-10">{(value * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Other personality data */}
            <div className="space-y-4">
              {personality.interests?.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-dark-100 mb-2">Interests</h3>
                  <div className="flex flex-wrap gap-2">
                    {personality.interests.map((i, idx) => (
                      <span key={idx} className="badge-primary">{i}</span>
                    ))}
                  </div>
                </div>
              )}
              {personality.quirks?.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-dark-100 mb-2">Quirks & Mannerisms</h3>
                  <div className="flex flex-wrap gap-2">
                    {personality.quirks.map((q, idx) => (
                      <span key={idx} className="badge bg-purple-500/20 text-purple-300">{q}</span>
                    ))}
                  </div>
                </div>
              )}
              {Object.keys(personality.relationship_styles || {}).length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-dark-100 mb-2">Known Relationships</h3>
                  {Object.entries(personality.relationship_styles).map(([name, style]) => (
                    <div key={name} className="bg-dark-600/30 rounded-lg p-2 mb-1">
                      <span className="text-sm text-white font-medium">{name}</span>
                      <span className="text-xs text-dark-300 ml-2">({style.label || style.relationship_type})</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
