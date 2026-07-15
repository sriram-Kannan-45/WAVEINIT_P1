import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Camera, Plus, Trash2, Save, User, FileText, Tag, Upload } from 'lucide-react'
import toast from 'react-hot-toast'

function AvatarUpload({ currentSrc, initials, onChange }) {
  const fileRef = useRef(null)
  const [preview, setPreview] = useState(currentSrc || null)
  const [dragging, setDragging] = useState(false)

  const handleFile = (file) => {
    if (!file || !file.type.startsWith('image/')) {
      toast.error('Please select an image file')
      return
    }
    if (file.size > 4 * 1024 * 1024) {
      toast.error('Image must be smaller than 4 MB')
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      setPreview(e.target.result)
      onChange(e.target.result)
    }
    reader.readAsDataURL(file)
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files[0])
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <motion.div
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.97 }}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`relative w-24 h-24 rounded-full cursor-pointer group transition-all duration-300 ${
          dragging ? 'scale-105' : ''
        }`}
      >
        <div className="absolute inset-0 rounded-full p-[2px]"
          style={{ background: 'linear-gradient(135deg, #14B8A6, #0D9488)' }}
        >
          <div className="w-full h-full rounded-full bg-white overflow-hidden flex items-center justify-center">
            {preview ? (
              <img src={preview} alt="avatar preview" className="w-full h-full object-cover" />
            ) : (
              <span className="font-display text-2xl font-black text-primary-600">{initials}</span>
            )}
          </div>
        </div>
        <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <Camera size={20} className="text-white" />
        </div>
        {dragging && (
          <div className="absolute inset-0 rounded-full bg-primary-500/30 border-2 border-primary-400 border-dashed flex items-center justify-center">
            <Upload size={20} className="text-primary-600" />
          </div>
        )}
      </motion.div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files[0])}
        id="avatar-file-input"
      />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1.5 transition-colors"
        >
          <Camera size={14} /> Change photo
        </button>
        {preview && (
          <>
            <span className="text-slate-300">·</span>
            <button
              type="button"
              onClick={() => { setPreview(null); onChange(null) }}
              className="text-sm text-rose-600 hover:text-rose-700 font-medium flex items-center gap-1.5 transition-colors"
            >
              <Trash2 size={14} /> Remove
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function SkillInput({ skills, onChange }) {
  const [input, setInput] = useState('')

  const addSkill = () => {
    const val = input.trim()
    if (!val || skills.includes(val) || skills.length >= 10) return
    onChange([...skills, val])
    setInput('')
  }

  const removeSkill = (s) => onChange(skills.filter(x => x !== s))

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2 min-h-[36px]">
        <AnimatePresence>
          {skills.map(s => (
            <motion.span
              key={s}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold bg-primary-50 text-primary-700 border border-primary-200"
            >
              {s}
              <button
                type="button"
                onClick={() => removeSkill(s)}
                className="hover:text-primary-900 transition-colors"
              >
                <X size={12} />
              </button>
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSkill() } }}
          placeholder="e.g. React, Python, Leadership…"
          maxLength={30}
          className="flex-1 px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 text-sm placeholder-slate-400 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 transition-all"
        />
        <motion.button
          type="button"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={addSkill}
          className="px-3 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-all text-sm font-medium"
        >
          <Plus size={16} />
        </motion.button>
      </div>
      <p className="text-xs text-slate-500 mt-1.5">{skills.length}/10 skills · Press Enter to add</p>
    </div>
  )
}

function FormField({ icon: Icon, label, children }) {
  return (
    <div>
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">
        <Icon size={14} className="text-primary-500" />
        {label}
      </label>
      {children}
    </div>
  )
}

export default function EditProfileModal({ isOpen, profileData, userInitials, onClose, onSave }) {
  const [form, setForm] = useState({ ...profileData })

  useEffect(() => { setForm({ ...profileData }) }, [profileData])

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    if (isOpen) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  const handleSave = () => {
    if (!form.name?.trim()) { toast.error('Name is required'); return }
    onSave(form)
    toast.success('Profile updated successfully! ✨')
    onClose()
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
          />

          <motion.div
            key="modal"
            initial={{ opacity: 0, y: 60, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            className="fixed inset-x-4 bottom-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-lg z-50 rounded-t-2xl sm:rounded-xl overflow-hidden border border-slate-200 bg-white shadow-lg"
          >
            <div className="h-1 w-full bg-gradient-to-r from-primary-500 via-primary-500 to-pink-400" />

            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">Edit Profile</h3>
                <p className="text-xs text-slate-500 mt-0.5">Changes are saved locally</p>
              </div>
              <motion.button
                whileHover={{ scale: 1.1, rotate: 90 }}
                whileTap={{ scale: 0.9 }}
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-900 transition-all"
              >
                <X size={18} />
              </motion.button>
            </div>

            <div className="px-5 py-4 max-h-[70vh] overflow-y-auto space-y-4 custom-scrollbar">
              <AvatarUpload
                currentSrc={form.avatarUrl}
                initials={userInitials}
                onChange={(url) => setForm(p => ({ ...p, avatarUrl: url }))}
              />

              <FormField icon={User} label="Display Name">
                <input
                  type="text"
                  value={form.name || ''}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Your full name"
                  maxLength={60}
                  className="w-full px-3 py-2.5 rounded-lg bg-white border border-slate-300 text-slate-900 text-sm placeholder-slate-400 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 transition-all"
                />
              </FormField>

              <FormField icon={FileText} label="Bio">
                <textarea
                  value={form.bio || ''}
                  onChange={e => setForm(p => ({ ...p, bio: e.target.value }))}
                  placeholder="Tell us about yourself…"
                  rows={2}
                  maxLength={200}
                  className="w-full px-3 py-2.5 rounded-lg bg-white border border-slate-300 text-slate-900 text-sm placeholder-slate-400 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 transition-all resize-none"
                />
                <p className="text-right text-xs text-slate-500 mt-1.5">{(form.bio || '').length}/200</p>
              </FormField>

              <FormField icon={Tag} label="Skills & Interests">
                <SkillInput
                  skills={form.skills || []}
                  onChange={(skills) => setForm(p => ({ ...p, skills }))}
                />
              </FormField>
            </div>

            <div className="px-5 py-3 border-t border-slate-200 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-slate-600 hover:text-slate-900 border border-slate-300 hover:border-slate-400 hover:bg-slate-50 transition-all"
              >
                Cancel
              </button>
              <motion.button
                type="button"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSave}
                id="save-profile-btn"
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all"
                style={{
                  background: 'linear-gradient(135deg, #14B8A6, #0D9488)',
                  boxShadow: '0 0 16px rgba(13,148,136,0.3)',
                }}
              >
                <Save size={15} /> Save Changes
              </motion.button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}