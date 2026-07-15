import { useCallback, useEffect, useMemo, useState } from 'react'
import { API_BASE } from '../api/api'

/**
 * useParticipantProfile
 * ─────────────────────────────────────────────────────────────────────────
 * Backend-first profile store. The participant's profile (avatar, bio,
 * skills, links, displayName) is persisted to /api/participant-profile so
 * trainers and admins can see it. localStorage is kept only as a tiny
 * cache so the page paints instantly while the network call resolves —
 * the backend response is always authoritative.
 *
 * Storage cache key:  wave-profile-<userId>
 *
 * Returned shape:
 *   {
 *     profile,       // { displayName, bio, avatarUrl, skills, links }
 *     completion,    // 0..100 derived from filled fields
 *     initials,      // 2-letter fallback for avatars
 *     loading,       // true on first fetch
 *     saving,        // true while a PUT is in flight
 *     error,         // last error message or ''
 *     updateProfile(patch) → Promise
 *     setAvatar(dataUrl)   → Promise
 *     clearAvatar()        → Promise
 *     refresh()            → Promise
 *   }
 */

const KEY = (id) => `wave-profile-${id || 'anon'}`

const DEFAULT_PROFILE = {
  displayName: '',
  bio: '',
  avatarUrl: null,
  skills: [],
  links: { website: '', github: '', linkedin: '', twitter: '' },
  updatedAt: 0,
}

function readCache(userId) {
  if (typeof window === 'undefined') return { ...DEFAULT_PROFILE }
  try {
    const raw = window.localStorage.getItem(KEY(userId))
    if (!raw) return { ...DEFAULT_PROFILE }
    const parsed = JSON.parse(raw)
    return {
      ...DEFAULT_PROFILE,
      ...parsed,
      links: { ...DEFAULT_PROFILE.links, ...(parsed.links || {}) },
      skills: Array.isArray(parsed.skills) ? parsed.skills : [],
    }
  } catch {
    return { ...DEFAULT_PROFILE }
  }
}

function writeCache(userId, profile) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KEY(userId), JSON.stringify(profile))
  } catch {
    /* quota errors ignored — backend is authoritative */
  }
}

/** Normalise the API payload to the shape the UI expects. */
function fromApi(apiProfile) {
  if (!apiProfile) return { ...DEFAULT_PROFILE }
  return {
    displayName: apiProfile.displayName || '',
    bio: apiProfile.bio || '',
    avatarUrl: apiProfile.avatarUrl || null,
    skills: Array.isArray(apiProfile.skills) ? apiProfile.skills : [],
    links: { ...DEFAULT_PROFILE.links, ...(apiProfile.links || {}) },
    updatedAt: apiProfile.updatedAt
      ? new Date(apiProfile.updatedAt).getTime()
      : 0,
  }
}

/* ───── Completion score ───────────────────────────────────────────── */
export function computeCompletion(profile, user) {
  const name = profile?.displayName || user?.name
  const bio = (profile?.bio || '').trim()
  const skills = Array.isArray(profile?.skills) ? profile.skills : []
  const linksFilled = profile?.links
    ? Object.values(profile.links).filter((v) => v && v.trim().length > 0).length
    : 0

  // Each check returns 0..1 (partial credit) so users can climb steadily
  // toward 100% instead of needing every field at full strength.
  const checks = [
    { ratio: user?.email ? 1 : 0,                                    weight: 15 },
    { ratio: name && name.trim().length > 1 ? 1 : 0,                 weight: 15 },
    { ratio: profile?.avatarUrl ? 1 : 0,                             weight: 25 },
    // Bio: full credit at 40 chars, partial below
    { ratio: Math.min(1, bio.length / 40),                            weight: 20 },
    // Skills: full credit at 3 skills, partial below
    { ratio: Math.min(1, skills.length / 3),                          weight: 15 },
    // Links: full credit when at least one is filled
    { ratio: linksFilled > 0 ? 1 : 0,                                 weight: 10 },
  ]
  const earned = checks.reduce((acc, c) => acc + c.ratio * c.weight, 0)
  return Math.max(0, Math.min(100, Math.round(earned)))
}

/* ───── Hook ───────────────────────────────────────────────────────── */
export function useParticipantProfile(user) {
  const userId = user?.id ?? user?.userId ?? user?.email ?? 'anon'
  const token = user?.token

  const [profile, setProfile] = useState(() => readCache(userId))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const auth = useCallback(
    () => (token
      ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      : { 'Content-Type': 'application/json' }
    ),
    [token]
  )

  /* ── Fetch from backend ────────────────────────────────────────────── */
  const refresh = useCallback(async () => {
    if (!token) {
      setLoading(false)
      return
    }
    setError('')
    try {
      const res = await fetch(`${API_BASE}/participant-profile/me`, {
        headers: auth(),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      const next = fromApi(data.profile)
      setProfile(next)
      writeCache(userId, next)
    } catch (e) {
      setError(e.message || 'Failed to load profile')
      // Fall back to whatever's in cache — set in initial state already
    } finally {
      setLoading(false)
    }
  }, [auth, token, userId])

  // Reload on user change + initial mount
  useEffect(() => {
    setProfile(readCache(userId)) // optimistic paint
    setLoading(true)
    refresh()
  }, [userId, refresh])

  /* ── Save to backend ───────────────────────────────────────────────── */
  const persist = useCallback(async (patch) => {
    // Apply patch optimistically
    let next
    setProfile((prev) => {
      next = {
        ...prev,
        ...patch,
        links: { ...prev.links, ...(patch?.links || {}) },
        updatedAt: Date.now(),
      }
      writeCache(userId, next)
      return next
    })

    if (!token) {
      // No backend reachable; cache-only mode.
      return
    }

    setSaving(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE}/participant-profile/me`, {
        method: 'PUT',
        headers: auth(),
        body: JSON.stringify({
          displayName: next?.displayName ?? null,
          bio: next?.bio ?? null,
          avatarUrl: next?.avatarUrl ?? null,
          skills: next?.skills ?? [],
          links: next?.links ?? {},
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      const fresh = fromApi(data.profile)
      setProfile(fresh)
      writeCache(userId, fresh)
    } catch (e) {
      setError(e.message || 'Failed to save profile')
      throw e
    } finally {
      setSaving(false)
    }
  }, [auth, token, userId])

  const updateProfile = useCallback((patch) => {
    // Strip avatarUrl just in case — avatars go through the dedicated
    // multipart endpoint now, not this JSON PUT.
    const { avatarUrl: _omit, ...rest } = patch || {}
    return persist(rest)
  }, [persist])

  /* ── Avatar upload via multipart (XHR for progress) ──────────────── */
  const uploadAvatar = useCallback((file, { onProgress } = {}) => {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error('No file provided'))
      if (!token) return reject(new Error('Not authenticated'))

      const xhr = new XMLHttpRequest()
      xhr.open('POST', `${API_BASE}/participant-profile/me/avatar`, true)
      xhr.setRequestHeader('Authorization', `Bearer ${token}`)
      // Don't set Content-Type — the browser must add the multipart boundary.

      if (xhr.upload && typeof onProgress === 'function') {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            onProgress({
              loaded: e.loaded,
              total: e.total,
              percent: Math.round((e.loaded / e.total) * 100),
            })
          }
        }
      }

      xhr.onload = () => {
        let parsed = {}
        try { parsed = xhr.responseText ? JSON.parse(xhr.responseText) : {} } catch { /* ignore */ }
        if (xhr.status >= 200 && xhr.status < 300) {
          if (parsed.profile) {
            const next = fromApi(parsed.profile)
            setProfile(next)
            writeCache(userId, next)
          }
          resolve(parsed.profile)
        } else {
          reject(new Error(parsed?.error || `HTTP ${xhr.status}`))
        }
      }
      xhr.onerror = () => reject(new Error('Network error'))

      const fd = new FormData()
      fd.append('avatar', file, file.name || 'avatar.jpg')
      xhr.send(fd)
    })
  }, [token, userId])

  /* setAvatar(file) — backwards-compatible alias for uploadAvatar.
     Accepts a File object (not a data URL anymore). */
  const setAvatar = useCallback(async (file) => {
    if (!(file instanceof Blob)) {
      throw new Error('setAvatar expects a File or Blob')
    }
    await uploadAvatar(file)
  }, [uploadAvatar])

  /* clearAvatar — DELETE the avatar file + clear the column. */
  const clearAvatar = useCallback(async () => {
    if (!token) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE}/participant-profile/me/avatar`, {
        method: 'DELETE',
        headers: auth(),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      if (data.profile) {
        const next = fromApi(data.profile)
        setProfile(next)
        writeCache(userId, next)
      }
    } catch (e) {
      setError(e.message || 'Could not remove avatar')
      throw e
    } finally {
      setSaving(false)
    }
  }, [auth, token, userId])

  /* ── Derived ───────────────────────────────────────────────────────── */
  const completion = useMemo(
    () => computeCompletion(profile, user),
    [profile, user]
  )

  const initials = useMemo(() => {
    const src = profile?.displayName || user?.name || user?.email || 'U'
    return src
      .trim()
      .split(/\s+/)
      .map((p) => p[0])
      .filter(Boolean)
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }, [profile?.displayName, user?.name, user?.email])

  return {
    profile,
    completion,
    initials,
    loading,
    saving,
    error,
    updateProfile,
    uploadAvatar,
    setAvatar,
    clearAvatar,
    refresh,
  }
}

export default useParticipantProfile
