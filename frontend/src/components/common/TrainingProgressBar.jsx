import React from 'react'
import { CheckCircle2, Layers, Clock, AlertCircle } from 'lucide-react'
import './TrainingProgressBar.css'

/**
 * Reusable Dynamic Training Completion Progress Bar Component.
 *
 * @param {Object} props
 * @param {number} props.percentage - Completion percentage (0 - 100)
 * @param {number} props.completedItems - Number of completed items
 * @param {number} props.totalItems - Total available structure items
 * @param {number} [props.inProgressItems] - Items currently in progress
 * @param {boolean} [props.hasStructure] - Whether any structure exists
 * @param {string} [props.size='md'] - 'sm' | 'md' | 'lg'
 * @param {string} [props.title='Training Progress'] - Section title
 * @param {boolean} [props.showDetails=true] - Whether to show item counts & badges
 * @param {string} [props.className] - Additional class names
 */
export default function TrainingProgressBar({
  percentage = 0,
  completedItems = 0,
  totalItems = 0,
  inProgressItems = 0,
  hasStructure,
  size = 'md',
  title = 'Training Progress',
  showDetails = true,
  className = '',
}) {
  const numericPct = typeof percentage === 'number' ? percentage : (parseFloat(percentage) || 0)
  const safePct = Math.min(100, Math.max(0, numericPct))
  const safeCompleted = Math.max(0, parseInt(completedItems, 10) || 0)
  const safeTotal = Math.max(0, parseInt(totalItems, 10) || 0)
  const structureExists = hasStructure !== undefined ? hasStructure : safeTotal > 0

  // Color scheme based on completion progress
  const getThemeColor = () => {
    if (!structureExists || safeTotal === 0) return { bg: '#94a3b8', fill: 'linear-gradient(90deg, #94a3b8, #cbd5e1)', text: '#64748b' }
    if (safePct === 100) return { bg: '#16a34a', fill: 'linear-gradient(90deg, #16a34a, #22c55e)', text: '#15803d' }
    if (safePct >= 50) return { bg: '#0d9488', fill: 'linear-gradient(90deg, #0d9488, #14b8a6)', text: '#0f766e' }
    if (safePct > 0) return { bg: '#3b82f6', fill: 'linear-gradient(90deg, #3b82f6, #60a5fa)', text: '#1d4ed8' }
    return { bg: '#e2e8f0', fill: 'linear-gradient(90deg, #cbd5e1, #e2e8f0)', text: '#64748b' }
  }

  const theme = getThemeColor()

  return (
    <div className={`tpb-container tpb-size-${size} ${className}`}>
      <div className="tpb-header">
        <div className="tpb-header-left">
          <Layers size={size === 'sm' ? 14 : 16} className="tpb-title-icon" />
          <span className="tpb-title">{title}</span>
        </div>
        <div className="tpb-header-right">
          <span
            className="tpb-badge"
            style={{
              background: safePct === 100 ? '#dcfce7' : safePct > 0 ? '#f0fdfa' : '#f1f5f9',
              color: safePct === 100 ? '#15803d' : safePct > 0 ? '#0f766e' : '#64748b',
              borderColor: safePct === 100 ? '#bbf7d0' : safePct > 0 ? '#99f6e4' : '#e2e8f0',
            }}
          >
            {safePct === 100 ? (
              <CheckCircle2 size={12} style={{ marginRight: 4 }} />
            ) : null}
            {safePct.toFixed(safePct % 1 === 0 ? 0 : 2)}% Complete
          </span>
        </div>
      </div>

      {/* Progress Bar Track */}
      <div className="tpb-track">
        <div
          className="tpb-bar"
          style={{
            width: `${safePct}%`,
            background: theme.fill,
          }}
        />
      </div>

      {/* Subtitle / Details */}
      {showDetails && (
        <div className="tpb-footer">
          {structureExists && safeTotal > 0 ? (
            <div className="tpb-stats-row">
              <span className="tpb-stats-text">
                <strong>{safeCompleted}</strong> of <strong>{safeTotal}</strong> structure item{safeTotal !== 1 ? 's' : ''} completed
              </span>
              {inProgressItems > 0 && (
                <span className="tpb-inprogress-chip">
                  <Clock size={11} /> {inProgressItems} in progress
                </span>
              )}
            </div>
          ) : (
            <div className="tpb-empty-notice">
              <AlertCircle size={13} />
              <span>No training structure has been added yet.</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
