import React, { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { FileText, Loader2 } from 'lucide-react'
import AIQuizList from '../components/AIQuizList'
import QuizTaking from '../components/QuizTaking'
import { useToast } from '../components/Toast'
import { API_BASE as API } from '../api/api'

import OverviewSection from '../components/student/overview/OverviewSection'
import AvailableCourses from '../components/student/dashboard/AvailableCourses'
import MyEnrollments from '../components/student/dashboard/MyEnrollments'
import FeedbackSection from '../components/student/dashboard/FeedbackSection'
import MyFeedbacks from '../components/student/dashboard/MyFeedbacks'
import LeaderboardSection from '../components/student/leaderboard/LeaderboardSection'
import AchievementsSection from '../components/student/achievements/AchievementsSection'
import LessonsSection from '../components/student/lessons/LessonsSection'
import ProfileSection from '../components/student/profile/ProfileSection'
import ParticipantCourses from './ParticipantCourses'
import { useContinueLearning } from '../hooks/useContinueLearning'
import { Button, Badge, Table, PageHeader, EmptyState, StatCard, ProgressBar } from '../components/ui'
import { useSocketEvent } from '../hooks/useSocket'

const fadeVariant = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -8 },
}

function ParticipantDashboard({ user, onLogout, activeTab, onTabChange }) {
  const { success, error: showError } = useToast()
  const tab = activeTab || 'overview'
  const handleTabChange = (next) => onTabChange?.(next)

  const auth = useCallback(
    () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${user?.token || ''}` }),
    [user]
  )

  const handleResponse = useCallback(async (res) => {
    if (res.status === 401) {
      onLogout?.()
      throw new Error('Session expired. Please log in again.')
    }
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Request failed')
    return data
  }, [onLogout])

  const [trainings, setTrainings] = useState([])
  const [enrollments, setEnrollments] = useState([])
  const [feedbacks, setFeedbacks] = useState([])
  const [quizzes, setQuizzes] = useState([])
  const [loading, setLoading] = useState(false)
  const [participantReport, setParticipantReport] = useState(null)

  const fetchParticipantReport = useCallback(async () => {
    try {
      const r = await fetch(`${API}/reports/participant`, { headers: auth() })
      const d = await handleResponse(r)
      if (d.success) {
        setParticipantReport(d.data)
      }
    } catch (e) {
      console.error('fetchParticipantReport error:', e.message)
    }
  }, [auth, handleResponse])
  const { track } = useContinueLearning()

  const fetchTrainings = useCallback(async () => {
    try {
      const r = await fetch(`${API}/trainings`, { headers: auth() })
      const d = await handleResponse(r)
      setTrainings(Array.isArray(d) ? d : (d.trainings || []))
    } catch (e) {
      console.error('fetchTrainings error:', e.message)
    }
  }, [auth, handleResponse])

  const fetchEnrollments = useCallback(async () => {
    try {
      const r = await fetch(`${API}/participant/enrollments`, { headers: auth() })
      const d = await handleResponse(r)
      setEnrollments(d.enrollments || [])
    } catch (e) {
      console.error('fetchEnrollments error:', e.message)
    }
  }, [auth, handleResponse])

  const fetchFeedbacks = useCallback(async () => {
    try {
      const r = await fetch(`${API}/participant/feedbacks`, { headers: auth() })
      const d = await handleResponse(r)
      setFeedbacks(d.feedbacks || [])
    } catch (e) {
      console.error('fetchFeedbacks error:', e.message)
    }
  }, [auth, handleResponse])

  const fetchQuizzes = useCallback(async () => {
    try {
      const r = await fetch(`${API}/ai-quiz/participant/quizzes`, { headers: auth() })
      const d = await handleResponse(r)
      setQuizzes(d.quizzes || [])
    } catch (e) {
      console.error('fetchQuizzes error:', e.message)
    }
  }, [auth, handleResponse])

  useSocketEvent('quiz:published', () => {
    fetchQuizzes()
  }, [fetchQuizzes])

  useSocketEvent('quiz:results:published', () => {
    fetchQuizzes()
  }, [fetchQuizzes])

  const fetchAll = useCallback(() => {
    fetchTrainings(); fetchEnrollments(); fetchFeedbacks(); fetchQuizzes(); fetchParticipantReport()
  }, [fetchTrainings, fetchEnrollments, fetchFeedbacks, fetchQuizzes, fetchParticipantReport])

  useEffect(() => {
    if (user && user.token) {
      fetchAll()
    }
  }, [fetchAll, user])

  useEffect(() => {
    if (tab === 'reports' || tab === 'certificates') {
      fetchParticipantReport()
    }
  }, [tab, fetchParticipantReport])

  if (!user || !user.token) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--neutral-50)',
        fontFamily: 'var(--font-primary)'
      }}>
        <Loader2 style={{ animation: 'spin 1s linear infinite', color: 'var(--brand-primary)' }} size={36} />
        <span style={{ marginTop: '12px', fontSize: '13px', color: 'var(--neutral-500)' }}>Verifying session...</span>
      </div>
    )
  }

  const handleEnroll = async (trainingId) => {
    setLoading(true)
    try {
      const r = await fetch(`${API}/participant/enroll`, {
        method: 'POST', headers: auth(), body: JSON.stringify({ trainingId }),
      })
      const d = await handleResponse(r)
      success('Enrolled successfully!')
      const t = trainings.find((x) => x.id === trainingId)
      if (t) track({ type: 'course', id: trainingId, title: t.title, subtitle: t.trainerName })
      fetchAll()
    } catch (e) { showError(e.message) }
    finally { setLoading(false) }
  }

  const handleCancelEnrollment = async (trainingId) => {
    setLoading(true)
    try {
      const r = await fetch(`${API}/participant/enroll/${trainingId}`, {
        method: 'DELETE', headers: auth(),
      })
      const d = await handleResponse(r)
      success('Course unenrolled.')
      fetchAll()
    } catch (e) { showError(e.message) }
    finally { setLoading(false) }
  }

  const fetchSurveyQuestions = async (trainingId) => {
    try {
      const r = await fetch(`${API}/survey/${trainingId}`, { headers: auth() })
      const d = await handleResponse(r)
      return d.questions || []
    } catch (e) {
      console.error('fetchSurveyQuestions error:', e.message)
      return []
    }
  }

  const handleSubmitFeedback = async ({ enrollment, fbForm, surveyAnswers }) => {
    setLoading(true)
    try {
      const payload = { trainingId: enrollment.trainingId, ...fbForm, surveyAnswers }
      const r = await fetch(`${API}/feedback`, {
        method: 'POST', headers: auth(), body: JSON.stringify(payload),
      })
      const d = await handleResponse(r)
      success(d.message || 'Feedback submitted successfully!')
      fetchFeedbacks()
    } catch (e) { showError(e.message); throw e }
    finally { setLoading(false) }
  }

  const handleStartQuiz = (attemptId, quiz) => {
    if (quiz?.id) track({ type: 'quiz', id: quiz.id, title: quiz.title })
  }
  const handleQuizComplete = (result) => {
    if (result?.percentage != null) success(`Quiz submitted! Score: ${result.percentage.toFixed(1)}%`)
    fetchQuizzes()
  }

  const handleResume = (item) => {
    if (item.type === 'course') handleTabChange('available')
    else if (item.type === 'quiz') handleTabChange('ai-quizzes')
    else if (item.type === 'lesson') handleTabChange('lessons')
  }

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '32px', minHeight: '100vh', fontFamily: 'var(--font-primary)' }}>
      {tab === 'overview' && (
        <motion.div key="overview" {...fadeVariant} transition={{ duration: 0.25 }}>
          <OverviewSection
            user={user}
            trainings={trainings}
            enrollments={enrollments}
            quizzes={quizzes}
            onGoToCourses={() => handleTabChange('available')}
            onResume={handleResume}
            onClickCourse={() => handleTabChange('myEnrollments')}
            onClickQuiz={() => handleTabChange('ai-quizzes')}
          />
        </motion.div>
      )}

      {tab === 'available' && (
        <motion.div key="available" {...fadeVariant} transition={{ duration: 0.25 }}>
          <AvailableCourses
            trainings={trainings}
            enrollments={enrollments}
            loading={loading}
            onEnroll={handleEnroll}
          />
        </motion.div>
      )}

      {tab === 'myEnrollments' && (
        <motion.div key="myEnrollments" {...fadeVariant} transition={{ duration: 0.25 }}>
          <ParticipantCourses user={user} />
        </motion.div>
      )}

      {tab === 'lessons' && (
        <motion.div key="lessons" {...fadeVariant} transition={{ duration: 0.25 }}>
          <LessonsSection />
        </motion.div>
      )}

      {tab === 'ai-quizzes' && (
        <motion.div key="ai-quizzes" {...fadeVariant} transition={{ duration: 0.25 }}>
          <AIQuizList user={user} onStartQuiz={handleStartQuiz} />
        </motion.div>
      )}

      {tab === 'leaderboard' && (
        <motion.div key="leaderboard" {...fadeVariant} transition={{ duration: 0.25 }}>
          <LeaderboardSection
            enrollments={enrollments}
            quizzes={quizzes}
            currentUserId={user?.id}
          />
        </motion.div>
      )}

      {tab === 'achievements' && (
        <motion.div key="achievements" {...fadeVariant} transition={{ duration: 0.25 }}>
          <AchievementsSection user={user} enrollmentsCount={enrollments.length} />
        </motion.div>
      )}

      {tab === 'reports' && (
        <motion.div key="reports" {...fadeVariant} transition={{ duration: 0.25 }}>
          <div className="enterprise-card">
            <div className="enterprise-card__header">
              <div>
                <h2 className="enterprise-card__title">My Learning Reports</h2>
                <p style={{ fontSize: '13px', color: 'var(--neutral-500)', marginTop: '4px' }}>Detailed overview of your academic progress, quiz history, and assessment scores.</p>
              </div>
              <button onClick={fetchParticipantReport} className="btn-enterprise btn-enterprise--secondary" style={{ fontSize: '13px' }}>
                Refresh Report
              </button>
            </div>
            <div className="enterprise-card__body">
              {!participantReport ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '192px' }}>
                  <div style={{ textAlign: 'center' }}>
                    <FileText size={32} style={{ color: 'var(--neutral-300)', margin: '0 auto 12px' }} />
                    <p style={{ fontSize: '13px', color: 'var(--neutral-500)' }}>Loading reports...</p>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                  {/* Course Progress */}
                  <div>
                    <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--neutral-700)', marginBottom: '16px' }}>Course & Training Progress</h3>
                    {(!participantReport.progress || participantReport.progress.length === 0) ? (
                      <p style={{ color: 'var(--neutral-500)', fontSize: '13px' }}>You are not enrolled in any courses or training programs yet.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {participantReport.progress.map((p, idx) => (
                          <div key={idx} style={{ padding: '16px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--neutral-150)', background: 'var(--neutral-50)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--neutral-800)' }}>{p.title}</span>
                                <span className="badge badge--primary" style={{ fontSize: '10px' }}>{p.type}</span>
                              </div>
                              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--brand-primary)' }}>{p.progressPercent}%</span>
                            </div>
                            <div style={{ width: '100%', height: '6px', background: 'var(--neutral-150)', borderRadius: '3px', overflow: 'hidden', marginBottom: '8px' }}>
                              <div style={{ width: `${p.progressPercent}%`, height: '100%', background: 'var(--brand-primary)', borderRadius: '3px', transition: 'width 600ms ease' }} />
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--neutral-500)' }}>
                              Completed Lessons: {p.completedLessons} / {p.totalLessons}
                              {p.certificateAvailable && (
                                <span style={{ marginLeft: '16px', color: '#10B981', fontWeight: 600 }}>
                                  ✓ Certificate Available ({p.certificateCode})
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Quiz History */}
                  <div>
                    <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--neutral-700)', marginBottom: '16px' }}>Quiz History</h3>
                    {(!participantReport.quizHistory || participantReport.quizHistory.length === 0) ? (
                      <p style={{ color: 'var(--neutral-500)', fontSize: '13px' }}>No quiz attempts recorded yet.</p>
                    ) : (
                      <div className="enterprise-table-wrapper">
                        <table className="enterprise-table">
                          <thead>
                            <tr>
                              <th>Quiz Title</th>
                              <th style={{ textAlign: 'center' }}>Score</th>
                              <th>Status</th>
                              <th>Date</th>
                            </tr>
                          </thead>
                          <tbody>
                            {participantReport.quizHistory.map((q, idx) => (
                              <tr key={idx}>
                                <td style={{ fontWeight: 500, color: 'var(--neutral-800)' }}>{q.quizTitle}</td>
                                <td style={{ textAlign: 'center' }}>
                                  {q.isPublished ? (
                                    <span className="badge badge--success" style={{ fontWeight: 600 }}>{q.score}%</span>
                                  ) : (
                                    <span className="badge">—</span>
                                  )}
                                </td>
                                <td>
                                  <span className={`badge ${q.isPublished ? 'badge--success' : ''}`}>
                                    {q.isPublished ? 'Published' : 'Pending'}
                                  </span>
                                </td>
                                <td style={{ color: 'var(--neutral-500)', fontSize: '12px' }}>
                                  {new Date(q.date).toLocaleDateString()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Assessment History */}
                  <div>
                    <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--neutral-700)', marginBottom: '16px' }}>Assessment History</h3>
                    {(!participantReport.assessmentHistory || participantReport.assessmentHistory.length === 0) ? (
                      <p style={{ color: 'var(--neutral-500)', fontSize: '13px' }}>No assessment submissions recorded yet.</p>
                    ) : (
                      <div className="enterprise-table-wrapper">
                        <table className="enterprise-table">
                          <thead>
                            <tr>
                              <th>Assessment</th>
                              <th style={{ textAlign: 'center' }}>Score</th>
                              <th>Status</th>
                              <th>Feedback</th>
                              <th>Date</th>
                            </tr>
                          </thead>
                          <tbody>
                            {participantReport.assessmentHistory.map((ah, idx) => (
                              <tr key={idx}>
                                <td style={{ fontWeight: 500, color: 'var(--neutral-800)' }}>{ah.assessmentTitle}</td>
                                <td style={{ textAlign: 'center' }}>
                                  {ah.score !== null ? (
                                    <span className="badge badge--primary" style={{ fontWeight: 600 }}>
                                      {ah.score} / {ah.maxScore}
                                    </span>
                                  ) : (
                                    <span className="badge">Pending Grade</span>
                                  )}
                                </td>
                                <td>
                                  <span className={`badge ${ah.status === 'PUBLISHED' || ah.status === 'REVIEWED' ? 'badge--success' : 'badge--primary'}`}>
                                    {ah.status}
                                  </span>
                                </td>
                                <td style={{ fontSize: '12px', color: 'var(--neutral-500)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {ah.feedback || '—'}
                                </td>
                                <td style={{ color: 'var(--neutral-500)', fontSize: '12px' }}>
                                  {new Date(ah.date).toLocaleDateString()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {tab === 'certificates' && (
        <motion.div key="certificates" {...fadeVariant} transition={{ duration: 0.25 }}>
          <div className="enterprise-card">
            <div className="enterprise-card__header">
              <div>
                <h2 className="enterprise-card__title">My Certificates</h2>
                <p style={{ fontSize: '13px', color: 'var(--neutral-500)', marginTop: '4px' }}>View and download your official completion certificates.</p>
              </div>
              <button onClick={fetchParticipantReport} className="btn-enterprise btn-enterprise--secondary" style={{ fontSize: '13px' }}>
                Refresh
              </button>
            </div>
            <div className="enterprise-card__body">
              {!participantReport ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '192px' }}>
                  <div style={{ textAlign: 'center' }}>
                    <FileText size={32} style={{ color: 'var(--neutral-300)', margin: '0 auto 12px' }} />
                    <p style={{ fontSize: '13px', color: 'var(--neutral-500)' }}>Loading certificates...</p>
                  </div>
                </div>
              ) : (!participantReport.certificates || participantReport.certificates.length === 0) ? (
                <EmptyState
                  icon={FileText}
                  title="No certificates earned yet"
                  description="Complete 100% of your course requirements, quizzes, and assessments to earn your certificate!"
                />
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '24px' }}>
                  {participantReport.certificates.map((cert, idx) => (
                    <div
                      key={idx}
                      style={{
                        border: '2px solid rgba(37, 99, 235, 0.2)',
                        borderRadius: 'var(--radius-xl)',
                        padding: '24px',
                        background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.03) 0%, var(--neutral-0) 100%)',
                        position: 'relative',
                        overflow: 'hidden'
                      }}
                    >
                      <div style={{ textAlign: 'center', padding: '20px', border: '1px solid rgba(37, 99, 235, 0.15)', borderRadius: 'var(--radius-lg)' }}>
                        <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--brand-primary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>
                          Wave Init LMS Certificate
                        </div>
                        <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--neutral-900)', fontFamily: 'var(--font-display)', marginBottom: '8px' }}>
                          Certificate of Completion
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--neutral-400)', marginBottom: '12px' }}>
                          This is proudly presented to
                        </div>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--neutral-900)', borderBottom: '2px solid var(--brand-primary)', display: 'inline-block', paddingBottom: '4px', marginBottom: '12px' }}>
                          {user.name}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--neutral-400)', marginBottom: '8px' }}>
                          for successfully completing all requirements for
                        </div>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--neutral-800)', marginBottom: '16px' }}>
                          {cert.title}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--neutral-400)', borderTop: '1px solid var(--neutral-100)', paddingTop: '12px' }}>
                          <span><strong>Issued:</strong> {new Date(cert.issuedAt).toLocaleDateString()}</span>
                          <span><strong>Verify:</strong> {cert.certificateCode}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          const printContent = `
                            <html>
                              <head>
                                <title>Certificate - ${cert.title}</title>
                                <style>
                                  body { font-family: 'Poppins', sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #fff; color: #000; }
                                  .cert-container { border: 15px double #0D9488; padding: 50px; width: 650px; text-align: center; border-radius: 4px; box-shadow: 0 0 20px rgba(0,0,0,0.05); }
                                  .title { font-size: 32px; font-weight: 700; color: #1e1b4b; margin-bottom: 10px; }
                                  .subtitle { font-size: 16px; color: #4b5563; margin-bottom: 30px; text-transform: uppercase; letter-spacing: 2px; }
                                  .presented { font-size: 14px; font-style: italic; color: #6b7280; margin-bottom: 20px; }
                                  .name { font-size: 28px; font-weight: 700; color: #0D9488; border-bottom: 2px solid #e5e7eb; display: inline-block; padding-bottom: 5px; margin-bottom: 30px; }
                                  .reason { font-size: 14px; color: #4b5563; line-height: 1.6; margin-bottom: 40px; }
                                  .course-title { font-size: 20px; font-weight: 600; color: #1f2937; }
                                  .footer { display: flex; justify-content: space-between; font-size: 12px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 20px; }
                                </style>
                              </head>
                              <body>
                                <div class="cert-container">
                                  <div class="subtitle">Wave Init LMS Certificate</div>
                                  <div class="title">Certificate of Completion</div>
                                  <div class="presented">This is proudly presented to</div>
                                  <div class="name">${user.name}</div>
                                  <div class="reason">for successfully completing all academic requirements, lessons, quizzes, and assessments for the course:</div>
                                  <div class="reason"><span class="course-title">${cert.title}</span></div>
                                  <div class="footer">
                                    <div><strong>Date Issued:</strong> ${new Date(cert.issuedAt).toLocaleDateString()}</div>
                                    <div><strong>Verification Code:</strong> ${cert.certificateCode}</div>
                                  </div>
                                </div>
                                <script>window.onload = function() { window.print(); }</script>
                              </body>
                            </html>
                          `;
                          const win = window.open('', '_blank');
                          win.document.write(printContent);
                          win.document.close();
                        }}
                        className="btn-enterprise btn-enterprise--primary"
                        style={{ width: '100%', marginTop: '16px' }}
                      >
                        Print Certificate
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {tab === 'feedback' && (
        <motion.div key="feedback" {...fadeVariant} transition={{ duration: 0.25 }}>
          <FeedbackSection
            enrollments={enrollments}
            feedbacks={feedbacks}
            loading={loading}
            onSubmit={handleSubmitFeedback}
            fetchQuestions={fetchSurveyQuestions}
          />
        </motion.div>
      )}

      {tab === 'myFeedbacks' && (
        <motion.div key="myFeedbacks" {...fadeVariant} transition={{ duration: 0.25 }}>
          <MyFeedbacks feedbacks={feedbacks} loading={loading} />
        </motion.div>
      )}

      {tab === 'profile' && (
        <motion.div key="profile" {...fadeVariant} transition={{ duration: 0.25 }}>
          <ProfileSection
            user={user}
            enrollments={enrollments}
            quizzes={quizzes}
            onResume={handleResume}
            onTabChange={handleTabChange}
          />
        </motion.div>
      )}
    </div>
  )
}

export default ParticipantDashboard
