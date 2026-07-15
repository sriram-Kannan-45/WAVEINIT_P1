import PropTypes from 'prop-types';
import ReactMarkdown from 'react-markdown';

const containerStyle = {
  height: '100%',
  overflowY: 'auto',
  padding: '24px',
  color: '#e2e8f0',
};

const headingStyle = {
  fontSize: '22px',
  fontWeight: 700,
  color: '#f1f5f9',
  marginBottom: '16px',
  lineHeight: '28px',
};

const sectionStyle = {
  marginBottom: '20px',
};

const sectionHeadingStyle = {
  fontSize: '14px',
  fontWeight: 600,
  color: '#94a3b8',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  marginBottom: '8px',
};

const contentStyle = {
  fontSize: '14px',
  lineHeight: '22px',
  color: '#cbd5e1',
};

const preStyle = {
  margin: 0,
  whiteSpace: 'pre-wrap',
  color: '#e2e8f0',
  background: '#1e293b',
  padding: '10px 12px',
  borderRadius: '6px',
  fontSize: '13px',
  fontFamily: "'Fira Code', 'Consolas', monospace",
  border: '1px solid #334155',
  overflowX: 'auto',
};

const labelStyle = {
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  color: '#64748b',
  marginBottom: '4px',
  display: 'block',
};

const ProblemPanel = ({ problem }) => {
  if (!problem) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}>
        No problem selected.
      </div>
    );
  }

  const {
    title,
    statement,
    description: problemDescription,
    inputFormat,
    outputFormat,
    constraints,
    sampleInput,
    sampleOutput,
    explanation,
    difficulty,
    marks,
    testCases = [],
  } = problem;

  const description = statement || problemDescription || '';
  const visibleTestCases = testCases.filter((tc) => !tc.isHidden);

  const getDifficultyColor = (d) => {
    switch (d?.toUpperCase()) {
      case 'EASY': return '#4ade80';
      case 'MEDIUM': return '#fbbf24';
      case 'HARD': return '#f87171';
      default: return '#94a3b8';
    }
  };

  return (
    <div style={containerStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <h1 style={headingStyle}>{title}</h1>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        {difficulty && (
          <span style={{
            padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
            background: `${getDifficultyColor(difficulty)}20`,
            color: getDifficultyColor(difficulty),
            border: `1px solid ${getDifficultyColor(difficulty)}40`,
          }}>
            {difficulty}
          </span>
        )}
        {marks && (
          <span style={{
            padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
            background: '#1e293b', color: '#94a3b8', border: '1px solid #334155',
          }}>
            {marks} pts
          </span>
        )}
      </div>

      {description && (
        <div style={sectionStyle}>
          <div style={contentStyle}>
            <ReactMarkdown
              components={{
                code: ({ children }) => <code style={{ background: '#1e293b', padding: '1px 4px', borderRadius: 3, fontSize: '13px' }}>{children}</code>,
                pre: ({ children }) => <pre style={preStyle}>{children}</pre>,
                p: ({ children }) => <p style={{ margin: '0 0 8px 0' }}>{children}</p>,
                ul: ({ children }) => <ul style={{ paddingLeft: 20, margin: '0 0 8px 0' }}>{children}</ul>,
                ol: ({ children }) => <ol style={{ paddingLeft: 20, margin: '0 0 8px 0' }}>{children}</ol>,
                li: ({ children }) => <li style={{ marginBottom: 2 }}>{children}</li>,
                h3: ({ children }) => <h3 style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9', margin: '12px 0 6px' }}>{children}</h3>,
                strong: ({ children }) => <strong style={{ color: '#e2e8f0' }}>{children}</strong>,
              }}
            >
              {description}
            </ReactMarkdown>
          </div>
        </div>
      )}

      {inputFormat && (
        <div style={sectionStyle}>
          <div style={sectionHeadingStyle}>Input Format</div>
          <div style={contentStyle}>
            <ReactMarkdown
              components={{
                code: ({ children }) => <code style={{ background: '#1e293b', padding: '1px 4px', borderRadius: 3, fontSize: '13px' }}>{children}</code>,
                p: ({ children }) => <p style={{ margin: '0 0 6px 0' }}>{children}</p>,
              }}
            >
              {inputFormat}
            </ReactMarkdown>
          </div>
        </div>
      )}

      {outputFormat && (
        <div style={sectionStyle}>
          <div style={sectionHeadingStyle}>Output Format</div>
          <div style={contentStyle}>
            <ReactMarkdown
              components={{
                code: ({ children }) => <code style={{ background: '#1e293b', padding: '1px 4px', borderRadius: 3, fontSize: '13px' }}>{children}</code>,
                p: ({ children }) => <p style={{ margin: '0 0 6px 0' }}>{children}</p>,
              }}
            >
              {outputFormat}
            </ReactMarkdown>
          </div>
        </div>
      )}

      {constraints && (
        <div style={sectionStyle}>
          <div style={sectionHeadingStyle}>Constraints</div>
          <div style={contentStyle}>
            <ReactMarkdown
              components={{
                code: ({ children }) => <code style={{ background: '#1e293b', padding: '1px 4px', borderRadius: 3, fontSize: '13px' }}>{children}</code>,
                p: ({ children }) => <p style={{ margin: '0 0 6px 0' }}>{children}</p>,
                ul: ({ children }) => <ul style={{ paddingLeft: 20, margin: '0 0 6px 0' }}>{children}</ul>,
                li: ({ children }) => <li style={{ marginBottom: 2 }}>{children}</li>,
              }}
            >
              {constraints}
            </ReactMarkdown>
          </div>
        </div>
      )}

      {visibleTestCases.length > 0 && (
        <div style={sectionStyle}>
          <div style={sectionHeadingStyle}>Sample Test Cases</div>
          {visibleTestCases.map((tc, index) => (
            <div
              key={tc.id || index}
              style={{
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: 8,
                padding: '12px',
                marginBottom: 12,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 8 }}>
                Sample {index + 1}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <span style={labelStyle}>Input</span>
                  <pre style={preStyle}>{tc.input}</pre>
                </div>
                <div>
                  <span style={labelStyle}>Expected Output</span>
                  <pre style={preStyle}>{tc.expectedOutput}</pre>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {explanation && (
        <div style={sectionStyle}>
          <div style={sectionHeadingStyle}>Explanation</div>
          <div style={contentStyle}>
            <ReactMarkdown
              components={{
                code: ({ children }) => <code style={{ background: '#1e293b', padding: '1px 4px', borderRadius: 3, fontSize: '13px' }}>{children}</code>,
                p: ({ children }) => <p style={{ margin: '0 0 6px 0' }}>{children}</p>,
              }}
            >
              {explanation}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
};

ProblemPanel.propTypes = {
  problem: PropTypes.shape({
    title: PropTypes.string,
    statement: PropTypes.string,
    description: PropTypes.string,
    inputFormat: PropTypes.string,
    outputFormat: PropTypes.string,
    constraints: PropTypes.string,
    sampleInput: PropTypes.string,
    sampleOutput: PropTypes.string,
    explanation: PropTypes.string,
    difficulty: PropTypes.string,
    marks: PropTypes.number,
    testCases: PropTypes.arrayOf(
      PropTypes.shape({
        id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
        input: PropTypes.string,
        expectedOutput: PropTypes.string,
        isHidden: PropTypes.bool,
      })
    ),
  }),
};

export default ProblemPanel;