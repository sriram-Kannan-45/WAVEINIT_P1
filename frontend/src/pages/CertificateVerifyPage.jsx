import React, { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Award, ShieldCheck, CheckCircle2, XCircle, Search, ArrowLeft, Loader2 } from 'lucide-react'
import { API } from '../api/api'
import { fetchWithTimeout } from '../api/request'

export default function CertificateVerifyPage() {
  const { code } = useParams()
  const [searchCode, setSearchCode] = useState(code || '')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)

  const verifyCode = async (c) => {
    if (!c || !c.trim()) return
    try {
      setLoading(true)
      setErrorMsg(null)
      setResult(null)

      const res = await fetchWithTimeout(API.CERTIFICATES.VERIFY(c.trim()), {}, 8000)
      const data = await res.json().catch(() => ({}))

      if (res.ok && data.success && data.certificate) {
        setResult(data.certificate)
      } else {
        setErrorMsg(data.message || 'No valid certificate found for this verification code.')
      }
    } catch (err) {
      setErrorMsg('Failed to connect to verification authority. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (code) {
      verifyCode(code)
    }
  }, [code])

  const handleSearch = (e) => {
    e.preventDefault()
    verifyCode(searchCode)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #F8FAFC 0%, #EEF2F6 100%)',
      fontFamily: "'Poppins', sans-serif",
      padding: '40px 20px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center'
    }}>
      <div style={{ maxWidth: 640, width: '100%' }}>
        {/* Header link */}
        <Link
          to="/"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            color: '#64748B', textDecoration: 'none', fontSize: 13,
            fontWeight: 600, marginBottom: 24
          }}
        >
          <ArrowLeft size={16} /> Back to WAVE INIT LMS
        </Link>

        {/* Card */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: 24,
          padding: '36px 32px',
          boxShadow: '0 10px 35px rgba(0,0,0,0.06)',
          border: '1px solid #E2E8F0',
          textAlign: 'center'
        }}>
          {/* Logo / Badge */}
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: '#FFFBEB', color: '#D97706',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', border: '2px solid #FDE68A'
          }}>
            <ShieldCheck size={36} />
          </div>

          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0F172A', margin: '0 0 6px' }}>
            Certificate Verification Portal
          </h1>
          <p style={{ fontSize: 13.5, color: '#64748B', margin: '0 0 24px' }}>
            Verify the authenticity of digital certificates issued by WAVE INIT LMS.
          </p>

          {/* Search Box */}
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
              <input
                type="text"
                required
                placeholder="Enter Certificate Code (e.g. CERT-ABC123XY)"
                value={searchCode}
                onChange={(e) => setSearchCode(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 14px 12px 40px',
                  borderRadius: 12,
                  border: '1.5px solid #CBD5E1',
                  fontSize: 14,
                  outline: 'none',
                  textTransform: 'uppercase',
                  fontWeight: 600
                }}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '12px 24px',
                borderRadius: 12,
                border: 'none',
                background: '#2563EB',
                color: '#fff',
                fontWeight: 700,
                fontSize: 14,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              {loading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : 'Verify'}
            </button>
          </form>

          {/* Verified Certificate Card */}
          {result && (
            <div style={{
              background: '#F0FDF4',
              borderRadius: 18,
              border: '2px solid #86EFAC',
              padding: '24px',
              textAlign: 'left'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#15803D', fontWeight: 800, fontSize: 15, marginBottom: 14 }}>
                <CheckCircle2 size={20} /> Official Certificate Verified
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13.5 }}>
                <div>
                  <span style={{ color: '#64748B', display: 'block', fontSize: 11, textTransform: 'uppercase', fontWeight: 700 }}>Recipient Name</span>
                  <span style={{ color: '#0F172A', fontWeight: 800, fontSize: 17 }}>{result.recipientName}</span>
                </div>
                <div>
                  <span style={{ color: '#64748B', display: 'block', fontSize: 11, textTransform: 'uppercase', fontWeight: 700 }}>Course of Study</span>
                  <span style={{ color: '#0F172A', fontWeight: 700 }}>{result.courseTitle}</span>
                </div>
                <div>
                  <span style={{ color: '#64748B', display: 'block', fontSize: 11, textTransform: 'uppercase', fontWeight: 700 }}>Issued By</span>
                  <span style={{ color: '#334155', fontWeight: 600 }}>{result.trainerName}</span>
                </div>
                <div>
                  <span style={{ color: '#64748B', display: 'block', fontSize: 11, textTransform: 'uppercase', fontWeight: 700 }}>Issue Date</span>
                  <span style={{ color: '#334155', fontWeight: 600 }}>
                    {result.issuedAt ? new Date(result.issuedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—'}
                  </span>
                </div>
                <div style={{ borderTop: '1px solid #BBF7D0', paddingTop: 10, marginTop: 4 }}>
                  <span style={{ color: '#64748B', display: 'block', fontSize: 11, textTransform: 'uppercase', fontWeight: 700 }}>Verification Code</span>
                  <span style={{ color: '#15803D', fontWeight: 800, fontFamily: 'monospace', fontSize: 15 }}>{result.code}</span>
                </div>
              </div>
            </div>
          )}

          {/* Error / Not Found */}
          {errorMsg && (
            <div style={{
              background: '#FEF2F2',
              borderRadius: 14,
              border: '1.5px solid #FCA5A5',
              padding: '16px',
              color: '#B91C1C',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              textAlign: 'left',
              fontSize: 13
            }}>
              <XCircle size={20} style={{ flexShrink: 0 }} />
              <div>{errorMsg}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
