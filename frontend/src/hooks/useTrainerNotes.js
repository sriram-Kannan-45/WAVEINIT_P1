import { useCallback, useEffect, useState } from 'react'
import { API_BASE } from '../api/api'

/**
 * useTrainerNotes
 * ─────────────────────────────────────────────────────────────────────────
 * Encapsulates the trainer's notes/resources lifecycle:
 *   - GET /api/notes/my-notes              (list)
 *   - POST /api/notes                      (upload, with upload progress)
 *   - PUT /api/notes/:id                   (edit, optionally replace file)
 *   - DELETE /api/notes/:id                (delete)
 *
 * Why XHR (not fetch) for upload?
 *   fetch() does NOT expose upload progress events, while
 *   XMLHttpRequest.upload.onprogress works in every browser. Anything we
 *   need a progress bar for (uploads, file replacements) goes through XHR.
 *
 * Returned shape:
 *   {
 *     notes, loading, error, refresh,
 *     upload({ formData, onProgress }) → Promise<note>,
 *     update(id, { formData?, json?, onProgress? }) → Promise<note>,
 *     remove(id) → Promise<void>,
 *   }
 */
export function useTrainerNotes(user) {
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const auth = useCallback(
    () => ({ Authorization: `Bearer ${user?.token || ''}` }),
    [user]
  )

  /* ── Read ───────────────────────────────────────────────────────────── */
  const refresh = useCallback(async () => {
    if (!user?.token) return
    setLoading(true); setError('')
    try {
      const res = await fetch(`${API_BASE}/notes/my-notes`, { headers: auth() })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setNotes(Array.isArray(data.notes) ? data.notes : [])
    } catch (e) {
      setError(e.message || 'Failed to load notes')
    } finally {
      setLoading(false)
    }
  }, [auth, user])

  useEffect(() => { refresh() }, [refresh])

  /* ── XHR helper with progress ──────────────────────────────────────── */
  const xhrSend = useCallback((method, url, body, { onProgress, headers = {} } = {}) => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open(method, url, true)
      // Auth
      const a = auth()
      Object.entries({ ...a, ...headers }).forEach(([k, v]) => {
        if (v != null) xhr.setRequestHeader(k, v)
      })

      if (body instanceof FormData) {
        // Let the browser set multipart boundary; do nothing
      } else if (typeof body === 'object' && body !== null) {
        xhr.setRequestHeader('Content-Type', 'application/json')
        body = JSON.stringify(body)
      }

      if (xhr.upload && typeof onProgress === 'function') {
        xhr.upload.onprogress = (evt) => {
          if (evt.lengthComputable) {
            onProgress({
              loaded: evt.loaded,
              total: evt.total,
              percent: Math.round((evt.loaded / evt.total) * 100),
            })
          }
        }
      }

      xhr.onload = () => {
        let parsed = null
        try { parsed = xhr.responseText ? JSON.parse(xhr.responseText) : {} } catch { parsed = {} }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(parsed)
        } else {
          const msg = parsed?.error || parsed?.message || `HTTP ${xhr.status}`
          reject(new Error(msg))
        }
      }
      xhr.onerror = () => reject(new Error('Network error'))
      xhr.onabort = () => reject(new Error('Upload cancelled'))

      xhr.send(body)
    })
  }, [auth])

  /* ── Create ─────────────────────────────────────────────────────────── */
  const upload = useCallback(async ({ formData, onProgress } = {}) => {
    if (!formData) throw new Error('formData required')
    const data = await xhrSend('POST', `${API_BASE}/notes`, formData, { onProgress })
    if (data?.note) {
      setNotes((prev) => [data.note, ...prev])
    } else {
      // Fallback: refresh to be safe
      refresh()
    }
    return data?.note
  }, [xhrSend, refresh])

  /* ── Update ─────────────────────────────────────────────────────────── */
  const update = useCallback(async (id, { formData, json, onProgress } = {}) => {
    const body = formData || json
    if (!body) throw new Error('formData or json required')
    const data = await xhrSend('PUT', `${API_BASE}/notes/${id}`, body, { onProgress })
    if (data?.note) {
      setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...data.note } : n)))
    } else {
      refresh()
    }
    return data?.note
  }, [xhrSend, refresh])

  /* ── Delete ─────────────────────────────────────────────────────────── */
  const remove = useCallback(async (id) => {
    const res = await fetch(`${API_BASE}/notes/${id}`, {
      method: 'DELETE',
      headers: auth(),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
    setNotes((prev) => prev.filter((n) => n.id !== id))
  }, [auth])

  return { notes, loading, error, refresh, upload, update, remove }
}

export default useTrainerNotes
