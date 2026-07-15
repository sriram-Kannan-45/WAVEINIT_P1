export default function ContentContainer({ children, maxWidth = '1440px', padding = true, style = {} }) {
  return (
    <div style={{
      maxWidth,
      width: '100%',
      margin: '0 auto',
      padding: padding ? '0 var(--space-6)' : undefined,
      ...style,
    }}>
      {children}
    </div>
  )
}
