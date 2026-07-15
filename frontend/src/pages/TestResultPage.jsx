import { useParams, Link } from 'react-router-dom';

export default function TestResultPage() {
  const { testId, attemptId } = useParams();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6 text-center">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
        <div className="mb-4 text-5xl">✅</div>
        <h1 className="mb-2 text-2xl font-bold text-slate-900">Test Submitted</h1>
        <p className="mb-6 text-slate-600">
          Thank you for completing the test. Your responses have been recorded.
        </p>
        <div className="mb-6 rounded-lg bg-slate-50 p-4 text-left text-sm text-slate-700">
          <p><span className="font-semibold">Attempt ID:</span> {attemptId}</p>
          <p><span className="font-semibold">Test ID:</span> {testId}</p>
        </div>
        <Link
          to="/participant"
          className="inline-block rounded-lg bg-primary-600 px-6 py-2.5 font-semibold text-white hover:bg-primary-700"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
