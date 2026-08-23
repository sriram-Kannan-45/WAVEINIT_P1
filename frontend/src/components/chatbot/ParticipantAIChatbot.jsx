import { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  MessageSquare,
  X,
  Send,
  RotateCcw,
  Bot,
  User as UserIcon,
  ArrowRight,
  Camera,
  CheckCircle2,
  Zap,
} from 'lucide-react';
import { participantChatbotService } from '../../services/participantChatbotService';
import { executeParticipantAction } from '../../services/participantActionRegistry';
import ParticipantQRScannerModal from './ParticipantQRScannerModal';

const DEFAULT_SUGGESTIONS = {
  profile: [
    'How do I complete my profile?',
    'Edit my profile',
    'Open my course',
    'What should I do next?',
  ],
  courses: [
    'Open my course',
    'Continue my course',
    'Show assessments',
    'Show certificates',
  ],
  quizzes: [
    'Start assessment',
    'Scan QR',
    'Show my results',
    'Open my course',
  ],
  interviews: [
    'Scan QR',
    'Show my interviews',
    'Open my course',
    'What should I do next?',
  ],
  general: [
    '✨ What should I do next?',
    'Open my course',
    'Show certificates',
    'Scan QR',
    'Show my profile',
  ],
};

export default function ParticipantAIChatbot({ user, activeTab }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isExecutingAction, setIsExecutingAction] = useState(false);
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const currentRoute = location.pathname;

  // Determine current active section for dynamic suggestion pills
  const activeContextType = useMemo(() => {
    if (currentRoute === '/my-profile' || activeTab === 'profile') return 'profile';
    if (activeTab === 'myCourses' || activeTab === 'myEnrollments' || currentRoute.includes('/courses')) return 'courses';
    if (activeTab === 'ai-quizzes' || activeTab === 'myQuizzes' || currentRoute.includes('/quizzes') || currentRoute.includes('/exam')) return 'quizzes';
    if (activeTab === 'interviews' || currentRoute.includes('/interview')) return 'interviews';
    return 'general';
  }, [currentRoute, activeTab]);

  const suggestions = useMemo(() => {
    return DEFAULT_SUGGESTIONS[activeContextType] || DEFAULT_SUGGESTIONS.general;
  }, [activeContextType]);

  // Initial welcome message
  useEffect(() => {
    if (messages.length === 0 && user) {
      setMessages([
        {
          id: 'welcome-1',
          role: 'assistant',
          content: `Hi **${user.name || 'there'}** 👋\n\nI am your **WAVE INIT LMS Agent**.\nTell me what to open, start, or guide you through!`,
          actionButtons: [
            { label: '✨ What should I do next?', action: 'send_message', message: 'What should I do next?' },
            { label: '📖 Open my course', action: 'navigate', type: 'OPEN_COURSES', route: '/participant', tab: 'myEnrollments' },
            { label: '📷 Scan QR', action: 'open_qr_scanner', type: 'OPEN_QR_SCANNER' },
          ],
        },
      ]);
    }
  }, [user, messages.length]);

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen, isLoading]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
    }
  }, [isOpen]);

  // Action Dispatcher wrapper
  const dispatchAction = async (action) => {
    if (!action) return;
    setIsExecutingAction(true);

    try {
      const result = await executeParticipantAction(action, {
        navigate,
        openQrScanner: () => setIsQrScannerOpen(true),
      });

      if (result && result.success) {
        return result.confirmationMessage;
      }
    } catch (err) {
      console.warn('Action dispatch error:', err);
    } finally {
      setIsExecutingAction(false);
    }
  };

  const handleSendMessage = async (customText = null) => {
    const textToSend = (customText !== null ? customText : inputText).trim();
    if (!textToSend || isLoading || isExecutingAction) return;

    const userMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: textToSend,
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsLoading(true);

    try {
      const historyPayload = messages.map(m => ({
        role: m.role,
        content: m.content,
      }));

      const res = await participantChatbotService.askAssistant({
        message: textToSend,
        history: historyPayload,
        context: {
          currentRoute,
          currentTab: activeTab,
        },
      });

      let confirmation = null;

      // ── AUTO-EXECUTE ACTION ──
      if (res.action && res.action.autoExecute) {
        confirmation = await dispatchAction(res.action);
      }

      const assistantMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: res.reply || 'Action completed.',
        action: res.action || null,
        confirmation: confirmation || res.action?.confirmationMessage || null,
        actionButtons: res.actionButtons || [],
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          id: `ai-err-${Date.now()}`,
          role: 'assistant',
          content: 'I had trouble reaching the server. You can use the quick actions below:',
          actionButtons: [
            { label: 'Open My Courses', action: 'navigate', type: 'OPEN_COURSES', route: '/participant', tab: 'myEnrollments' },
            { label: 'Open My Profile', action: 'navigate', type: 'OPEN_PROFILE', route: '/my-profile' },
          ],
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewChat = () => {
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        role: 'assistant',
        content: `Hi **${user?.name || 'there'}** 👋\n\nSession reset! What would you like me to open or guide you through?`,
        actionButtons: [
          { label: '✨ What should I do next?', action: 'send_message', message: 'What should I do next?' },
          { label: '📖 Open my course', action: 'navigate', type: 'OPEN_COURSES', route: '/participant', tab: 'myEnrollments' },
          { label: '📷 Scan QR', action: 'open_qr_scanner', type: 'OPEN_QR_SCANNER' },
        ],
      },
    ]);
  };

  const handleActionButtonClick = async (btn) => {
    if (isLoading || isExecutingAction) return;

    if (btn.action === 'send_message') {
      handleSendMessage(btn.message || btn.label);
      return;
    }

    if (btn.action === 'open_qr_scanner' || btn.type === 'OPEN_QR_SCANNER') {
      setIsQrScannerOpen(true);
      return;
    }

    // Direct real action execution
    const actionPayload = {
      type: btn.type || (btn.courseId ? 'OPEN_COURSE' : 'NAVIGATE'),
      route: btn.route,
      tab: btn.tab,
      subtab: btn.subtab,
      courseId: btn.courseId,
      lessonId: btn.lessonId,
      quizId: btn.quizId,
      quizTitle: btn.quizTitle,
      courseName: btn.courseName || btn.label,
    };

    const confirmation = await dispatchAction(actionPayload);
    if (confirmation) {
      setMessages(prev => [
        ...prev,
        {
          id: `ai-act-${Date.now()}`,
          role: 'assistant',
          content: `✅ ${confirmation}`,
        },
      ]);
    }
  };

  const renderFormattedMarkdown = (text = '') => {
    const lines = text.split('\n');
    return lines.map((line, idx) => {
      // Header 3
      if (line.startsWith('### ')) {
        return (
          <h5 key={idx} style={{ margin: '8px 0 4px', fontSize: 13, fontWeight: 700, color: '#0F172A' }}>
            {line.replace('### ', '')}
          </h5>
        );
      }
      // List items (1. or • or -)
      if (/^(\d+\.|\*|-|•)\s/.test(line)) {
        return (
          <div key={idx} style={{ display: 'flex', gap: 6, margin: '2px 0', fontSize: 12, lineHeight: 1.45 }}>
            <span style={{ color: '#16A34A', fontWeight: 600 }}>•</span>
            <span>{parseInlineBold(line.replace(/^(\d+\.|\*|-|•)\s/, ''))}</span>
          </div>
        );
      }
      // Empty line
      if (!line.trim()) {
        return <div key={idx} style={{ height: 4 }} />;
      }
      // Regular line
      return (
        <p key={idx} style={{ margin: '2px 0', fontSize: 12, lineHeight: 1.5, color: '#334155' }}>
          {parseInlineBold(line)}
        </p>
      );
    });
  };

  const parseInlineBold = (str) => {
    const parts = str.split(/(\*\*.*?\*\*)/g);
    return parts.map((p, i) => {
      if (p.startsWith('**') && p.endsWith('**')) {
        return <strong key={i} style={{ color: '#0F172A', fontWeight: 600 }}>{p.slice(2, -2)}</strong>;
      }
      if (p.startsWith('`') && p.endsWith('`')) {
        return <code key={i} style={{ background: '#F1F5F9', padding: '1px 4px', borderRadius: 4, fontSize: 11 }}>{p.slice(1, -1)}</code>;
      }
      return p;
    });
  };

  return (
    <>
      {/* ── Floating AI Trigger Button (Bottom Right) ── */}
      <div
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 9990,
          fontFamily: "'Poppins', sans-serif",
        }}
      >
        <motion.button
          type="button"
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.94 }}
          onClick={() => setIsOpen(prev => !prev)}
          style={{
            background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
            border: '2px solid #BBF7D0',
            color: '#FFFFFF',
            padding: '12px 18px',
            borderRadius: 30,
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            cursor: 'pointer',
            boxShadow: '0 10px 20px -3px rgba(22, 163, 74, 0.35), 0 4px 6px -4px rgba(22, 163, 74, 0.2)',
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '0.01em',
          }}
          aria-label="Open WAVE INIT AI LMS Agent"
        >
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Sparkles size={14} color="#FFFFFF" />
          </div>
          <span>AI Assistant</span>
          {/* Pulsing indicator dot */}
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#86EFAC',
              boxShadow: '0 0 6px #86EFAC',
            }}
          />
        </motion.button>
      </div>

      {/* ── Floating Chatbot Modal / Panel ── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 15, scale: 0.96 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: 'fixed',
              bottom: 84,
              right: 24,
              width: 'calc(100vw - 32px)',
              maxWidth: 400,
              height: 560,
              maxHeight: 'calc(100vh - 120px)',
              background: '#FFFFFF',
              borderRadius: 20,
              border: '1px solid #E2E8F0',
              boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              zIndex: 9995,
              overflow: 'hidden',
              fontFamily: "'Poppins', sans-serif",
            }}
          >
            {/* ── Chatbot Header ── */}
            <div
              style={{
                padding: '14px 18px',
                background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderTopLeftRadius: 19,
                borderTopRightRadius: 19,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 10,
                    background: 'rgba(255, 255, 255, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Bot size={18} color="#FFFFFF" />
                </div>
                <div>
                  <h4 style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: 6 }}>
                    WAVE INIT AI Agent
                  </h4>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: '#DCFCE7' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#86EFAC' }} />
                    Action-Based Assistant
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  type="button"
                  title="New Chat"
                  onClick={handleNewChat}
                  style={{
                    border: 'none',
                    background: 'rgba(255, 255, 255, 0.15)',
                    color: '#FFFFFF',
                    padding: 6,
                    borderRadius: 6,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <RotateCcw size={14} />
                </button>
                <button
                  type="button"
                  title="Close Assistant"
                  onClick={() => setIsOpen(false)}
                  style={{
                    border: 'none',
                    background: 'rgba(255, 255, 255, 0.15)',
                    color: '#FFFFFF',
                    padding: 6,
                    borderRadius: 6,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* ── Suggested Action Pills ── */}
            <div
              style={{
                padding: '8px 14px',
                background: '#F8FAFC',
                borderBottom: '1px solid #F1F5F9',
                display: 'flex',
                gap: 6,
                overflowX: 'auto',
                scrollbarWidth: 'none',
                flexShrink: 0,
              }}
            >
              {suggestions.map((sug, sIdx) => (
                <button
                  key={`sug-${sIdx}`}
                  type="button"
                  onClick={() => handleSendMessage(sug)}
                  disabled={isLoading || isExecutingAction}
                  style={{
                    background: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    borderRadius: 14,
                    padding: '4px 10px',
                    fontSize: 11,
                    fontWeight: 500,
                    color: '#334155',
                    cursor: isLoading || isExecutingAction ? 'default' : 'pointer',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    transition: 'all 0.15s ease',
                    opacity: isLoading || isExecutingAction ? 0.6 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!isLoading && !isExecutingAction) {
                      e.currentTarget.style.borderColor = '#16A34A';
                      e.currentTarget.style.color = '#16A34A';
                      e.currentTarget.style.background = '#F0FDF4';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#E2E8F0';
                    e.currentTarget.style.color = '#334155';
                    e.currentTarget.style.background = '#FFFFFF';
                  }}
                >
                  {sug}
                </button>
              ))}
            </div>

            {/* ── Chat Messages Stream ── */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: 14,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                background: '#FFFFFF',
              }}
            >
              {messages.map((msg) => {
                const isUser = msg.role === 'user';
                return (
                  <div
                    key={msg.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: isUser ? 'flex-end' : 'flex-start',
                      gap: 4,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 8,
                        maxWidth: '88%',
                        flexDirection: isUser ? 'row-reverse' : 'row',
                      }}
                    >
                      {/* Avatar */}
                      <div
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: '50%',
                          background: isUser ? '#16A34A' : '#F0FDF4',
                          border: `1px solid ${isUser ? '#15803D' : '#BBF7D0'}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          marginTop: 2,
                        }}
                      >
                        {isUser ? <UserIcon size={14} color="#FFFFFF" /> : <Bot size={14} color="#16A34A" />}
                      </div>

                      {/* Bubble */}
                      <div
                        style={{
                          background: isUser ? '#16A34A' : '#F8FAFC',
                          color: isUser ? '#FFFFFF' : '#0F172A',
                          border: isUser ? 'none' : '1px solid #E2E8F0',
                          padding: '10px 14px',
                          borderRadius: isUser ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                          fontSize: 12.5,
                          lineHeight: 1.45,
                          boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                        }}
                      >
                        {isUser ? msg.content : renderFormattedMarkdown(msg.content)}

                        {/* Confirmation Badge for Executed Actions */}
                        {!isUser && msg.confirmation && (
                          <div
                            style={{
                              marginTop: 8,
                              padding: '5px 8px',
                              background: '#F0FDF4',
                              border: '1px solid #BBF7D0',
                              borderRadius: 6,
                              fontSize: 11,
                              color: '#15803D',
                              fontWeight: 600,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 5,
                            }}
                          >
                            <CheckCircle2 size={13} color="#16A34A" />
                            <span>{msg.confirmation}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    {!isUser && msg.actionButtons && msg.actionButtons.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginLeft: 34, marginTop: 4 }}>
                        {msg.actionButtons.map((btn, bIdx) => (
                          <button
                            key={`btn-${bIdx}`}
                            type="button"
                            onClick={() => handleActionButtonClick(btn)}
                            disabled={isLoading || isExecutingAction}
                            style={{
                              background: '#F0FDF4',
                              border: '1px solid #BBF7D0',
                              borderRadius: 8,
                              padding: '5px 11px',
                              fontSize: 11.5,
                              fontWeight: 600,
                              color: '#15803D',
                              cursor: isLoading || isExecutingAction ? 'default' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 5,
                              transition: 'all 0.15s ease',
                              opacity: isLoading || isExecutingAction ? 0.6 : 1,
                            }}
                            onMouseEnter={(e) => {
                              if (!isLoading && !isExecutingAction) {
                                e.currentTarget.style.background = '#DCFCE7';
                                e.currentTarget.style.borderColor = '#86EFAC';
                              }
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = '#F0FDF4';
                              e.currentTarget.style.borderColor = '#BBF7D0';
                            }}
                          >
                            {btn.action === 'open_qr_scanner' || btn.type === 'OPEN_QR_SCANNER' ? <Camera size={12} /> : null}
                            <span>{btn.label}</span>
                            {btn.action === 'navigate' ? <ArrowRight size={11} /> : null}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Execution / Loading Indicator */}
              {(isLoading || isExecutingAction) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 2 }}>
                  <div
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      background: '#F0FDF4',
                      border: '1px solid #BBF7D0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Bot size={14} color="#16A34A" />
                  </div>
                  <div
                    style={{
                      background: '#F8FAFC',
                      border: '1px solid #E2E8F0',
                      padding: '8px 14px',
                      borderRadius: '4px 16px 16px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 11.5,
                      color: '#475569',
                    }}
                  >
                    <Zap size={12} color="#16A34A" style={{ animation: 'spin 1.5s linear infinite' }} />
                    <span>{isExecutingAction ? 'Executing LMS action...' : 'Analyzing request & LMS context...'}</span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* ── Input Box & Send Button ── */}
            <div
              style={{
                padding: '10px 14px',
                borderTop: '1px solid #E2E8F0',
                background: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <input
                ref={inputRef}
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder="Ask or tell me what to open..."
                disabled={isLoading || isExecutingAction}
                style={{
                  flex: 1,
                  border: '1px solid #CBD5E1',
                  borderRadius: 10,
                  padding: '9px 12px',
                  fontSize: 12.5,
                  color: '#0F172A',
                  outline: 'none',
                  fontFamily: "'Poppins', sans-serif",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#16A34A';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#CBD5E1';
                }}
              />
              <button
                type="button"
                onClick={() => handleSendMessage()}
                disabled={!inputText.trim() || isLoading || isExecutingAction}
                style={{
                  background: inputText.trim() && !isLoading && !isExecutingAction ? '#16A34A' : '#E2E8F0',
                  color: inputText.trim() && !isLoading && !isExecutingAction ? '#FFFFFF' : '#94A3B8',
                  border: 'none',
                  borderRadius: 10,
                  width: 36,
                  height: 36,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: inputText.trim() && !isLoading && !isExecutingAction ? 'pointer' : 'default',
                  transition: 'all 0.15s ease',
                  flexShrink: 0,
                }}
              >
                <Send size={15} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Dedicated QR Scanner Modal ── */}
      <ParticipantQRScannerModal
        isOpen={isQrScannerOpen}
        onClose={() => setIsQrScannerOpen(false)}
        onScanSuccess={(data) => {
          setMessages(prev => [
            ...prev,
            {
              id: `ai-qr-${Date.now()}`,
              role: 'assistant',
              content: `✅ **QR code scanned successfully!**\n\nPayload: \`${data.slice(0, 45)}...\`\n\nYou can now proceed with your proctored assessment or interview.`,
            },
          ]);
        }}
      />
    </>
  );
}
