import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { API_BASE } from '../api/api';
import useScreenShare from '../proctoring/hooks/useScreenShare';
import useAntiCheat from '../hooks/useAntiCheat';
import { captureFrameAsBase64 } from '../utils/captureFrame';
import Timer from '../components/Timer';
import { useSocket } from '../hooks/useSocket';

const authHeaders = (token) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
});

export default function TestPage({ user }) {
  const navigate = useNavigate();
  const { testId } = useParams();
  const token = user?.token;

  const [showModal, setShowModal] = useState(true);
  const [modalError, setModalError] = useState('');

  const [attemptId, setAttemptId] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [duration, setDuration] = useState(0);
  const [answers, setAnswers] = useState({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [testStarted, setTestStarted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [testBlocked, setTestBlocked] = useState(false);
  const [blockMessage, setBlockMessage] = useState('');
  const [trainerWarning, setTrainerWarning] = useState('');
  const [showTrainerWarning, setShowTrainerWarning] = useState(false);

  const answersRef = useRef({});
  const screenshotIntervalRef = useRef(null);
  const autoSaveIntervalRef = useRef(null);
  const timeSyncIntervalRef = useRef(null);
  const streamRef = useRef(null);

  const socket = useSocket(token);

  const {
    stream,
    isSharing,
    error: screenShareError,
    request: requestScreenShare,
    stop: stopScreenShare,
  } = useScreenShare({
    onStop: () => {
      if (!attemptId) return;
      socket?.emit('violation', {
        attemptId,
        participantId: user.id,
        type: 'screen_share_stopped',
        timestamp: new Date().toISOString(),
      });
      setBlockMessage('You stopped screen sharing. Please re-share your screen to continue.');
      setTestBlocked(true);
      clearInterval(screenshotIntervalRef.current);
    },
    onDenied: (msg) => {
      setModalError(msg);
    },
  });

  useEffect(() => { streamRef.current = stream; }, [stream]);

  const {
    warningMessage,
    showWarning,
    emitViolation,
    showLocalWarning,
  } = useAntiCheat({
    attemptId,
    participantId: user?.id,
    socket,
    enabled: testStarted && !showModal,
  });

  // ── Socket listeners ───────────────────────────────────────────────────
  useEffect(() => {
    if (!socket || !attemptId) return;

    const onTrainerWarning = ({ message }) => {
      setTrainerWarning(message);
      setShowTrainerWarning(true);
      setTimeout(() => setShowTrainerWarning(false), 10000);
    };

    const onForceSubmit = ({ reason }) => {
      handleSubmit(true, reason);
    };

    socket.on('trainer-warning', onTrainerWarning);
    socket.on('force-submit', onForceSubmit);

    return () => {
      socket.off('trainer-warning', onTrainerWarning);
      socket.off('force-submit', onForceSubmit);
    };
  }, [socket, attemptId]);

  // ── Start screenshot capture ───────────────────────────────────────────
  const startScreenshotCapture = useCallback(() => {
    clearInterval(screenshotIntervalRef.current);
    screenshotIntervalRef.current = setInterval(() => {
      const base64Image = captureFrameAsBase64(streamRef.current);
      if (base64Image && attemptId) {
        socket?.emit('screen-frame', {
          attemptId,
          participantId: user.id,
          imageBase64: base64Image,
          timestamp: new Date().toISOString(),
        });
      }
    }, 30000);
  }, [attemptId, socket, user?.id]);

  // ── Start auto-save ────────────────────────────────────────────────────
  const startAutoSave = useCallback(() => {
    clearInterval(autoSaveIntervalRef.current);
    autoSaveIntervalRef.current = setInterval(async () => {
      if (!attemptId) return;
      try {
        await axios.post(
          `${API_BASE}/tests/${testId}/attempts/${attemptId}/save`,
          { answers: Object.values(answersRef.current) },
          { headers: authHeaders(token) }
        );
      } catch (err) {
        console.warn('Auto-save failed silently:', err);
      }
    }, 60000);
  }, [attemptId, testId, token]);

  // ── Time sync with backend ─────────────────────────────────────────────
  const syncTimeWithBackend = useCallback(async () => {
    if (!attemptId) return;
    try {
      const res = await axios.get(
        `${API_BASE}/tests/${testId}/attempts/${attemptId}/time-remaining`,
        { headers: authHeaders(token) }
      );
      const backendSeconds = res.data?.remainingSeconds ?? duration;
      const diff = Math.abs(duration - backendSeconds);
      if (diff > 10) {
        setDuration(backendSeconds);
      }
    } catch (err) {
      console.warn('Time sync failed:', err);
    }
  }, [attemptId, testId, token, duration]);

  // ── Request fullscreen ─────────────────────────────────────────────────
  const requestFullscreen = async () => {
    try {
      await document.documentElement.requestFullscreen();
      return true;
    } catch {
      return false;
    }
  };

  // ── Modal: Begin test ──────────────────────────────────────────────────
  const handleBegin = useCallback(async () => {
    setModalError('');

    const screenStream = await requestScreenShare();
    if (!screenStream) {
      setModalError(screenShareError || 'Screen sharing was denied. It is required to start the test.');
      return;
    }

    const fullscreenOk = await requestFullscreen();
    if (!fullscreenOk) {
      setModalError('Fullscreen mode is required to start the test.');
      return;
    }

    try {
      const res = await axios.post(
        `${API_BASE}/tests/${testId}/start`,
        { participantId: user.id, testId: Number(testId) },
        { headers: authHeaders(token) }
      );

      const { attemptId: newAttemptId, questions: qs, duration: dur } = res.data;
      setAttemptId(newAttemptId);
      setQuestions(qs || []);
      setDuration(dur || 0);
      setShowModal(false);
      setTestStarted(true);

      socket?.emit('join-session', {
        participantId: user.id,
        sessionId: Number(testId),
        attemptId: newAttemptId,
      });
    } catch (err) {
      setModalError(err.response?.data?.error || err.message || 'Failed to start test');
      stopScreenShare();
      if (document.fullscreenElement) document.exitFullscreen();
    }
  }, [requestScreenShare, screenShareError, stopScreenShare, testId, token, user?.id, socket]);

  // ── Start intervals once attempt is active ─────────────────────────────
  useEffect(() => {
    if (!testStarted || !attemptId) return;

    startScreenshotCapture();
    startAutoSave();
    timeSyncIntervalRef.current = setInterval(syncTimeWithBackend, 60000);

    return () => {
      clearInterval(screenshotIntervalRef.current);
      clearInterval(autoSaveIntervalRef.current);
      clearInterval(timeSyncIntervalRef.current);
    };
  }, [testStarted, attemptId, startScreenshotCapture, startAutoSave, syncTimeWithBackend]);

  // ── Answer selection ───────────────────────────────────────────────────
  const handleAnswer = (questionId, selectedOption) => {
    const next = { ...answersRef.current, [questionId]: { questionId, selectedOption } };
    answersRef.current = next;
    setAnswers(next);
  };

  // ── Submit / auto-submit ───────────────────────────────────────────────
  const handleSubmit = useCallback(async (auto = false, reason = '') => {
    if (!attemptId || submitting) return;
    setSubmitting(true);

    clearInterval(screenshotIntervalRef.current);
    clearInterval(autoSaveIntervalRef.current);
    clearInterval(timeSyncIntervalRef.current);

    try {
      await axios.post(
        `${API_BASE}/tests/${testId}/attempts/${attemptId}/submit`,
        { answers: Object.values(answersRef.current), autoSubmitted: auto },
        { headers: authHeaders(token) }
      );

      stopScreenShare();
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      }

      socket?.emit('leave-session', { participantId: user.id, attemptId });
      navigate(`/test/${testId}/result/${attemptId}`);
    } catch (err) {
      console.error(auto ? 'Auto-submit failed:' : 'Submit failed:', err);
      setSubmitting(false);
      if (auto) {
        setTimeout(() => handleSubmit(true, reason), 3000);
      }
    }
  }, [attemptId, submitting, testId, token, stopScreenShare, socket, user?.id, navigate]);

  const onTimeUp = useCallback(() => {
    handleSubmit(true, 'Time expired');
  }, [handleSubmit]);

  const answeredCount = Object.keys(answers).length;

  // ── Re-share screen ────────────────────────────────────────────────────
  const handleReshare = async () => {
    const screenStream = await requestScreenShare();
    if (screenStream) {
      setTestBlocked(false);
      setBlockMessage('');
      startScreenshotCapture();
    }
  };

  // ── Cleanup on unmount ─────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      clearInterval(screenshotIntervalRef.current);
      clearInterval(autoSaveIntervalRef.current);
      clearInterval(timeSyncIntervalRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      if (attemptId) {
        socket?.emit('leave-session', { participantId: user?.id, attemptId });
      }
    };
  }, [attemptId, socket, user?.id]);

  // ── Render ─────────────────────────────────────────────────────────────
  if (showModal) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
        <div className="w-full max-w-xl rounded-2xl bg-white p-8 shadow-2xl">
          <h2 className="mb-4 text-2xl font-bold text-slate-900">Before You Begin</h2>
          <ul className="mb-6 list-disc space-y-2 pl-5 text-slate-700">
            <li>This test is timed. Once started, the timer cannot be paused.</li>
            <li>Screen sharing is mandatory throughout the test.</li>
            <li>Do not switch tabs or windows during the test.</li>
            <li>Do not exit fullscreen mode during the test.</li>
            <li>Violations will be recorded and reported to your trainer.</li>
            <li>Closing the browser will auto-submit your test.</li>
          </ul>
          {modalError && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {modalError}
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button
              onClick={() => navigate('/participant')}
              className="rounded-lg px-5 py-2.5 text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              onClick={handleBegin}
              className="rounded-lg bg-primary-600 px-5 py-2.5 font-semibold text-white hover:bg-primary-700"
            >
              I Understand, Share My Screen
            </button>
          </div>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      {/* Anti-cheat local warning */}
      {showWarning && (
        <div className="fixed left-0 right-0 top-0 z-50 bg-orange-500 px-4 py-2 text-center text-sm font-semibold text-white">
          {warningMessage}
        </div>
      )}

      {/* Trainer warning banner */}
      {showTrainerWarning && (
        <div className="fixed left-0 right-0 top-0 z-50 bg-red-600 px-4 py-2 text-center text-sm font-semibold text-white">
          ⚠ Trainer Warning: {trainerWarning}
        </div>
      )}

      {/* Screen-share block overlay */}
      {testBlocked && (
        <div className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-black/80 p-4 text-white">
          <p className="mb-4 text-center text-lg">{blockMessage}</p>
          <button
            onClick={handleReshare}
            className="rounded-lg bg-primary-600 px-6 py-3 font-semibold hover:bg-primary-700"
          >
            Re-share Screen
          </button>
        </div>
      )}

      {/* Top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-white px-6 py-3 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-800">Test</h1>
        <Timer durationInSeconds={duration} onTimeUp={onTimeUp} attemptId={attemptId} />
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Question nav panel */}
        <aside className="w-64 overflow-y-auto border-r bg-white p-4">
          <p className="mb-3 text-sm font-semibold text-slate-500">Question Navigator</p>
          <div className="grid grid-cols-4 gap-2">
            {questions.map((q, idx) => (
              <button
                key={q.id}
                onClick={() => setCurrentQuestionIndex(idx)}
                className={`rounded-md py-2 text-sm font-medium ${
                  idx === currentQuestionIndex
                    ? 'bg-primary-600 text-white'
                    : answers[q.id]
                    ? 'bg-green-100 text-green-700'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {idx + 1}
              </button>
            ))}
          </div>
        </aside>

        {/* Main question area */}
        <main className="flex-1 overflow-y-auto p-8">
          {currentQuestion && (
            <div className="mx-auto max-w-3xl rounded-2xl bg-white p-8 shadow-sm">
              <p className="mb-6 text-lg font-medium text-slate-900">
                {currentQuestionIndex + 1}. {currentQuestion.text}
              </p>
              <div className="space-y-3">
                {currentQuestion.options?.map((opt) => (
                  <label
                    key={opt.id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border p-4 hover:bg-slate-50"
                  >
                    <input
                      type="radio"
                      name={`q-${currentQuestion.id}`}
                      checked={answers[currentQuestion.id]?.selectedOption === opt.id}
                      onChange={() => handleAnswer(currentQuestion.id, opt.id)}
                      className="h-5 w-5 text-primary-600"
                    />
                    <span className="text-slate-700">{opt.text}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="mx-auto mt-8 flex max-w-3xl items-center justify-between">
            <button
              disabled={currentQuestionIndex === 0}
              onClick={() => setCurrentQuestionIndex((i) => Math.max(0, i - 1))}
              className="rounded-lg border bg-white px-5 py-2.5 text-slate-700 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              disabled={currentQuestionIndex === questions.length - 1}
              onClick={() => setCurrentQuestionIndex((i) => Math.min(questions.length - 1, i + 1))}
              className="rounded-lg border bg-white px-5 py-2.5 text-slate-700 disabled:opacity-50"
            >
              Next
            </button>
          </div>

          <div className="mx-auto mt-8 max-w-3xl">
            <button
              onClick={() => setShowSubmitConfirm(true)}
              disabled={submitting}
              className="w-full rounded-lg bg-primary-600 px-6 py-3 font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {submitting ? 'Submitting…' : 'Submit Test'}
            </button>
          </div>
        </main>
      </div>

      {/* Submit confirmation modal */}
      {showSubmitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="mb-2 text-lg font-bold text-slate-900">Submit Test?</h3>
            <p className="mb-6 text-slate-600">
              You have answered {answeredCount} of {questions.length} questions. Submit now?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowSubmitConfirm(false)}
                className="rounded-lg px-5 py-2.5 text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowSubmitConfirm(false);
                  handleSubmit(false);
                }}
                className="rounded-lg bg-primary-600 px-5 py-2.5 font-semibold text-white hover:bg-primary-700"
              >
                Confirm Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
