export default function ExamLayout({ children }) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--color-bg-base)',
    }}>
      {children}
    </div>
  )
}
