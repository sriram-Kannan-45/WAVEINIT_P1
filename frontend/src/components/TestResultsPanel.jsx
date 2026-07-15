import PropTypes from 'prop-types';
import { CheckCircle2, Loader, XCircle } from 'lucide-react';

const TestResultsPanel = ({ results, loading }) => {
  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center space-y-3 text-slate-600">
        <Loader className="h-8 w-8 animate-spin" />
        <p className="text-sm font-medium">Running tests...</p>
      </div>
    );
  }

  if (!results) {
    return (
      <div className="flex h-full items-center justify-center text-slate-500">
        Submit your code to see results.
      </div>
    );
  }

  const { score, results: rawResults, tests: legacyTests } = results || {};
  const tests = (rawResults || legacyTests || []).map((test, index) => ({
    id: test?.id ?? index,
    passed: test?.status === 'OK' || test?.passed === true,
    input: test?.stdin ?? test?.input ?? '',
    expected: test?.expectedOutput ?? test?.expected ?? '',
    output: test?.actualOutput ?? test?.output ?? '',
    isHidden: !!test?.isHidden,
    message: test?.message ?? '',
  }));

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900">Test Results</h2>
        {score !== undefined && score !== null && (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-800">
            Score: {score}
          </span>
        )}
      </div>

      {tests.length === 0 ? (
        <p className="text-slate-500">No test results available.</p>
      ) : (
        <div className="space-y-4">
          {tests.map((test, index) => {
            const passed = !!test.passed;
            return (
              <div
                key={test.id || index}
                className={`rounded-lg border p-4 shadow-sm ${
                  passed
                    ? 'border-green-200 bg-green-50'
                    : 'border-red-200 bg-red-50'
                }`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    {passed ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-600" />
                    )}
                    <span
                      className={`font-semibold ${
                        passed ? 'text-green-800' : 'text-red-800'
                      }`}
                    >
                      {passed ? 'Passed' : 'Failed'}
                    </span>
                  </div>
                  <span className="text-xs text-slate-500">Test {index + 1}</span>
                </div>

                {test.isHidden && (
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                    Hidden Test Case
                  </p>
                )}

                {!test.isHidden && (
                  <div className="space-y-3">
                    <div>
                      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Input
                      </span>
                      <pre className="mt-1 overflow-x-auto rounded bg-white p-2 text-sm text-slate-800">
                        {test.input}
                      </pre>
                    </div>

                    {!passed && (
                      <>
                        <div>
                          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                            Expected
                          </span>
                          <pre className="mt-1 overflow-x-auto rounded bg-white p-2 text-sm text-slate-800">
                            {test.expected}
                          </pre>
                        </div>
                        <div>
                          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                            Got
                          </span>
                          <pre className="mt-1 overflow-x-auto rounded bg-white p-2 text-sm text-slate-800">
                            {test.output}
                          </pre>
                        </div>
                      </>
                    )}

                    {passed && (
                      <div>
                        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          Expected
                        </span>
                        <pre className="mt-1 overflow-x-auto rounded bg-white p-2 text-sm text-slate-800">
                          {test.expected}
                        </pre>
                      </div>
                    )}
                  </div>
                )}

                {test.message && (
                  <p className="mt-3 text-sm text-slate-700">{test.message}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

TestResultsPanel.propTypes = {
  loading: PropTypes.bool,
  results: PropTypes.shape({
    score: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    results: PropTypes.arrayOf(PropTypes.object),
    tests: PropTypes.arrayOf(
      PropTypes.shape({
        id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
        passed: PropTypes.bool,
        input: PropTypes.string,
        expected: PropTypes.string,
        output: PropTypes.string,
        isHidden: PropTypes.bool,
        message: PropTypes.string,
      })
    ),
  }),
};

export default TestResultsPanel;
