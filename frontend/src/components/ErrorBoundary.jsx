import React from 'react'
import { AlertCircle, RotateCcw, RefreshCw, Home, Copy } from 'lucide-react'
import { useLocation } from 'react-router-dom'

class ErrorBoundaryClass extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null, errorId: null, copied: false }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error, errorId: `ERR-${Math.random().toString(36).substring(2, 9).toUpperCase()}` }
  }

  componentDidCatch(error, errorInfo) {
    const errorId = this.state.errorId || `ERR-${Math.random().toString(36).substring(2, 9).toUpperCase()}`
    console.error(`[LMS Error ID: ${errorId}] caught an error:`, error, errorInfo)
    if (import.meta.env.DEV) {
      console.error("[ErrorBoundary DEV LOG] Full Error Details:", error)
      console.error("[ErrorBoundary DEV LOG] Component Stack:", errorInfo?.componentStack)
    }
    this.setState({ error, errorInfo, errorId })
  }

  handleCopyError = () => {
    const details = `Error ID: ${this.state.errorId || 'Unknown'}
Error: ${this.state.error?.toString() || 'Unknown runtime error'}
Component Stack:
${this.state.errorInfo?.componentStack || 'No stack trace available'}`

    navigator.clipboard.writeText(details)
      .then(() => {
        this.setState({ copied: true })
        setTimeout(() => this.setState({ copied: false }), 2000)
      })
      .catch((err) => {
        console.error('Failed to copy error details:', err)
      })
  }

  handleGoToLogin = () => {
    localStorage.removeItem('user')
    localStorage.removeItem('rememberMe')
    window.location.href = '/participant'
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, errorId: null })
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #f5f8ff 0%, #eef3ff 50%, #f8faff 100%)',
          padding: '24px',
          fontFamily: "'Manrope', 'Poppins', sans-serif",
          color: '#1e293b',
          textAlign: 'center',
          boxSizing: 'border-box'
        }}>
          <div style={{
            background: 'rgba(255, 255, 255, 0.8)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(226, 232, 240, 0.8)',
            borderRadius: '24px',
            padding: '40px 32px',
            maxWidth: '560px',
            width: '100%',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.05)',
            boxSizing: 'border-box'
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '16px',
              background: '#fee2e2',
              color: '#ef4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
              boxShadow: '0 8px 16px rgba(239, 68, 68, 0.1)'
            }}>
              <AlertCircle size={32} />
            </div>

            <h1 style={{
              fontSize: '24px',
              fontWeight: 800,
              margin: '0 0 10px',
              letterSpacing: '-0.02em',
              color: '#0f172a'
            }}>
              Something Went Wrong
            </h1>

            <p style={{
              fontSize: '14.5px',
              color: '#64748b',
              margin: '0 0 8px',
              lineHeight: 1.5
            }}>
              An unexpected error occurred while loading your learning workspace.
            </p>
            <p style={{
              fontSize: '12px',
              color: '#94a3b8',
              margin: '0 0 20px',
              fontWeight: 600
            }}>
              Error ID: {this.state.errorId}
            </p>

            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '12px 16px',
              fontSize: '12.5px',
              fontFamily: "Consolas, Monaco, 'Courier New', monospace",
              color: '#ef4444',
              textAlign: 'left',
              wordBreak: 'break-word',
              maxHeight: '220px',
              overflowY: 'auto',
              marginBottom: '24px'
            }}>
              <strong style={{ display: 'block', marginBottom: '8px' }}>
                {this.state.error?.toString() || 'Unknown runtime error'}
              </strong>
              {import.meta.env.DEV && this.state.errorInfo?.componentStack && (
                <pre style={{
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  fontSize: '11px',
                  color: '#475569',
                  borderTop: '1px solid #e2e8f0',
                  paddingTop: '8px',
                  marginTop: '8px'
                }}>
                  {this.state.errorInfo.componentStack}
                </pre>
              )}
            </div>

            <button
              onClick={this.handleCopyError}
              style={{
                width: '100%',
                height: '40px',
                background: '#f8fafc',
                color: '#64748b',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                marginBottom: '16px',
                transition: 'all 0.2s ease',
                outline: 'none'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#f1f5f9'
                e.currentTarget.style.color = '#334155'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#f8fafc'
                e.currentTarget.style.color = '#64748b'
              }}
            >
              <Copy size={15} />
              <span>{this.state.copied ? 'Copied Details!' : 'Copy Error Details'}</span>
            </button>

            <div style={{ display: 'flex', gap: '12px', flexDirection: 'column' }}>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={this.handleRetry}
                  style={{
                    flex: 1,
                    height: '44px',
                    background: '#f0fdfa',
                    color: '#0D9488',
                    border: '1px solid #99f6e4',
                    borderRadius: '10px',
                    fontSize: '14px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <RotateCcw size={16} />
                  <span>Retry Component</span>
                </button>
                <button
                  onClick={this.handleReload}
                  style={{
                    flex: 1,
                    height: '44px',
                    background: '#f0fdfa',
                    color: '#0D9488',
                    border: '1px solid #99f6e4',
                    borderRadius: '10px',
                    fontSize: '14px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <RefreshCw size={16} />
                  <span>Reload Page</span>
                </button>
              </div>
              <button
                onClick={this.handleGoToLogin}
                style={{
                  width: '100%',
                  height: '48px',
                  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)',
                  transition: 'all 0.2s ease'
                }}
              >
                <Home size={16} />
                <span>Clear Session & Go to Login</span>
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function ErrorBoundary({ children }) {
  const location = useLocation()
  return <ErrorBoundaryClass key={location.pathname}>{children}</ErrorBoundaryClass>
}

export default ErrorBoundary
