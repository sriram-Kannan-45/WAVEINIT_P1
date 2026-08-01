/**
 * Permission Matrix — Fine-grained RBAC for the LMS.
 *
 * Roles: SUPER_ADMIN, ADMIN, TRAINER, PARTICIPANT, HR
 * Permissions are string tokens like 'course:create', 'quiz:publish'
 *
 * Usage in middleware:
 *   authorizePermission('course:create')(req, res, next)
 *   verifyRole('ADMIN', 'TRAINER')(req, res, next)
 */

const PERMISSIONS = {
  SUPER_ADMIN: [
    // Everything
    '*',
  ],
  ADMIN: [
    // User management
    'user:list', 'user:create', 'user:update', 'user:delete', 'user:view',
    // Course management
    'course:create', 'course:update', 'course:delete', 'course:view', 'course:publish',
    // Training management
    'training:create', 'training:update', 'training:delete', 'training:view',
    // Trainer management
    'trainer:assign', 'trainer:remove', 'trainer:view',
    // Quiz management
    'quiz:create', 'quiz:update', 'quiz:delete', 'quiz:view', 'quiz:publish', 'quiz:publish-result',
    // Reports
    'report:view', 'report:export', 'report:analytics',
    // Participant management
    'participant:view', 'participant:update', 'participant:approve',
    // Registration
    'registration:view', 'registration:approve', 'registration:reject',
    // System
    'system:settings', 'system:audit-log', 'system:security',
    // File management
    'file:upload', 'file:delete', 'file:view',
    // Certificate
    'certificate:create', 'certificate:view',
    // Proctoring
    'proctor:view', 'proctor:terminate', 'proctor:warning',
    // Coding assessments
    'coding:create', 'coding:update', 'coding:delete', 'coding:view', 'coding:publish',
    // Interview
    'interview:create', 'interview:update', 'interview:delete', 'interview:view',
    // Discussion
    'discussion:create', 'discussion:update', 'discussion:delete', 'discussion:view',
  ],
  TRAINER: [
    // Own courses
    'course:create', 'course:update', 'course:view',
    // Own training
    'training:view', 'training:update',
    // Quiz
    'quiz:create', 'quiz:update', 'quiz:view', 'quiz:publish', 'quiz:publish-result',
    // Participants (limited)
    'participant:view',
    // Reports (limited)
    'report:view',
    // File management
    'file:upload', 'file:view',
    // Certificate
    'certificate:view',
    // Proctoring
    'proctor:view', 'proctor:warning',
    // Coding assessments
    'coding:create', 'coding:update', 'coding:view', 'coding:publish',
    // Interview (limited)
    'interview:create', 'interview:update', 'interview:view',
    // Discussion
    'discussion:create', 'discussion:update', 'discussion:view',
    // Profile
    'profile:view', 'profile:update',
  ],
  PARTICIPANT: [
    // View enrolled courses
    'course:view',
    // Training
    'training:view',
    // Quiz (take)
    'quiz:view',
    // Own results
    'result:view',
    // Profile
    'profile:view', 'profile:update',
    // File (limited upload)
    'file:upload-own',
    // Discussion
    'discussion:create', 'discussion:view',
    // Notes
    'note:view',
    // Feedback
    'feedback:create', 'feedback:view',
  ],
  HR: [
    // Interview management
    'interview:create', 'interview:update', 'interview:delete', 'interview:view',
    // View participants
    'participant:view',
    // Reports
    'report:view',
    // Profile
    'profile:view', 'profile:update',
  ],
};

// ── Check if role has a specific permission ────────────────────────────────
function hasPermission(role, permission) {
  const normalizedRole = (role || '').toUpperCase();
  const perms = PERMISSIONS[normalizedRole];
  if (!perms) return false;
  if (perms.includes('*')) return true;
  return perms.includes(permission);
}

// ── Check if role can access another role's resources ──────────────────────
function canAccessRole(userRole, targetRole) {
  const hierarchy = { SUPER_ADMIN: 5, ADMIN: 4, TRAINER: 3, HR: 2, PARTICIPANT: 1 };
  return (hierarchy[userRole] || 0) >= (hierarchy[targetRole] || 0);
}

module.exports = {
  PERMISSIONS,
  hasPermission,
  canAccessRole,
};
