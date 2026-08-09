/**
 * useInterviewRecorder Hook
 * Manages MediaRecorder for interview recordings with chunked upload.
 */
import { useRef, useState, useCallback } from 'react'
import { api } from '../services/api'

const CHUNK_INTERVAL_MS = 5000 // 5 seconds per chunk

export function useInterviewRecorder(sessionId) {
  const [isRecording, setIsRecording] = useState(false)
  const [recordingId, setRecordingId] = useState(null)
  const recorderRef = useRef(null)
  const chunkIndexRef = useRef(0)
  const chunkTimerRef = useRef(null)
  const recordedBytesRef = useRef(0)
  const recordingIdRef = useRef(null)
  recordingIdRef.current = recordingId

  const startRecording = useCallback(async (stream, deviceType = 'LAPTOP') => {
    if (!stream || !sessionId) return null

    try {
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm'

      const recorder = new MediaRecorder(stream, { mimeType })
      chunkIndexRef.current = 0
      recordedBytesRef.current = 0

      recorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          const chunk = event.data
          const index = chunkIndexRef.current++
          recordedBytesRef.current += chunk.size

          try {
            const formData = new FormData()
            formData.append('chunk', chunk, `chunk_${index}.webm`)
            formData.append('sessionId', sessionId)
            formData.append('deviceType', deviceType)
            formData.append('chunkIndex', index)

            const res = await api.post('/api/interviews/upload-chunk', formData)
            if (res?.recordingId) setRecordingId(res.recordingId)
          } catch (err) {
            console.error('Chunk upload failed:', err)
          }
        }
      }

      recorder.onstop = async () => {
        clearInterval(chunkTimerRef.current)
        setIsRecording(false)
        // Merge chunks into the final recording file.
        if (recordingIdRef.current) {
          try {
            await api.post('/api/interviews/finalize-recording', {
              recordingId: recordingIdRef.current,
            })
          } catch (err) {
            console.error('Failed to finalize recording:', err)
          }
        }
      }

      recorder.start(CHUNK_INTERVAL_MS)
      recorderRef.current = recorder
      setIsRecording(true)

      return recorder
    } catch (err) {
      console.error('Failed to start recording:', err)
      return null
    }
  }, [sessionId])

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
    clearInterval(chunkTimerRef.current)
    setIsRecording(false)
  }, [])

  const toggleRecording = useCallback((stream, deviceType) => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording(stream, deviceType)
    }
  }, [isRecording, startRecording, stopRecording])

  return {
    isRecording,
    recordingId,
    startRecording,
    stopRecording,
    toggleRecording,
  }
}

export default useInterviewRecorder
