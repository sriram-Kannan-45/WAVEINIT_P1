/**
 * Participant Action Registry & Secure Dispatcher
 * ───────────────────────────────────────────────
 * Centralized security allowlist for executing LMS actions on behalf of the participant.
 * Strictly prevents arbitrary script execution while allowing instant, seamless UI navigation & triggers.
 */

let isExecutingAction = false;
let lastActionTime = 0;

export const PARTICIPANT_ALLOWED_ACTIONS = [
  'NAVIGATE',
  'OPEN_DASHBOARD',
  'OPEN_COURSES',
  'OPEN_COURSE',
  'CONTINUE_COURSE',
  'START_COURSE',
  'OPEN_PROFILE',
  'EDIT_PROFILE',
  'COMPLETE_PROFILE',
  'OPEN_CERTIFICATES',
  'OPEN_ASSESSMENTS',
  'START_ASSESSMENT',
  'VIEW_RESULTS',
  'OPEN_ACHIEVEMENTS',
  'OPEN_LEADERBOARD',
  'OPEN_INTERVIEWS',
  'OPEN_QR_SCANNER',
  'SHOW_SELECTION',
];

/**
 * Execute an approved Participant LMS Action.
 *
 * @param {Object} action - Structured action payload
 * @param {Object} handlers - UI handlers provided by React context/hooks
 * @param {Function} handlers.navigate - React Router navigate function
 * @param {Function} handlers.openQrScanner - Opens QR scanner modal
 * @param {Function} handlers.onTabChange - Changes tab in dashboard if on /participant
 * @returns {Promise<{ success: boolean, confirmationMessage?: string, error?: string }>}
 */
export async function executeParticipantAction(action, { navigate, openQrScanner, onTabChange }) {
  if (!action || !action.type) {
    return { success: false, error: 'No valid action provided.' };
  }

  // Prevent rapid double-clicks (debouncing 500ms)
  const now = Date.now();
  if (isExecutingAction || (now - lastActionTime < 500)) {
    return { success: false, error: 'Action already in progress.' };
  }

  isExecutingAction = true;
  lastActionTime = now;

  try {
    const actionType = String(action.type).toUpperCase();

    // Security check: Must be in allowlist
    if (!PARTICIPANT_ALLOWED_ACTIONS.includes(actionType)) {
      console.warn(`[ActionRegistry] Blocked unrecognized action: ${actionType}`);
      return { success: false, error: `Action "${actionType}" is not permitted.` };
    }

    // 1. QR Scanner Trigger
    if (actionType === 'OPEN_QR_SCANNER') {
      if (openQrScanner) {
        openQrScanner();
        return {
          success: true,
          confirmationMessage: action.confirmationMessage || 'QR Scanner opened. Point camera at the QR code.',
        };
      }
      return { success: false, error: 'QR Scanner modal is not available.' };
    }

    // 2. Disambiguation Selection (no navigation needed)
    if (actionType === 'SHOW_SELECTION') {
      return {
        success: true,
        confirmationMessage: 'Please select an option below.',
      };
    }

    // 3. Open Specific Course (with courseId)
    if (actionType === 'OPEN_COURSE' || actionType === 'START_COURSE') {
      const courseId = action.courseId || action.targetId;
      if (courseId) {
        const queryParams = new URLSearchParams({
          tab: 'myEnrollments',
          courseId: String(courseId),
          ...(action.subtab ? { subtab: String(action.subtab) } : {}),
        });
        navigate(`/participant?${queryParams.toString()}`, {
          state: {
            tab: 'myEnrollments',
            courseId: Number(courseId),
            ...(action.subtab ? { subtab: String(action.subtab) } : {}),
          },
        });
        return {
          success: true,
          confirmationMessage: action.confirmationMessage || `Opening your "${action.courseName || 'enrolled'}" course.`,
        };
      }
      // Fallback to My Courses list
      navigate('/participant?tab=myEnrollments', { state: { tab: 'myEnrollments' } });
      return { success: true, confirmationMessage: 'Opening your enrolled courses.' };
    }

    // 4. Continue Course / Lesson (with courseId & optional lessonId)
    if (actionType === 'CONTINUE_COURSE') {
      const courseId = action.courseId || action.targetId;
      const lessonId = action.lessonId;
      const queryParams = new URLSearchParams({
        tab: 'myEnrollments',
        ...(courseId ? { courseId: String(courseId) } : {}),
        ...(lessonId ? { lessonId: String(lessonId) } : {}),
        ...(action.subtab ? { subtab: String(action.subtab) } : {}),
      });
      navigate(`/participant?${queryParams.toString()}`, {
        state: {
          tab: 'myEnrollments',
          ...(courseId ? { courseId: Number(courseId) } : {}),
          ...(lessonId ? { lessonId: Number(lessonId) } : {}),
          ...(action.subtab ? { subtab: String(action.subtab) } : {}),
        },
      });
      return {
        success: true,
        confirmationMessage: action.confirmationMessage || `Resumed your course.`,
      };
    }

    // 5. Open / Complete Profile
    if (actionType === 'OPEN_PROFILE' || actionType === 'COMPLETE_PROFILE') {
      navigate('/my-profile');
      return {
        success: true,
        confirmationMessage: action.confirmationMessage || "You're now on your Profile page.",
      };
    }

    // 6. Edit Profile (navigates to /my-profile with edit focus state)
    if (actionType === 'EDIT_PROFILE') {
      navigate('/my-profile', { state: { openEdit: true } });
      return {
        success: true,
        confirmationMessage: action.confirmationMessage || 'Opened your Profile editor.',
      };
    }

    // 7. Start / View Assessment -> Open Course AI Quiz subtab (Image 2)
    if (actionType === 'START_ASSESSMENT' || actionType === 'OPEN_ASSESSMENTS') {
      const courseId = action.courseId || action.targetId || 1;
      const subtab = action.subtab || 'quizzes';
      const queryParams = new URLSearchParams({
        tab: 'myEnrollments',
        courseId: String(courseId),
        subtab: String(subtab),
        ...(action.quizId ? { quizId: String(action.quizId) } : {}),
      });

      navigate(`/participant?${queryParams.toString()}`, {
        state: {
          tab: 'myEnrollments',
          courseId: Number(courseId),
          subtab: String(subtab),
          ...(action.quizId ? { quizId: Number(action.quizId) } : {}),
        },
      });

      return {
        success: true,
        confirmationMessage: action.confirmationMessage || 'Opening Quizzes for your course.',
      };
    }

    // 8. Generic Tab Navigation Mapping
    const targetRoute = action.route || '/participant';
    let targetTab = action.tab;

    if (!targetTab) {
      if (actionType === 'OPEN_DASHBOARD') targetTab = 'overview';
      else if (actionType === 'OPEN_COURSES') targetTab = 'myEnrollments';
      else if (actionType === 'OPEN_CERTIFICATES') targetTab = 'certificates';
      else if (actionType === 'VIEW_RESULTS') targetTab = 'reports';
      else if (actionType === 'OPEN_ACHIEVEMENTS') targetTab = 'achievements';
      else if (actionType === 'OPEN_LEADERBOARD') targetTab = 'leaderboard';
      else if (actionType === 'OPEN_INTERVIEWS') {
        navigate('/interviews');
        return {
          success: true,
          confirmationMessage: action.confirmationMessage || 'Opening Interviews.',
        };
      }
    }

    if (targetRoute === '/interviews' || actionType === 'OPEN_INTERVIEWS') {
      navigate('/interviews');
      return {
        success: true,
        confirmationMessage: action.confirmationMessage || 'Opening your Interviews page.',
      };
    }

    if (targetRoute === '/my-profile') {
      navigate('/my-profile');
      return {
        success: true,
        confirmationMessage: action.confirmationMessage || 'Opening Profile.',
      };
    }

    if (targetTab) {
      navigate(`/participant?tab=${targetTab}`, { state: { tab: targetTab } });
    } else {
      navigate(targetRoute);
    }

    return {
      success: true,
      confirmationMessage: action.confirmationMessage || `Navigated to ${targetTab || targetRoute}.`,
    };
  } catch (err) {
    console.error('[ActionRegistry] Error executing participant action:', err);
    return { success: false, error: err.message };
  } finally {
    setTimeout(() => {
      isExecutingAction = false;
    }, 400);
  }
}
