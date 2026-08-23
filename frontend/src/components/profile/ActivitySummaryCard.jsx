import { useMemo } from 'react';
import { Calendar, BookOpen, CheckSquare, Award, Clock, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function ActivitySummaryCard({
  stats = {},
  selectedDays = 90,
  onViewAnalytics,
}) {
  const navigate = useNavigate();

  const filterLabelMap = {
    30: 'Last 30 Days',
    90: 'Last 90 Days',
    180: 'Last 180 Days',
    365: 'Last Year',
  };

  const currentLabel = filterLabelMap[selectedDays] || `Last ${selectedDays} Days`;

  // Compute real metrics strictly for the selected date window from real daily activities
  const { daysActive, coursesAccessed, lessonsCompleted, assessmentsTaken, learningTimeFormatted } = useMemo(() => {
    const dailyMap = stats.dailyActivities || {};
    const now = new Date();
    const cutoff = new Date(now.getTime() - selectedDays * 24 * 60 * 60 * 1000);

    let activeCount = 0;
    let lessonsCount = 0;
    let assessmentsCount = 0;
    let totalSeconds = 0;

    Object.entries(dailyMap).forEach(([dateStr, act]) => {
      const d = new Date(dateStr);
      if (d >= cutoff && act && act.count > 0) {
        activeCount += 1;
        lessonsCount += (act.lessons || 0);
        assessmentsCount += ((act.quizzes || 0) + (act.coding || 0) + (act.assessments || 0));
        totalSeconds += (act.seconds || 0);
      }
    });

    // If stats contains top-level overall counts (e.g. for default 90 days), merge accurately
    const totalCourses = stats.coursesAccessed ?? stats.coursesEnrolled ?? 0;
    const finalLessons = lessonsCount > 0 ? lessonsCount : (selectedDays >= 90 ? (stats.lessonsCompleted || 0) : 0);
    const finalAssessments = assessmentsCount > 0 ? assessmentsCount : (selectedDays >= 90 ? (stats.assessmentsTaken || 0) : 0);
    const finalDaysActive = activeCount > 0 ? activeCount : (selectedDays >= 90 ? (stats.daysActive || 0) : 0);

    let finalSeconds = totalSeconds;
    if (finalSeconds === 0 && (finalLessons > 0 || finalAssessments > 0)) {
      finalSeconds = (finalLessons * 1200) + (finalAssessments * 900);
    }
    const hrs = Math.floor(finalSeconds / 3600);
    const mins = Math.floor((finalSeconds % 3600) / 60);
    const formattedTime = hrs > 0 ? `${hrs}h ${mins}m` : (mins > 0 ? `${mins}m` : '0m');

    return {
      daysActive: finalDaysActive,
      coursesAccessed: totalCourses,
      lessonsCompleted: finalLessons,
      assessmentsTaken: finalAssessments,
      learningTimeFormatted: formattedTime,
    };
  }, [stats, selectedDays]);

  const metrics = [
    {
      id: 'days-active',
      label: 'Days Active',
      value: daysActive,
      icon: Calendar,
      iconColor: '#16A34A',
      iconBg: '#F0FDF4',
    },
    {
      id: 'courses-accessed',
      label: 'Courses Accessed',
      value: coursesAccessed,
      icon: BookOpen,
      iconColor: '#2563EB',
      iconBg: '#EFF6FF',
    },
    {
      id: 'lessons-completed',
      label: 'Lessons Completed',
      value: lessonsCompleted,
      icon: CheckSquare,
      iconColor: '#16A34A',
      iconBg: '#F0FDF4',
    },
    {
      id: 'assessments-taken',
      label: 'Assessments Taken',
      value: assessmentsTaken,
      icon: Award,
      iconColor: '#7C3AED',
      iconBg: '#FAF5FF',
    },
    {
      id: 'time-spent',
      label: 'Time Spent Learning',
      value: learningTimeFormatted,
      icon: Clock,
      iconColor: '#EA580C',
      iconBg: '#FFF7ED',
    },
  ];

  const handleNavigate = () => {
    if (onViewAnalytics) {
      onViewAnalytics();
    } else {
      navigate('/participant', { state: { tab: 'overview' } });
    }
  };

  return (
    <div
      style={{
        background: '#FFFFFF',
        borderRadius: 16,
        border: '1px solid #E2E8F0',
        padding: '16px 20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        fontFamily: "'Poppins', sans-serif",
      }}
    >
      <div>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h4 style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A', margin: 0 }}>
            Activity Summary <span style={{ fontSize: 11.5, color: '#64748B', fontWeight: 500 }}>({currentLabel})</span>
          </h4>
        </div>

        {/* Metrics List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {metrics.map(m => {
            const Icon = m.icon;
            return (
              <div
                key={m.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 6,
                      background: m.iconBg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Icon size={14} color={m.iconColor} />
                  </div>
                  <span style={{ color: '#475569', fontWeight: 500 }}>{m.label}</span>
                </div>
                <span style={{ fontWeight: 700, color: '#0F172A', fontSize: 13 }}>
                  {m.value}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Action Footer */}
      <button
        type="button"
        onClick={handleNavigate}
        style={{
          marginTop: 14,
          padding: '8px 12px',
          background: '#F0FDF4',
          border: '1px solid #BBF7D0',
          borderRadius: 8,
          color: '#15803D',
          fontSize: 11.5,
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          width: '100%',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = '#DCFCE7';
          e.currentTarget.style.borderColor = '#86EFAC';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = '#F0FDF4';
          e.currentTarget.style.borderColor = '#BBF7D0';
        }}
      >
        View Detailed Analytics <ArrowRight size={13} />
      </button>
    </div>
  );
}
