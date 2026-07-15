import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  PieChart, Pie, Cell, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { Activity, TrendingUp, AlertTriangle, Trophy, BarChart3 } from 'lucide-react'
import { API } from '../../api/api'
import { useToast } from '../Toast'
import { COMPLETION_COLORS, colors } from '../../theme/tokens'

function ChartCard({ title, subtitle, children }) {
  return (
    <div style={{
      background: colors.surface.primary, border: `1px solid ${colors.border.default}`, borderRadius: 12,
      padding: 18, display: 'flex', flexDirection: 'column', minHeight: 320,
    }}>
      <div style={{ marginBottom: 12 }}>
        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: colors.slate[900] }}>
          {title}
        </h4>
        {subtitle && (
          <p style={{ margin: '2px 0 0', fontSize: 11, color: colors.slate[500] }}>
            {subtitle}
          </p>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 240 }}>
        {children}
      </div>
    </div>
  )
}

function StatBlock({ icon, label, value, color }) {
  return (
    <div style={{
      flex: 1, padding: 14, background: colors.surface.primary, border: `1px solid ${colors.border.default}`,
      borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10, minWidth: 200,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: `${color}22`, color, display: 'flex',
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: colors.slate[400], textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {label}
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: colors.slate[900],
                       overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} style={{ height: 320, background: colors.slate[100], borderRadius: 12 }} />
        ))}
      </div>
    )
  }

  if (!data || data.completion?.totalEnrolled === 0) {
    return (
      <div style={{
        padding: 40, textAlign: 'center', background: colors.surface.primary,
        border: `1px dashed ${colors.slate[300]}`, borderRadius: 12,
      }}>
        <BarChart3 size={48} color={colors.slate[300]} style={{ margin: '0 auto 12px' }} />
        <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 600, color: colors.slate[600] }}>
          No analytics yet
        </h3>
        <p style={{ margin: 0, fontSize: 13, color: colors.slate[400] }}>
          Once participants start enrolling and engaging with the course, charts will appear here.
        </p>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}
    >
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16,
      }}>
        <ChartCard title="Course Completion" subtitle="Distribution of participants by status">
          {pieData.length === 0 ? (
            <NoData />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={4}
                  dataKey="value"
                  nameKey="name"
                  label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                >
                  {pieData.map(d => (
                    <Cell key={d.key} fill={COMPLETION_COLORS[d.key] || colors.slate[400]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Avg Quiz Score" subtitle="Per-quiz average across all submissions">
          {quizScoreData.length === 0 ? (
            <NoData />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={quizScoreData} margin={{ top: 10, right: 10, left: 0, bottom: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.slate[100]} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
                <Tooltip
                  formatter={(v, n) => n === 'avgScore' ? [`${v}%`, 'Avg Score'] : [v, 'Attempts']}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Bar dataKey="avgScore" fill={colors.primary[600]} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Engagement" subtitle="Lessons completed per day (last 14 days)">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={engagementData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.slate[100]} />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Line
                type="monotone" dataKey="lessonsCompleted"
                stroke={colors.success[500]} strokeWidth={3}
                dot={{ r: 4, fill: colors.success[500] }}
                activeDot={{ r: 6 }}
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
                margin={{ top: 10, right: 30, left: 80, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={colors.slate[100]} />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
                <Tooltip
                  formatter={(v) => [`${v}%`, 'Completion rate']}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Bar dataKey="completionRate" fill={colors.secondary[600]} radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {summary && (
        <div style={{
          marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap',
        }}>
          {summary.mostAttemptedQuiz && (
            <StatBlock
              icon={<Activity size={18} />}
              label="Most attempted quiz"
              value={`${shortLabel(summary.mostAttemptedQuiz.title, 25)} (${summary.mostAttemptedQuiz.attempts} attempts)`}
              color={colors.primary[600]}
            />
          )}
          {summary.leastCompletedLesson && (
            <StatBlock
              icon={<AlertTriangle size={18} />}
              label="Least completed lesson"
              value={`${shortLabel(summary.leastCompletedLesson.title, 25)} (${summary.leastCompletedLesson.completionRate.toFixed(0)}%)`}
              color={colors.warning[500]}
            />
          )}
          <StatBlock
            icon={<TrendingUp size={18} />}
            label="Total Enrolled"
            value={summary.totalEnrolled}
            color={colors.success[500]}
          />
        </div>
      )}
    </motion.div>
  )
}

function NoData() {
  return (
    <div style={{
      height: '100%', minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: colors.slate[400], fontSize: 12,
    }}>
      Not enough data yet.
    </div>
  )
}
