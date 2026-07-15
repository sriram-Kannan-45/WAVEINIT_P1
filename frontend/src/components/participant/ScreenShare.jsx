/**
 * ScreenShare — participant-facing screen-share control.
 *
 * Integrates with the proctoring context to:
 *   - Start/stop screen capture via getDisplayMedia.
 *   - Publish the screen stream to the backend so trainers can observe.
 *   - Show clear status indicators and toast feedback.
 */
import { useCallback, useEffect } from 'react';
import { Monitor, MonitorOff, AlertCircle } from 'lucide-react';
import { useProctor } from '../../proctoring/ProctorContext';
import useScreenShare from '../../proctoring/hooks/useScreenShare';
import { useToast } from '../Toast';

export default function ScreenShare() {
  const { success, error: showError } = useToast();
  const {
    session,
    socket,
    screenStream,
    setScreenStream,
    pushState,
  } = useProctor();

  const sessionId = session?.sessionId;
  const isActive = session?.status === 'ACTIVE';

  const onStop = useCallback(() => {
    // Setting the stream to null triggers ProctorContext cleanup,
    // which stops tracks, closes peer connections, and emits stream-ended.
    setScreenStream(null);
    pushState({ isScreenSharing: false });
    success('Screen sharing stopped');
  }, [setScreenStream, pushState, success]);

  const onDenied = useCallback((err) => {
    showError(err?.message || 'Screen sharing permission was denied');
  }, [showError]);

  const onInvalidShare = useCallback((err) => {
    showError(err?.message || 'Invalid screen share. Please share your entire screen.');
  }, [showError]);

  const { stream, isSharing, request, stop, error } = useScreenShare({
    onStop,
    onDenied,
    onInvalidShare,
  });

  // Sync the acquired stream into ProctorContext and notify trainers.
  useEffect(() => {
    if (!stream || !sessionId || !socket) return;

    setScreenStream(stream);
    pushState({ isScreenSharing: true });
    // stream-available is emitted by ProctorContext once it receives the stream.
    success('Screen sharing started — trainers can now observe your screen');

    // If the stream is already ended (browser UI stop), clean up immediately.
    const [videoTrack] = stream.getVideoTracks();
    if (videoTrack?.readyState === 'ended') {
      onStop();
    }
  }, [stream, sessionId, socket, setScreenStream, pushState, success, onStop]);

  // Surface hook-level errors via toast.
  useEffect(() => {
    if (error) {
      showError(error.message || 'Screen sharing failed');
    }
  }, [error, showError]);

  const handleStart = async () => {
    if (!isActive) {
      showError('You can only start screen sharing once the exam is active');
      return;
    }
    await request();
  };

  const handleStop = () => {
    stop();
    onStop();
  };

  const isSharingActive = isSharing || !!screenStream;

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border bg-white/80 border-slate-200/60 backdrop-blur-sm shadow-sm">
      <div
        className={`flex items-center justify-center w-10 h-10 rounded-lg ${
          isSharingActive
            ? 'bg-emerald-100 text-emerald-600'
            : 'bg-slate-100 text-slate-500'
        }`}
        aria-hidden="true"
      >
        {isSharingActive ? <Monitor size={20} /> : <MonitorOff size={20} />}
      </div>

      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-semibold text-slate-800">
          {isSharingActive ? 'Screen sharing is active' : 'Screen sharing is stopped'}
        </h4>
        <p className="text-xs text-slate-500 truncate">
          {isSharingActive
            ? 'Trainers can observe your screen in real time.'
            : 'Start sharing so trainers can monitor your exam session.'}
        </p>
      </div>

      {isSharingActive ? (
        <button
          type="button"
          onClick={handleStop}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-rose-500 rounded-lg hover:bg-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-500/40 transition-colors"
        >
          <MonitorOff size={16} />
          Stop sharing
        </button>
      ) : (
        <button
          type="button"
          onClick={handleStart}
          disabled={!isActive}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
        >
          <Monitor size={16} />
          Share screen
        </button>
      )}

      {error && !isSharingActive && (
        <div className="flex items-center gap-1.5 text-xs text-rose-600" title={error.message}>
          <AlertCircle size={14} />
          <span className="hidden sm:inline">Error</span>
        </div>
      )}
    </div>
  );
}
