// ═══════════════════════════════════════════════════════════════════
// DESIGN TOKENS — Single source of truth for the entire LMS UI
// ═══════════════════════════════════════════════════════════════════
//
// DESIGN RATIONALE:
// This training/LMS platform is used by trainers for hours daily. The
// palette centers on deep ocean teal (#0D9488) — conveying trust,
// growth, and calm focus ideal for educational tools. Warm stone
// backgrounds (#FAFAF9 / #FFFFFF) reduce eye strain during long
// sessions. Amber (#D97706) is reserved exclusively for ratings and
// achievement highlights, creating a rewarding warm contrast. The
// signature visual element is a subtle bottom-edge gradient bar on
// interactive stat cards that shifts from teal to cyan on hover,
// reinforcing the "learning growth" metaphor throughout the app.
//
// ═══════════════════════════════════════════════════════════════════

// ── Color Palette ─────────────────────────────────────────────────

export const colors = {
  // Backgrounds
  bg: {
    base: '#f8fafc',
    raised: '#ffffff',
    overlay: 'rgba(15, 23, 42, 0.5)',
    overlayLight: 'rgba(15, 23, 42, 0.25)',
  },

  // Surfaces
  surface: {
    primary: '#ffffff',
    secondary: '#f8fafc',
    tertiary: '#f1f5f9',
    hover: '#f1f5f9',
  },

  // Borders
  border: {
    default: '#e5e7eb',
    light: '#f1f5f9',
    focus: '#0d9488',
    dashed: '#cbd5e1',
  },

  // Text
  text: {
    primary: '#0f172a',
    secondary: '#475569',
    muted: '#6b7280',
    inverse: '#ffffff',
    link: '#0d9488',
    linkHover: '#0f766e',
  },

  // Primary — Teal (trust, growth, calm focus)
  primary: {
    50: '#f0fdfa',
    100: '#ccfbf1',
    200: '#99f6e4',
    300: '#5eead4',
    400: '#2dd4bf',
    500: '#14b8a6',
    600: '#0d9488',
    700: '#0f766e',
    800: '#115e59',
    900: '#134e4a',
  },

  // Secondary — Blue
  secondary: {
    50: '#EFF6FF',
    100: '#DBEAFE',
    200: '#BFDBFE',
    300: '#93C5FD',
    400: '#60A5FA',
    500: '#3B82F6',
    600: '#2563EB',
    700: '#1D4ED8',
    800: '#1E40AF',
    900: '#1E3A8A',
  },

  // Accent Warm — Amber (ratings, achievements)
  accent: {
    50: '#FFFBEB',
    100: '#FEF3C7',
    200: '#FDE68A',
    300: '#FCD34D',
    400: '#FBBF24',
    500: '#F59E0B',
    600: '#D97706',
    700: '#B45309',
    800: '#92400E',
    900: '#78350F',
  },

  // Success — Green
  success: {
    50: '#f0fdf4',
    100: '#dcfce7',
    200: '#bbf7d0',
    300: '#86efac',
    400: '#4ade80',
    500: '#22c55e',
    600: '#16a34a',
    700: '#15803d',
    800: '#166534',
    900: '#14532d',
  },

  // Warning — Amber
  warning: {
    50: '#FFFBEB',
    100: '#FEF3C7',
    200: '#FDE68A',
    300: '#FCD34D',
    400: '#FBBF24',
    500: '#F59E0B',
    600: '#D97706',
    700: '#B45309',
    800: '#92400E',
    900: '#78350F',
  },

  // Danger — Red
  danger: {
    50: '#FEF2F2',
    100: '#FEE2E2',
    200: '#FECACA',
    300: '#FCA5A5',
    400: '#F87171',
    500: '#EF4444',
    600: '#DC2626',
    700: '#B91C1C',
    800: '#991B1B',
    900: '#7F1D1D',
  },

  // Info — Blue
  info: {
    50: '#EFF6FF',
    100: '#DBEAFE',
    200: '#BFDBFE',
    300: '#93C5FD',
    400: '#60A5FA',
    500: '#3B82F6',
    600: '#2563EB',
    700: '#1D4ED8',
    800: '#1E40AF',
    900: '#1E3A8A',
  },

  // Neutral Slate
  slate: {
    50: '#F8FAFC',
    100: '#F1F5F9',
    200: '#E2E8F0',
    300: '#CBD5E1',
    400: '#94A3B8',
    500: '#64748B',
    600: '#475569',
    700: '#334155',
    800: '#1E293B',
    900: '#0F172A',
    950: '#020617',
  },

  // Sidebar
  sidebar: {
    bg: '#0F172A',
    bgMid: '#16213E',
    bgEnd: '#1E293B',
    activeBg: '#059669',
    activeText: '#ffffff',
    hoverBg: 'rgba(255, 255, 255, 0.06)',
  },

  // Brand — Green/Emerald (hero, logo, accent elements)
  brand: {
    indigo: '#059669',
    indigoDark: '#047857',
    violet: '#10B981',
    violetLight: '#34D399',
    violetTint: '#ECFDF5',
    blue: '#0D9488',
    blueDark: '#0F766E',
    blueTint: '#F0FDFA',
    green: '#059669',
    greenLight: '#10B981',
    greenTint: '#DCFCE7',
    amber: '#F59E0B',
    amberTint: '#FEF3C7',
  },

  // Semantic gradients
  gradient: {
    primary: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
    primaryStrong: 'linear-gradient(135deg, #047857 0%, #059669 100%)',
    hero: 'linear-gradient(90deg, #059669 0%, #10B981 100%)',
    logo: 'linear-gradient(135deg, #059669, #10B981)',
    warm: 'linear-gradient(135deg, #D97706 0%, #F59E0B 100%)',
    success: 'linear-gradient(135deg, #16A34A 0%, #22C55E 100%)',
    danger: 'linear-gradient(135deg, #DC2626 0%, #EF4444 100%)',
    sidebar: 'linear-gradient(180deg, #0F172A 0%, #16213E 50%, #1E293B 100%)',
    courseNode: 'linear-gradient(135deg, #059669, #0D9488)',
    courseJava: 'linear-gradient(135deg, #EA580C, #F59E0B)',
  },
}

// ── Typography ────────────────────────────────────────────────────

export const typography = {
  fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
  fontFamilyMono: "'JetBrains Mono', 'Fira Code', monospace",
}

// ── Button Styles ─────────────────────────────────────────────────

const baseBtn = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  fontFamily: typography.fontFamily,
  fontWeight: 600,
  borderRadius: '12px',
  cursor: 'pointer',
  border: 'none',
  outline: 'none',
  transition: 'all 0.2s ease',
  whiteSpace: 'nowrap',
}

export const btnPrimary = {
  ...baseBtn,
  background: colors.secondary[600],
  color: colors.text.inverse,
  padding: '10px 20px',
  fontSize: '0.875rem',
  lineHeight: '1.25rem',
  boxShadow: '0 1px 3px rgba(37, 99, 235, 0.25)',
}

export const btnSecondary = {
  ...baseBtn,
  background: colors.surface.primary,
  color: colors.text.secondary,
  border: `1px solid ${colors.border.default}`,
  padding: '10px 20px',
  fontSize: '0.875rem',
  lineHeight: '1.25rem',
}

export const btnDanger = {
  ...baseBtn,
  background: colors.danger[600],
  color: colors.text.inverse,
  padding: '10px 20px',
  fontSize: '0.875rem',
  lineHeight: '1.25rem',
}

export const btnSuccess = {
  ...baseBtn,
  background: colors.success[600],
  color: colors.text.inverse,
  padding: '10px 20px',
  fontSize: '0.875rem',
  lineHeight: '1.25rem',
}

export const btnWarning = {
  ...baseBtn,
  background: colors.warning[600],
  color: colors.text.inverse,
  padding: '10px 20px',
  fontSize: '0.875rem',
  lineHeight: '1.25rem',
}

export const btnOutline = {
  ...baseBtn,
  background: 'transparent',
  color: colors.text.secondary,
  border: `1px solid ${colors.border.default}`,
  padding: '10px 20px',
  fontSize: '0.875rem',
  lineHeight: '1.25rem',
}

export function iconBtn(bg = 'transparent', fg = colors.text.secondary, size = 36) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: '10px',
    background: bg,
    color: fg,
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    flexShrink: 0,
  }
}

// ── Badge / Status Pill Styles ────────────────────────────────────

function badge(baseBg, baseFg) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '3px 10px',
    borderRadius: '8px',
    fontSize: '0.75rem',
    lineHeight: '1rem',
    fontWeight: 600,
    background: baseBg,
    color: baseFg,
    whiteSpace: 'nowrap',
  }
}

// Training / assessment statuses
export const STATUS_BADGE = {
  DRAFT:              badge(colors.slate[100], colors.slate[600]),
  PUBLISHED:          badge('#dcfce7', '#16a34a'),
  CLOSED:             badge(colors.danger[100], colors.danger[600]),
  RESULTS_PUBLISHED:  badge(colors.info[100], colors.info[700]),
  ARCHIVED:           badge('#F5F5F4', '#78716C'),
}

// Result visibility statuses
export const RESULT_BADGE = {
  HIDDEN:    badge(colors.warning[100], colors.warning[800]),
  PUBLISHED: badge(colors.success[100], colors.success[700]),
}

// Difficulty levels
export const DIFF_BADGE = {
  EASY:   badge(colors.success[100], colors.success[700]),
  MEDIUM: badge(colors.warning[100], colors.warning[800]),
  HARD:   badge(colors.danger[100], colors.danger[600]),
}

// Quiz / coding attempt statuses
export const ATTEMPT_STATUS = {
  NOT_STARTED:      { bg: colors.slate[100], fg: colors.slate[600], label: 'Not Started' },
  IN_PROGRESS:      { bg: colors.info[100], fg: colors.info[700], label: 'In Progress' },
  SUBMITTED:        { bg: colors.success[100], fg: colors.success[700], label: 'Submitted' },
  COMPLETED:        { bg: colors.success[100], fg: colors.success[700], label: 'Completed' },
  WAITING_RESULT:   { badge: badge(colors.warning[100], colors.warning[800]), label: 'Waiting Result' },
  RESULT_PUBLISHED: { bg: colors.info[100], fg: colors.info[700], label: 'Result Published' },
  DISQUALIFIED:     { bg: colors.danger[100], fg: colors.danger[600], label: 'Disqualified' },
}

// Material type badges
export const TYPE_BADGE = {
  NOTE:         badge(colors.primary[50], colors.primary[700]),
  PDF:          badge(colors.danger[100], colors.danger[600]),
  PPT:          badge(colors.warning[100], colors.warning[800]),
  VIDEO:        badge(colors.info[100], colors.info[700]),
  IMAGE:        badge(colors.success[100], colors.success[700]),
  LINK:         badge('#F3E8FF', '#7E22CE'),
  ATTACHMENT:   badge(colors.slate[100], colors.slate[600]),
  LIVE_SESSION: badge('#FAE8FF', '#C084FC'),
}

// Quiz result status (legacy naming for some files)
export const RESULT_STATUS_BADGE = {
  HIDDEN:    badge(colors.warning[100], colors.warning[800]),
  PUBLISHED: badge(colors.success[100], colors.success[700]),
}

// ── Form / Input Styles ───────────────────────────────────────────

export const lblStyle = {
  display: 'block',
  fontSize: '0.875rem',
  fontWeight: 600,
  color: colors.text.primary,
  marginBottom: '6px',
  fontFamily: typography.fontFamily,
}

export const lblTiny = {
  display: 'block',
  fontSize: '0.75rem',
  fontWeight: 500,
  color: colors.text.muted,
  marginBottom: '4px',
  fontFamily: typography.fontFamily,
}

export const inputStyle = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: '12px',
  border: `1px solid ${colors.border.default}`,
  background: colors.surface.primary,
  color: colors.text.primary,
  fontSize: '0.875rem',
  fontFamily: typography.fontFamily,
  outline: 'none',
  transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
  boxSizing: 'border-box',
}

export const selectStyle = {
  ...inputStyle,
  appearance: 'none',
  cursor: 'pointer',
}

export const textareaStyle = {
  ...inputStyle,
  resize: 'vertical',
  minHeight: '80px',
}

// ── Table Styles ──────────────────────────────────────────────────

export const th = {
  padding: '12px 16px',
  textAlign: 'left',
  fontWeight: 600,
  fontSize: '0.75rem',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: colors.text.muted,
  background: colors.surface.secondary,
  borderBottom: `1px solid ${colors.border.default}`,
  fontFamily: typography.fontFamily,
  whiteSpace: 'nowrap',
}

export const td = {
  padding: '12px 16px',
  fontSize: '0.875rem',
  color: colors.text.secondary,
  borderBottom: `1px solid ${colors.border.light}`,
  fontFamily: typography.fontFamily,
  verticalAlign: 'middle',
}

// ── Card / Surface Style ──────────────────────────────────────────

export const cardStyle = {
  background: colors.surface.primary,
  borderRadius: '22px',
  border: `1px solid ${colors.border.default}`,
  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04), 0 6px 16px rgba(0, 0, 0, 0.04)',
  overflow: 'hidden',
}

export const cardPadding = {
  padding: '24px',
}

// ── Chart / Analytics Colors ──────────────────────────────────────

export const COMPLETION_COLORS = {
  completed:   colors.success[600],
  inProgress:  colors.warning[500],
  notStarted:  colors.slate[400],
}

export const CHART_COLORS = {
  primary:   colors.primary[600],
  secondary: colors.secondary[600],
  success:   colors.success[600],
  warning:   colors.warning[500],
  danger:    colors.danger[600],
  muted:     colors.slate[400],
}

// ── Activity / Timeline ───────────────────────────────────────────

export const activityColors = {
  course: {
    published: { text: colors.success[600], bg: colors.success[50] },
    draft:     { text: colors.warning[600], bg: colors.warning[50] },
    default:   { text: colors.primary[600], bg: colors.primary[50] },
  },
  quiz: {
    default: { text: colors.secondary[600], bg: colors.secondary[50] },
  },
  alert: {
    default: { text: colors.danger[600], bg: colors.danger[50] },
  },
}

// ── Podium / Leaderboard ──────────────────────────────────────────

export const PODIUM_COLORS = [
  colors.accent[500],  // gold
  colors.slate[400],   // silver
  '#CD7C47',           // bronze
]

export const MEDAL_COLORS = {
  1: colors.accent[500],
  2: colors.slate[400],
  3: '#CD7C47',
}

// ── Severity Styles (for violations / proctoring) ─────────────────

export const SEVERITY_STYLES = {
  CRITICAL: { bg: colors.danger[100], fg: colors.danger[600], label: 'Critical' },
  HIGH:     { bg: colors.danger[100], fg: colors.danger[600], label: 'High' },
  MEDIUM:   { bg: colors.warning[100], fg: colors.warning[800], label: 'Medium' },
  LOW:      { bg: colors.accent[100], fg: colors.accent[700], label: 'Low' },
  INFO:     { bg: colors.info[100], fg: colors.info[600], label: 'Info' },
}

// ── Skeleton / Loading ────────────────────────────────────────────

export const skeletonStyle = {
  background: `linear-gradient(90deg, ${colors.slate[100]} 25%, ${colors.slate[200]} 50%, ${colors.slate[100]} 75%)`,
  backgroundSize: '200% 100%',
  animation: 'shimmer 2s infinite',
  borderRadius: '8px',
}

// ── Helper: Generate a badge from a value map ─────────────────────

export function statusBadge(value) {
  const map = STATUS_BADGE[value]
  if (!map) return badge(colors.slate[100], colors.slate[600])
  return map
}

export function resultBadge(value) {
  const map = RESULT_BADGE[value]
  if (!map) return badge(colors.slate[100], colors.slate[600])
  return map
}

export function diffBadge(value) {
  const map = DIFF_BADGE[value]
  if (!map) return badge(colors.slate[100], colors.slate[600])
  return map
}

export function typeBadge(value) {
  const map = TYPE_BADGE[value]
  if (!map) return badge(colors.slate[100], colors.slate[600])
  return map
}

export function attemptStatusBadge(value) {
  const map = ATTEMPT_STATUS[value]
  if (!map) return badge(colors.slate[100], colors.slate[600])
  if (map.badge) return map.badge
  return badge(map.bg, map.fg)
}

// ── Spacing Scale (4px base) ─────────────────────────────────────

export const spacing = {
  0: '0px',
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  7: '28px',
  8: '32px',
  9: '36px',
  10: '40px',
  12: '48px',
  14: '56px',
  16: '64px',
  20: '80px',
  24: '96px',
}

// ── Border Radius ────────────────────────────────────────────────

export const radius = {
  none: '0px',
  xs: '4px',
  sm: '6px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  '2xl': '20px',
  '3xl': '24px',
  full: '9999px',
}

// ── Shadows / Elevation ──────────────────────────────────────────

export const shadows = {
  none: 'none',
  xs: '0 1px 2px rgba(0, 0, 0, 0.05)',
  sm: '0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
  '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
  card: '0 1px 3px rgba(0, 0, 0, 0.04), 0 6px 16px rgba(0, 0, 0, 0.04)',
  'card-hover': '0 4px 12px rgba(0, 0, 0, 0.08), 0 12px 28px rgba(0, 0, 0, 0.06)',
  stat: '0 1px 2px rgba(0, 0, 0, 0.04)',
  'stat-hover': '0 4px 12px rgba(0, 0, 0, 0.08)',
  inner: 'inset 0 2px 4px rgba(0, 0, 0, 0.06)',
  glass: '0 8px 32px rgba(0, 0, 0, 0.12)',
}

// ── Animation / Transitions ──────────────────────────────────────

export const transitions = {
  fast: '150ms ease',
  normal: '200ms ease',
  slow: '300ms ease',
  spring: '300ms cubic-bezier(0.16, 1, 0.3, 1)',
  bounce: '500ms cubic-bezier(0.34, 1.56, 0.64, 1)',
}

export const animation = {
  fadeIn: 'fadeIn 200ms ease',
  fadeInUp: 'fadeInUp 300ms cubic-bezier(0.16, 1, 0.3, 1)',
  fadeInDown: 'fadeInDown 300ms cubic-bezier(0.16, 1, 0.3, 1)',
  scaleIn: 'scaleIn 200ms cubic-bezier(0.16, 1, 0.3, 1)',
  slideInRight: 'slideInRight 300ms cubic-bezier(0.16, 1, 0.3, 1)',
  shimmer: 'shimmer 2s infinite',
  pulse: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
  spin: 'spin 1s linear infinite',
}

// ── Breakpoints (for reference — use Tailwind classes in JSX) ────

export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
}

// ── Container Max Widths ─────────────────────────────────────────

export const containers = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
  full: '100%',
}

// ── Z-Index Scale ────────────────────────────────────────────────

export const zIndex = {
  base: 0,
  dropdown: 1000,
  sticky: 1100,
  fixed: 1300,
  modalBackdrop: 1400,
  modal: 1500,
  popover: 1600,
  toast: 1700,
  tooltip: 1800,
  loading: 9999,
}

// ── Icon Sizes ───────────────────────────────────────────────────

export const iconSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
}

// ── Opacity ──────────────────────────────────────────────────────

export const opacity = {
  disabled: 0.5,
  hover: 0.8,
  active: 0.9,
  overlay: 0.5,
  muted: 0.6,
}

// ── Overlay utility ──────────────────────────────────────────────

export const overlay = {
  background: colors.bg.overlay,
  backdropFilter: 'blur(4px)',
}

// ── Focus ring utility ───────────────────────────────────────────

export const focusRing = {
  outline: 'none',
  boxShadow: `0 0 0 2px ${colors.surface.primary}, 0 0 0 4px ${colors.primary[500]}`,
}

// ── Grid utility ─────────────────────────────────────────────────

export const grid = {
  display: 'grid',
  gap: spacing[6],
}
