import PropTypes from 'prop-types';
import ReactMarkdown from 'react-markdown';

const containerStyle = {
  height: '100%',
  overflowY: 'auto',
  padding: '24px',
  color: '#E2E8F0',
  background: '#0B0F19',
};

const headingStyle = {
  fontSize: '20px',
  fontWeight: 700,
  color: '#FFFFFF',
  marginBottom: '14px',
  lineHeight: '26px',
  letterSpacing: '-0.01em',
};

const sectionStyle = {
  marginBottom: '22px',
};

const sectionHeadingStyle = {
  fontSize: '12px',
  fontWeight: 700,
  color: '#4ADE80',
  textTransform: 'uppercase',
  letterSpacing: '0.6px',
  marginBottom: '8px',
};

const contentStyle = {
  fontSize: '13.5px',
  lineHeight: '22px',
  color: '#CBD5E1',
};

const preStyle = {
  margin: 0,
  whiteSpace: 'pre-wrap',
  color: '#F8FAFC',
  background: '#060913',
  padding: '10px 14px',
  borderRadius: '8px',
  fontSize: '13px',
  fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
  border: '1px solid #1E293B',
  overflowX: 'auto',
};

const labelStyle = {
  fontSize: '11px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  color: '#94A3B8',
  marginBottom: '6px',
  display: 'block',
};

const ProblemPanel = ({ problem }) => {
  if (!problem) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', background: '#0B0F19' }}>
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
      case 'EASY': return '#4ADE80';
      case 'MEDIUM': return '#FBBF24';
      case 'HARD': return '#F87171';
      default: return '#94A3B8';
    }
  };

  const diffColor = getDifficultyColor(difficulty);

  return (
    <div style={containerStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <h1 style={headingStyle}>{title}</h1>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        {difficulty && (
          <span style={{
            padding: '3px 10px', borderRadius: 6, fontSize: 11.5, fontWeight: 700,
            background: `${diffColor}18`,
            color: diffColor,
            border: `1px solid ${diffColor}40`,
          }}>
            {difficulty}
          </span>
        )}
        {marks && (
          <span style={{
            padding: '3px 10px', borderRadius: 6, fontSize: 11.5, fontWeight: 700,
            background: 'rgba(255, 255, 255, 0.05)', color: '#F8FAFC', border: '1px solid #1E293B',
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
                code: ({ children }) => <code style={{ background: '#060913', color: '#4ADE80', border: '1px solid #1E293B', padding: '2px 6px', borderRadius: 4, fontSize: '12.5px', fontFamily: "'JetBrains Mono', monospace" }}>{children}</code>,
                pre: ({ children }) => <pre style={preStyle}>{children}</pre>,
                p: ({ children }) => <p style={{ margin: '0 0 10px 0' }}>{children}</p>,
                ul: ({ children }) => <ul style={{ paddingLeft: 20, margin: '0 0 10px 0' }}>{children}</ul>,
                ol: ({ children }) => <ol style={{ paddingLeft: 20, margin: '0 0 10px 0' }}>{children}</ol>,
                li: ({ children }) => <li style={{ marginBottom: 4 }}>{children}</li>,
                h3: ({ children }) => <h3 style={{ fontSize: 14.5, fontWeight: 700, color: '#FFFFFF', margin: '14px 0 6px' }}>{children}</h3>,
                strong: ({ children }) => <strong style={{ color: '#FFFFFF', fontWeight: 600 }}>{children}</strong>,
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
                code: ({ children }) => <code style={{ background: '#060913', color: '#4ADE80', border: '1px solid #1E293B', padding: '2px 6px', borderRadius: 4, fontSize: '12.5px', fontFamily: "'JetBrains Mono', monospace" }}>{children}</code>,
                p: ({ children }) => <p style={{ margin: '0 0 8px 0' }}>{children}</p>,
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
                code: ({ children }) => <code style={{ background: '#060913', color: '#4ADE80', border: '1px solid #1E293B', padding: '2px 6px', borderRadius: 4, fontSize: '12.5px', fontFamily: "'JetBrains Mono', monospace" }}>{children}</code>,
                p: ({ children }) => <p style={{ margin: '0 0 8px 0' }}>{children}</p>,
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
                code: ({ children }) => <code style={{ background: '#060913', color: '#4ADE80', border: '1px solid #1E293B', padding: '2px 6px', borderRadius: 4, fontSize: '12.5px', fontFamily: "'JetBrains Mono', monospace" }}>{children}</code>,
                p: ({ children }) => <p style={{ margin: '0 0 8px 0' }}>{children}</p>,
                ul: ({ children }) => <ul style={{ paddingLeft: 20, margin: '0 0 8px 0' }}>{children}</ul>,
                li: ({ children }) => <li style={{ marginBottom: 4 }}>{children}</li>,
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
                background: '#0D1527',
                border: '1.5px solid #1E293B',
                borderRadius: 10,
                padding: '14px',
                marginBottom: 14,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: '#4ADE80', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>Sample {index + 1}</span>
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
                code: ({ children }) => <code style={{ background: '#060913', color: '#4ADE80', border: '1px solid #1E293B', padding: '2px 6px', borderRadius: 4, fontSize: '12.5px', fontFamily: "'JetBrains Mono', monospace" }}>{children}</code>,
                p: ({ children }) => <p style={{ margin: '0 0 8px 0' }}>{children}</p>,
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