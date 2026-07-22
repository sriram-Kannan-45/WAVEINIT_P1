import { motion } from 'framer-motion';
import { Plus, Pencil, Trash2, Award, ExternalLink, FileText } from 'lucide-react';
import { assetUrl } from '../../api/api';

export default function CertificatesCard({ certificates, isOwn, onAdd, onEdit, onDelete }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.16 }}
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
            background: 'linear-gradient(135deg, #FFFBEB, #FEF3C7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Award size={16} style={{ color: '#D97706' }} />
          </div>
          <h3 style={{
            fontSize: 16, fontWeight: 700, color: '#111827',
            fontFamily: "'Poppins', sans-serif", margin: 0,
          }}>
            Certifications
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
        {(certificates || []).map((cert, i) => (
          <motion.div
            key={cert.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 + i * 0.04 }}
            whileHover={{ y: -2, boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}
            style={{
              padding: 16, borderRadius: 14,
              border: '1px solid #F1F5F9', background: '#FAFBFC',
              transition: 'all 0.2s',
              display: 'flex', flexDirection: 'column', gap: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 10,
                background: 'linear-gradient(135deg, #FFFBEB, #FEF3C7)',
                color: '#D97706',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                boxShadow: '0 2px 8px rgba(217,119,6,0.15)',
              }}>
                <Award size={20} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h4 style={{
                  fontSize: 14, fontWeight: 600, color: '#111827',
                  margin: '0 0 2px', lineHeight: 1.3,
                }}>
                  {cert.title}
                </h4>
                {cert.issuer && (
                  <p style={{ fontSize: 12, color: '#64748B', margin: 0 }}>{cert.issuer}</p>
                )}
                <div style={{ display: 'flex', gap: 6, marginTop: 4, fontSize: 11, color: '#94A3B8', flexWrap: 'wrap' }}>
                  {cert.issueDate && <span>{new Date(cert.issueDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>}
                  {cert.credentialId && (
                    <span style={{ fontFamily: 'monospace', background: '#F1F5F9', padding: '1px 5px', borderRadius: 3, fontSize: 10 }}>
                      ID: {cert.credentialId}
                    </span>
                  )}
                </div>
              </div>
              {isOwn && (
                <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                  <motion.button
                    whileHover={{ scale: 1.1, backgroundColor: '#F0FDF4' }}
                    onClick={() => onEdit(cert)}
                    style={{
                      width: 26, height: 26, borderRadius: 5, border: 'none',
                      background: 'transparent', color: '#94A3B8', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  ><Pencil size={11} /></motion.button>
                  <motion.button
                    whileHover={{ scale: 1.1, backgroundColor: '#FEF2F2' }}
                    onClick={() => onDelete(cert.id)}
                    style={{
                      width: 26, height: 26, borderRadius: 5, border: 'none',
                      background: 'transparent', color: '#94A3B8', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  ><Trash2 size={11} /></motion.button>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              {cert.verificationUrl && (
                <a href={cert.verificationUrl} target="_blank" rel="noopener noreferrer" style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                  background: 'linear-gradient(135deg, #F0FDF4, #DCFCE7)',
                  color: '#16A34A', textDecoration: 'none',
                  border: '1px solid #BBF7D0',
                }}>
                  <ExternalLink size={10} /> Verify
                </a>
              )}
              {cert.certificateFile && (
                <a href={assetUrl(cert.certificateFile)} target="_blank" rel="noopener noreferrer" style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                  background: '#F8FAFC', color: '#64748B', textDecoration: 'none',
                  border: '1px solid #E5E7EB',
                }}>
                  <FileText size={10} /> View
                </a>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {(!certificates || certificates.length === 0) && (
        <div style={{
          textAlign: 'center', padding: '28px 20px',
          background: 'linear-gradient(135deg, #F8FAFC, #F1F5F9)',
          borderRadius: 12, border: '1px dashed #E5E7EB',
        }}>
          <Award size={24} style={{ color: '#CBD5E1', margin: '0 auto 8px' }} />
          <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>
            No certificates added yet.
          </p>
        </div>
      )}
    </motion.div>
  );
}
