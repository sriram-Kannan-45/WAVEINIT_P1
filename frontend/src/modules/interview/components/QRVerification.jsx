import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { QrCode, RefreshCw, CheckCircle, Loader2, X } from 'lucide-react';
import interviewApi from '../api';

export default function QRVerification({ interviewId, onClose }) {
  const [qrData, setQrData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState(null);

  const generateQR = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await interviewApi.generateQR(interviewId);
      setQrData(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    generateQR();
  }, [interviewId]);

  const qrUrl = qrData ? `${window.location.origin}/interview/${interviewId}/mobile-verify?token=${qrData.token}` : '';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
              <QrCode size={16} className="text-emerald-600" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900">QR Verification</h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg"><X size={16} className="text-slate-400" /></button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center py-8">
            <Loader2 size={32} className="text-emerald-500 animate-spin" />
            <p className="text-xs text-slate-500 mt-2">Generating QR code...</p>
          </div>
        ) : verified ? (
          <div className="flex flex-col items-center py-8">
            <CheckCircle size={48} className="text-emerald-500 mb-2" />
            <p className="text-sm font-semibold text-slate-900">Verified!</p>
            <p className="text-xs text-slate-500">Mobile camera connected</p>
          </div>
        ) : error ? (
          <div className="text-center py-4">
            <p className="text-xs text-red-500 mb-3">{error}</p>
            <button onClick={generateQR} className="text-xs text-emerald-600 font-medium flex items-center gap-1 mx-auto">
              <RefreshCw size={12} /> Retry
            </button>
          </div>
        ) : qrData ? (
          <div className="flex flex-col items-center">
            <div className="w-48 h-48 bg-white border-2 border-slate-100 rounded-xl flex items-center justify-center mb-3">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrUrl)}`}
                alt="QR Code"
                className="w-full h-full p-2"
              />
            </div>
            <p className="text-xs text-slate-500 text-center mb-2">
              Scan with your registered mobile device
            </p>
            <p className="text-xs text-slate-400 text-center">
              QR expires in 5 minutes
            </p>
            <button
              onClick={generateQR}
              className="mt-3 text-xs text-emerald-600 font-medium flex items-center gap-1"
            >
              <RefreshCw size={12} /> Regenerate
            </button>
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}
