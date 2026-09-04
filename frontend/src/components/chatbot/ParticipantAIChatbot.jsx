import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
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

const STORAGE_KEY = 'waveinit-ai-assistant-position';
const SAFE_MARGIN = 10;

// Helper to get safe clamped coordinates
const clampCoordinates = (x, y, elemWidth = 145, elemHeight = 42) => {
  if (typeof window === 'undefined') return { x, y };
  const minX = SAFE_MARGIN;
  const minY = SAFE_MARGIN;
  const maxX = Math.max(SAFE_MARGIN, window.innerWidth - elemWidth - SAFE_MARGIN);
  const maxY = Math.max(SAFE_MARGIN, window.innerHeight - elemHeight - SAFE_MARGIN);
  return {
    x: Math.min(Math.max(x, minX), maxX),
    y: Math.min(Math.max(y, minY), maxY),
  };
};

// Read saved position from localStorage if available
const getSavedPosition = () => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') {
        const isNarrow = window.innerWidth < 768;
        return clampCoordinates(parsed.x, parsed.y, isNarrow ? 48 : 145, isNarrow ? 48 : 42);
      }
    }
  } catch (e) {
    console.warn('Could not read saved assistant position:', e);
  }
  return null;
};

export default function ParticipantAIChatbot({ user, activeTab }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isExecutingAction, setIsExecutingAction] = useState(false);
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false);
  const [bottomOffset, setBottomOffset] = useState(24);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 768 : false);

  // Floating draggable position state
  const [customPosition, setCustomPosition] = useState(() => getSavedPosition());
  const [isDragging, setIsDragging] = useState(false);
  const triggerRef = useRef(null);
  const dragTracker = useRef({
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    initialPosX: 0,
    initialPosY: 0,
    elemWidth: 145,
    elemHeight: 42,
    moved: false,
  });
  const dragOccurredRef = useRef(false);

  const location = useLocation();
  const navigate = useNavigate();
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const currentRoute = location.pathname;

  // Measure button dimensions dynamically
  const getButtonSize = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return { width: rect.width, height: rect.height };
      }
    }
    const isNarrow = typeof window !== 'undefined' ? window.innerWidth < 768 : false;
    return {
      width: isNarrow ? 48 : 145,
      height: isNarrow ? 48 : 42,
    };
  };

  // Default bottom-right position calculation
  const getDefaultPosition = () => {
    if (typeof window === 'undefined') return { x: 0, y: 0 };
    const { width, height } = getButtonSize();
    const isNarrow = window.innerWidth < 768;
    const rightOffset = isNarrow ? 16 : 24;
    const x = window.innerWidth - rightOffset - width;
    const y = window.innerHeight - bottomOffset - height;
    return clampCoordinates(x, y, width, height);
  };

  const currentPosition = customPosition || getDefaultPosition();

  // ── Drag Event Handlers via Pointer Events ──────────
  const handlePointerDown = (e) => {
    if (e.button !== 0) return; // Only primary button / tap
    const btn = triggerRef.current;
    if (!btn) return;

    const { width, height } = getButtonSize();
    const activePos = customPosition || getDefaultPosition();

    dragTracker.current = {
      active: true,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      initialPosX: activePos.x,
      initialPosY: activePos.y,
      elemWidth: width,
      elemHeight: height,
      moved: false,
    };
    dragOccurredRef.current = false;

    try {
      btn.setPointerCapture(e.pointerId);
    } catch (_) {}
  };

  const handlePointerMove = (e) => {
    const dt = dragTracker.current;
    if (!dt.active) return;

    const dx = e.clientX - dt.startX;
    const dy = e.clientY - dt.startY;
    const distance = Math.hypot(dx, dy);

    if (distance > 4 || dt.moved) {
      dt.moved = true;
      if (!isDragging) setIsDragging(true);

      const newX = dt.initialPosX + dx;
      const newY = dt.initialPosY + dy;
      const clamped = clampCoordinates(newX, newY, dt.elemWidth, dt.elemHeight);
      setCustomPosition(clamped);
    }
  };

  const handlePointerUp = (e) => {
    const dt = dragTracker.current;
    if (!dt.active) return;

    const btn = triggerRef.current;
    if (btn) {
      try {
        btn.releasePointerCapture(e.pointerId);
      } catch (_) {}
    }

    if (dt.moved) {
      dragOccurredRef.current = true;
      setTimeout(() => {
        dragOccurredRef.current = false;
      }, 120);

      const dx = e.clientX - dt.startX;
      const dy = e.clientY - dt.startY;
      const finalClamped = clampCoordinates(
        dt.initialPosX + dx,
        dt.initialPosY + dy,
        dt.elemWidth,
        dt.elemHeight
      );
      setCustomPosition(finalClamped);

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(finalClamped));
      } catch (err) {
        console.warn('Failed to persist assistant position:', err);
      }
    }

    dragTracker.current = {
      active: false,
      pointerId: null,
      startX: 0,
      startY: 0,
      initialPosX: 0,
      initialPosY: 0,
      elemWidth: 145,
      elemHeight: 42,
      moved: false,
    };
    setIsDragging(false);
  };

  const handlePointerCancel = (e) => {
    handlePointerUp(e);
  };

  const handleTriggerClick = (e) => {
    if (dragOccurredRef.current) {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      return;
    }
    setIsOpen(prev => !prev);
  };

  // Adjust position within viewport boundaries on window resize
  useEffect(() => {
    const handleWindowResize = () => {
      setCustomPosition(prev => {
        if (!prev) return prev;
        const { width, height } = getButtonSize();
        const clamped = clampCoordinates(prev.x, prev.y, width, height);
        if (clamped.x !== prev.x || clamped.y !== prev.y) {
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(clamped));
          } catch (_) {}
          return clamped;
        }
        return prev;
      });
    };

    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, []);

  // Compute anchored, viewport-clamped position for the open chat panel
  const getChatPanelCoordinates = () => {
    const isNarrow = isMobile;
    const panelWidth = isNarrow ? Math.min(window.innerWidth - 24, 380) : 380;
    const panelHeight = isNarrow
      ? Math.min(500, window.innerHeight - 120)
      : Math.min(540, window.innerHeight - 100);

    const { width: btnWidth, height: btnHeight } = getButtonSize();
    const btnX = currentPosition.x;
    const btnY = currentPosition.y;

    // Horizontal position
    let left;
    if (isNarrow) {
      left = 12;
    } else {
      if (btnX + btnWidth / 2 > window.innerWidth / 2) {
        left = btnX + btnWidth - panelWidth;
      } else {
        left = btnX;
      }
      left = Math.min(Math.max(left, SAFE_MARGIN), window.innerWidth - panelWidth - SAFE_MARGIN);
    }

    // Vertical position
    let top;
    if (btnY > window.innerHeight / 2) {
      top = btnY - panelHeight - 12;
      if (top < SAFE_MARGIN) {
        top = SAFE_MARGIN;
      }
    } else {
      top = btnY + btnHeight + 12;
      if (top + panelHeight > window.innerHeight - SAFE_MARGIN) {
        top = Math.max(SAFE_MARGIN, window.innerHeight - panelHeight - SAFE_MARGIN);
      }
    }

    return {
      left,
      top,
      width: isNarrow ? 'calc(100vw - 24px)' : panelWidth,
      maxWidth: 'calc(100vw - 24px)',
      height: isNarrow ? 'min(500px, calc(100vh - 120px))' : panelHeight,
      maxHeight: 'calc(100vh - 40px)',
    };
  };

  // ── Context-Aware Dynamic Offset & Bottom Action Bar Detection ──────────
  useEffect(() => {
    const updateLayoutMetrics = () => {
      const isNarrow = window.innerWidth < 768;
      setIsMobile(isNarrow);

      // Selectors for bottom action bars, full-screen edit modals, and fixed footers
      const bottomBarSelectors = [
        '.wip-footer',
        '.wip-edit-profile-root',
        '[data-has-bottom-bar="true"]',
        '.bottom-action-bar',
        '.modal-footer-fixed',
        '.fixed-bottom-bar',
        '.assessment-footer-bar',
      ];

      let detectedHeight = 0;
      let hasBottomBar = false;

      for (const sel of bottomBarSelectors) {
        const el = document.querySelector(sel);
        if (el) {
          hasBottomBar = true;
          const rect = el.getBoundingClientRect();
          if (rect && rect.height > 0 && rect.bottom >= window.innerHeight - 15) {
            detectedHeight = Math.max(detectedHeight, rect.height);
          } else {
            detectedHeight = Math.max(detectedHeight, 60);
          }
        }
      }

      const basePadding = isNarrow ? 16 : 24;

      if (hasBottomBar) {
        // Position comfortably above the fixed bottom bar with a safe 24px clearance (16px on mobile)
        const totalBottom = (detectedHeight || 60) + (isNarrow ? 16 : 24);
        setBottomOffset(totalBottom);
      } else {
        setBottomOffset(basePadding);
      }
    };

    updateLayoutMetrics();

    // Observe DOM mutations to immediately elevate when modals or action bars mount/unmount
    const observer = new MutationObserver(() => {
      updateLayoutMetrics();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'data-has-bottom-bar'],
    });

    window.addEventListener('resize', updateLayoutMetrics);
    window.addEventListener('scroll', updateLayoutMetrics, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateLayoutMetrics);
      window.removeEventListener('scroll', updateLayoutMetrics);
    };
  }, [currentRoute, activeTab]);

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

  const chatbotJSX = (
    <>
      {/* ── Floating Draggable AI Trigger Button ── */}
      <div
        className="participant-ai-chatbot-assessment-hide"
        style={{
          position: 'fixed',
          left: currentPosition.x,
          top: currentPosition.y,
          zIndex: 9999,
          fontFamily: "'Poppins', sans-serif",
          pointerEvents: 'none',
          touchAction: 'none',
          userSelect: 'none',
          transition: isDragging ? 'none' : 'left 0.12s ease-out, top 0.12s ease-out',
        }}
      >
        <motion.button
          ref={triggerRef}
          type="button"
          whileHover={isDragging ? {} : { scale: 1.05 }}
          whileTap={isDragging ? {} : { scale: 0.95 }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onClick={handleTriggerClick}
          title="Drag to move • Click to open WAVE INIT AI LMS Assistant"
          aria-label="Open WAVE INIT AI LMS Assistant"
          style={{
            pointerEvents: 'auto',
            background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
            border: '2px solid #BBF7D0',
            color: '#FFFFFF',
            borderRadius: isMobile ? '50%' : 28,
            width: isMobile ? 48 : 'auto',
            height: isMobile ? 48 : 42,
            padding: isMobile ? 0 : '8px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            cursor: isDragging ? 'grabbing' : 'grab',
            boxShadow: isDragging
              ? '0 20px 35px -5px rgba(22, 163, 74, 0.5), 0 10px 10px -5px rgba(22, 163, 74, 0.3)'
              : '0 10px 25px -3px rgba(22, 163, 74, 0.4), 0 4px 6px -4px rgba(22, 163, 74, 0.2)',
            fontSize: 12.5,
            fontWeight: 600,
            letterSpacing: '0.01em',
            transition: 'border-color 0.15s ease, background 0.15s ease, box-shadow 0.2s ease',
            whiteSpace: 'nowrap',
            touchAction: 'none',
            userSelect: 'none',
          }}
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
              flexShrink: 0,
              pointerEvents: 'none',
            }}
          >
            <Sparkles size={13} color="#FFFFFF" />
          </div>

          {!isMobile && <span style={{ pointerEvents: 'none' }}>AI Assistant</span>}

          {/* Pulsing indicator dot */}
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: '#86EFAC',
              boxShadow: '0 0 6px #86EFAC',
              flexShrink: 0,
              pointerEvents: 'none',
            }}
          />
        </motion.button>
      </div>

      {/* ── Floating Chatbot Modal / Panel ── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="participant-ai-chatbot-assessment-hide"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{
              opacity: 1,
              scale: 1,
              ...getChatPanelCoordinates(),
            }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: 'fixed',
              background: '#FFFFFF',
              borderRadius: 18,
              border: '1px solid #E2E8F0',
              boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.28)',
              display: 'flex',
              flexDirection: 'column',
              zIndex: 9999,
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
                borderTopLeftRadius: 17,
                borderTopRightRadius: 17,
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
                          border: isUser ? 'none' : '1px solid #DCFCE7',
                          color: isUser ? '#FFFFFF' : '#16A34A',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          marginTop: 2,
                        }}
                      >
                        {isUser ? <UserIcon size={14} /> : <Bot size={14} />}
                      </div>

                      {/* Bubble */}
                      <div
                        style={{
                          background: isUser ? '#16A34A' : '#F8FAFC',
                          color: isUser ? '#FFFFFF' : '#1E293B',
                          padding: '10px 14px',
                          borderRadius: 14,
                          borderTopRightRadius: isUser ? 3 : 14,
                          borderTopLeftRadius: isUser ? 14 : 3,
                          fontSize: 12.5,
                          lineHeight: 1.55,
                          border: isUser ? 'none' : '1px solid #E2E8F0',
                          wordBreak: 'break-word',
                        }}
                      >
                        <div style={{ whiteSpace: 'pre-wrap' }}>
                          {renderFormattedMarkdown(msg.content)}
                        </div>

                        {/* Action Buttons inside Bot Message */}
                        {msg.actionButtons && msg.actionButtons.length > 0 && (
                          <div
                            style={{
                              marginTop: 10,
                              paddingTop: 8,
                              borderTop: isUser ? '1px solid rgba(255, 255, 255, 0.2)' : '1px solid #E2E8F0',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 6,
                            }}
                          >
                            {msg.actionButtons.map((btn, bIdx) => (
                              <button
                                key={`abtn-${bIdx}`}
                                type="button"
                                onClick={() => handleActionButtonClick(btn)}
                                disabled={isLoading || isExecutingAction}
                                style={{
                                  background: '#FFFFFF',
                                  border: '1px solid #16A34A',
                                  color: '#16A34A',
                                  borderRadius: 8,
                                  padding: '6px 10px',
                                  fontSize: 11.5,
                                  fontWeight: 600,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  cursor: isLoading || isExecutingAction ? 'default' : 'pointer',
                                  transition: 'all 0.15s ease',
                                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                                }}
                                onMouseEnter={(e) => {
                                  if (!isLoading && !isExecutingAction) {
                                    e.currentTarget.style.background = '#16A34A';
                                    e.currentTarget.style.color = '#FFFFFF';
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (!isLoading && !isExecutingAction) {
                                    e.currentTarget.style.background = '#FFFFFF';
                                    e.currentTarget.style.color = '#16A34A';
                                  }
                                }}
                              >
                                <span>{btn.label}</span>
                                <ArrowRight size={13} />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Bot thinking indicator */}
              {(isLoading || isExecutingAction) && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 12px',
                    background: '#F8FAFC',
                    borderRadius: 12,
                    border: '1px solid #E2E8F0',
                    width: 'fit-content',
                  }}
                >
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      background: '#F0FDF4',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Bot size={12} color="#16A34A" />
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 11.5,
                      color: '#475569',
                    }}
                  >
                    <Zap size={12} color="#16A34A" style={{ animation: 'spin 1.5s linear infinite' }} />
                    <span>{isExecutingAction ? 'Executing LMS action...' : 'Thinking...'}</span>
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

  if (typeof document === 'undefined') return null;
  return createPortal(chatbotJSX, document.body);
}
