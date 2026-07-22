import { Skeleton } from '../ui';

export default function ProfileSkeleton() {
  return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 24px 48px' }}>
        {/* Hero skeleton */}
        <div style={{
          background: '#fff', border: '1px solid #E5E7EB', borderRadius: 20,
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.06)',
        }}>
          {/* Banner */}
          <Skeleton style={{ height: 200, borderRadius: 0 }} />

          {/* Content */}
          <div style={{ position: 'relative', padding: '0 32px 28px' }}>
            <div style={{ marginTop: -60, marginBottom: 20, display: 'flex', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}>
              {/* Avatar */}
              <Skeleton style={{ width: 120, height: 120, borderRadius: '50%', border: '4px solid #fff' }} />

              {/* Name area */}
              <div style={{ flex: '1 1 300px', paddingTop: 4 }}>
                <Skeleton style={{ height: 28, width: 220, marginBottom: 8 }} />
                <Skeleton style={{ height: 16, width: 300, marginBottom: 12 }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <Skeleton style={{ height: 26, width: 80, borderRadius: 8 }} />
                  <Skeleton style={{ height: 26, width: 100, borderRadius: 8 }} />
                  <Skeleton style={{ height: 26, width: 90, borderRadius: 8 }} />
                </div>
              </div>

              {/* Buttons */}
              <div style={{ display: 'flex', gap: 8 }}>
                <Skeleton style={{ height: 40, width: 120, borderRadius: 12 }} />
                <Skeleton style={{ height: 40, width: 110, borderRadius: 12 }} />
                <Skeleton style={{ height: 40, width: 100, borderRadius: 12 }} />
              </div>
            </div>
          </div>
        </div>

        {/* Stats skeleton */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginTop: 20 }}
          className="profile-stats-grid"
        >
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{
              background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(12px)',
              border: '1px solid rgba(229,231,235,0.8)', borderRadius: 16, padding: '20px 18px',
              display: 'flex', alignItems: 'center', gap: 14,
            }}>
              <Skeleton style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0 }} />
              <div>
                <Skeleton style={{ height: 10, width: 60, marginBottom: 6 }} />
                <Skeleton style={{ height: 24, width: 40 }} />
              </div>
            </div>
          ))}
        </div>

        {/* Completion skeleton */}
        <div style={{
          background: '#fff', border: '1px solid #E5E7EB', borderRadius: 20,
          padding: 24, marginTop: 20,
        }}>
          <Skeleton style={{ height: 20, width: 160, marginBottom: 16 }} />
          <Skeleton style={{ height: 8, width: '100%', borderRadius: 4, marginBottom: 16 }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[...Array(8)].map((_, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Skeleton style={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0 }} />
                <Skeleton style={{ height: 12, width: 80 }} />
              </div>
            ))}
          </div>
        </div>

        {/* Content skeleton */}
        <div className="profile-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 20, marginTop: 20 }}>
          <div className="profile-main-col" style={{ gridColumn: 'span 8', display: 'flex', flexDirection: 'column', gap: 20 }}>
            {[...Array(4)].map((_, i) => (
              <div key={i} style={{
                background: '#fff', border: '1px solid #E5E7EB', borderRadius: 20, padding: 24,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <Skeleton style={{ width: 32, height: 32, borderRadius: 8 }} />
                  <Skeleton style={{ height: 20, width: 100 }} />
                </div>
                <Skeleton style={{ height: 12, width: '100%', marginBottom: 8 }} />
                <Skeleton style={{ height: 12, width: '85%', marginBottom: 8 }} />
                <Skeleton style={{ height: 12, width: '60%' }} />
              </div>
            ))}
          </div>
          <div className="profile-side-col" style={{ gridColumn: 'span 4', display: 'flex', flexDirection: 'column', gap: 20 }}>
            {[...Array(3)].map((_, i) => (
              <div key={i} style={{
                background: '#fff', border: '1px solid #E5E7EB', borderRadius: 20, padding: 24,
              }}>
                <Skeleton style={{ height: 20, width: 100, marginBottom: 16 }} />
                {[...Array(4)].map((_, j) => (
                  <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <Skeleton style={{ width: 36, height: 36, borderRadius: 10 }} />
                    <Skeleton style={{ height: 14, width: 100 }} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 1024px) {
          .profile-main-col { grid-column: span 12 !important; }
          .profile-side-col { grid-column: span 12 !important; }
          .profile-stats-grid { grid-template-columns: repeat(3, 1fr) !important; }
        }
        @media (max-width: 640px) {
          .profile-stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </div>
  );
}
