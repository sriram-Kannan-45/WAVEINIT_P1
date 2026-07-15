import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Edit3, Camera, Star, Zap, Trophy, Calendar,
  Award, TrendingUp, Shield
} from 'lucide-react'
import { getTier } from './leaderboardData'

function Avatar({ src, initials, size = 72 }) {
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <div
        className="absolute inset-0 rounded-full"
        style={{ background: 'linear-gradient(135deg, #0D9488, #0D9488)', padding: 2 }}
      >
        <div className="w-full h-full rounded-full bg-white" />
      </div>
      <div className="absolute inset-[3px] rounded-full overflow-hidden flex items-center justify-center bg-gradient-to-br from-primary-50 to-primary-50">
        {src ? (
          <img src={src} alt="avatar" className="w-full h-full object-cover" />
        ) : (
          <span className="font-display font-black text-primary-600 select-none" style={{ fontSize: size * 0.35 }}>
            {initials}
          </span>
        )}
      </div>
    </div>
  )
}

function TierBadge({ tier }) {
  const icons = { Diamond: '💎', Platinum: '⚡', Gold: '👑', Silver: '🥈', Bronze: '🥉' }
  return (
    <span className="badge badge-blue flex items-center gap-1">
      <span className="text-sm">{icons[tier.label] || '🏅'}</span>
      {tier.label}
    </span>
  )
}

function XPCounter({ xp }) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    let start = 0
    const step = xp / 40
    const timer = setInterval(() => {
      start += step
      if (start >= xp) { setDisplay(xp); clearInterval(timer) }
      else setDisplay(Math.floor(start))
    }, 30)
    return () => clearInterval(timer)
  }, [xp])
  return <span>{display.toLocaleString()}</span>
}

function LevelBar({ xp }) {
  const tier = getTier(xp)
  const nextTierIdx = [2000, 1500, 1000, 500, 0]
  const idx = nextTierIdx.findIndex(t => xp >= t)
  const nextXP = idx > 0 ? nextTierIdx[idx - 1] : null
  const currentFloor = nextTierIdx[idx]
  const pct = nextXP ? Math.min(100, ((xp - currentFloor) / (nextXP - currentFloor)) * 100) : 100

  return (
    <div className="w-full mt-2">
      <div className="flex justify-between items-center mb-1 text-xs text-slate-500">
        <span className="font-medium">{tier.label} Tier</span>
        {nextXP ? <span>{xp.toLocaleString()} / {nextXP.toLocaleString()} XP</span> : <span>MAX LEVEL</span>}
      </div>
      <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
          className="h-full rounded-full"
          style={{
            background: `linear-gradient(90deg, ${tier.color}99, ${tier.color})`,
            boxShadow: `0 0 8px ${tier.color}60`,
          }}
        />
      </div>
    </div>
  )
}

function SkillChip({ label }) {
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-primary-50 text-primary-600 border border-primary-200">
      {label}
    </span>
  )
}

export default function ProfileCard({ user, profileData, rank, xp, onEditClick }) {
  const tier = getTier(xp)
  const initials = (profileData?.name || user?.name || 'U')
    .trim().split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

  return (
    <motion.div
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="relative rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm"
    >
      <div className="h-[3px] w-full bg-gradient-to-r from-primary-500 via-primary-500 to-pink-400" />

      <div className="p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
          <Avatar src={profileData?.avatarUrl} initials={initials} size={72} />

          <div className="flex-1 min-w-0 text-center sm:text-left">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-1">
              <h2 className="font-display text-xl font-black text-slate-900 truncate">
                {profileData?.name || user?.name || 'Participant'}
              </h2>
              <TierBadge tier={tier} />
            </div>

            {profileData?.bio && (
              <p className="text-sm text-slate-500 mb-2 line-clamp-2">{profileData.bio}</p>
            )}

            {profileData?.skills?.length > 0 && (
              <div className="flex flex-wrap gap-1 justify-center sm:justify-start mb-2">
                {profileData.skills.slice(0, 5).map(s => <SkillChip key={s} label={s} />)}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-4 justify-center sm:justify-start text-sm text-slate-500">
              <span className="flex items-center gap-1.5">
                <Zap size={14} className="text-amber-500" />
                <span className="font-bold text-slate-900"><XPCounter xp={xp} /></span>
                <span className="text-slate-400">XP</span>
              </span>
              <span className="flex items-center gap-1.5">
                <Trophy size={14} className="text-amber-500" />
                <span className="font-bold text-slate-900">#{rank}</span>
                <span className="text-slate-400">Global</span>
              </span>
              {user?.createdAt && (
                <span className="flex items-center gap-1.5">
                  <Calendar size={14} className="text-blue-500" />
                  Joined {new Date(user.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                </span>
              )}
            </div>

            <LevelBar xp={xp} />
          </div>

          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={onEditClick}
            id="edit-profile-btn"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-primary-600 border border-primary-200 hover:bg-primary-50 hover:border-primary-300 transition-all duration-200 flex-shrink-0"
          >
            <Edit3 size={15} />
            Edit
          </motion.button>
        </div>
      </div>
    </motion.div>
  )
}