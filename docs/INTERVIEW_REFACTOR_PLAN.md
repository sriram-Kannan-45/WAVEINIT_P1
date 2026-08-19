# HR Interview Room — Complete Refactor Plan

## AUDIT FINDINGS

### Current Architecture
- **34 files** in `modules/interview/` (20 components, 10 pages, 3 hooks, 1 API, 1 constants)
- **35 files** in `proctoring/` (separate module)
- **27 reusable UI components** in `components/ui/` (Button, Modal, Card, Avatar, Badge, Spinner, etc.) — mostly unused by interview module
- Backend: 1 controller, 1 route file, 2 services, 9 models

### Problems Identified

#### Interview Room Layout
1. `InterviewRoom.jsx` uses `h-screen flex flex-col` but adds `mt-[52px]` for the topbar instead of using a proper CSS Grid layout
2. `VideoGrid.jsx` uses CSS Grid but doesn't fill the viewport properly — wraps in `p-4` padding
3. No true full-screen mode — room is inside the app shell with sidebar margins
4. Screen sharing replaces local video track instead of creating a separate display — causes infinite mirror when sharing same screen
5. No PiP (Picture-in-Picture) for shared screen vs camera

#### Admin → HR Assignment
6. `CreateInterviewForm.jsx` handles trainer assignment during creation only — no reassignment after creation
7. The `assignTrainers` API exists (`POST /api/interview/:id/trainers`) but no UI component uses it post-creation
8. No dedicated "Assign HR" modal or panel in the interview management flow
9. `InterviewDashboard.jsx` has no way to view/edit trainer assignments

#### Code Quality
10. `InterviewRoom.jsx` (340 lines) mixes WebRTC logic, socket events, UI state, media controls — violates separation of concerns
11. `CreateInterviewForm.jsx` (463 lines) is a monolith with 5 steps all in one file
12. No barrel export (`index.js`) for the interview module
13. Shared UI components (Button, Modal, Avatar, Badge, Spinner) exist but are not used — inline styles used instead
14. Duplicate loading spinners (custom `animate-spin` divs instead of `Spinner` from ui/)
15. Duplicate card/empty-state patterns instead of using `Card`, `EmptyState` from ui/

---

## IMPLEMENTATION PLAN

### Phase 1: Interview Room — Full-Screen Layout (Priority: HIGH)

**Files to modify:**
- `InterviewRoom.jsx` — Restructure to CSS Grid, remove padding, fix viewport fill
- `RoomTopBar.jsx` — Make floating/translucent, absolute positioned
- `RoomControls.jsx` — Make floating/translucent, absolute positioned
- `VideoGrid.jsx` — Fix to fill available space, add PiP mode for screen share

**New files:**
- `ScreenShareView.jsx` — Dedicated screen share display with camera PiP

**Key changes:**
```
Before: h-screen flex flex-col → mt-[52px] → flex-1 p-4 → VideoGrid
After:  h-screen grid grid-rows-[auto_1fr_auto] → RoomTopBar (floating) → VideoGrid (fills 100%) → RoomControls (floating)
```

**Screen share fix:**
- When sharing screen, display screen as main view
- Show camera as draggable floating PiP (small overlay)
- Prevent infinite mirror by NOT displaying the local screen share track in the main grid

### Phase 2: Admin → HR Assignment Modal (Priority: HIGH)

**Files to modify:**
- `InterviewDashboard.jsx` — Add "Assign HR" button per interview
- `InterviewCard.jsx` — Add assignment action
- `InterviewTable.jsx` — Add "Assign HR" action in dropdown

**New files:**
- `components/AssignHRModal.jsx` — Reusable modal for assigning/reassigning HR
- `hooks/useTrainers.js` — Hook to fetch and manage trainer list (reuse existing `interviewApi.listTrainers()`)

**Key flows:**
1. Admin sees "Assign HR" button on interview cards/table
2. Click opens `AssignHRModal` with search, trainer list, current assignment
3. Admin selects trainer → calls `interviewApi.assignTrainers(id, [trainerId])`
4. Success toast → auto-refresh interview list

**Backend:** No new endpoints needed — reuse existing:
- `GET /api/interview/users/trainers` (listTrainers)
- `POST /api/interview/:id/trainers` (assignTrainers)

### Phase 3: Code Quality — Reuse Existing Components (Priority: MEDIUM)

**Replace inline patterns with shared UI components:**

| Current Pattern | Replace With |
|----------------|-------------|
| Custom loading spinners | `<Spinner />` from `components/ui/` |
| Custom empty states | `<EmptyState />` from `components/ui/` |
| Inline buttons | `<Button />` from `components/ui/` |
| Inline modals | `<Modal />` from `components/ui/` |
| Inline avatars | `<Avatar />` from `components/ui/` |
| Inline badges | `<Badge />` from `components/ui/` |

**Files to refactor:**
- `InterviewCard.jsx` — Use Card, Badge, Button from ui/
- `InterviewTable.jsx` — Use Table, Badge, Button from ui/
- `InterviewStats.jsx` — Use StatCard from ui/
- `InterviewDashboard.jsx` — Use PageHeader, Spinner from ui/
- `InterviewFilters.jsx` — Use Input, Select from ui/
- `CreateInterviewForm.jsx` — Use Input, Select, Button, Modal from ui/
- `PreJoinScreen.jsx` — Use Button from ui/
- `ChatPanel.jsx` — Use Input patterns from ui/

### Phase 4: Extract Business Logic (Priority: MEDIUM)

**Move logic out of components:**

| Component | Logic to Extract | Target |
|-----------|-----------------|--------|
| `InterviewRoom.jsx` | Media controls | `hooks/useMediaControls.js` (new) |
| `InterviewRoom.jsx` | Timer logic | Already in `Timer.jsx` — remove duplicate state |
| `InterviewRoom.jsx` | Participant tracking | Move to `hooks/useRoomParticipants.js` (new) |
| `CreateInterviewForm.jsx` | Form validation | Move to `utils/interviewValidation.js` (new) |
| `CreateInterviewForm.jsx` | Step management | Move to `hooks/useWizardSteps.js` (new) |

### Phase 5: Module Barrel Export (Priority: LOW)

Create `modules/interview/index.js` to export all public APIs:
- Components
- Hooks
- API
- Constants

---

## DETAILED FILE CHANGES

### 1. `InterviewRoom.jsx` — Full-Screen Grid Layout

**Current issues:**
- Uses `flex flex-col` with `mt-[52px]` hack for topbar
- `VideoGrid` wrapped in `p-4` div that wastes space
- No proper full-screen behavior

**New structure:**
```jsx
<div className="h-screen w-screen overflow-hidden bg-slate-900 grid grid-rows-[auto_1fr_auto]">
  {/* Floating top bar */}
  <RoomTopBar ... />
  
  {/* Main content — fills remaining space */}
  <div className="relative overflow-hidden">
    {isScreenSharing ? (
      <ScreenShareView screenStream={screenStream} cameraStream={localStream} />
    ) : (
      <VideoGrid ... />
    )}
  </div>
  
  {/* Floating bottom controls */}
  <RoomControls ... />
</div>
```

### 2. `VideoGrid.jsx` — Responsive + PiP

**Changes:**
- Remove outer padding
- Use `h-full w-full` to fill parent
- Add `aspect-ratio` maintenance via CSS Grid
- When screen sharing, show camera tiles in sidebar strip

### 3. `RoomTopBar.jsx` — Floating Translucent

**Changes:**
- Add `pointer-events-none` to container, `pointer-events-auto` to content
- Position: `absolute top-0 left-0 right-0 z-40`
- Background: `bg-slate-900/60 backdrop-blur-xl`
- Add: HR name, candidate name, connection status, fullscreen button

### 4. `RoomControls.jsx` — Floating Translucent

**Changes:**
- Position: `absolute bottom-0 left-0 right-0 z-40`
- Background: `bg-slate-900/60 backdrop-blur-xl`
- Center-aligned floating bar with rounded corners
- Add: participants count, whiteboard toggle

### 5. `AssignHRModal.jsx` — New Component

```jsx
// Reuses: Modal from ui/, Input from ui/, Avatar from ui/, Spinner from ui/
// Uses: interviewApi.listTrainers(), interviewApi.assignTrainers()
// Features: Search by name, show current assignment, loading states, toast
```

### 6. `useMediaControls.js` — New Hook

Extract from InterviewRoom.jsx:
- toggleMic, toggleCamera, toggleScreenShare
- Local stream management
- Screen share stream separation

### 7. `useRoomParticipants.js` — New Hook

Extract from InterviewRoom.jsx:
- Participants state
- Socket event handlers for join/leave
- Participant count computation

---

## COMPONENT REUSE MAP

### Existing UI components to use:

| File | Export | Use In |
|------|--------|--------|
| `components/ui/Button.jsx` | `Button` | All buttons across interview module |
| `components/ui/Modal.jsx` | `Modal` | AssignHRModal, ConfirmDialog |
| `components/ui/Card.jsx` | `Card, CardHeader, CardBody` | InterviewCard, stats |
| `components/ui/Avatar.jsx` | `Avatar` | Video tiles, participant lists |
| `components/ui/Badge.jsx` | `Badge` | Status badges, type badges |
| `components/ui/Spinner.jsx` | `Spinner` | All loading states |
| `components/ui/Input.jsx` | `Input` | Forms, search |
| `components/ui/Select.jsx` | `Select` | Filters, forms |
| `components/ui/EmptyState.jsx` | `EmptyState` | Empty lists |
| `components/ui/Tooltip.jsx` | `Tooltip` | Control buttons |
| `components/ui/SearchBar.jsx` | `SearchBar` | Trainer search, participant search |
| `components/Toast.jsx` | `useToast` | Success/error notifications |

---

## RESPONSIVE BEHAVIOR

### Desktop (≥1280px)
- Full 2-column grid: video area + side panel
- Floating toolbar at bottom center
- PiP for screen share in corner

### Laptop (1024-1279px)
- Same layout, smaller controls
- Side panel overlays on small screens

### Tablet (768-1023px)
- Stacked layout
- Bottom toolbar with "More" menu
- Side panel as full-screen overlay

### Mobile (<768px)
- Video takes full screen
- Controls overlay at bottom
- Chat as full-screen modal

---

## EXECUTION ORDER

1. **Phase 1** — Interview Room layout (InterviewRoom, RoomTopBar, RoomControls, VideoGrid, ScreenShareView)
2. **Phase 2** — Admin HR Assignment (AssignHRModal, useTrainers, InterviewDashboard/Card/Table updates)
3. **Phase 3** — Component reuse refactor (replace inline patterns with ui/ components)
4. **Phase 4** — Extract business logic into hooks/utils
5. **Phase 5** — Module barrel export
6. **Verify** — Build, test, responsive check
