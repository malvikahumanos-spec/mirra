import React, { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { intentAPI } from '../services/api'
import {
  HiOutlinePlus, HiOutlineCheck, HiOutlineClock,
  HiOutlineFlag, HiOutlineTrash, HiOutlineSparkles,
  HiOutlineClipboardList
} from 'react-icons/hi'

const priorityColors = {
  critical: 'border-red-500/50 bg-red-500/10',
  high: 'border-orange-500/50 bg-orange-500/10',
  medium: 'border-twin-500/50 bg-twin-500/10',
  low: 'border-dark-400/50 bg-dark-600/30',
}

const priorityBadge = {
  critical: 'badge-danger',
  high: 'badge-warning',
  medium: 'badge-primary',
  low: 'text-dark-300 bg-dark-600 badge',
}

export default function TasksPage() {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [filter, setFilter] = useState('all')
  const [newTask, setNewTask] = useState({ title: '', description: '', priority: 'medium', category: '' })

  useEffect(() => { loadTasks() }, [filter])

  const loadTasks = async () => {
    try {
      const status = filter === 'all' ? undefined : filter
      const res = await intentAPI.getTasks(status)
      setTasks(res.data)
    } catch (err) {
      toast.error('Failed to load tasks')
    } finally {
      setLoading(false)
    }
  }

  const createTask = async (e) => {
    e.preventDefault()
    if (!newTask.title.trim()) return
    try {
      await intentAPI.createTask(newTask)
      toast.success('Task created')
      setNewTask({ title: '', description: '', priority: 'medium', category: '' })
      setShowAdd(false)
      loadTasks()
    } catch (err) {
      toast.error('Failed to create task')
    }
  }

  const updateStatus = async (id, status) => {
    try {
      await intentAPI.updateTask(id, status)
      toast.success(`Task ${status === 'done' ? 'completed' : 'updated'}`)
      loadTasks()
    } catch (err) {
      toast.error('Failed to update task')
    }
  }

  const filters = [
    { value: 'all', label: 'All' },
    { value: 'todo', label: 'To Do' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'done', label: 'Done' },
  ]

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="section-title">Tasks</h1>
          <p className="section-subtitle">AI-powered task management that learns your priorities</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="btn-primary flex items-center gap-2">
          <HiOutlinePlus className="w-4 h-4" /> Add Task
        </button>
      </div>

      {/* Add Task Form */}
      {showAdd && (
        <form onSubmit={createTask} className="glass-card p-5 mb-6 space-y-3">
          <input
            type="text"
            value={newTask.title}
            onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
            placeholder="Task title..."
            className="input-field"
            autoFocus
          />
          <textarea
            value={newTask.description}
            onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
            placeholder="Description (optional)..."
            className="input-field resize-none"
            rows={2}
          />
          <div className="flex gap-3">
            <select
              value={newTask.priority}
              onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}
              className="input-field w-auto"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
            <input
              type="text"
              value={newTask.category}
              onChange={(e) => setNewTask({ ...newTask, category: e.target.value })}
              placeholder="Category"
              className="input-field flex-1"
            />
            <button type="submit" className="btn-primary">Create</button>
            <button type="button" onClick={() => setShowAdd(false)} className="btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-4 py-2 rounded-xl text-sm transition-all ${
              filter === f.value
                ? 'bg-twin-500/20 text-twin-400 border border-twin-500/30'
                : 'text-dark-200 hover:bg-dark-600/50 border border-transparent'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Task List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-twin-500/30 border-t-twin-500 rounded-full animate-spin" />
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-16">
          <HiOutlineClipboardList className="w-12 h-12 text-dark-400 mx-auto mb-3" />
          <p className="text-dark-300">No tasks yet. Add your first task!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <div
              key={task.id}
              className={`glass-card-hover p-4 flex items-center gap-4 border-l-4 ${priorityColors[task.priority] || ''}`}
            >
              <button
                onClick={() => updateStatus(task.id, task.status === 'done' ? 'todo' : 'done')}
                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                  task.status === 'done'
                    ? 'border-green-400 bg-green-400/20'
                    : 'border-dark-400 hover:border-twin-400'
                }`}
              >
                {task.status === 'done' && <HiOutlineCheck className="w-4 h-4 text-green-400" />}
              </button>
              <div className="flex-1 min-w-0">
                <h3 className={`text-sm font-medium ${task.status === 'done' ? 'text-dark-300 line-through' : 'text-white'}`}>
                  {task.title}
                </h3>
                {task.description && (
                  <p className="text-xs text-dark-300 mt-0.5 truncate">{task.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {task.category && <span className="badge-primary">{task.category}</span>}
                <span className={priorityBadge[task.priority]}>{task.priority}</span>
                {task.status !== 'done' && task.status !== 'in_progress' && (
                  <button
                    onClick={() => updateStatus(task.id, 'in_progress')}
                    className="btn-ghost text-xs"
                    title="Start"
                  >
                    <HiOutlineClock className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
