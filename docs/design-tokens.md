# WAVE INIT LMS — Design System Reference (Tokens)

This document is the single source of truth for the typography, colors, spacing, and component styles across the entire WAVE INIT LMS application.

---

## 1. Typography System

All text elements must use a consistent type scale. The primary font is **Poppins** (for headings and titles) and **Inter** (for body and UI elements), with fallback to system sans-serif.

| Level | Size | Weight | Line Height | Element / Usage |
| :--- | :--- | :--- | :--- | :--- |
| **Page Title** | 24px - 28px | Bold (700) | 1.2 | `h1` |
| **Section Title** | 18px - 20px | Semibold (600) | 1.3 | `h2` |
| **Card Title** | 15px - 16px | Semibold (600) | 1.4 | `h3` |
| **Body Text** | 14px | Regular (400) | 1.5 | Paragraphs, lists, standard forms |
| **Secondary / Muted**| 13px | Regular (400) | 1.5 | Meta labels, helper texts, table cells |
| **Micro-labels** | 11px - 12px | Semibold (600) | 1.2 | Uppercase stat labels, tags, categories |
| **Large Stats** | 28px - 32px | Bold (700) | 1.1 | Numeric values on metrics dashboards |

---

## 2. Color System

Colors are semantic, mapping directly to specific functions rather than being decorative.

| Semantic Class | HEX / Variable | Tailwind Equiv | Usage |
| :--- | :--- | :--- | :--- |
| **Primary / Brand** | `#7c3aed` | `violet-600` | Primary buttons, active sidebar states, AI wands/quiz features, primary chart series |
| **Success** | `#10b981` | `emerald-500` | Published badge, completed items, positive trend sparks, enrollment success |
| **Warning** | `#f59e0b` | `amber-500` | Draft badge, intermediate difficulty tag, pending approvals, quiz assessments |
| **Info** | `#3b82f6` | `blue-500` | Info badges, category tags, secondary chart series, informational dialogs |
| **Danger** | `#ef4444` | `red-500` | Destructive buttons, errors, overdue quizzes, rejected status |
| **Page Background** | `#F5F6FA` | `slate-50` / `#F5F6FA` | Core canvas area |
| **Card Background** | `#ffffff` | `white` | Cards, panels, dropdown lists |
| **Border** | `#E5E7EB` | `gray-200` | 1px card borders, table dividers |
| **Text Primary** | `#0f172a` | `slate-900` | Headings, main text |
| **Text Secondary** | `#64748b` | `slate-500` | Subtitles, meta tags, table header titles |
| **Text Muted** | `#94a3b8` | `slate-400` | Inline helper labels, placeholder text |

---

## 3. Spacing Scale

Unified spacing structure based on standard increments.

* **Layout Padding**: `24px` to `32px` (e.g. `p-6` to `p-8`)
* **Card Gap**: `16px` to `24px` (e.g. `gap-4` to `gap-6`)
* **Element Spacing**: `8px` to `12px` (e.g. `space-y-2` to `space-y-3`)

---

## 4. Reusable Primitives & Components

* **Badge/Pill**: `rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider`
* **Tag/Chip**: `rounded px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-700`
* **Buttons**:
  * *Primary*: Indigo/purple gradient `#7c3aed` to `#a855f7`, white text, shadow, lift-on-hover.
  * *Secondary*: Outlined grey, transparent background, subtle hover bg.
  * *Danger*: Solid red `#ef4444`, white text.
* **Cards**: Pure white, 1px border `#E5E7EB`, 16px border-radius, soft layered shadow (`box-shadow: 0 1px 3px rgba(0,0,0,0.05), 0 8px 24px -10px rgba(0,0,0,0.04)`).
* **Tables**: Header cells grey-50, uppercase micro-labels, hover row bg (`#f8fafc`).
