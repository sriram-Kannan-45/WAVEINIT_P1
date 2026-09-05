import React, { useEffect, useState } from 'react'
import { Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { API_BASE } from '../../api/api'

export default function MobileAdmissionGate({ user, assessmentType, children }) {
  const location = useLocation()
  const [params] = useSearchParams()
  const attemptId = params.get('attemptId')
  const token = user?.token || localStorage.getItem('token') || sessionStorage.getItem('token')
  const [allowed, setAllowed] = useState(null)
  useEffect(() => {
    const controller = new AbortController()
    setAllowed(null)
    fetch(`${API_BASE}/assessment-verification/admission/${assessmentType}/${attemptId}`, {
      headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
    }).then(response => { if (!controller.signal.aborted) setAllowed(response.ok) })
      .catch(error => { if (error.name !== 'AbortError') setAllowed(false) })
    return () => controller.abort()
  }, [assessmentType, attemptId, token])
  if (allowed === null) return <p role="status">Checking mobile verification…</p>
  if (!allowed) return <Navigate replace to={`${location.pathname.replace(/\/attempt\/?$/, '/verification')}${location.search}`} />
  return children
}
