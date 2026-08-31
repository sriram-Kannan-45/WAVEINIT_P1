import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Trophy, ArrowLeft, RefreshCw, Search, Users, Award, BookOpen,
  CheckCircle2, Clock, HelpCircle, ChevronRight, Sparkles, Filter,
  TrendingUp, AlertCircle, BarChart3, Star, Crown, ShieldAlert
} from 'lucide-react'
import { API } from '../api/api'
import { getAuthHeaders, fetchWithTimeout } from '../api/request'
import UserAvatar, { getTwoLetterInitials } from '../components/common/UserAvatar'
import { useToast } from '../components/Toast'
import Pagination from '../components/common/Pagination'

export default function TrainingLeaderboard({ user, onLogout }) {
  const { trainingId, id } = useParams()
  const currentTrainingId = trainingId || id
  const navigate = useNavigate()
  const { error: showError, success: showSuccess } = useToast()

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [training, setTraining] = useState(null)
  const [summary, setSummary] = useState(null)
  const [leaderboard, setLeaderboard] = useState([])
  const [errorMsg, setErrorMsg] = useState(null)

  // Filters & Search
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [sortBy, setSortBy] = useState('rank_asc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const fetchLeaderboardData = useCallback(async (isManualRefresh = false, signal = null) => {
    if (!currentTrainingId) {
      setErrorMsg('No Training ID provided')
      setLoading(false)
      return
    }

    try {
      if (isManualRefresh) setRefreshing(true)
      else setLoading(true)
      setErrorMsg(null)

      const endpoint = API.TRAININGS.LEADERBOARD
        ? API.TRAININGS.LEADERBOARD(currentTrainingId)
        : `/api/trainings/${currentTrainingId}/leaderboard`

      const res = await fetchWithTimeout(endpoint, { headers: getAuthHeaders(user), signal }, 12000)
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(data.error || 'Failed to load leaderboard')
      }

      if (data.success) {
        setTraining(data.training || null)
        setSummary(data.summary || null)
        setLeaderboard(Array.isArray(data.leaderboard) ? data.leaderboard : [])
        if (isManualRefresh) {
          showSuccess?.('Leaderboard refreshed successfully')
        }
      } else {
        throw new Error(data.error || 'Failed to load leaderboard')
      }
    } catch (err) {
      if (err.name === 'AbortError') return
      console.error('Leaderboard error:', err.message)
      setErrorMsg(err.message || 'An error occurred while loading the leaderboard')
      showError?.(err.message || 'Failed to load leaderboard')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [currentTrainingId, user?.token, showError, showSuccess])

  useEffect(() => {
    const controller = new AbortController()
    fetchLeaderboardData(false, controller.signal)
    return () => controller.abort()
  }, [fetchLeaderboardData])

  // Filtered & Sorted participants
  const filteredParticipants = useMemo(() => {
    let list = [...leaderboard]

    // 1. Status Filter
    if (statusFilter !== 'ALL') {
      list = list.filter(p => p.status === statusFilter)
    }

    // 2. Search Query
    if (search.trim()) {
      const q = search.toLowerCase().trim()
      list = list.filter(p => {
        const name = (p.name || '').toLowerCase()
        const email = (p.email || '').toLowerCase()
        const empId = (p.employeeId || '').toLowerCase()
        const dept = (p.department || '').toLowerCase()
        return name.includes(q) || email.includes(q) || empId.includes(q) || dept.includes(q)
      })
    }

    // 3. Sorting
    list.sort((a, b) => {
      if (sortBy === 'rank_asc') {
        if (a.rank == null && b.rank == null) return (a.name || '').localeCompare(b.name || '')
        if (a.rank == null) return 1
        if (b.rank == null) return -1
        return a.rank - b.rank
      }
      if (sortBy === 'score_desc') {
        return (b.score || 0) - (a.score || 0)
      }
      if (sortBy === 'percentage_desc') {
        return (b.percentage || 0) - (a.percentage || 0)
      }
      if (sortBy === 'percentage_asc') {
        if (a.percentage == null && b.percentage == null) return 0
        if (a.percentage == null) return 1
        if (b.percentage == null) return -1
        return a.percentage - b.percentage
      }
      if (sortBy === 'name_asc') {
        return (a.name || '').localeCompare(b.name || '')
      }
      if (sortBy === 'name_desc') {
        return (b.name || '').localeCompare(a.name || '')
      }
      return 0
    })

    return list
  }, [leaderboard, statusFilter, search, sortBy])

  useEffect(() => {
    setPage(1)
  }, [statusFilter, search, sortBy])

  const pagedParticipants = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredParticipants.slice(start, start + pageSize)
  }, [filteredParticipants, page, pageSize])

  // Top 3 for Podium (only from attempted with valid rank)
  const topThree = useMemo(() => {
    const attemptedOnly = leaderboard.filter(p => p.rank != null && p.rank > 0)
    return attemptedOnly.slice(0, 3)
  }, [leaderboard])

  const handleBack = () => {
    if (window.history.length > 2) {
      navigate(-1)
    } else {
      if (user?.role === 'ADMIN') navigate('/admin')
      else if (user?.role === 'TRAINER') navigate('/trainer')
      else navigate('/participant')
    }
  }

  // Helper for Rank Icon/Badge
  const renderRankBadge = (rank) => {
    if (rank === 1) {
      return (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', background: '#FEF3C7', color: '#B45309', border: '1.5px solid #FCD34D', borderRadius: 9999, fontWeight: 800, fontSize: 12 }}>
          <span>Rank #1</span>
        </div>
      )
    }
    if (rank === 2) {
      return (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', background: '#F1F5F9', color: '#475569', border: '1.5px solid #CBD5E1', borderRadius: 9999, fontWeight: 800, fontSize: 12 }}>
          <span>Rank #2</span>
        </div>
      )
    }
    if (rank === 3) {
      return (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', background: '#FFF7ED', color: '#C2410C', border: '1.5px solid #FDBA74', borderRadius: 9999, fontWeight: 800, fontSize: 12 }}>
          <span>Rank #3</span>
        </div>
      )
    }
    if (rank != null) {
      return (
        <span style={{ fontWeight: 700, fontSize: 13.5, color: '#334155' }}>
          #{rank}
        </span>
      )
    }
    return <span style={{ color: '#94A3B8', fontWeight: 600 }}>—</span>
  }

  const renderStatusBadge = (status) => {
    if (status === 'COMPLETED') {
      return (
        <span className="reg-admin-status" style={{ background: '#DCFCE7', color: '#15803D', border: '1px solid #86EFAC', fontWeight: 600, fontSize: 12 }}>
          Completed
        </span>
      )
    }
    if (status === 'IN_PROGRESS') {
      return (
        <span className="reg-admin-status" style={{ background: '#DBEAFE', color: '#1D4ED8', border: '1px solid #93C5FD', fontWeight: 600, fontSize: 12 }}>
          In Progress
        </span>
      )
    }
    return (
      <span className="reg-admin-status" style={{ background: '#F1F5F9', color: '#64748B', border: '1px solid #CBD5E1', fontWeight: 500, fontSize: 12 }}>
        Not Attempted
      </span>
    )
  }

  return (
    <div className="tmt-container" style={{ padding: '16px 24px 24px', minHeight: 'auto', background: '#F8FAFC', fontFamily: "'Poppins', sans-serif" }}>
      
      {/* ── TOP BREADCRUMB & BACK ROW ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={handleBack}
            className="reg-admin-btn reg-admin-btn--secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: '#FFFFFF', border: '1.5px solid #E2E8F0', borderRadius: 10 }}
          >
            <ArrowLeft size={16} color="#16A34A" /> Back to Trainings
          </button>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#64748B', marginLeft: 8 }}>
            <span>Trainings</span>
            <ChevronRight size={14} color="#94A3B8" />
            <span style={{ fontWeight: 600, color: '#0F172A' }}>{training?.title || `Training #${currentTrainingId}`}</span>
            <ChevronRight size={14} color="#94A3B8" />
            <span style={{ fontWeight: 600, color: '#16A34A' }}>Leaderboard</span>
          </div>
        </div>

        <button
          onClick={() => fetchLeaderboardData(true)}
          disabled={loading || refreshing}
          className="reg-admin-btn reg-admin-btn--secondary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: '#FFFFFF', border: '1.5px solid #E2E8F0', borderRadius: 10 }}
        >
          <RefreshCw size={14} className={refreshing ? 'bulk-spin' : ''} color="#16A34A" />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* ── ERROR STATE ── */}
      {errorMsg && !loading && (
        <div style={{ padding: '32px', background: '#FEF2F2', border: '1.5px solid #FCA5A5', borderRadius: 16, textAlign: 'center', margin: '20px 0' }}>
          <AlertCircle size={40} color="#DC2626" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: 18, fontWeight: 700, color: '#991B1B', marginBottom: 6 }}>Unable to load leaderboard</h3>
          <p style={{ fontSize: 14, color: '#B91C1C', maxWidth: 480, margin: '0 auto 16px' }}>{errorMsg}</p>
          <button
            onClick={() => fetchLeaderboardData(true)}
            className="reg-admin-btn reg-admin-btn--primary"
            style={{ padding: '8px 20px', fontSize: 13, background: '#16A34A', border: 'none', color: '#fff', borderRadius: 8, cursor: 'pointer' }}
          >
            Try Again
          </button>
        </div>
      )}

      {/* ── LOADING SKELETON ── */}
      {loading && !errorMsg && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ height: 110, background: '#FFFFFF', borderRadius: 16, border: '1px solid #E2E8F0', padding: 24, display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: '#F1F5F9' }} />
            <div style={{ flex: 1 }}>
              <div style={{ width: 220, height: 24, background: '#F1F5F9', borderRadius: 6, marginBottom: 8 }} />
              <div style={{ width: 340, height: 14, background: '#F8FAFC', borderRadius: 4 }} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            {[1, 2, 3, 4].map(n => (
              <div key={n} style={{ height: 90, background: '#FFFFFF', borderRadius: 14, border: '1px solid #E2E8F0' }} />
            ))}
          </div>
          <div style={{ height: 280, background: '#FFFFFF', borderRadius: 16, border: '1px solid #E2E8F0' }} />
        </div>
      )}

      {/* ── MAIN LEADERBOARD CONTENT ── */}
      {!loading && !errorMsg && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
          
          {/* 1. Header Banner */}
          <div className="reg-admin-header" style={{ background: '#FFFFFF', padding: '24px 28px', borderRadius: 16, border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 18 }}>
            <div className="reg-admin-header-icon" style={{ background: '#FFFFFF', border: '1.5px solid #16A34A', width: 52, height: 52, borderRadius: 14, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <Trophy size={26} color="#16A34A" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}>
                  Leaderboard
                </h1>
                <span style={{ padding: '2px 10px', background: '#DCFCE7', color: '#15803D', border: '1px solid #86EFAC', borderRadius: 9999, fontSize: 12, fontWeight: 700 }}>
                  {training?.title || 'Training'}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: '#64748B', fontWeight: 500 }}>
                Rank participants for <strong style={{ color: '#0F172A' }}>{training?.title}</strong> · Performance and official rankings
              </p>
            </div>
          </div>

          {/* 2. Summary KPI Metric Cards (4 Cards) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
            {/* Card 1: Training & Trainer */}
            <div style={{ background: '#FFFFFF', padding: '18px 20px', borderRadius: 14, border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: '#FFFFFF', border: '1.5px solid #16A34A', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <BookOpen size={20} color="#16A34A" />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Trainer</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {training?.trainerName || 'Unassigned'}
                </div>
                <div style={{ fontSize: 11, color: '#94A3B8' }}>{training?.totalAssessments || 0} Assessments Total</div>
              </div>
            </div>

            {/* Card 2: Participants */}
            <div style={{ background: '#FFFFFF', padding: '18px 20px', borderRadius: 14, border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: '#FFFFFF', border: '1.5px solid #2563EB', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <Users size={20} color="#2563EB" />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Enrolled</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', lineHeight: 1.1 }}>
                  {summary?.totalParticipants ?? 0}
                </div>
                <div style={{ fontSize: 11, color: '#94A3B8' }}>Enrolled students</div>
              </div>
            </div>

            {/* Card 3: Completed */}
            <div style={{ background: '#FFFFFF', padding: '18px 20px', borderRadius: 14, border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: '#FFFFFF', border: '1.5px solid #16A34A', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <CheckCircle2 size={20} color="#16A34A" />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Completed</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#16A34A', lineHeight: 1.1 }}>
                  {summary?.completedParticipants ?? 0}
                </div>
                <div style={{ fontSize: 11, color: '#94A3B8' }}>Finished all assessments</div>
              </div>
            </div>

            {/* Card 4: Average Score */}
            <div style={{ background: '#FFFFFF', padding: '18px 20px', borderRadius: 14, border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: '#FFFFFF', border: '1.5px solid #D97706', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <Award size={20} color="#D97706" />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Average Score</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#D97706', lineHeight: 1.1 }}>
                  {summary?.averageScore != null ? `${summary.averageScore}%` : '0%'}
                </div>
                <div style={{ fontSize: 11, color: '#94A3B8' }}>
                  Top score: {summary?.highestScore != null ? `${summary.highestScore}%` : '—'}
                </div>
              </div>
            </div>
          </div>

          {/* 3. TOP 3 PODIUM SECTION (Only shown if at least 1 attempted participant exists) */}
          {topThree.length > 0 && (
            <div style={{ background: '#FFFFFF', borderRadius: 16, border: '1px solid #E2E8F0', padding: '24px 28px', marginBottom: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Crown size={20} color="#D97706" />
                  <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0F172A' }}>Top Performers</h2>
                </div>
                <span style={{ fontSize: 12, color: '#64748B', fontWeight: 500 }}>
                  Rankings based on overall assessment scores
                </span>
              </div>

              {/* Podium Grid (Left: 2nd, Center: 1st, Right: 3rd) */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 18, alignItems: 'stretch' }}>
                
                {/* Rank 2 (if exists) */}
                {topThree[1] ? (
                  <motion.div
                    whileHover={{ y: -3 }}
                    style={{ background: '#F8FAFC', border: '1.5px solid #CBD5E1', borderRadius: 14, padding: '20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}
                  >
                    <div style={{ marginBottom: 12 }}>
                      <UserAvatar src={topThree[1].avatar || topThree[1].profilePic || topThree[1].profileImage} name={topThree[1].name} size={68} fontSize={22} rank={2} />
                    </div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', background: '#F1F5F9', color: '#475569', border: '1px solid #CBD5E1', borderRadius: 9999, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                      Rank #2 · 2nd Place
                    </div>
                    <h3 style={{ margin: '0 0 4px 0', fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
                      {topThree[1].name}
                    </h3>
                    <div style={{ fontSize: 12, color: '#64748B', marginBottom: 12 }}>
                      {topThree[1].email || (topThree[1].employeeId ? `ID: ${topThree[1].employeeId}` : 'Participant')}
                    </div>
                    
                    <div style={{ width: '100%', borderTop: '1px solid #E2E8F0', paddingTop: 12, marginTop: 'auto', display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: '#16A34A' }}>
                          {topThree[1].percentage != null ? `${topThree[1].percentage}%` : '—'}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748B' }}>Overall Score</div>
                      </div>
                      <div style={{ width: 1, height: 24, background: '#E2E8F0' }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>
                          {topThree[1].completedAssessments}/{topThree[1].totalAssessments}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748B' }}>Completed</div>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <div style={{ background: '#FAFAFA', border: '1px dashed #E2E8F0', borderRadius: 14, padding: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontSize: 13 }}>
                    No 2nd place yet
                  </div>
                )}

                {/* Rank 1 (Center - Elevated) */}
                {topThree[0] && (
                  <motion.div
                    whileHover={{ y: -4 }}
                    style={{ background: '#FEFDF8', border: '2px solid #F59E0B', borderRadius: 16, padding: '24px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', boxShadow: '0 8px 24px rgba(245, 158, 11, 0.08)' }}
                  >
                    <div style={{ position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)', background: '#F59E0B', color: '#FFFFFF', padding: '2px 14px', borderRadius: 9999, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', boxShadow: '0 2px 6px rgba(245, 158, 11, 0.3)' }}>
                      Top Performer
                    </div>

                    <div style={{ marginBottom: 12, marginTop: 4 }}>
                      <UserAvatar src={topThree[0].avatar || topThree[0].profilePic || topThree[0].profileImage} name={topThree[0].name} size={76} fontSize={24} rank={1} />
                    </div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', background: '#FEF3C7', color: '#B45309', border: '1px solid #FCD34D', borderRadius: 9999, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                      Rank #1 · Champion
                    </div>
                    <h3 style={{ margin: '0 0 4px 0', fontSize: 18, fontWeight: 800, color: '#0F172A' }}>
                      {topThree[0].name}
                    </h3>
                    <div style={{ fontSize: 12, color: '#64748B', marginBottom: 14 }}>
                      {topThree[0].email || (topThree[0].employeeId ? `ID: ${topThree[0].employeeId}` : 'Participant')}
                    </div>
                    
                    <div style={{ width: '100%', borderTop: '1px solid #FEF08A', paddingTop: 14, marginTop: 'auto', display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: '#16A34A' }}>
                          {topThree[0].percentage != null ? `${topThree[0].percentage}%` : '—'}
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#B45309' }}>Overall Score</div>
                      </div>
                      <div style={{ width: 1, height: 28, background: '#FDE68A' }} />
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>
                          {topThree[0].completedAssessments}/{topThree[0].totalAssessments}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748B' }}>Completed</div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Rank 3 (if exists) */}
                {topThree[2] ? (
                  <motion.div
                    whileHover={{ y: -3 }}
                    style={{ background: '#F8FAFC', border: '1.5px solid #CBD5E1', borderRadius: 14, padding: '20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}
                  >
                    <div style={{ marginBottom: 12 }}>
                      <UserAvatar src={topThree[2].avatar || topThree[2].profilePic || topThree[2].profileImage} name={topThree[2].name} size={68} fontSize={22} rank={3} />
                    </div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', background: '#FFF7ED', color: '#C2410C', border: '1px solid #FDBA74', borderRadius: 9999, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                      Rank #3 · 3rd Place
                    </div>
                    <h3 style={{ margin: '0 0 4px 0', fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
                      {topThree[2].name}
                    </h3>
                    <div style={{ fontSize: 12, color: '#64748B', marginBottom: 12 }}>
                      {topThree[2].email || (topThree[2].employeeId ? `ID: ${topThree[2].employeeId}` : 'Participant')}
                    </div>
                    
                    <div style={{ width: '100%', borderTop: '1px solid #E2E8F0', paddingTop: 12, marginTop: 'auto', display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: '#16A34A' }}>
                          {topThree[2].percentage != null ? `${topThree[2].percentage}%` : '—'}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748B' }}>Overall Score</div>
                      </div>
                      <div style={{ width: 1, height: 24, background: '#E2E8F0' }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>
                          {topThree[2].completedAssessments}/{topThree[2].totalAssessments}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748B' }}>Completed</div>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <div style={{ background: '#FAFAFA', border: '1px dashed #E2E8F0', borderRadius: 14, padding: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontSize: 13 }}>
                    No 3rd place yet
                  </div>
                )}

              </div>
            </div>
          )}

          {/* 4. MAIN RANKING TABLE CARD */}
          <div style={{ background: '#FFFFFF', borderRadius: 16, border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', overflow: 'hidden' }}>
            
            {/* Filter & Search Bar */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
              
              {/* Search Box */}
              <div className="reg-admin-search" style={{ minWidth: 260, maxWidth: 380, flex: 1 }}>
                <Search size={16} color="#94A3B8" />
                <input
                  type="text"
                  placeholder="Search participants by name, email, ID..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ width: '100%', fontSize: 13 }}
                />
              </div>

              {/* Status Filter Tabs */}
              <div className="reg-admin-filter-tabs" style={{ display: 'flex', gap: 6 }}>
                {[
                  { key: 'ALL', label: 'All', count: leaderboard.length },
                  { key: 'COMPLETED', label: 'Completed', count: leaderboard.filter(p => p.status === 'COMPLETED').length },
                  { key: 'IN_PROGRESS', label: 'In Progress', count: leaderboard.filter(p => p.status === 'IN_PROGRESS').length },
                  { key: 'NOT_ATTEMPTED', label: 'Not Attempted', count: leaderboard.filter(p => p.status === 'NOT_ATTEMPTED').length }
                ].map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setStatusFilter(tab.key)}
                    className={`reg-admin-filter-tab ${statusFilter === tab.key ? 'reg-admin-filter-tab--active' : ''}`}
                    style={{ padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}
                  >
                    {tab.label}
                    <span className="reg-admin-badge" style={{ marginLeft: 6, fontSize: 11 }}>{tab.count}</span>
                  </button>
                ))}
              </div>

              {/* Sort Selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: '#64748B', fontWeight: 500 }}>Sort:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="tmt-select"
                  style={{ padding: '6px 10px', fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0', background: '#FFFFFF', cursor: 'pointer' }}
                >
                  <option value="rank_asc">Rank (1st to Last)</option>
                  <option value="percentage_desc">Score (Highest First)</option>
                  <option value="percentage_asc">Score (Lowest First)</option>
                  <option value="name_asc">Name (A–Z)</option>
                  <option value="name_desc">Name (Z–A)</option>
                </select>
              </div>

            </div>

            {/* Table or Empty State */}
            {filteredParticipants.length === 0 ? (
              <div style={{ padding: '48px 24px', textAlign: 'center', color: '#64748B' }}>
                <Users size={36} color="#94A3B8" style={{ margin: '0 auto 12px' }} />
                <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>
                  {search ? 'No matching participants found' : 'No participants in this category'}
                </h3>
                <p style={{ fontSize: 13, color: '#94A3B8', maxWidth: 420, margin: '0 auto 16px' }}>
                  {search ? `No participants matched "${search}". Try checking for spelling or clear search.` : 'Participants enrolled in this training will appear here after attempting assessments.'}
                </p>
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="reg-admin-btn reg-admin-btn--secondary"
                    style={{ padding: '6px 16px', fontSize: 12, cursor: 'pointer' }}
                  >
                    Clear Search
                  </button>
                )}
              </div>
            ) : (
              <div className="reg-admin-table-wrap" style={{ overflowX: 'auto' }}>
                <table className="reg-admin-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                      <th style={{ width: '10%', textAlign: 'center', padding: '14px 16px', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>RANK</th>
                      <th style={{ width: '35%', textAlign: 'left', padding: '14px 16px', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>PARTICIPANT</th>
                      <th style={{ width: '15%', textAlign: 'center', padding: '14px 16px', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>SCORE</th>
                      <th style={{ width: '15%', textAlign: 'center', padding: '14px 16px', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>PERCENTAGE</th>
                      <th style={{ width: '12%', textAlign: 'center', padding: '14px 16px', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>COMPLETED</th>
                      <th style={{ width: '13%', textAlign: 'center', padding: '14px 16px', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedParticipants.map((entry, idx) => {
                      const isSelf = entry.participantId === user?.id
                      return (
                        <tr
                          key={entry.participantId || idx}
                          style={{
                            borderBottom: '1px solid #F1F5F9',
                            background: isSelf ? '#F0FDF4' : idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA',
                            transition: 'background 150ms ease'
                          }}
                        >
                          {/* RANK */}
                          <td style={{ textAlign: 'center', padding: '14px 16px' }}>
                            {renderRankBadge(entry.rank)}
                          </td>

                          {/* PARTICIPANT */}
                          <td style={{ padding: '14px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <UserAvatar src={entry.avatar || entry.profilePic || entry.profileImage} name={entry.name} size={40} fontSize={13} rank={entry.rank} />
                              <div style={{ minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ fontWeight: 600, fontSize: 14, color: '#0F172A' }}>
                                    {entry.name}
                                  </span>
                                  {isSelf && (
                                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', background: '#16A34A', color: '#fff', borderRadius: 9999 }}>
                                      YOU
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize: 12, color: '#64748B' }}>
                                  {entry.email || (entry.employeeId ? `Emp ID: ${entry.employeeId}` : 'Participant')}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* SCORE */}
                          <td style={{ textAlign: 'center', padding: '14px 16px' }}>
                            {entry.score != null ? (
                              <span style={{ fontWeight: 700, fontSize: 14, color: '#0F172A' }}>
                                {entry.score} {entry.maxScore ? <span style={{ color: '#94A3B8', fontWeight: 500 }}>/ {entry.maxScore}</span> : ''}
                              </span>
                            ) : (
                              <span style={{ color: '#94A3B8', fontWeight: 500 }}>—</span>
                            )}
                          </td>

                          {/* PERCENTAGE */}
                          <td style={{ textAlign: 'center', padding: '14px 16px' }}>
                            {entry.percentage != null ? (
                              <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                <span style={{ fontWeight: 800, fontSize: 14, color: entry.percentage >= 80 ? '#16A34A' : entry.percentage >= 50 ? '#D97706' : '#DC2626' }}>
                                  {entry.percentage.toFixed(1)}%
                                </span>
                                <div style={{ width: 64, height: 4, background: '#E2E8F0', borderRadius: 9999, overflow: 'hidden' }}>
                                  <div
                                    style={{
                                      width: `${Math.min(100, Math.max(0, entry.percentage))}%`,
                                      height: '100%',
                                      background: entry.percentage >= 80 ? '#16A34A' : entry.percentage >= 50 ? '#F59E0B' : '#EF4444',
                                      borderRadius: 9999
                                    }}
                                  />
                                </div>
                              </div>
                            ) : (
                              <span style={{ color: '#94A3B8', fontWeight: 500 }}>—</span>
                            )}
                          </td>

                          {/* ASSESSMENTS COMPLETED */}
                          <td style={{ textAlign: 'center', padding: '14px 16px' }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>
                              {entry.completedAssessments || 0} / {entry.totalAssessments || 0}
                            </span>
                          </td>

                          {/* STATUS */}
                          <td style={{ textAlign: 'center', padding: '14px 16px' }}>
                            {renderStatusBadge(entry.status)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <Pagination
                  currentPage={page}
                  totalPages={Math.max(1, Math.ceil(filteredParticipants.length / pageSize))}
                  totalItems={filteredParticipants.length}
                  pageSize={pageSize}
                  onPageChange={(p) => setPage(p)}
                  onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
                  recordLabel="participants"
                />
              </div>
            )}

            {/* Table Footer */}
            <div style={{ padding: '14px 24px', background: '#F8FAFC', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: '#64748B' }}>
              <span>Showing {filteredParticipants.length} of {leaderboard.length} enrolled participants</span>
              <span>Program ID: #{currentTrainingId}</span>
            </div>

          </div>

        </motion.div>
      )}

    </div>
  )
}
