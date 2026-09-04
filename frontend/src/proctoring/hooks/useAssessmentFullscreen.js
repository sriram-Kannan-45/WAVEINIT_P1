import { useEffect, useState } from 'react'
import monitoringClient from '../engine/MonitoringEngineClient'

export const fsApi = {
  request: (el = document.documentElement) =>
    (el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen)?.call(el),
  exit: () =>
    (document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen)?.call(document),
  element: () =>
    document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement,
  changeEvents: ['fullscreenchange', 'webkitfullscreenchange', 'msfullscreenchange'],
}

// QuizTaking's confirmation window and non-terminating warning behavior are
// shared by both assessments. Audit penalties belong to monitoringService.
export function useAssessmentFullscreen({ submittedRef, terminated = false, inactive = false }) {
  const [isFullscreen, setIsFullscreen] = useState(() => !!fsApi.element())
  const [warnings, setWarnings] = useState(0)
  const [warningOpen, setWarningOpen] = useState(false)
  useEffect(() => {
    const onChange = () => {
      const fullscreen = !!fsApi.element()
      setIsFullscreen(fullscreen)
      if (fullscreen) setWarningOpen(false)
    }
    const onIncident = event => {
      if (submittedRef.current || terminated || inactive) return
      setWarnings(event.detail.count)
      setWarningOpen(true)
    }
    const onCount = event => setWarnings(event.detail.count)
    setWarnings(monitoringClient.browserIncidentCount || 0)
    if (inactive || terminated) setWarningOpen(false)
    fsApi.changeEvents.forEach(event => document.addEventListener(event, onChange))
    window.addEventListener('assessment:browser-incident', onIncident)
    window.addEventListener('assessment:browser-count', onCount)
    return () => {
      fsApi.changeEvents.forEach(event => document.removeEventListener(event, onChange))
      window.removeEventListener('assessment:browser-incident', onIncident)
      window.removeEventListener('assessment:browser-count', onCount)
    }
  }, [submittedRef, terminated, inactive])

  return { isFullscreen, warnings, warningOpen, setWarningOpen }
}
