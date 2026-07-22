import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertCircle } from 'lucide-react';
import PreJoinScreen from '../components/PreJoinScreen';
import InterviewRoom from '../components/InterviewRoom';

export default function InterviewRoomPage({ user }) {
  const { interviewId } = useParams();
  const navigate = useNavigate();
  const [phase, setPhase] = useState('prejoin');

  const handleJoin = () => {
    setPhase('room');
  };

  const handleExit = () => {
    setPhase('exited');
  };

  const handleBack = () => {
    navigate(-1);
  };

  if (phase === 'exited') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-2xl border border-slate-100 p-8 max-w-md w-full text-center"
        >
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-sm font-semibold text-slate-900 mb-1">Interview ended</h2>
          <p className="text-xs text-slate-500 mb-4">You have left the interview room.</p>
          <button
            onClick={handleBack}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl transition-colors"
          >
            Go Back
          </button>
        </motion.div>
      </div>
    );
  }

  if (phase === 'prejoin') {
    return (
      <PreJoinScreen
        interview={{ title: 'Interview', id: interviewId }}
        onJoin={handleJoin}
        onBack={handleBack}
      />
    );
  }

  return (
    <InterviewRoom
      interviewId={interviewId}
      user={user}
      onExit={handleExit}
    />
  );
}
