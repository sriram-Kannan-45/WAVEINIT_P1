import { useRef, useCallback, useEffect } from 'react'
import { useProctor } from '../ProctorContext'

const FACE_CHECK_INTERVAL_MS = 3000
const FACE_ABSENT_THRESHOLD = 3
const FACE_MULTIPLE_THRESHOLD = 2

export default function useFaceDetection({ enabled = true, stream, videoRef }) {
  const proctor = useProctor()
  const faceAbsentCountRef = useRef(0)
  const faceMultipleCountRef = useRef(0)
  const lookingAwayCountRef = useRef(0)
  const detectorRef = useRef(null)
  const intervalRef = useRef(null)
  const canvasRef = useRef(null)
  const lastFaceCountRef = useRef(0)

  const initDetector = useCallback(async () => {
    if (detectorRef.current) return detectorRef.current
    try {
      if ('FaceDetector' in window) {
        const detector = new window.FaceDetector({
          maxDetectedFaces: 5,
          fastMode: true,
        })
        detectorRef.current = detector
        return detector
      }
    } catch (e) {
      console.warn('[FaceDetection] FaceDetector API not available:', e.message)
    }
    return null
  }, [])

  const detectFaces = useCallback(async () => {
    if (!stream || !stream.active) return 0

    const video = videoRef?.current
    if (!video || video.paused || video.ended || video.readyState < 2) return lastFaceCountRef.current

    const detector = await initDetector()
    if (!detector) {
      lastFaceCountRef.current = 1
      return 1
    }

    try {
      const faces = await detector.detect(video)
      const faceCount = faces.length
      lastFaceCountRef.current = faceCount
      return faceCount
    } catch (e) {
      if (e.name === 'NotSupportedError') {
        detectorRef.current = null
      }
      return lastFaceCountRef.current
    }
  }, [stream, videoRef, initDetector])

  const checkFaces = useCallback(async () => {
    if (!enabled || !stream || !proctor.isActive) return

    const faceCount = await detectFaces()

    if (faceCount === 0) {
      faceAbsentCountRef.current++
      faceMultipleCountRef.current = 0
      lookingAwayCountRef.current = 0

      if (faceAbsentCountRef.current >= FACE_ABSENT_THRESHOLD) {
        proctor.report('FACE_ABSENT', 'No face detected in camera view')
        faceAbsentCountRef.current = 0
      }
    } else if (faceCount >= FACE_MULTIPLE_THRESHOLD) {
      faceMultipleCountRef.current++
      faceAbsentCountRef.current = 0
      lookingAwayCountRef.current = 0

      if (faceMultipleCountRef.current >= 2) {
        proctor.report('FACE_MULTIPLE', `Multiple faces detected (${faceCount} faces in frame)`)
        faceMultipleCountRef.current = 0
      }
    } else {
      faceAbsentCountRef.current = Math.max(0, faceAbsentCountRef.current - 1)
      faceMultipleCountRef.current = Math.max(0, faceMultipleCountRef.current - 1)
      lookingAwayCountRef.current = Math.max(0, lookingAwayCountRef.current - 1)
    }
  }, [enabled, stream, proctor, detectFaces])

  useEffect(() => {
    if (!enabled || !stream) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    initDetector()
    intervalRef.current = setInterval(checkFaces, FACE_CHECK_INTERVAL_MS)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [enabled, stream, initDetector, checkFaces])

  const forceCheck = useCallback(async () => {
    return detectFaces()
  }, [detectFaces])

  return { faceCount: lastFaceCountRef.current, forceCheck }
}
