import PropTypes from 'prop-types';
import ReactMarkdown from 'react-markdown';
import {
  LogIn,
  CornerDownRight,
  Shield,
  Sliders,
  Lightbulb,
  FileCode,
} from 'lucide-react';

const containerStyle = {
  height: '100%',
  overflowY: 'auto',
  padding: '24px 28px',
  color: '#334155',
  background: '#FFFFFF',
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
};

const headingStyle = {
  fontSize: '22px',
  fontWeight: 700,
  color: '#111827',
  marginBottom: '12px',
  lineHeight: '28px',
  letterSpacing: '-0.02em',
};

const sectionStyle = {
  marginBottom: '24px',
};

const sectionHeadingStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: '12px',
  fontWeight: 700,
  color: '#15803D',
  textTransform: 'uppercase',
  letterSpacing: '0.6px',
  marginBottom: '10px',
};

const contentStyle = {
  fontSize: '14px',
  lineHeight: '24px',
  color: '#334155',
};

const preStyle = {
  margin: 0,
  whiteSpace: 'pre-wrap',
  color: '#1E293B',
  background: '#F8FAF9',
  padding: '10px 14px',
  borderRadius: '8px',
  fontSize: '13px',
  fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
  border: '1px solid #E2E8F0',
  overflowX: 'auto',
  lineHeight: '1.5',
};

const labelStyle = {
  fontSize: '11px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  color: '#64748B',
  marginBottom: '6px',
  display: 'block',
};

const ProblemPanel = ({ problem, index = 0, total = 1 }) => {
  if (!problem) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', background: '#FFFFFF' }}>
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
    difficulty = 'EASY',
    marks = 10,
    testCases = [],
  } = problem;

  const description = statement || problemDescription || '';
  const visibleTestCases = testCases && testCases.length > 0 ? testCases.filter((tc) => !tc.isHidden) : [];

  const getDifficultyBadge = (d) => {
    const diff = d?.toUpperCase() || 'EASY';
    if (diff === 'HARD') {
      return { bg: '#FEE2E2', color: '#DC2626', border: '#FECACA' };
    }
    if (diff === 'MEDIUM') {
      return { bg: '#FEF3C7', color: '#D97706', border: '#FDE68A' };
    }
    return { bg: '#DCFCE7', color: '#15803D', border: '#BBF7D0' };
  };

  const diffBadge = getDifficultyBadge(difficulty);

  return (
    <div style={containerStyle} className="wi-problem-panel">
      {/* Top Problem Badge */}
      <div style={{ marginBottom: 14 }}>
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 12px',
          borderRadius: 9999,
          background: '#DCFCE7',
          color: '#15803D',
          border: '1px solid #BBF7D0',
          fontSize: 12,
          fontWeight: 600,
        }}>
          Problem {index + 1}
        </span>
      </div>

      {/* Problem Title */}
      <h1 style={headingStyle}>{title}</h1>

      {/* Difficulty & Points Badges */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <span style={{
          padding: '3px 10px',
          borderRadius: 6,
          fontSize: 11.5,
          fontWeight: 700,
          background: diffBadge.bg,
          color: diffBadge.color,
          border: `1px solid ${diffBadge.border}`,
          textTransform: 'uppercase',
          letterSpacing: '0.4px',
        }}>
          {difficulty}
        </span>

        {marks != null && (
          <span style={{
            padding: '3px 10px',
            borderRadius: 6,
            fontSize: 11.5,
            fontWeight: 600,
            background: '#F1F5F9',
            color: '#475569',
            border: '1px solid #E2E8F0',
          }}>
            {marks} pts
          </span>
        )}
      </div>

      {/* Problem Statement / Description */}
      {description && (
        <div style={sectionStyle}>
          <div style={contentStyle}>
            <ReactMarkdown
              components={{
                code: ({ children }) => (
                  <code style={{
                    background: '#F1F5F9',
                    color: '#0F172A',
                    border: '1px solid #E2E8F0',
                    padding: '2px 6px',
                    borderRadius: 4,
                    fontSize: '12.5px',
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>
                    {children}
                  </code>
                ),
                pre: ({ children }) => <pre style={preStyle}>{children}</pre>,
                p: ({ children }) => <p style={{ margin: '0 0 12px 0' }}>{children}</p>,
                ul: ({ children }) => <ul style={{ paddingLeft: 22, margin: '0 0 12px 0' }}>{children}</ul>,
                ol: ({ children }) => <ol style={{ paddingLeft: 22, margin: '0 0 12px 0' }}>{children}</ol>,
                li: ({ children }) => <li style={{ marginBottom: 4 }}>{children}</li>,
                h3: ({ children }) => <h3 style={{ fontSize: 14.5, fontWeight: 700, color: '#111827', margin: '16px 0 8px' }}>{children}</h3>,
                strong: ({ children }) => <strong style={{ color: '#111827', fontWeight: 600 }}>{children}</strong>,
              }}
            >
              {description}
            </ReactMarkdown>
          </div>
        </div>
      )}

      {/* Input Format */}
      {inputFormat && (
        <div style={sectionStyle}>
          <div style={sectionHeadingStyle}>
            <LogIn size={14} color="#15803D" />
            <span>INPUT FORMAT</span>
          </div>
          <div style={contentStyle}>
            <ReactMarkdown
              components={{
                code: ({ children }) => (
                  <code style={{ background: '#F1F5F9', color: '#0F172A', border: '1px solid #E2E8F0', padding: '2px 6px', borderRadius: 4, fontSize: '12.5px', fontFamily: "'JetBrains Mono', monospace" }}>
                    {children}
                  </code>
                ),
                p: ({ children }) => <p style={{ margin: '0 0 8px 0' }}>{children}</p>,
              }}
            >
              {inputFormat}
            </ReactMarkdown>
          </div>
        </div>
      )}

      {/* Output Format */}
      {outputFormat && (
        <div style={sectionStyle}>
          <div style={sectionHeadingStyle}>
            <CornerDownRight size={14} color="#15803D" />
            <span>OUTPUT FORMAT</span>
          </div>
          <div style={contentStyle}>
            <ReactMarkdown
              components={{
                code: ({ children }) => (
                  <code style={{ background: '#F1F5F9', color: '#0F172A', border: '1px solid #E2E8F0', padding: '2px 6px', borderRadius: 4, fontSize: '12.5px', fontFamily: "'JetBrains Mono', monospace" }}>
                    {children}
                  </code>
                ),
                p: ({ children }) => <p style={{ margin: '0 0 8px 0' }}>{children}</p>,
              }}
            >
              {outputFormat}
            </ReactMarkdown>
          </div>
        </div>
      )}

      {/* Constraints */}
      {constraints && (
        <div style={sectionStyle}>
          <div style={sectionHeadingStyle}>
            <Shield size={14} color="#15803D" />
            <span>CONSTRAINTS</span>
          </div>
          <div style={contentStyle}>
            <ReactMarkdown
              components={{
                code: ({ children }) => (
                  <code style={{ background: '#F1F5F9', color: '#0F172A', border: '1px solid #E2E8F0', padding: '2px 6px', borderRadius: 4, fontSize: '12.5px', fontFamily: "'JetBrains Mono', monospace" }}>
                    {children}
                  </code>
                ),
                p: ({ children }) => <p style={{ margin: '0 0 8px 0' }}>{children}</p>,
                ul: ({ children }) => <ul style={{ paddingLeft: 22, margin: '0 0 8px 0' }}>{children}</ul>,
                li: ({ children }) => <li style={{ marginBottom: 4 }}>{children}</li>,
              }}
            >
              {constraints}
            </ReactMarkdown>
          </div>
        </div>
      )}

      {/* Sample Test Cases */}
      {(visibleTestCases.length > 0 || sampleInput || sampleOutput) && (
        <div style={sectionStyle}>
          <div style={sectionHeadingStyle}>
            <Sliders size={14} color="#15803D" />
            <span>SAMPLE TEST CASES</span>
          </div>
          {visibleTestCases.length > 0 ? (
            visibleTestCases.map((tc, sIndex) => (
              <div
                key={tc.id || sIndex}
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: 10,
                  padding: '16px',
                  marginBottom: 14,
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: '#111827', marginBottom: 12 }}>
                  Sample {sIndex + 1}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <span style={labelStyle}>INPUT</span>
                    <pre style={preStyle}>{tc.input || '(no input)'}</pre>
                  </div>
                  <div>
                    <span style={labelStyle}>EXPECTED OUTPUT</span>
                    <pre style={preStyle}>{tc.expectedOutput || '(no output)'}</pre>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div
              style={{
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: 10,
                padding: '16px',
                marginBottom: 14,
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: '#111827', marginBottom: 12 }}>
                Sample 1
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <span style={labelStyle}>INPUT</span>
                  <pre style={preStyle}>{sampleInput || '(no input)'}</pre>
                </div>
                <div>
                  <span style={labelStyle}>EXPECTED OUTPUT</span>
                  <pre style={preStyle}>{sampleOutput || '(no output)'}</pre>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Explanation */}
      {explanation && (
        <div style={sectionStyle}>
          <div style={sectionHeadingStyle}>
            <Lightbulb size={14} color="#15803D" />
            <span>EXPLANATION</span>
          </div>
          <div style={contentStyle}>
            <ReactMarkdown
              components={{
                code: ({ children }) => (
                  <code style={{ background: '#F1F5F9', color: '#0F172A', border: '1px solid #E2E8F0', padding: '2px 6px', borderRadius: 4, fontSize: '12.5px', fontFamily: "'JetBrains Mono', monospace" }}>
                    {children}
                  </code>
                ),
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
  index: PropTypes.number,
  total: PropTypes.number,
};

export default ProblemPanel;