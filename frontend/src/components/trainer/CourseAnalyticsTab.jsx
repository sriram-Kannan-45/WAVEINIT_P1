import { useEffect, useMemo, useState } from 'react'
import {
  PieChart, Pie, Cell, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { Activity, TrendingUp, AlertTriangle, Trophy, BarChart3, Loader2 } from 'lucide-react'
import { API } from '../../api/api'
import { useToast } from '../Toast'

const COMPLETION_COLORS = { completed: '#16a34a', inProgress: '#F59E0B', notStarted: '#94a3b8' }

function ChartCard({ title, subtitle, children }) {
  return (
    <div className="cat-chart-card">
      <div className="cat-chart-header">
        <h3 className="cat-chart-title">{title}</h3>
        {subtitle && <p className="cat-chart-subtitle">{subtitle}</p>}
      </div>
      <div className="cat-chart-body">
        <div style={{ height: '100%', width: '100%' }}>{children}</div>
      </div>
    </div>
  )
}

function StatBlock({ icon, label, value, color }) {
  return (
    <div className="cat-stat-block">
      <div className="cat-stat-icon" style={{ background: `${color}18`, color }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="cat-stat-label">{label}</div>
        <div className="cat-stat-val">
          {value}
        </div>
      </div>
    </div>
  )
}

function shortLabel(s, max = 18) {
  if (!s) return ''
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

export default function CourseAnalyticsTab({ user, courseId }) {
  const { error: showError } = useToast()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let aborted = false
    ;(async () => {
      try {
        setLoading(true)
        const r = await fetch(API.TRAINER_COURSES.ANALYTICS(courseId), {
          headers: { Authorization: `Bearer ${user.token}` },
        })
        const d = await r.json()
        if (aborted) return
        if (d.success) setData(d)
        else showError(d.error || 'Failed to load analytics')
      } catch (e) { showError(e.message) }
      finally { if (!aborted) setLoading(false) }
    })()
    return () => { aborted = true }
  }, [courseId])

  const pieData = useMemo(() => {
    if (!data?.completion) return []
    return [
      { name: 'Completed',   value: data.completion.completed,  key: 'completed' },
      { name: 'In Progress', value: data.completion.inProgress, key: 'inProgress' },
      { name: 'Not Started', value: data.completion.notStarted, key: 'notStarted' },
    ].filter(d => d.value > 0)
  }, [data])

  const quizScoreData = useMemo(() => {
    if (!data?.quizScores) return []
    return data.quizScores.map(q => ({
      name: shortLabel(q.title),
      avgScore: Number((q.avgScore || 0).toFixed(2)),
      attempts: q.attempts,
    }))
  }, [data])

  const engagementData = useMemo(() => {
    if (!data?.engagement) return []
    const map = Object.fromEntries(data.engagement.map(e => [String(e.day), Number(e.lessonsCompleted || 0)]))
    const out = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      out.push({
        day: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        lessonsCompleted: map[key] || 0,
      })
    }
    return out
  }, [data])

  const lessonCompletionData = useMemo(() => {
    if (!data?.lessonCompletion) return []
    return data.lessonCompletion.map(l => ({
      name: shortLabel(l.title, 24),
      completionRate: Number(l.completionRate || 0),
      completedCount: l.completedCount,
    }))
  }, [data])

  const summary = useMemo(() => {
    if (!data) return null
    const mostAttemptedQuiz = (data.quizScores || []).reduce((acc, q) => (q.attempts > (acc?.attempts || 0) ? q : acc), null)
    const leastCompletedLesson = (data.lessonCompletion || []).reduce((acc, l) => (acc == null || l.completionRate < acc.completionRate ? l : acc), null)
    return {
      mostAttemptedQuiz,
      leastCompletedLesson,
      totalEnrolled: data.completion?.totalEnrolled || 0,
    }
  }, [data])

  if (loading) {
    return (
      <div className="reg-admin-loading">
        <Loader2 size={24} className="bulk-spin" />
        <p>Loading analytics...</p>
      </div>
    )
  }

  if (!data || data.completion?.totalEnrolled === 0) {
    return (
      <div className="reg-admin-empty">
        <BarChart3 size={28} />
        <h3>No analytics yet</h3>
        <p>Once participants start enrolling and engaging with the course, charts will appear here.</p>
      </div>
    )
  }

  return (
    <div className="cat-container">
      <div className="cat-grid">
        <ChartCard title="Course Completion" subtitle="Distribution of participants by status">
          {pieData.length === 0 ? (
            <NoData />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  innerRadius={42}
                  outerRadius={68}
                  paddingAngle={3}
                  dataKey="value"
                  nameKey="name"
                  label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                >
                  {pieData.map(d => (
                    <Cell key={d.key} fill={COMPLETION_COLORS[d.key] || '#94a3b8'} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Avg Quiz Score" subtitle="Per-quiz average across all submissions">
          {quizScoreData.length === 0 ? (
            <NoData />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={quizScoreData} margin={{ top: 8, right: 8, left: -10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-15} textAnchor="end" height={40} />
                <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                <Tooltip
                  formatter={(v, n) => n === 'avgScore' ? [`${v}%`, 'Avg Score'] : [v, 'Attempts']}
                  contentStyle={{ fontSize: 11, borderRadius: 6 }}
                />
                <Bar dataKey="avgScore" fill="#16A34A" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Engagement" subtitle="Lessons completed per day (last 14 days)">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={engagementData} margin={{ top: 8, right: 8, left: -10, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="day" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
              <Line
                type="monotone" dataKey="lessonsCompleted"
                stroke="#16A34A" strokeWidth={2.5}
                dot={{ r: 3, fill: '#16A34A' }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Lesson Completion" subtitle="% of enrolled participants who completed each lesson">
          {lessonCompletionData.length === 0 ? (
            <NoData />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={lessonCompletionData}
                margin={{ top: 8, right: 20, left: 40, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={50} />
                <Tooltip
                  formatter={(v) => [`${v}%`, 'Completion rate']}
                  contentStyle={{ fontSize: 11, borderRadius: 6 }}
                />
                <Bar dataKey="completionRate" fill="#2563EB" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {summary && (
        <div className="reg-admin-stats" style={{ marginBottom: 0 }}>
          {summary.mostAttemptedQuiz && (
            <StatBlock
              icon={<Activity size={18} />}
              label="Most attempted quiz"
              value={`${shortLabel(summary.mostAttemptedQuiz.title, 25)} (${summary.mostAttemptedQuiz.attempts} attempts)`}
              color="#0d9488"
            />
          )}
          {summary.leastCompletedLesson && (
            <StatBlock
              icon={<AlertTriangle size={18} />}
              label="Least completed lesson"
              value={`${shortLabel(summary.leastCompletedLesson.title, 25)} (${summary.leastCompletedLesson.completionRate.toFixed(0)}%)`}
              color="#F59E0B"
            />
          )}
          <StatBlock
            icon={<TrendingUp size={18} />}
            label="Total Enrolled"
            value={summary.totalEnrolled}
            color="#16a34a"
          />
          {summary.mostAttemptedQuiz?.attempts > 0 && (
            <StatBlock
              icon={<Trophy size={18} />}
              label="Quizzes"
              value="View charts above"
              color="#2563eb"
            />
          )}
        </div>
      )}
    </div>
  )
}

function NoData() {
  return (
    <div style={{
      minHeight: 180, display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#94a3b8', fontSize: 12, fontFamily: 'var(--font-primary)',
    }}>
      Not enough data yet.
    </div>
  )
}
