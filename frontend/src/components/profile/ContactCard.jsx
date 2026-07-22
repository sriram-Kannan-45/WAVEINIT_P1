import { motion } from 'framer-motion';
import { Pencil, Mail, Phone, MapPin, ExternalLink, Link2, Code2, Globe, FolderGit2, MessageCircle, Play } from 'lucide-react';

const LINK_FIELDS = [
  { key: 'linkedin', label: 'LinkedIn', icon: Link2, gradient: 'linear-gradient(135deg, #EFF6FF, #DBEAFE)', iconColor: '#2563EB' },
  { key: 'github', label: 'GitHub', icon: Code2, gradient: 'linear-gradient(135deg, #F8FAFC, #F1F5F9)', iconColor: '#475569' },
  { key: 'website', label: 'Website', icon: Globe, gradient: 'linear-gradient(135deg, #F0FDF4, #DCFCE7)', iconColor: '#16A34A' },
  { key: 'portfolio', label: 'Portfolio', icon: FolderGit2, gradient: 'linear-gradient(135deg, #F5F3FF, #EDE9FE)', iconColor: '#7C3AED' },
  { key: 'twitter', label: 'Twitter', icon: MessageCircle, gradient: 'linear-gradient(135deg, #EFF6FF, #DBEAFE)', iconColor: '#2563EB' },
  { key: 'youtube', label: 'YouTube', icon: Play, gradient: 'linear-gradient(135deg, #FEF2F2, #FEE2E2)', iconColor: '#DC2626' },
];

export default function ContactCard({ contactLinks, email, phone, location, isOwn, onEdit }) {
  const hasAny = email || phone || location || Object.values(contactLinks || {}).some(Boolean);

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
            background: 'linear-gradient(135deg, #EFF6FF, #DBEAFE)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Mail size={16} style={{ color: '#2563EB' }} />
          </div>
          <h3 style={{
            fontSize: 16, fontWeight: 700, color: '#111827',
            fontFamily: "'Poppins', sans-serif", margin: 0,
          }}>
            Contact
          </h3>
        </div>
        {isOwn && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onEdit}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: '#F8FAFC', border: '1px solid #E5E7EB', color: '#64748B',
              cursor: 'pointer',
            }}
          >
            <Pencil size={11} /> Edit
          </motion.button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {email && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'linear-gradient(135deg, #F0FDF4, #DCFCE7)',
              color: '#16A34A',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Mail size={14} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email</div>
              <a href={`mailto:${email}`} style={{
                fontSize: 13, color: '#334155', textDecoration: 'none',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block',
              }}>{email}</a>
            </div>
          </div>
        )}

        {phone && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'linear-gradient(135deg, #EFF6FF, #DBEAFE)',
              color: '#2563EB',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Phone size={14} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Phone</div>
              <span style={{ fontSize: 13, color: '#334155' }}>{phone}</span>
            </div>
          </div>
        )}

        {location && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'linear-gradient(135deg, #FFFBEB, #FEF3C7)',
              color: '#D97706',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <MapPin size={14} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Location</div>
              <span style={{ fontSize: 13, color: '#334155' }}>{location}</span>
            </div>
          </div>
        )}

        {/* Divider */}
        {hasAny && LINK_FIELDS.some(f => contactLinks?.[f.key]) && (
          <div style={{ height: 1, background: '#F1F5F9', margin: '4px 0' }} />
        )}

        {LINK_FIELDS.filter(f => contactLinks?.[f.key]).map(f => {
          const Icon = f.icon;
          return (
            <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: f.gradient,
                color: f.iconColor,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Icon size={14} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{f.label}</div>
                <a href={contactLinks[f.key]} target="_blank" rel="noopener noreferrer" style={{
                  fontSize: 13, color: '#16A34A', textDecoration: 'none',
                  display: 'flex', alignItems: 'center', gap: 4,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {contactLinks[f.key].replace(/^https?:\/\//, '').replace(/\/$/, '')}
                  <ExternalLink size={10} style={{ flexShrink: 0 }} />
                </a>
              </div>
            </div>
          );
        })}
      </div>

      {!hasAny && (
        <div style={{
          textAlign: 'center', padding: '20px',
          background: 'linear-gradient(135deg, #F8FAFC, #F1F5F9)',
          borderRadius: 12, border: '1px dashed #E5E7EB',
        }}>
          <Mail size={20} style={{ color: '#CBD5E1', margin: '0 auto 6px' }} />
          <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>
            No contact information added yet.
          </p>
        </div>
      )}
    </motion.div>
  );
}
