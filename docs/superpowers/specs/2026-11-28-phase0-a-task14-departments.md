# Task 14: departments as references (migration 002)

Parent: [plan](../plans/2026-11-23-phase0-a-tenancy.md) Task 14, [spec](2026-11-23-phase0-a-tenancy-design.md) §8.

## Contract

| Field | Before | After |
|---|---|---|
| `Doctor/Nurse/Staff.department`, `Conversation.department` | string | `ObjectId` ref `Department` |
| `Bed.ward` | string | `ObjectId` ref `Department` |
| `legacyDepartment` (the four above), `legacyWard` (Bed) | n/a | original text, kept one release |

- **API in:** the same string fields, now a department *name*. Resolved case-insensitively inside the caller's organisation, active branch first, then any branch. An unknown name is `400`. Nothing is created.
- **API out:** `{ id, name }` (populated), never a bare id.
- **Unchanged:** `Patient.ward`, `CareLog.ward`, `Nurse.assignedWards` stay denormalised ward *names*. Services copy `bed.ward.name` into them.

## Migration `002-departments`

1. Per collection, take documents whose field is still a string (this makes it idempotent).
2. Branch of a document: `Bed.branch`; staff profiles use the linked user's `defaultBranch`; conversations use the organisation's `defaultRegistrationBranch`.
3. Normalise (trim, collapse spaces, lower-case) to group values per branch. One `Department` per group: name = first occurrence's casing, `code` from the name (A-Z0-9, max 12) made unique per branch, `source: '002-departments'`.
4. Write the id to the field and the original text to `legacy*`.
5. Write `department-mapping.csv` (`branch,originalValue,departmentId,departmentName`), one row per distinct original value per branch. Skipped when nothing changed.
6. `down`: restore text from `legacy*`, unset `legacy*`, delete departments with `source: '002-departments'`.
