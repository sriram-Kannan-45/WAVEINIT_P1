export const ROLES = {
  ADMIN: 'ADMIN',
  TRAINER: 'TRAINER',
  PARTICIPANT: 'PARTICIPANT',
}

export const ROLE_LABELS = {
  [ROLES.ADMIN]: 'Administrator',
  [ROLES.TRAINER]: 'Trainer',
  [ROLES.PARTICIPANT]: 'Participant',
}

export const DEFAULT_DASHBOARD_TABS = {
  [ROLES.ADMIN]: 'overview',
  [ROLES.TRAINER]: 'courses',
  [ROLES.PARTICIPANT]: 'overview',
}

export const ROLE_COLORS = {
  [ROLES.ADMIN]: '#059669',
  [ROLES.TRAINER]: '#0D9488',
  [ROLES.PARTICIPANT]: '#10B981',
}
