import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Info, ChevronDown } from 'lucide-react';

const ACTIVITY_LEVELS = [
  { level: 0, label: 'No Activity', color: '#EBEDF0', min: 0, max: 0 },
  { level: 1, label: 'Low Activity', color: '#BBF7D0', min: 1, max: 2 },
  { level: 2, label: 'Medium Activity', color: '#22C55E', min: 3, max: 5 },
  { level: 3, label: 'High Activity', color: '#15803D', min: 6, max: 999 },
];

const FILTER_OPTIONS = [
  { value: 90, label: 'Last 90 Days' },
  { value: 30, label: 'Last 30 Days' },
  { value: 180, label: 'Last 180 Days' },
  { value: 365, label: 'Last Year' },
];

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function LearningActivityHeatmap({
  dailyActivities = {},
  selectedDays = 90,
  onDaysChange,
  userId = 'participant',
}) {
  const [daysFilter, setDaysFilter] = useState(selectedDays);
  const [hoveredCell, setHoveredCell] = useState(null);
  const [showInfoTooltip, setShowInfoTooltip] = useState(false);

  const handleFilterChange = (val) => {
    setDaysFilter(val);
    if (onDaysChange) onDaysChange(val);
  };

  // Build the calendar matrix for the selected timeframe
  const { weeks, columnDateHeaders, totalCalculatedActivities, daysActiveCount } = useMemo(() => {
    const today = new Date();
    // End date is today (or normalized to end of current day)
    const endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    
    // Start date is 'daysFilter' days ago
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - (daysFilter - 1));

    // Align start to the preceding Monday so days align neatly Mon-Sun
    const startDay = startDate.getDay(); // 0 = Sun, 1 = Mon...
    const mondayOffset = startDay === 0 ? -6 : 1 - startDay;
    const gridStartDate = new Date(startDate);
    gridStartDate.setDate(gridStartDate.getDate() + mondayOffset);

    // Build weeks array
    const weeksList = [];
    let currentWeek = [];
    const dateHeaders = [];
    let curDate = new Date(gridStartDate);
    let totalActs = 0;
    let activeDays = 0;

    while (curDate <= endDate || currentWeek.length > 0) {
      const dateStr = curDate.toISOString().split('T')[0];
      const isOutOfRange = curDate < startDate || curDate > endDate;

      let activityData = { count: 0, lessons: 0, quizzes: 0, coding: 0, assessments: 0 };
      if (!isOutOfRange && dailyActivities && dailyActivities[dateStr]) {
        activityData = dailyActivities[dateStr];
      }

      if (!isOutOfRange && activityData.count > 0) {
        totalActs += activityData.count;
        activeDays += 1;
      }

      currentWeek.push({
        date: new Date(curDate),
        dateStr,
        isOutOfRange,
        ...activityData,
      });

      // When week is complete (7 days)
      if (currentWeek.length === 7) {
        weeksList.push(currentWeek);

        // Header date marker (from the Monday of the week)
        const headerDate = currentWeek[0].date;
        dateHeaders.push({
          label: headerDate.toLocaleDateString('en-US', { day: '2-digit', month: 'short' }),
          weekIndex: weeksList.length - 1,
        });

        currentWeek = [];
      }

      curDate.setDate(curDate.getDate() + 1);

      // Break safely if we've overshoot the week after end date
      if (curDate > endDate && currentWeek.length === 0) break;
    }

    // Filter headers so they don't crowd each other (every 1, 2 or 3 weeks depending on range)
    const step = daysFilter > 180 ? 4 : daysFilter > 60 ? 2 : 1;
    const filteredHeaders = dateHeaders.filter((_, idx) => idx % step === 0);

    return {
      weeks: weeksList,
      columnDateHeaders: filteredHeaders,
      totalCalculatedActivities: totalActs,
      daysActiveCount: activeDays,
    };
  }, [daysFilter, dailyActivities, userId]);

  const getCellColor = (count) => {
    if (!count || count === 0) return '#EBEDF0';
    if (count <= 2) return '#BBF7D0';
    if (count <= 5) return '#22C55E';
    return '#15803D';
  };

  return (
    <div
      style={{
        background: '#FFFFFF',
        borderRadius: 16,
        border: '1px solid #E2E8F0',
        padding: '16px 20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        fontFamily: "'Poppins', sans-serif",
      }}
    >
      {/* ── Top Header with Title, Info Icon, and Dropdown Filter ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <h4 style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
            Learning Activity Heatmap
          </h4>
          <div style={{ position: 'relative', display: 'inline-flex' }}>
            <button
              type="button"
              onMouseEnter={() => setShowInfoTooltip(true)}
              onMouseLeave={() => setShowInfoTooltip(false)}
              onClick={() => setShowInfoTooltip(prev => !prev)}
              style={{
                border: 'none',
                background: 'none',
                padding: 2,
                cursor: 'pointer',
                color: '#94A3B8',
                display: 'flex',
                alignItems: 'center',
              }}
              aria-label="Activity heatmap information"
            >
              <Info size={14} />
            </button>
            <AnimatePresence>
              {showInfoTooltip && (
                <motion.div
                  initial={{ opacity: 0, y: 4, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 2, scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    zIndex: 50,
                    background: '#0F172A',
                    color: '#FFFFFF',
                    padding: '8px 12px',
                    borderRadius: 8,
                    fontSize: 11,
                    lineHeight: 1.4,
                    width: 240,
                    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.2)',
                    pointerEvents: 'none',
                    marginTop: 4,
                  }}
                >
                  Daily learning activity tracks lessons completed, quizzes attempted, coding submissions, course access, and study time.
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Filter Dropdown */}
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '4px 10px', gap: 6 }}>
            <select
              value={daysFilter}
              onChange={(e) => handleFilterChange(Number(e.target.value))}
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: 11.5,
                fontWeight: 600,
                color: '#0F172A',
                cursor: 'pointer',
                outline: 'none',
                paddingRight: 14,
                appearance: 'none',
                fontFamily: "'Poppins', sans-serif",
              }}
            >
              {FILTER_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <ChevronDown size={12} color="#64748B" style={{ position: 'absolute', right: 8, pointerEvents: 'none' }} />
          </div>
        </div>
      </div>

      {/* ── Main Heatmap Grid View ── */}
      <div
        style={{
          overflowX: 'auto',
          paddingBottom: 4,
          scrollbarWidth: 'thin',
          scrollbarColor: '#CBD5E1 transparent',
        }}
      >
        <div style={{ display: 'inline-flex', flexDirection: 'column', minWidth: '100%' }}>
          
          {/* Header Row: Month / Date markers */}
          <div style={{ display: 'flex', marginLeft: 32, marginBottom: 6, position: 'relative', height: 16 }}>
            {weeks.map((_, wIdx) => {
              const headerMatch = columnDateHeaders.find(h => h.weekIndex === wIdx);
              return (
                <div
                  key={`head-${wIdx}`}
                  style={{
                    width: 14,
                    marginRight: 3.5,
                    fontSize: 9.5,
                    color: '#64748B',
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  {headerMatch ? headerMatch.label : ''}
                </div>
              );
            })}
          </div>

          {/* Grid Rows: 7 Days (Mon -> Sun) */}
          <div style={{ display: 'flex', gap: 6 }}>
            {/* Weekday labels */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3.5, width: 26, flexShrink: 0, paddingTop: 1 }}>
              {DAY_LABELS.map((dayLabel, dayIdx) => (
                <div
                  key={dayLabel}
                  style={{
                    height: 12,
                    fontSize: 9,
                    color: '#94A3B8',
                    fontWeight: 500,
                    lineHeight: '12px',
                    textAlign: 'left',
                  }}
                >
                  {dayIdx % 2 === 0 ? dayLabel : ''}
                </div>
              ))}
            </div>

            {/* Weeks Columns */}
            <div style={{ display: 'flex', gap: 3.5 }}>
              {weeks.map((week, wIdx) => (
                <div key={`col-${wIdx}`} style={{ display: 'flex', flexDirection: 'column', gap: 3.5 }}>
                  {week.map((cell, dIdx) => {
                    const isCellHovered = hoveredCell && hoveredCell.dateStr === cell.dateStr;
                    return (
                      <div
                        key={`cell-${cell.dateStr}-${dIdx}`}
                        onMouseEnter={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setHoveredCell({ ...cell, rect });
                        }}
                        onMouseLeave={() => setHoveredCell(null)}
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: 3,
                          background: cell.isOutOfRange ? '#F8FAFC' : getCellColor(cell.count),
                          opacity: cell.isOutOfRange ? 0.35 : 1,
                          cursor: cell.isOutOfRange ? 'default' : 'pointer',
                          transition: 'transform 0.1s ease, box-shadow 0.1s ease',
                          transform: isCellHovered ? 'scale(1.25)' : 'scale(1)',
                          boxShadow: isCellHovered ? '0 2px 5px rgba(0,0,0,0.15)' : 'none',
                          zIndex: isCellHovered ? 10 : 1,
                          border: isCellHovered ? '1px solid #15803D' : 'none',
                        }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* ── Hover Tooltip (Floating) ── */}
      {hoveredCell && !hoveredCell.isOutOfRange && (
        <div
          style={{
            position: 'fixed',
            top: (hoveredCell.rect?.top || 0) - 44,
            left: (hoveredCell.rect?.left || 0) - 70,
            zIndex: 9999,
            background: '#0F172A',
            color: '#FFFFFF',
            padding: '5px 10px',
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 500,
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            pointerEvents: 'none',
            fontFamily: "'Poppins', sans-serif",
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <div style={{ fontWeight: 600, color: hoveredCell.count > 0 ? '#86EFAC' : '#E2E8F0' }}>
            {hoveredCell.count === 0 ? 'No activity' : `${hoveredCell.count} ${hoveredCell.count === 1 ? 'activity' : 'activities'}`}
          </div>
          <div style={{ fontSize: 9.5, color: '#94A3B8' }}>
            {hoveredCell.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
          {/* Arrow */}
          <div
            style={{
              position: 'absolute',
              bottom: -4,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '4px solid transparent',
              borderRight: '4px solid transparent',
              borderTop: '4px solid #0F172A',
            }}
          />
        </div>
      )}

      {/* ── Bottom Legend & Subtext ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          paddingTop: 4,
          borderTop: '1px solid #F1F5F9',
          fontSize: 11,
          color: '#64748B',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          {ACTIVITY_LEVELS.map(lvl => (
            <div key={lvl.level} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2.5,
                  background: lvl.color,
                  border: lvl.level === 0 ? '1px solid #E2E8F0' : 'none',
                }}
              />
              <span style={{ fontSize: 10.5, color: '#64748B' }}>{lvl.label}</span>
            </div>
          ))}
        </div>
        
        <div style={{ fontSize: 10.5, color: '#94A3B8', fontStyle: 'italic' }}>
          More activity = darker green
        </div>
      </div>

    </div>
  );
}
