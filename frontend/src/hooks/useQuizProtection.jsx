import { useEffect, useRef, useState, useCallback } from 'react'
import { API_BASE } from '../api/api'
import { getAuthHeaders } from '../api/request'

const VIOLATION_WEIGHTS = {
  COPY: 1.0,
  CUT: 1.0,
  PASTE: 1.0,
  SELECT_ALL: 1.0,
  RIGHT_CLICK: 1.0,
  VIEW_SOURCE: 1.0,
  SAVE_PAGE: 1.0,
  PRINT: 1.0,
  PRINT_SCREEN: 1.0,
  DEVTOOLS_OPENED: 1.0,
  TAB_SWITCH: 0.5,
  WINDOW_BLUR: 0.5,
}

const SOFT_THRESHOLD = 2

const VIOLATION_MESSAGES = {
  COPY: 'Copying quiz content is not allowed.',
  CUT: 'Cutting quiz content is not allowed.',
  PASTE: 'Pasting content into the quiz is not allowed.',
  RIGHT_CLICK: 'Right-click is disabled during the assessment.',
  SELECT_ALL: 'Selecting all content is not allowed during the assessment.',
  VIEW_SOURCE: 'Viewing page source is not allowed during the assessment.',
  SAVE_PAGE: 'Saving the page is not allowed during the assessment.',
  PRINT: 'Printing is disabled during the assessment.',
  PRINT_SCREEN: 'Screen capture activity detected.',
  DEVTOOLS_OPENED: 'Developer tools are not allowed during the assessment.',
  TAB_SWITCH: 'Tab switching is monitored during the assessment.',
  WINDOW_BLUR: 'Leaving the assessment window is monitored.',
}

export function useQuizProtection({
  attemptId,
  quiz,
  initialViolationCount = 0,
  initialStatus = 'IN_PROGRESS',
  answers = {},
  onSubmit,
  currentQ = 0,
  enabled = true,
  participantName = '',
  participantId = '',
}) {
  console.log('[useQuizProtection] Initialized', {
    attemptId,
    quizId: quiz?.id,
    quizTitle: quiz?.title,
    enabled,
    copyProtectionEnabled: quiz?.copyProtectionEnabled,
  })
  const [violationCount, setViolationCount] = useState(initialViolationCount)
  const [softViolationCount, setSoftViolationCount] = useState(0)
  const [disqualified, setDisqualified] = useState(
    initialStatus === 'disqualified_copy_violation' || initialStatus === 'disqualified_policy_violation'
  )
  const [warningOpen, setWarningOpen] = useState(false)
  const [lastViolationType, setLastViolationType] = useState('')
  const containerRef = useRef(null)
  const lastTriggerRef = useRef(0)
  const blurTimerRef = useRef(null)
  const tabSwitchCountRef = useRef(0)

  const stateRef = useRef({
    answers,
    currentQ,
    violationCount,
    softViolationCount,
    disqualified,
    maxWarnings: quiz?.maxCopyWarnings ?? 3,
    enabled,
    participantName,
    participantId,
  })

  useEffect(() => {
    stateRef.current = {
      answers,
      currentQ,
      violationCount,
      softViolationCount,
      disqualified,
      maxWarnings: quiz?.maxCopyWarnings ?? 3,
      enabled,
      participantName,
      participantId,
    }
  }, [answers, currentQ, violationCount, softViolationCount, disqualified, quiz, enabled, participantName, participantId])

  const triggerViolation = useCallback(async (actionType) => {
    const { maxWarnings, enabled: protEnabled } = stateRef.current
    if (!protEnabled || stateRef.current.disqualified) return

    const now = Date.now()
    if (now - lastTriggerRef.current < 500) return
    lastTriggerRef.current = now

    const weight = VIOLATION_WEIGHTS[actionType] || 1.0
    const isSoft = weight < 1.0

    console.warn(`[useQuizProtection] Violation: ${actionType} (weight: ${weight}), attemptId: ${attemptId}`)

    if (!attemptId) {
      console.error('[useQuizProtection] Cannot report violation: attemptId is missing')
      return
    }

    const answerArray = Object.entries(stateRef.current.answers).map(([questionId, val]) => ({
      questionId: parseInt(questionId, 10),
      selectedOption: val.selectedOption !== undefined ? val.selectedOption : null,
      answerText: val.answerText || null,
      matches: val.matches || null,
    }))

    try {
      let token = sessionStorage.getItem('quiz_session_token') || null
      const headers = { ...getAuthHeaders(), 'Content-Type': 'application/json' }
      if (token) headers['X-Assessment-Session'] = token

      const quizId = quiz?.id || stateRef.current.answers?.[0]?.quizId
      const violationPayload = {
        type: actionType,
        weight,
        quizId,
        questionNumber: stateRef.current.currentQ + 1,
        answers: answerArray,
      }
      console.log('[useQuizProtection] Violation payload:', violationPayload)

      const res = await fetch(`${API_BASE}/quizzes/attempts/${attemptId}/violation`, {
        method: 'POST',
        headers,
        body: JSON.stringify(violationPayload),
      })

      const data = await res.json()
      if (res.ok && data.success) {
        const newViolationCount = data.violationCount ?? (stateRef.current.violationCount + (isSoft ? 0 : 1))

        if (isSoft) {
          const newSoft = tabSwitchCountRef.current + 1
          tabSwitchCountRef.current = newSoft
          setSoftViolationCount(newSoft)
          if (newSoft >= SOFT_THRESHOLD) {
            setViolationCount((v) => v + 1)
            tabSwitchCountRef.current = 0
            setSoftViolationCount(0)
          }
        } else {
          setViolationCount(newViolationCount)
        }

        setLastViolationType(actionType)

        if (data.disqualified) {
          setDisqualified(true)
          setWarningOpen(false)
          if (onSubmit) {
            if (document.fullscreenElement || document.webkitFullscreenElement) {
              const exitFs = document.exitFullscreen || document.webkitExitFullscreen
              if (exitFs) {
                try { await exitFs.call(document) } catch {}
              }
            }
            setTimeout(() => { onSubmit() }, 3000)
          }
        } else if (!isSoft || (isSoft && weight === 1.0)) {
          setWarningOpen(true)
        }
      }
    } catch (err) {
      console.error('Failed to post violation:', err)
      if (isSoft) {
        const newSoft = tabSwitchCountRef.current + 1
        tabSwitchCountRef.current = newSoft
        setSoftViolationCount(newSoft)
        if (newSoft >= SOFT_THRESHOLD) {
          const localNext = stateRef.current.violationCount + 1
          setViolationCount(localNext)
          tabSwitchCountRef.current = 0
          setSoftViolationCount(0)
          if (localNext >= maxWarnings) {
            setDisqualified(true)
            setWarningOpen(false)
            if (onSubmit) setTimeout(() => onSubmit(), 3000)
          } else {
            setWarningOpen(true)
          }
        }
      } else {
        const localNext = stateRef.current.violationCount + 1
        setViolationCount(localNext)
        if (localNext >= maxWarnings) {
          setDisqualified(true)
          setWarningOpen(false)
          if (onSubmit) setTimeout(() => onSubmit(), 3000)
        } else {
          setWarningOpen(true)
        }
      }
    }
  }, [attemptId, onSubmit])

  useEffect(() => {
    const { enabled: protEnabled } = stateRef.current
    if (!protEnabled || disqualified) return

    const container = containerRef.current
    let originalStyle = ''
    if (container) {
      originalStyle = container.style.cssText
      container.style.userSelect = 'none'
      container.style.webkitUserSelect = 'none'
      container.style.msUserSelect = 'none'
      container.style.mozUserSelect = 'none'
      container.style.webkitTouchCallout = 'none'
    }

    const handleCopy = (e) => {
      e.preventDefault()
      triggerViolation('COPY')
    }

    const handleCut = (e) => {
      e.preventDefault()
      triggerViolation('CUT')
    }

    const handlePaste = (e) => {
      e.preventDefault()
      triggerViolation('PASTE')
    }

    const handleContextMenu = (e) => {
      e.preventDefault()
      triggerViolation('RIGHT_CLICK')
    }

    const handleSelectStart = (e) => {
      const tag = e.target.tagName?.toUpperCase()
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.closest('input') || e.target.closest('textarea') || e.target.closest('select')) {
        return
      }
      e.preventDefault()
    }

    const handleDragStart = (e) => {
      e.preventDefault()
    }

    const handleTouchStart = (e) => {
      const tag = e.target.tagName?.toUpperCase()
      if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT' || tag === 'OPTION' || e.target.closest('.qt-option')) {
        return
      }
    }

    document.addEventListener('copy', handleCopy)
    document.addEventListener('cut', handleCut)
    document.addEventListener('paste', handlePaste, true)
    document.addEventListener('contextmenu', handleContextMenu)
    document.addEventListener('selectstart', handleSelectStart)
    document.addEventListener('dragstart', handleDragStart)
    document.addEventListener('touchstart', handleTouchStart, { passive: true })

    return () => {
      if (container) {
        container.style.cssText = originalStyle
      }
      document.removeEventListener('copy', handleCopy)
      document.removeEventListener('cut', handleCut)
      document.removeEventListener('paste', handlePaste, true)
      document.removeEventListener('contextmenu', handleContextMenu)
      document.removeEventListener('selectstart', handleSelectStart)
      document.removeEventListener('dragstart', handleDragStart)
      document.removeEventListener('touchstart', handleTouchStart)
    }
  }, [triggerViolation, disqualified])

  useEffect(() => {
    const { enabled: protEnabled } = stateRef.current
    if (!protEnabled || disqualified) return

    const handleResize = () => {
      const widthDiff = window.outerWidth - window.innerWidth
      const heightDiff = window.outerHeight - window.innerHeight
      if (widthDiff > 160 || heightDiff > 160) {
        triggerViolation('DEVTOOLS_OPENED')
      }
    }

    window.addEventListener('resize', handleResize)
    handleResize()

    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [triggerViolation, disqualified])

  useEffect(() => {
    const { enabled: protEnabled } = stateRef.current
    if (!protEnabled || disqualified) return

    const handleKeyDown = (e) => {
      let isViolation = false
      let actionType = ''

      if (e.key === 'F12') {
        isViolation = true
        actionType = 'DEVTOOLS_OPENED'
      } else if (e.ctrlKey && e.shiftKey && ['I', 'J', 'C', 'U', 'i', 'j', 'c', 'u'].includes(e.key)) {
        isViolation = true
        actionType = 'DEVTOOLS_OPENED'
      } else if (e.ctrlKey && ['U', 'u'].includes(e.key)) {
        isViolation = true
        actionType = 'VIEW_SOURCE'
      } else if (e.ctrlKey && ['P', 'p'].includes(e.key)) {
        isViolation = true
        actionType = 'PRINT'
      } else if (e.ctrlKey && ['A', 'a'].includes(e.key)) {
        isViolation = true
        actionType = 'SELECT_ALL'
      } else if (e.ctrlKey && ['C', 'c'].includes(e.key)) {
        isViolation = true
        actionType = 'COPY'
      } else if (e.ctrlKey && ['X', 'x'].includes(e.key)) {
        isViolation = true
        actionType = 'CUT'
      } else if (e.ctrlKey && ['S', 's'].includes(e.key)) {
        isViolation = true
        actionType = 'SAVE_PAGE'
      } else if (e.key === 'PrintScreen') {
        isViolation = true
        actionType = 'PRINT_SCREEN'
      }

      if (isViolation) {
        e.preventDefault()
        e.stopPropagation()
        triggerViolation(actionType)
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [triggerViolation, disqualified])

  useEffect(() => {
    const { enabled: protEnabled } = stateRef.current
    if (!protEnabled || disqualified) return

    const handleBeforePrint = (e) => {
      triggerViolation('PRINT')
    }

    window.addEventListener('beforeprint', handleBeforePrint)
    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint)
    }
  }, [triggerViolation, disqualified])

  useEffect(() => {
    const { enabled: protEnabled } = stateRef.current
    if (!protEnabled || disqualified) return

    const handleVisibility = () => {
      if (document.hidden) {
        clearTimeout(blurTimerRef.current)
        blurTimerRef.current = setTimeout(() => {
          triggerViolation('TAB_SWITCH')
        }, 1000)
      } else {
        clearTimeout(blurTimerRef.current)
      }
    }

    const handleBlur = () => {
      clearTimeout(blurTimerRef.current)
      blurTimerRef.current = setTimeout(() => {
        triggerViolation('WINDOW_BLUR')
      }, 2000)
    }

    const handleFocus = () => {
      clearTimeout(blurTimerRef.current)
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('blur', handleBlur)
    window.addEventListener('focus', handleFocus)

    return () => {
      clearTimeout(blurTimerRef.current)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('blur', handleBlur)
      window.removeEventListener('focus', handleFocus)
    }
  }, [triggerViolation, disqualified])

  const renderModals = () => {
    const maxWarnings = quiz?.maxCopyWarnings ?? 3
    const actionMessage = VIOLATION_MESSAGES[lastViolationType] || 'Action not allowed during the assessment.'
    const warningTitle = (lastViolationType === 'TAB_SWITCH' || lastViolationType === 'WINDOW_BLUR')
      ? 'Focus Warning'
      : 'Security Warning'

    return (
      <>
        {warningOpen && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(15, 23, 42, 0.4)',
            backdropFilter: 'blur(8px)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'fadeIn 0.2s ease-out',
          }}>
            <div style={{
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              padding: '32px',
              maxWidth: '480px',
              width: '90%',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
              textAlign: 'center',
              border: '1px solid #f1f5f9',
            }}>
              <div style={{
                fontSize: '48px',
                marginBottom: '16px',
                display: 'inline-block',
              }}>
                ⚠️
              </div>
              <h3 style={{
                fontSize: '20px',
                fontWeight: '700',
                color: '#0f172a',
                margin: '0 0 8px 0',
                fontFamily: "'Manrope', sans-serif",
              }}>
                {warningTitle}
              </h3>
              <p style={{
                fontSize: '14px',
                lineHeight: '1.5',
                color: '#dc2626',
                margin: '0 0 16px 0',
                fontWeight: '600',
                fontFamily: "'Manrope', sans-serif",
              }}>
                {actionMessage}
              </p>
              <p style={{
                fontSize: '15px',
                lineHeight: '1.6',
                color: '#475569',
                margin: '0 0 24px 0',
                fontWeight: '500',
                fontFamily: "'Manrope', sans-serif",
              }}>
                Warning {violationCount} of {maxWarnings}. Further violations may result in disqualification.
              </p>
              <button
                type="button"
                onClick={() => setWarningOpen(false)}
                style={{
                  width: '100%',
                  padding: '12px 24px',
                  backgroundColor: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '15px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s',
                  fontFamily: "'Manrope', sans-serif",
                  boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.2)',
                  marginBottom: '8px',
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1d4ed8'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
              >
                I Understand & Acknowledge
              </button>
            </div>
          </div>
        )}

        {disqualified && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: '#0f172a',
            zIndex: 100000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            color: '#ffffff',
            padding: '24px',
            textAlign: 'center',
          }}>
            <div style={{
              maxWidth: '520px',
              padding: '40px',
              borderRadius: '24px',
              backgroundColor: 'rgba(30, 41, 59, 0.7)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              backdropFilter: 'blur(12px)',
            }}>
              <div style={{
                fontSize: '64px',
                marginBottom: '20px',
              }}>
                🚫
              </div>
              <h1 style={{
                fontSize: '28px',
                fontWeight: '800',
                color: '#ef4444',
                margin: '0 0 16px 0',
                fontFamily: "'Manrope', sans-serif",
                letterSpacing: '-0.5px',
              }}>
                Disqualified
              </h1>
              <p style={{
                fontSize: '16px',
                lineHeight: '1.7',
                color: '#94a3b8',
                margin: '0 0 28px 0',
                fontWeight: '500',
                fontFamily: "'Manrope', sans-serif",
              }}>
                You have been disqualified for repeated policy violations. Your attempt has been submitted and flagged for review.
              </p>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '14px',
                color: '#64748b',
                fontWeight: '600',
              }}>
                <span style={{
                  display: 'inline-block',
                  width: '16px',
                  height: '16px',
                  border: '2px solid #64748b',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  marginRight: '8px',
                }} />
                Submitting attempt and redirecting...
              </div>
            </div>
          </div>
        )}
      </>
    )
  }

  return {
    containerRef,
    renderModals,
    violationCount,
    softViolationCount,
    disqualified,
    warningOpen,
    setWarningOpen,
  }
}
