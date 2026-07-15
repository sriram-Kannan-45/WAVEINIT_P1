import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'wave-continue-learning'
const MAX_ITEMS = 5

/**
 * Lightweight "Continue learning" feature backed by localStorage.
 * Tracks the last few items (course, lesson, quiz) the student interacted with.
 * No backend required.
 *
 * Item shape: { type: 'course'|'lesson'|'quiz', id, title, subtitle?, href?, progress?, ts }
 */

function readStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}

function writeStore(items) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)) } catch { /* ignore */ }
}

export function useContinueLearning() {
  const [items, setItems] = useState(() => readStore())

  const track = useCallback((entry) => {
    if (!entry || !entry.type || entry.id == null) return
    setItems((prev) => {
      const next = [
        { ...entry, ts: Date.now() },
        ...prev.filter((p) => !(p.type === entry.type && String(p.id) === String(entry.id))),
      ].slice(0, MAX_ITEMS)
      writeStore(next)
      return next
    })
  }, [])

  const remove = useCallback((type, id) => {
    setItems((prev) => {
      const next = prev.filter((p) => !(p.type === type && String(p.id) === String(id)))
      writeStore(next)
      return next
    })
  }, [])

  const clear = useCallback(() => {
    writeStore([])
    setItems([])
  }, [])

  // Sync if another tab updates storage
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY) setItems(readStore())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  return { items, track, remove, clear }
}
