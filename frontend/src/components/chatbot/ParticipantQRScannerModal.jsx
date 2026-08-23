import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, X, CheckCircle, AlertTriangle, RefreshCw, ShieldAlert, VideoOff } from 'lucide-react';
import jsQR from 'jsqr';

export default function ParticipantQRScannerModal({ isOpen, onClose, onScanSuccess }) {
  const [permissionState, setPermissionState] = useState('prompt'); // 'prompt' | 'requesting' | 'granted' | 'denied' | 'error'
  const [errorMessage, setErrorMessage] = useState('');
  const [scanStatus, setScanStatus] = useState('scanning'); // 'scanning' | 'validating' | 'success' | 'invalid'
  const [scannedData, setScannedData] = useState(null);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const scanLoopRef = useRef(null);

  // Stop camera tracks
  const stopCamera = useCallback(() => {
    if (scanLoopRef.current) {
      cancelAnimationFrame(scanLoopRef.current);
      scanLoopRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // Close & clean up
  const handleClose = useCallback(() => {
    stopCamera();
    setPermissionState('prompt');
    setScanStatus('scanning');
    setScannedData(null);
    setErrorMessage('');
    onClose?.();
  }, [stopCamera, onClose]);

  // Start continuous QR scanning loop
  const startScanningLoop = useCallback(() => {
    const scanFrame = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && video.readyState === video.HAVE_ENOUGH_DATA && canvas) {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        });

        if (code && code.data && code.data.trim().length > 0) {
          handleDetectedQR(code.data.trim());
          return; // Pause scanning loop while validating
        }
      }

      scanLoopRef.current = requestAnimationFrame(scanFrame);
    };

    scanLoopRef.current = requestAnimationFrame(scanFrame);
  }, []);

  // Request camera access
  const requestCameraPermission = async () => {
    setPermissionState('requesting');
    setErrorMessage('');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setPermissionState('error');
      setErrorMessage('Camera access is not supported by your browser or connection. Please ensure HTTPS is used.');
      return;
    }

    try {
      // Prefer back/environment camera on phones, fallback to standard user camera
      const constraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        await videoRef.current.play();
      }

      setPermissionState('granted');
      setScanStatus('scanning');
      startScanningLoop();
    } catch (err) {
      console.warn('Camera permission or access failed:', err.name, err.message);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setPermissionState('denied');
        setErrorMessage('Camera permission is blocked. Please enable camera permission in your browser/device settings and try again.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setPermissionState('error');
        setErrorMessage('No camera device found on your system. Please connect a webcam.');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setPermissionState('error');
        setErrorMessage('Camera is unavailable or currently in use by another application.');
      } else {
        setPermissionState('error');
        setErrorMessage(`Camera error: ${err.message || 'Unable to access video stream'}`);
      }
    }
  };

  // Process detected QR code string
  const handleDetectedQR = (rawData) => {
    setScanStatus('validating');
    stopCamera();

    // Check if valid LMS URL, token, or pairing payload
    const isLmsUrl = rawData.includes('assessment-mobile-join') ||
      rawData.includes('mobile-join') ||
      rawData.includes('token=') ||
      rawData.includes('http://') ||
      rawData.includes('https://') ||
      rawData.startsWith('{');

    if (isLmsUrl || rawData.length > 8) {
      setScannedData(rawData);
      setScanStatus('success');
      if (onScanSuccess) {
        onScanSuccess(rawData);
      }
    } else {
      setScanStatus('invalid');
      setErrorMessage("We couldn't read a valid LMS QR code. Make sure you are scanning the QR code displayed on your screen.");
    }
  };

  // Retry scanning
  const handleRetry = () => {
    setScanStatus('scanning');
    setScannedData(null);
    setErrorMessage('');
    requestCameraPermission();
  };

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, stopCamera]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 99999,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
          fontFamily: "'Poppins', sans-serif",
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          style={{
            background: '#FFFFFF',
            borderRadius: 20,
            width: '100%',
            maxWidth: 440,
            overflow: 'hidden',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* ── Modal Header ── */}
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#F8FAFC',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: '#F0FDF4',
                  border: '1px solid #BBF7D0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Camera size={18} color="#16A34A" />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0F172A' }}>
                  QR Code Scanner
                </h3>
                <span style={{ fontSize: 11, color: '#64748B' }}>
                  WAVE INIT LMS Mobile Pairing
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClose}
              style={{
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: '#64748B',
                padding: 4,
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <X size={18} />
            </button>
          </div>

          {/* ── Modal Body ── */}
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {/* Hidden canvas for decoding */}
            <canvas ref={canvasRef} style={{ display: 'none' }} />

            {/* ── STATE 1: Permission Prompt ── */}
            {permissionState === 'prompt' && (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: '50%',
                    background: '#F0FDF4',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 16px',
                    border: '2px solid #BBF7D0',
                  }}
                >
                  <Camera size={32} color="#16A34A" />
                </div>
                <h4 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
                  Camera Access Required
                </h4>
                <p style={{ margin: '0 0 20px', fontSize: 12.5, color: '#475569', lineHeight: 1.5 }}>
                  Camera access is required to scan the secondary proctoring QR code shown on your assessment or interview screen.
                </p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                  <button
                    type="button"
                    onClick={handleClose}
                    style={{
                      padding: '9px 18px',
                      background: '#F1F5F9',
                      border: '1px solid #E2E8F0',
                      borderRadius: 10,
                      color: '#475569',
                      fontSize: 12.5,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={requestCameraPermission}
                    style={{
                      padding: '9px 20px',
                      background: '#16A34A',
                      border: 'none',
                      borderRadius: 10,
                      color: '#FFFFFF',
                      fontSize: 12.5,
                      fontWeight: 600,
                      cursor: 'pointer',
                      boxShadow: '0 2px 6px rgba(22, 163, 74, 0.3)',
                    }}
                  >
                    Allow Camera
                  </button>
                </div>
              </div>
            )}

            {/* ── STATE 2: Requesting ── */}
            {permissionState === 'requesting' && (
              <div style={{ textAlign: 'center', padding: '30px 0' }}>
                <RefreshCw size={36} color="#16A34A" style={{ animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
                <h4 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 600, color: '#0F172A' }}>
                  Connecting Camera...
                </h4>
                <p style={{ margin: 0, fontSize: 12, color: '#64748B' }}>
                  Please click "Allow" if prompted by your browser.
                </p>
              </div>
            )}

            {/* ── STATE 3: Camera Stream & Scanning ── */}
            {permissionState === 'granted' && scanStatus === 'scanning' && (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div
                  style={{
                    width: '100%',
                    height: 260,
                    borderRadius: 12,
                    overflow: 'hidden',
                    background: '#000000',
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />

                  {/* Target Square Overlay */}
                  <div
                    style={{
                      position: 'absolute',
                      width: 180,
                      height: 180,
                      border: '2px solid #22C55E',
                      borderRadius: 12,
                      boxShadow: '0 0 0 4000px rgba(0, 0, 0, 0.45)',
                      pointerEvents: 'none',
                    }}
                  >
                    {/* Animated Scanning Laser Line */}
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        height: 2,
                        background: '#22C55E',
                        boxShadow: '0 0 8px #22C55E',
                        animation: 'scanLaser 2s ease-in-out infinite',
                      }}
                    />
                  </div>
                </div>

                <p style={{ margin: '14px 0 0', fontSize: 12, color: '#64748B', textAlign: 'center' }}>
                  Align the QR code within the green square to scan.
                </p>
              </div>
            )}

            {/* ── STATE 4: Success ── */}
            {scanStatus === 'success' && (
              <div style={{ textAlign: 'center', padding: '16px 0', width: '100%' }}>
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    background: '#F0FDF4',
                    border: '2px solid #BBF7D0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 14px',
                  }}
                >
                  <CheckCircle size={32} color="#16A34A" />
                </div>
                <h4 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
                  QR Code Scanned Successfully!
                </h4>
                <p style={{ margin: '0 0 16px', fontSize: 12.5, color: '#475569' }}>
                  Secondary proctoring pairing validated. You can now proceed.
                </p>
                {scannedData && (scannedData.startsWith('http://') || scannedData.startsWith('https://')) && (
                  <a
                    href={scannedData}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'inline-block',
                      margin: '0 auto 16px',
                      padding: '8px 16px',
                      background: '#EFF6FF',
                      border: '1px solid #BFDBFE',
                      borderRadius: 8,
                      color: '#1D4ED8',
                      fontSize: 11.5,
                      fontWeight: 600,
                      textDecoration: 'none',
                      maxWidth: '90%',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Open Link: {scannedData}
                  </a>
                )}
                <button
                  type="button"
                  onClick={handleClose}
                  style={{
                    padding: '9px 24px',
                    background: '#16A34A',
                    border: 'none',
                    borderRadius: 10,
                    color: '#FFFFFF',
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: 'pointer',
                    width: '100%',
                  }}
                >
                  Done
                </button>
              </div>
            )}

            {/* ── STATE 5: Invalid QR ── */}
            {scanStatus === 'invalid' && (
              <div style={{ textAlign: 'center', padding: '16px 0', width: '100%' }}>
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    background: '#FEF2F2',
                    border: '2px solid #FECACA',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 14px',
                  }}
                >
                  <AlertTriangle size={30} color="#DC2626" />
                </div>
                <h4 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: '#0F172A' }}>
                  Invalid or Unreadable QR Code
                </h4>
                <div
                  style={{
                    background: '#FFF7ED',
                    border: '1px solid #FFEDD5',
                    borderRadius: 8,
                    padding: '10px 14px',
                    fontSize: 11.5,
                    color: '#9A3412',
                    textAlign: 'left',
                    margin: '12px 0 16px',
                    lineHeight: 1.5,
                  }}
                >
                  <strong>Tips to scan successfully:</strong>
                  <ul style={{ margin: '6px 0 0', paddingLeft: 16 }}>
                    <li>Keep the QR code clearly visible inside the square.</li>
                    <li>Increase your screen brightness if needed.</li>
                    <li>Hold your device steady and avoid glare.</li>
                  </ul>
                </div>
                <button
                  type="button"
                  onClick={handleRetry}
                  style={{
                    padding: '9px 20px',
                    background: '#16A34A',
                    border: 'none',
                    borderRadius: 10,
                    color: '#FFFFFF',
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: 'pointer',
                    width: '100%',
                  }}
                >
                  Try Again
                </button>
              </div>
            )}

            {/* ── STATE 6: Denied / Error ── */}
            {(permissionState === 'denied' || permissionState === 'error') && (
              <div style={{ textAlign: 'center', padding: '16px 0', width: '100%' }}>
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    background: '#FEF2F2',
                    border: '2px solid #FECACA',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 14px',
                  }}
                >
                  {permissionState === 'denied' ? (
                    <ShieldAlert size={30} color="#DC2626" />
                  ) : (
                    <VideoOff size={30} color="#DC2626" />
                  )}
                </div>
                <h4 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: '#0F172A' }}>
                  {permissionState === 'denied' ? 'Camera Permission Blocked' : 'Camera Unavailable'}
                </h4>
                <p style={{ margin: '0 0 16px', fontSize: 12, color: '#475569', lineHeight: 1.5 }}>
                  {errorMessage}
                </p>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    onClick={handleClose}
                    style={{
                      flex: 1,
                      padding: '9px 16px',
                      background: '#F1F5F9',
                      border: '1px solid #E2E8F0',
                      borderRadius: 10,
                      color: '#475569',
                      fontSize: 12.5,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={requestCameraPermission}
                    style={{
                      flex: 1,
                      padding: '9px 16px',
                      background: '#16A34A',
                      border: 'none',
                      borderRadius: 10,
                      color: '#FFFFFF',
                      fontSize: 12.5,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Retry Access
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>

        {/* Global style for laser animation */}
        <style>{`
          @keyframes scanLaser {
            0% { top: 0%; opacity: 0.8; }
            50% { top: 96%; opacity: 1; }
            100% { top: 0%; opacity: 0.8; }
          }
        `}</style>
      </div>
    </AnimatePresence>
  );
}
