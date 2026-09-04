import { useEffect, useRef, useState } from 'react'
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
  const enteredOnce = useRef(!!fsApi.element())
  const count = useRef(0)

  useEffect(() => {
    let timer = null
    let outsideSince = null
    let confirmed = false
    const cancel = () => { clearTimeout(timer); timer = null; outsideSince = null }
    const onChange = () => {
      const inFs = !!fsApi.element()
      setIsFullscreen(inFs)
      if (inFs) {
        enteredOnce.current = true
        confirmed = false
        setWarningOpen(false)
        cancel()
        return
      }
      if (submittedRef.current || terminated || inactive || !enteredOnce.current || timer || confirmed) return
      outsideSince = Date.now()
      timer = setTimeout(() => {
        timer = null
        if (fsApi.element() || submittedRef.current || terminated || inactive) return
        confirmed = true
        const durationMs = Math.max(2000, Date.now() - outsideSince)
        const endedAt = new Date().toISOString()
        const startedAt = new Date(Date.now() - durationMs).toISOString()
        count.current += 1
        setWarnings(count.current)
        setWarningOpen(true)
        // Uses the same engine cooldown/idempotency gates as its browser detector.
        monitoringClient.reportEvent({
          source: 'LAPTOP', eventType: 'FULLSCREEN_EXIT', severity: 'HIGH',
          durationMs, confidence: 0.95, startedAt, endedAt, occurredAt: endedAt,
          metadata: {
            duration: durationMs / 1000, trigger: 'confirmed_fullscreen_exit_2s',
            exitCount: count.current, violationStartTime: startedAt, violationEndTime: endedAt,
          },
        }).catch(error => console.warn('[Assessment] Monitoring event dispatch failed:', error))
      }, 2000)
    }
    if (inactive || terminated) setWarningOpen(false)
    fsApi.changeEvents.forEach(event => document.addEventListener(event, onChange))
    return () => {
      cancel()
      fsApi.changeEvents.forEach(event => document.removeEventListener(event, onChange))
    }
  }, [submittedRef, terminated, inactive])

  return { isFullscreen, warnings, warningOpen, setWarningOpen }
}
