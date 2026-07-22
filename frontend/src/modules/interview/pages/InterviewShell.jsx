import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import InterviewDashboard from './InterviewDashboard';
import CreateInterview from './CreateInterview';
import UpcomingInterviews from './UpcomingInterviews';
import CompletedInterviews from './CompletedInterviews';
import EvaluationPage from './EvaluationPage';
import InterviewReports from './InterviewReports';
import InterviewTemplates from './InterviewTemplates';
import InterviewSettings from './InterviewSettings';

export default function InterviewShell({ activeTab, onTabChange, user }) {
  const navigate = useNavigate();
  const [interviewId, setInterviewId] = useState(null);

  const handleTabChange = useCallback((key, payload) => {
    if (key === 'interview-room' && payload?.interviewId) {
      navigate(`/interview/${payload.interviewId}/room`);
      return;
    }
    if (key === 'interview-evaluation' && payload?.interviewId) {
      setInterviewId(payload.interviewId);
      onTabChange?.('interview-evaluation');
      return;
    }
    if (key === 'interview-create' && payload?.template) {
      setInterviewId(null);
      onTabChange?.('interview-create');
      return;
    }
    setInterviewId(null);
    onTabChange?.(key);
  }, [navigate, onTabChange]);

  switch (activeTab) {
    case 'interview-create':
      return <CreateInterview user={user} onTabChange={handleTabChange} />;
    case 'interview-upcoming':
      return <UpcomingInterviews user={user} onTabChange={handleTabChange} />;
    case 'interview-completed':
      return <CompletedInterviews user={user} onTabChange={handleTabChange} />;
    case 'interview-evaluation':
      return <EvaluationPage user={user} interviewId={interviewId} />;
    case 'interview-reports':
      return <InterviewReports user={user} />;
    case 'interview-templates':
      return <InterviewTemplates user={user} onTabChange={handleTabChange} />;
    case 'interview-settings':
      return <InterviewSettings user={user} />;
    case 'interview-dashboard':
    default:
      return <InterviewDashboard user={user} onTabChange={handleTabChange} />;
  }
}
