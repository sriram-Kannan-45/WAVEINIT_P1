import { useState } from 'react'
import TrainerCard from './TrainerCard'

/**
 * TrainerList — renders the full accordion list of trainers for the admin.
 * Shows only trainer names initially; each click expands the full profile.
 * Only ONE trainer can be open at a time.
 */
function TrainerList({ trainers, token, onDelete, onAddTrainer }) {
  const [openId, setOpenId] = useState(null)

  const handleToggle = (id) => {
    setOpenId(prev => prev === id ? null : id)
  }

  if (!trainers || trainers.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">&#128100;</div>
        <p>No trainers added yet.</p>
        {onAddTrainer && (
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={onAddTrainer}>
            + Add First Trainer
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="trainer-accordion-list">
      <div className="trainer-list-hint">
        Click a trainer name to view their full profile details
      </div>
      {trainers.map((trainer, i) => (
        <TrainerCard
          key={trainer.id}
          trainer={trainer}
          token={token}
          index={i}
          onDelete={onDelete}
          isOpen={openId === trainer.id}
          onToggle={() => handleToggle(trainer.id)}
        />
      ))}
    </div>
  )
}

export default TrainerList
