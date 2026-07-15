import { useState } from 'react'
import TrainerDetails from './TrainerDetails'

/**
 * TrainerCard — a single clickable row that expands to reveal TrainerDetails via accordion.
 * Opens/closes based on external state (single open at a time in TrainerList).
 */
function TrainerCard({ trainer, token, index, onDelete, isOpen, onToggle }) {
  const initials = (name) => name ? name.trim().split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'TR'

  const hasProfile = trainer.profile && (
    trainer.profile.phone || trainer.profile.dob || trainer.profile.qualification || trainer.profile.experience || trainer.profile.imagePath
  )

  return (
    <div className={`trainer-accordion-item ${isOpen ? 'open' : ''}`} style={{ animationDelay: `${index * 0.07}s` }}>
      {/* Clickable header row */}
      <button
        className="trainer-accordion-trigger"
        onClick={onToggle}
        aria-expanded={isOpen}
        id={`trainer-card-${trainer.id}`}
      >
        <div className="trainer-acc-left">
          <div className="trainer-acc-avatar">{initials(trainer.name)}</div>
          <div className="trainer-acc-info">
            <span className="trainer-acc-name">{trainer.name}</span>
            <span className="trainer-acc-email">{trainer.email}</span>
          </div>
        </div>
        <div className="trainer-acc-right">
          {hasProfile && (
            <span className="badge badge-green" style={{ fontSize: 11 }}>Profile Set</span>
          )}
          {!hasProfile && (
            <span className="badge badge-gray" style={{ fontSize: 11 }}>No Profile</span>
          )}
          <span className="trainer-acc-chevron" aria-hidden="true">
            {isOpen ? '▲' : '▼'}
          </span>
        </div>
      </button>

      {/* Animated detail panel */}
      <div className={`trainer-accordion-body ${isOpen ? 'expanded' : ''}`}>
        <div className="trainer-accordion-body-inner">
          {isOpen && <TrainerDetails trainer={trainer} token={token} />}
          {isOpen && onDelete && (
            <div className="trainer-acc-actions">
              <button
                className="btn btn-sm btn-danger"
                onClick={(e) => { e.stopPropagation(); onDelete(trainer.id, trainer.name) }}
              >
                Delete Trainer
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default TrainerCard
