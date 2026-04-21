import React, { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { intentAPI } from '../services/api'
import { HiOutlinePlus, HiOutlineClock, HiOutlineLocationMarker, HiOutlineUpload } from 'react-icons/hi'

export default function CalendarPage() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [days, setDays] = useState(7)
  const [newEvent, setNewEvent] = useState({
    title: '', start_time: '', end_time: '', description: '', location: '', category: '', priority: 'medium'
  })

  useEffect(() => { loadEvents() }, [days])

  const loadEvents = async () => {
    try {
      const res = await intentAPI.getEvents(days)
      setEvents(res.data)
    } catch (err) {
      toast.error('Failed to load events')
    } finally {
      setLoading(false)
    }
  }

  const createEvent = async (e) => {
    e.preventDefault()
    if (!newEvent.title.trim() || !newEvent.start_time) return
    try {
      await intentAPI.createEvent(newEvent)
      toast.success('Event created')
      setNewEvent({ title: '', start_time: '', end_time: '', description: '', location: '', category: '', priority: 'medium' })
      setShowAdd(false)
      loadEvents()
    } catch (err) {
      toast.error('Failed to create event')
    }
  }

  const handleImport = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    try {
      const res = await intentAPI.importCalendar(file)
      toast.success(`Imported ${res.data.count} events`)
      loadEvents()
    } catch (err) {
      toast.error('Import failed')
    }
  }

  const groupEventsByDate = (events) => {
    const groups = {}
    events.forEach((event) => {
      const date = new Date(event.start_time).toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric'
      })
      if (!groups[date]) groups[date] = []
      groups[date].push(event)
    })
    return groups
  }

  const grouped = groupEventsByDate(events)

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="section-title">Calendar</h1>
          <p className="section-subtitle">Your schedule, intelligently organized</p>
        </div>
        <div className="flex gap-2">
          <label className="btn-secondary flex items-center gap-2 cursor-pointer">
            <HiOutlineUpload className="w-4 h-4" /> Import .ics
            <input type="file" accept=".ics" onChange={handleImport} className="hidden" />
          </label>
          <button onClick={() => setShowAdd(!showAdd)} className="btn-primary flex items-center gap-2">
            <HiOutlinePlus className="w-4 h-4" /> Add Event
          </button>
        </div>
      </div>

      {/* Time range filter */}
      <div className="flex gap-2 mb-6">
        {[3, 7, 14, 30].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`px-4 py-2 rounded-xl text-sm transition-all ${
              days === d ? 'bg-twin-500/20 text-twin-400 border border-twin-500/30' : 'text-dark-200 hover:bg-dark-600/50'
            }`}
          >
            {d} days
          </button>
        ))}
      </div>

      {/* Add Event Form */}
      {showAdd && (
        <form onSubmit={createEvent} className="glass-card p-5 mb-6 space-y-3">
          <input
            type="text" value={newEvent.title}
            onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
            placeholder="Event title..." className="input-field" autoFocus
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-dark-300 mb-1 block">Start</label>
              <input type="datetime-local" value={newEvent.start_time}
                onChange={(e) => setNewEvent({ ...newEvent, start_time: e.target.value })}
                className="input-field" />
            </div>
            <div>
              <label className="text-xs text-dark-300 mb-1 block">End</label>
              <input type="datetime-local" value={newEvent.end_time}
                onChange={(e) => setNewEvent({ ...newEvent, end_time: e.target.value })}
                className="input-field" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input type="text" value={newEvent.location}
              onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
              placeholder="Location" className="input-field" />
            <input type="text" value={newEvent.category}
              onChange={(e) => setNewEvent({ ...newEvent, category: e.target.value })}
              placeholder="Category" className="input-field" />
          </div>
          <textarea value={newEvent.description}
            onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
            placeholder="Description..." className="input-field resize-none" rows={2} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowAdd(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Create Event</button>
          </div>
        </form>
      )}

      {/* Events List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-twin-500/30 border-t-twin-500 rounded-full animate-spin" />
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-16">
          <HiOutlineClock className="w-12 h-12 text-dark-400 mx-auto mb-3" />
          <p className="text-dark-300">No upcoming events in the next {days} days</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([date, dateEvents]) => (
            <div key={date}>
              <h3 className="text-sm font-semibold text-twin-400 mb-3 sticky top-0 bg-dark-900/80 backdrop-blur py-1">{date}</h3>
              <div className="space-y-2 ml-4 border-l-2 border-dark-500/30 pl-4">
                {dateEvents.map((event) => (
                  <div key={event.id} className="glass-card-hover p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="text-sm font-medium text-white">{event.title}</h4>
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-dark-300">
                          <span className="flex items-center gap-1">
                            <HiOutlineClock className="w-3.5 h-3.5" />
                            {new Date(event.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            {event.end_time && ` - ${new Date(event.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                          </span>
                          {event.location && (
                            <span className="flex items-center gap-1">
                              <HiOutlineLocationMarker className="w-3.5 h-3.5" />
                              {event.location}
                            </span>
                          )}
                        </div>
                        {event.description && <p className="text-xs text-dark-300 mt-1.5">{event.description}</p>}
                      </div>
                      {event.category && <span className="badge-primary flex-shrink-0">{event.category}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
