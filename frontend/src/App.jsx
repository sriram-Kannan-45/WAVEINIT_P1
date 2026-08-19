import { motion } from 'framer-motion'
import { Suspense, lazy, useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useNavigate, useParams, useLocation } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary'
import Layout from './components/Layout'
import NotificationsPanel from './components/student/shell/NotificationsPanel'
import { ToastProvider } from './components/Toast'
import { AppThemeProvider } from './contexts/AppThemeContext'
import { API_BASE } from './api/api'

// Resilient lazy loader with auto-retry and auto-reload on stale Vite chunks / HMR
function lazyRetry(componentImport) {
  return lazy(async () => {
    try {
      return await componentImport()
    } catch (error) {
      const isDynamicImportError =
        error?.message?.includes('Failed to fetch dynamically imported module') ||
        error?.name === 'ChunkLoadError' ||
        error?.toString()?.includes('dynamically imported module')

      const refreshed = sessionStorage.getItem('page_auto_refreshed')
      if (isDynamicImportError && !refreshed) {
        sessionStorage.setItem('page_auto_refreshed', 'true')
        window.location.reload()
        return { default: () => null }
      }
      sessionStorage.removeItem('page_auto_refreshed')
      throw error
    }
  })
}

// Lazy-loaded pages — each chunk is separate with auto-retry
const AdminDashboard = lazyRetry(() => import('./pages/AdminDashboard'))
const ExamPage = lazyRetry(() => import('./pages/ExamPage'))
const ExamResultPage = lazyRetry(() => import('./pages/ExamResultPage'))
const ForgotPassword = lazyRetry(() => import('./pages/ForgotPassword'))
const Login = lazyRetry(() => import('./pages/Login'))
const ParticipantDashboard = lazyRetry(() => import('./pages/ParticipantDashboard'))
const ParticipantQuizAttemptPage = lazyRetry(() => import('./pages/ParticipantQuizAttemptPage'))
const ParticipantQuizResultPage = lazyRetry(() => import('./pages/ParticipantQuizResultPage'))
const PreExamReadiness = lazyRetry(() => import('./pages/PreExamReadiness'))
const Register = lazyRetry(() => import('./pages/Register'))
const RegistrationPage = lazyRetry(() => import('./pages/RegistrationPage'))
const TrainerDashboard = lazyRetry(() => import('./pages/TrainerDashboard'))
const TrainerProfile = lazyRetry(() => import('./pages/TrainerProfile'))
const AdminTrainerProfile = lazyRetry(() => import('./pages/AdminTrainerProfile'))
const TrainerRecordings = lazyRetry(() => import('./pages/TrainerRecordings'))
const TrainerRecordingDetail = lazyRetry(() => import('./pages/TrainerRecordingDetail'))
const TrainerProctoringPage = lazyRetry(() => import('./pages/TrainerProctoringPage'))
const TrainerMonitoringReportPage = lazyRetry(() => import('./pages/TrainerMonitoringReportPage'))
const TrainerQuizDetails = lazyRetry(() => import('./pages/TrainerQuizDetails'))
const TestPage = lazyRetry(() => import('./pages/TestPage'))
const TestResultPage = lazyRetry(() => import('./pages/TestResultPage'))
const TrainerMonitoringDashboard = lazyRetry(() => import('./pages/TrainerMonitoringDashboard'))
const TrainerCodingAssessmentDetails = lazyRetry(() => import('./pages/TrainerCodingAssessmentDetails'))
const ParticipantCodingAttemptPage = lazyRetry(() => import('./pages/ParticipantCodingAttemptPage'))
const CodingAssessmentResultPage = lazyRetry(() => import('./pages/CodingAssessmentResultPage'))
const TrainerCourses = lazyRetry(() => import('./pages/TrainerCourses'))
const ProfilePage = lazyRetry(() => import('./pages/Profile/ProfilePage'))

// Interview Module (Read-only reference)
const InterviewDashboard = lazyRetry(() => import('./pages/interview/InterviewDashboard'))
const ScheduleInterview = lazyRetry(() => import('./pages/interview/ScheduleInterview'))
const InterviewRoom = lazyRetry(() => import('./pages/interview/InterviewRoom'))
const MobileJoin = lazyRetry(() => import('./pages/interview/MobileJoin'))
const InterviewEvaluation = lazyRetry(() => import('./pages/interview/InterviewEvaluation'))

// Assessment Verification (Quiz & Coding)
const AssessmentMobileJoin = lazyRetry(() => import('./pages/assessment/AssessmentMobileJoin'))

function PageLoader() {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'linear-gradient(135deg, #f5f8ff 0%, #eef3ff 50%, #f8faff 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      fontFamily: "'Manrope', 'Poppins', sans-serif"
    }}>
      <div style={{
        width: '44px',
        height: '44px',
        border: '3px solid rgba(37, 99, 235, 0.1)',
        borderTop: '3px solid #2563eb',
        borderRadius: '50%',
        animation: 'appSpin 1s linear infinite',
        marginBottom: '16px'
      }} />
      <div style={{
        fontSize: '14px',
        fontWeight: 600,
        color: '#475569',
        letterSpacing: '0.01em',
        animation: 'appPulse 1.5s ease-in-out infinite'
      }}>
        Loading...
      </div>
      <style>{`
        @keyframes appSpin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes appPulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  )
}

function App() {
  const [user, setUser] = useState(null)
  const [initializing, setInitializing] = useState(true)

  useEffect(() => {
    const savedUser = localStorage.getItem('user')
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser))
      } catch (e) {
        localStorage.removeItem('user')
      }
    }
    setInitializing(false)
  }, [])

  useEffect(() => {
    const originalFetch = window.fetch
    let refreshPromise = null

    const doRefresh = async () => {
      if (refreshPromise) return refreshPromise
      refreshPromise = (async () => {
        try {
          const user = JSON.parse(localStorage.getItem('user') || '{}')
          const body = user.refreshToken ? { refreshToken: user.refreshToken } : {}
          const res = await originalFetch(`${API_BASE}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(body),
          })
          if (res.ok) {
            const data = await res.json()
            if (data.accessToken) {
              const stored = JSON.parse(localStorage.getItem('user') || '{}')
              const updated = { ...stored, token: data.accessToken, accessToken: data.accessToken }
              localStorage.setItem('user', JSON.stringify(updated))
              setUser(updated)
              return data.accessToken
            }
          }
        } catch {}
        return null
      })()
      const result = await refreshPromise
      refreshPromise = null
      return result
    }

    window.fetch = async (...args) => {
      const [url, options = {}] = args
      const mergedOptions = {
        ...options,
        credentials: options.credentials || 'include',
      }

      const response = await originalFetch(url, mergedOptions)

      if (response.status === 401) {
        const urlStr = response.url || ''
        const isAuthEndpoint = urlStr.includes('/api/auth/login') || urlStr.includes('/api/auth/register')
        const isRefreshEndpoint = urlStr.includes('/api/auth/refresh')
        const isVerifEndpoint = urlStr.includes('/api/assessment-verification')

        if (!isAuthEndpoint && !isRefreshEndpoint && !isVerifEndpoint) {
          const newToken = await doRefresh()
          if (newToken) {
            const retryOptions = {
              ...mergedOptions,
              headers: {
                ...(mergedOptions.headers || {}),
                Authorization: `Bearer ${newToken}`,
              },
            }
            return originalFetch(url, retryOptions)
          }

          localStorage.removeItem('user')
          setUser(null)
        }
      }
      return response
    }
    return () => {
      window.fetch = originalFetch
    }
  }, [])

  const handleLogin = (userData) => {
    setUser(userData)
    localStorage.setItem('user', JSON.stringify(userData))
  }

  const handleLogout = () => {
    setUser(null)
    localStorage.removeItem('user')
  }

  if (initializing) {
    return <PageLoader />
  }

  return (
    <AppThemeProvider>
      <BrowserRouter>
        <ToastProvider>
          <ErrorBoundary>
            <Suspense fallback={<PageLoader />}>
              <AppRoutes user={user} onLogin={handleLogin} onLogout={handleLogout} />
            </Suspense>
          </ErrorBoundary>
        </ToastProvider>
      </BrowserRouter>
    </AppThemeProvider>
  )
}

const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 }
}

const DEFAULT_TABS = {
  ADMIN: 'overview',
  TRAINER: 'overview',
  PARTICIPANT: 'overview',
}

function TrainerRecordingsWrapper({ user, onLogout, pageVariants }) {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('recordings')

  const handleTabChange = (tab) => {
    navigate('/trainer', { state: { tab } })
  }

  return (
    <Layout user={user} activeTab={activeTab} onTabChange={handleTabChange} onLogout={onLogout}>
      <motion.div
        initial="initial"
        animate="animate"
        exit="exit"
        variants={pageVariants}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        <TrainerRecordings user={user} />
      </motion.div>
    </Layout>
  )
}

function RecordingDetailWrapper({ user, onLogout, pageVariants }) {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('recordings')

  const handleTabChange = (tab) => {
    navigate('/trainer', { state: { tab } })
  }

  return (
    <Layout user={user} activeTab={activeTab} onTabChange={handleTabChange} onLogout={onLogout}>
      <motion.div
        initial="initial"
        animate="animate"
        exit="exit"
        variants={pageVariants}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        <TrainerRecordingDetail user={user} />
      </motion.div>
    </Layout>
  )
}

function DashboardWrapper({ component: Component, user, onLogout }) {
  const location = useLocation()
  const isProfileRoute = location.pathname === '/my-profile' || location.pathname === '/trainer/profile'
  const isInterviewRoute = location.pathname.startsWith('/interview')

  const resolveTab = () => {
    if (isProfileRoute) return 'profile'
    if (isInterviewRoute) return 'interviews'
    if (location.state?.tab) return location.state.tab
    return DEFAULT_TABS[user?.role] || 'overview'
  }

  const [activeTab, setActiveTab] = useState(resolveTab)

  useEffect(() => {
    const nextTab = resolveTab()
    setActiveTab(nextTab)
  }, [location.pathname, location.state?.tab])

  return (
    <ErrorBoundary>
      <Layout
        user={user}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onLogout={onLogout}
        headerSlot={user?.role === 'PARTICIPANT' ? <NotificationsPanel placement="top" /> : null}
      >
        <motion.div
          initial="initial"
          animate="animate"
          exit="exit"
          variants={pageVariants}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <Component
            user={user}
            onLogout={onLogout}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        </motion.div>
      </Layout>
    </ErrorBoundary>
  )
}

function AppRoutes({ user, onLogin, onLogout }) {

  return (
    <Routes>
      <Route path="/" element={<Login onLogin={onLogin} />} />
      <Route path="/login" element={<Login onLogin={onLogin} />} />
      <Route path="/admin/login" element={<Login onLogin={onLogin} defaultRole="ADMIN" />} />
      <Route path="/trainer/login" element={<Login onLogin={onLogin} defaultRole="TRAINER" />} />
      <Route path="/participant/login" element={<Login onLogin={onLogin} defaultRole="PARTICIPANT" />} />
      <Route path="/register" element={<Register onLogin={onLogin} />} />
      <Route path="/apply" element={<RegistrationPage />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />

      <Route
        path="/admin"
        element={
          user?.role === 'ADMIN' ? (
            <DashboardWrapper component={AdminDashboard} user={user} onLogout={onLogout} />
          ) : (
            <Navigate to="/login" state={{ fromRole: 'ADMIN' }} replace />
          )
        }
      />

      <Route
        path="/admin/trainer/:userId"
        element={
          user?.role === 'ADMIN' ? (
            <DashboardWrapper component={AdminTrainerProfile} user={user} onLogout={onLogout} />
          ) : (
            <Navigate to="/login" state={{ fromRole: 'ADMIN' }} replace />
          )
        }
      />

      <Route
        path="/trainer"
        element={
          user?.role === 'TRAINER' ? (
            <DashboardWrapper component={TrainerDashboard} user={user} onLogout={onLogout} />
          ) : (
            <Navigate to="/login" state={{ fromRole: 'TRAINER' }} replace />
          )
        }
      />

      <Route
        path="/trainer/profile"
        element={
          user?.role === 'TRAINER' ? (
            <DashboardWrapper component={ProfilePage} user={user} onLogout={onLogout} />
          ) : (
            <Navigate to="/login" state={{ fromRole: 'TRAINER' }} replace />
          )
        }
      />

      <Route
        path="/trainer/recordings"
        element={
          user?.role === 'TRAINER' ? (
            <TrainerRecordingsWrapper user={user} onLogout={onLogout} pageVariants={pageVariants} />
          ) : (
            <Navigate to="/login" state={{ fromRole: 'TRAINER' }} replace />
          )
        }
      />

      <Route
        path="/trainer/recordings/:id"
        element={
          user?.role === 'TRAINER' ? (
            <RecordingDetailWrapper user={user} onLogout={onLogout} pageVariants={pageVariants} />
          ) : (
            <Navigate to="/login" state={{ fromRole: 'TRAINER' }} replace />
          )
        }
      />

      <Route
        path="/participant"
        element={
          user?.role === 'PARTICIPANT' ? (
            <DashboardWrapper component={ParticipantDashboard} user={user} onLogout={onLogout} />
          ) : (
            <Navigate to="/login" state={{ fromRole: 'PARTICIPANT' }} replace />
          )
        }
      />

      <Route
        path="/participant/quizzes"
        element={<Navigate to="/participant" replace />}
      />

      <Route
        path="/quizzes"
        element={<Navigate to="/participant" replace />}
      />

      <Route
        path="/trainings/:trainingId/quizzes/:quizId/attempt"
        element={
          user?.role === 'PARTICIPANT' ? (
            <ParticipantQuizAttemptPage user={user} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      <Route
        path="/trainings/:trainingId/quizzes/:quizId/result"
        element={
          user?.role === 'PARTICIPANT' ? (
            <Layout
              user={user}
              onLogout={onLogout}
              activeTab="myEnrollments"
              onTabChange={() => window.location.href = '/participant'}
            >
              <ParticipantQuizResultPage user={user} />
            </Layout>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      <Route
        path="/participant/exam/:quizId"
        element={
          user?.role === 'PARTICIPANT'
            ? <PreExamReadiness />
            : <Navigate to="/participant" />
        }
      />

      <Route path="/exam/:sessionId" element={<ExamPage />} />
      <Route path="/exam/:sessionId/result" element={<ExamResultPage />} />

      <Route
        path="/trainer/proctor/:quizId"
        element={
          (user?.role === 'TRAINER' || user?.role === 'ADMIN')
            ? <TrainerProctoringPage />
            : <Navigate to="/trainer" />
        }
      />

      <Route
        path="/trainer/monitoring"
        element={
          (user?.role === 'TRAINER' || user?.role === 'ADMIN')
            ? <TrainerMonitoringDashboard user={user} />
            : <Navigate to="/trainer" />
        }
      />

      <Route
        path="/test/:testId"
        element={
          user?.role === 'PARTICIPANT'
            ? <TestPage user={user} />
            : <Navigate to="/login" replace />
        }
      />

      <Route
        path="/test/:testId/result/:attemptId"
        element={
          user?.role === 'PARTICIPANT'
            ? <TestResultPage />
            : <Navigate to="/login" replace />
        }
      />

      <Route
        path="/trainer/proctor/:quizId/report"
        element={
          (user?.role === 'TRAINER' || user?.role === 'ADMIN')
            ? <TrainerMonitoringReportPage />
            : <Navigate to="/trainer" />
        }
      />

      <Route
        path="/trainer/quiz/:quizId"
        element={
          (user?.role === 'TRAINER' || user?.role === 'ADMIN')
            ? <TrainerQuizDetails user={user} onLogout={onLogout} />
            : <Navigate to="/trainer" />
        }
      />

      <Route
        path="/trainer/coding/:assessmentId"
        element={
          (user?.role === 'TRAINER' || user?.role === 'ADMIN')
            ? <TrainerCodingAssessmentDetails user={user} onLogout={onLogout} />
            : <Navigate to="/trainer" />
        }
      />

      <Route
        path="/trainings/:trainingId/coding/:assessmentId/attempt"
        element={
          user?.role === 'PARTICIPANT' ? (
            <ParticipantCodingAttemptPage user={user} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      <Route
        path="/trainings/:trainingId/coding/:assessmentId/result"
        element={
          user?.role === 'PARTICIPANT' ? (
            <Layout user={user} onLogout={onLogout} activeTab="myEnrollments" onTabChange={() => window.location.href = '/participant'}>
              <CodingAssessmentResultPage user={user} />
            </Layout>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      <Route
        path="/my-profile"
        element={
          user ? (
            <DashboardWrapper component={ProfilePage} user={user} onLogout={onLogout} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      {/* Interview Module Routes */}
      <Route
        path="/interviews"
        element={
          user ? (
            <DashboardWrapper component={InterviewDashboard} user={user} onLogout={onLogout} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/interview/schedule"
        element={
          (user?.role === 'ADMIN' || user?.role === 'TRAINER') ? (
            <DashboardWrapper component={ScheduleInterview} user={user} onLogout={onLogout} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/interview/:id/room"
        element={
          user ? (
            <DashboardWrapper component={InterviewRoom} user={user} onLogout={onLogout} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/interview/:id/join"
        element={
          user ? (
            <DashboardWrapper component={InterviewRoom} user={user} onLogout={onLogout} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/interview/:id"
        element={
          user ? (
            <DashboardWrapper component={InterviewEvaluation} user={user} onLogout={onLogout} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/mobile-join/:token"
        element={<MobileJoin />}
      />
      <Route
        path="/interview/mobile/:token"
        element={<MobileJoin />}
      />

      {/* Assessment Verification Mobile Pairing (Quiz & Coding) */}
      <Route
        path="/assessment/mobile-join/:token"
        element={<AssessmentMobileJoin />}
      />
      <Route
        path="/assessment/mobile/:token"
        element={<AssessmentMobileJoin />}
      />

      <Route path="*" element={<Navigate to="/login" />} />
    </Routes>
  )
}

export default App
