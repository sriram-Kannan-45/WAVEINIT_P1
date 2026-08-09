/**
 * InterviewSessionContext
 * Provides interview session state to all child components.
 */
import { createContext, useContext, useState, useCallback } from 'react'

const InterviewSessionContext = createContext(null)

export function InterviewSessionProvider({ children }) {
  const [session, setSession] = useState(null)
  const [interview, setInterview] = useState(null)
  const [devices, setDevices] = useState({ laptop: false, mobile: false })
  const [peers, setPeers] = useState([])
  const [alerts, setAlerts] = useState([])
  const [chatMessages, setChatMessages] = useState([])
  const [codeContent, setCodeContent] = useState({ content: '', language: 'javascript' })
  const [isRecording, setIsRecording] = useState(false)
  const [consentGiven, setConsentGiven] = useState(false)
  const [localStreams, setLocalStreams] = useState({ laptop: null, mobile: null })
  const [remoteStreams, setRemoteStreams] = useState({})
  const [connectionState, setConnectionState] = useState('disconnected')
  const [screenSharing, setScreenSharing] = useState(false)
  const [timer, setTimer] = useState({ remaining: 0, total: 0 })

  const addChatMessage = useCallback((msg) => {
    setChatMessages(prev => [...prev, { ...msg, id: Date.now() + Math.random() }])
  }, [])

  const addAlert = useCallback((alert) => {
    setAlerts(prev => [...prev, { ...alert, id: Date.now() + Math.random() }])
  }, [])

  const updateDevice = useCallback((type, connected) => {
    setDevices(prev => ({ ...prev, [type.toLowerCase()]: connected }))
  }, [])

  const value = {
    session, setSession,
    interview, setInterview,
    devices, setDevices, updateDevice,
    peers, setPeers,
    alerts, setAlerts, addAlert,
    chatMessages, setChatMessages, addChatMessage,
    codeContent, setCodeContent,
    isRecording, setIsRecording,
    consentGiven, setConsentGiven,
    localStreams, setLocalStreams,
    remoteStreams, setRemoteStreams,
    connectionState, setConnectionState,
    screenSharing, setScreenSharing,
    timer, setTimer,
  }

  return (
    <InterviewSessionContext.Provider value={value}>
      {children}
    </InterviewSessionContext.Provider>
  )
}

export function useInterviewSession() {
  const ctx = useContext(InterviewSessionContext)
  if (!ctx) throw new Error('useInterviewSession must be used within InterviewSessionProvider')
  return ctx
}

export default InterviewSessionContext
