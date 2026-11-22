# Phase 4a (Nurse) — Deferred minors

Found while building slice 4a and deliberately not fixed. Each is low-impact; none blocks the slice. Recorded 2026-11-16.

## 1. `CareLog` and `Vitals` types do not match the backend

- **What:** the frontend `CareLog` type has `recordedAt`, but the backend sends `performedAt`. The frontend `Vitals` field names also differ from the backend's.
- **Today:** `entryTime()` in `src/features/nurse/model/display.ts` reads `performedAt`, then `recordedAt`, then `createdAt`, so the nurse screens work.
- **Left undone:** the shared types in `src/shared/types/domain.ts` and any other code that reads `recordedAt` or the old vitals names.
- **Suggested fix:** align the types with the backend in one pass, add a contract test, and then remove the tolerance from `entryTime()`.

## 2. Redundant recorder name on the workload page

- **What:** `FeedRow` prints the recorder's name on every row. On `/app/workload` every entry is the signed-in nurse's own, so the name adds nothing.
- **Suggested fix:** add a `hideRecorder` prop to `FeedRow`, or build a read-only row for own-entry lists.

## 3. No per-task counter in the handover form

- **What:** each outstanding task has a hard `maxLength` of 300 but no visible counter. The summary field does have one (`n / 4000`).
- **Suggested fix:** show a counter on a task once it is near the limit.

## 4. No realtime updates until Phase 6

- **What:** the ward feed and the workload entries only refresh on navigation or refocus. The attention queue polls every 60 seconds.
- **Suggested fix:** wait for the Phase 6 realtime work. This is a plan decision, not a defect.

## Assumptions to confirm (not defects)

- **Shift start hours** in `src/features/nurse/model/shift.ts` are assumed: morning 07:00, evening 15:00, night 23:00. If your wards use different hours, "This shift" will be wrong. Confirm with the hospital and update the single `SHIFT_START_HOUR` map.
- **"This shift" means the most recent start.** A morning nurse opening the page at 05:00 sees entries from yesterday 07:00. `on_call` and unknown shifts fall back to "Last 12 hours".
