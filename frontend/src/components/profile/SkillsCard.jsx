import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, Search, Sparkles } from 'lucide-react';

const SKILL_SUGGESTIONS = [
  'React', 'Node.js', 'Java', 'Spring Boot', 'MySQL', 'Python',
  'JMeter', 'Playwright', 'Selenium', 'TypeScript', 'Docker',
  'AWS', 'MongoDB', 'Express.js', 'Vue.js', 'Angular',
];

export default function SkillsCard({ skills, isOwn, onAdd, onDelete }) {
  const [adding, setAdding] = useState(false);
  const [newSkill, setNewSkill] = useState('');
  const [search, setSearch] = useState('');
  const [suggestions, setSuggestions] = useState([]);

  const handleAdd = async (skillName) => {
    const name = (skillName || newSkill).trim();
    if (!name) return;
    await onAdd(name);
    setNewSkill('');
    setSuggestions([]);
    setAdding(false);
  };

  const handleInputChange = (val) => {
    setNewSkill(val);
    if (val.length > 0) {
      const existing = (skills || []).map(s => s.skill?.toLowerCase());
      const filtered = SKILL_SUGGESTIONS.filter(
        s => s.toLowerCase().includes(val.toLowerCase()) && !existing.includes(s.toLowerCase())
      ).slice(0, 5);
      setSuggestions(filtered);
    } else {
      setSuggestions([]);
    }
  };

  const filtered = (skills || []).filter(s =>
    s.skill?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.04 }}
      style={{
        background: '#fff',
        border: '1px solid #E5E7EB',
        borderRadius: 20,
        padding: 24,
        boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.04)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'linear-gradient(135deg, #F0FDF4, #DCFCE7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Sparkles size={16} style={{ color: '#16A34A' }} />
          </div>
          <h3 style={{
            fontSize: 16, fontWeight: 700, color: '#111827',
            fontFamily: "'Poppins', sans-serif", margin: 0,
          }}>
            Skills
            {skills?.length > 0 && (
              <span style={{ fontSize: 13, fontWeight: 500, color: '#94A3B8', marginLeft: 8 }}>
                ({skills.length})
              </span>
            )}
          </h3>
        </div>
        {isOwn && !adding && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setAdding(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: 'linear-gradient(135deg, #F0FDF4, #DCFCE7)',
              border: '1px solid #BBF7D0', color: '#16A34A',
              cursor: 'pointer',
            }}
          >
            <Plus size={13} /> Add Skill
          </motion.button>
        )}
      </div>

      {/* Add skill input */}
      <AnimatePresence>
        {adding && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ marginBottom: 16, overflow: 'hidden' }}
          >
            <div style={{ position: 'relative' }}>
              <input
                value={newSkill}
                onChange={e => handleInputChange(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleAdd();
                  if (e.key === 'Escape') { setAdding(false); setNewSkill(''); setSuggestions([]); }
                }}
                placeholder="Type a skill (e.g., React, Python)..."
                autoFocus
                style={{
                  width: '100%', padding: '10px 40px 10px 14px', borderRadius: 10,
                  border: '1px solid #E5E7EB', fontSize: 13, outline: 'none',
                  fontFamily: "'Poppins', sans-serif",
                  transition: 'border-color 0.2s',
                  boxSizing: 'border-box',
                }}
                onFocus={e => e.target.style.borderColor = '#22C55E'}
                onBlur={e => { setTimeout(() => e.target.style.borderColor = '#E5E7EB', 200); }}
              />
              <button
                onClick={() => { setAdding(false); setNewSkill(''); setSuggestions([]); }}
                style={{
                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  width: 24, height: 24, borderRadius: 6,
                  background: '#F1F5F9', border: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: '#64748B',
                }}
              >
                <X size={12} />
              </button>
            </div>

            {/* Suggestions */}
            {suggestions.length > 0 && (
              <div style={{
                marginTop: 6, background: '#F8FAFC', borderRadius: 10,
                border: '1px solid #E5E7EB', overflow: 'hidden',
              }}>
                {suggestions.map(s => (
                  <button
                    key={s}
                    onMouseDown={(e) => { e.preventDefault(); handleAdd(s); }}
                    style={{
                      display: 'block', width: '100%', padding: '8px 14px',
                      background: 'transparent', border: 'none',
                      textAlign: 'left', fontSize: 13, color: '#334155',
                      cursor: 'pointer', fontFamily: "'Poppins', sans-serif",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#F0FDF4'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search */}
      {skills?.length > 4 && (
        <div style={{ position: 'relative', marginBottom: 14 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search skills..."
            style={{
              width: '100%', padding: '8px 12px 8px 34px', borderRadius: 10,
              border: '1px solid #E5E7EB', fontSize: 12, outline: 'none',
              fontFamily: "'Poppins', sans-serif", boxSizing: 'border-box',
              background: '#F8FAFC',
            }}
          />
        </div>
      )}

      {/* Skill Pills */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <AnimatePresence>
          {filtered.map(skill => (
            <motion.div
              key={skill.id}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              layout
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 24,
                background: 'linear-gradient(135deg, #F0FDF4, #DCFCE7)',
                border: '1px solid #BBF7D0',
                fontSize: 13, fontWeight: 500, color: '#15803D',
              }}
            >
              {skill.skill}
              {isOwn && (
                <motion.button
                  whileHover={{ scale: 1.15, backgroundColor: '#FEE2E2' }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => onDelete(skill.id)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 18, height: 18, borderRadius: '50%',
                    background: 'transparent', border: 'none',
                    color: '#94A3B8', cursor: 'pointer', padding: 0,
                  }}
                >
                  <X size={11} />
                </motion.button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {(!skills || skills.length === 0) && (
        <div style={{
          textAlign: 'center', padding: '28px 20px',
          background: 'linear-gradient(135deg, #F8FAFC, #F1F5F9)',
          borderRadius: 12, border: '1px dashed #E5E7EB',
        }}>
          <Sparkles size={24} style={{ color: '#CBD5E1', margin: '0 auto 8px' }} />
          <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>
            No skills added yet. Add your first skill to get started.
          </p>
        </div>
      )}
    </motion.div>
  );
}
