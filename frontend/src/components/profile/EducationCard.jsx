import { motion } from 'framer-motion';
import { Plus, Pencil, Trash2, GraduationCap } from 'lucide-react';

export default function EducationCard({ educations, isOwn, onAdd, onEdit, onDelete }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.12 }}
      style={{
        background: '#fff',
        border: '1px solid #E5E7EB',
        borderRadius: 20,
        padding: 24,
        boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.04)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'linear-gradient(135deg, #F5F3FF, #EDE9FE)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <GraduationCap size={16} style={{ color: '#7C3AED' }} />
          </div>
          <h3 style={{
            fontSize: 16, fontWeight: 700, color: '#111827',
            fontFamily: "'Poppins', sans-serif", margin: 0,
          }}>
            Education
          </h3>
        </div>
        {isOwn && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onAdd}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: 'linear-gradient(135deg, #F0FDF4, #DCFCE7)',
              border: '1px solid #BBF7D0', color: '#16A34A',
              cursor: 'pointer',
            }}
          >
            <Plus size={13} /> Add
          </motion.button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {(educations || []).map((edu, i) => (
          <motion.div
            key={edu.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 + i * 0.04 }}
            whileHover={{ y: -2, boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}
            style={{
              padding: 16, borderRadius: 14,
              border: '1px solid #F1F5F9', background: '#FAFBFC',
              transition: 'all 0.2s',
              position: 'relative',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ display: 'flex', gap: 12, flex: 1, minWidth: 0 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: 'linear-gradient(135deg, #F5F3FF, #EDE9FE)',
                  color: '#7C3AED',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <GraduationCap size={18} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <h4 style={{ fontSize: 14, fontWeight: 600, color: '#111827', margin: '0 0 2px' }}>
                    {edu.institution}
                  </h4>
                  {edu.degree && (
                    <p style={{ fontSize: 13, color: '#475569', margin: '0 0 4px' }}>
                      {edu.degree}{edu.department ? ` — ${edu.department}` : ''}
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    {edu.year && (
                      <span style={{
                        fontSize: 11, color: '#64748B',
                        padding: '2px 8px', borderRadius: 5,
                        background: '#F1F5F9', fontWeight: 500,
                      }}>
                        {edu.year}
                      </span>
                    )}
                    {edu.cgpa && (
                      <span style={{
                        fontSize: 11, color: '#16A34A',
                        padding: '2px 8px', borderRadius: 5,
                        background: '#F0FDF4', fontWeight: 600,
                      }}>
                        CGPA: {edu.cgpa}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {isOwn && (
                <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                  <motion.button
                    whileHover={{ scale: 1.1, backgroundColor: '#F0FDF4' }}
                    onClick={() => onEdit(edu)}
                    style={{
                      width: 26, height: 26, borderRadius: 5, border: 'none',
                      background: 'transparent', color: '#94A3B8', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  ><Pencil size={11} /></motion.button>
                  <motion.button
                    whileHover={{ scale: 1.1, backgroundColor: '#FEF2F2' }}
                    onClick={() => onDelete(edu.id)}
                    style={{
                      width: 26, height: 26, borderRadius: 5, border: 'none',
                      background: 'transparent', color: '#94A3B8', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  ><Trash2 size={11} /></motion.button>
                </div>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {(!educations || educations.length === 0) && (
        <div style={{
          textAlign: 'center', padding: '28px 20px',
          background: 'linear-gradient(135deg, #F8FAFC, #F1F5F9)',
          borderRadius: 12, border: '1px dashed #E5E7EB',
        }}>
          <GraduationCap size={24} style={{ color: '#CBD5E1', margin: '0 auto 8px' }} />
          <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>
            No education added yet.
          </p>
        </div>
      )}
    </motion.div>
  );
}
