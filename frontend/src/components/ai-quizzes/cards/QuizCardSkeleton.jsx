/**
 * QuizCardSkeleton — loading placeholder mirrors the new QuizCard layout
 * (pills, prominent title, inline meta, progress, CTA).
 */
export default function QuizCardSkeleton() {
  return (
    <div
      className="qz-card animate-pulse"
      style={{ minHeight: 260 }}
    >
      {/* Pills */}
      <div className="qz-card__pills">
        <div style={{ width: 36, height: 22, borderRadius: 999, background: '#eef0f4' }} />
        <div style={{ width: 60, height: 22, borderRadius: 999, background: '#eef0f4' }} />
      </div>

      {/* Title — two lines */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        <div style={{ height: 16, width: '85%', borderRadius: 6, background: '#eef0f4' }} />
        <div style={{ height: 16, width: '60%', borderRadius: 6, background: '#eef0f4' }} />
      </div>

      {/* Meta */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <div style={{ height: 12, width: 92, borderRadius: 4, background: '#eef0f4' }} />
        <div style={{ height: 12, width: 56, borderRadius: 4, background: '#eef0f4' }} />
      </div>

      {/* Progress */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ height: 10, width: 96, borderRadius: 4, background: '#eef0f4' }} />
          <div style={{ height: 10, width: 32, borderRadius: 4, background: '#eef0f4' }} />
        </div>
        <div style={{ height: 6, width: '100%', borderRadius: 999, background: '#eef0f4' }} />
      </div>

      {/* CTA */}
      <div
        style={{
          marginTop: 'auto',
          height: 44,
          width: '100%',
          borderRadius: 12,
          background: '#e4e6ec',
        }}
      />
    </div>
  );
}
