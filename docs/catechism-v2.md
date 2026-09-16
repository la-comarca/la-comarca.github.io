# Catecismo v2

Catecismo v2 is the private academic/operational domain for La Comarca. It is intentionally separated from the legacy Notion-backed Catecismo records until migration is explicitly performed.

## Product model

- Odoo-inspired administration patterns on desktop.
- Task-first mobile navigation: Hoy · Calendario · Grupos · Alumnos · Más.
- Group is the main academic workspace, similar to a Classroom course.
- Curriculum topics are distinct from calendar sessions.
- A session may cover multiple topics, be cancelled, moved, or replaced by another activity.
- Student topic progress is explicit and may be evidenced by attendance, assessment, makeup work, or manual accreditation.
- Assignments, submissions, grade categories, question bank, quizzes and attempts form the LMS/gradebook layer.

## Source of truth

New Catecismo v2 data lives in Supabase/Postgres. Legacy Notion Catecismo remains read/write for the old back office during transition, but should not receive new v2-only concepts.

## Private documents

Student documents use the private `catechism-private` Storage bucket. The database stores metadata only. The bucket is non-public and current RLS limits access to administrators/coordinators. Files must never be linked from the public website or GitHub Pages.

## Rollout

1. Create cycle(s), program(s), rooms and groups.
2. Load catechists and assign them to groups.
3. Load students and contacts, then enroll students into groups.
4. Import curriculum topics.
5. Generate recurring session series and materialize individual sessions.
6. Migrate documents only after validating storage access and retention rules.
7. Migrate attendance/grades after reconciliation with the legacy Notion sources.
8. Retire legacy Catecismo only after acceptance checks and a rollback window.

No legacy tables or Notion records are deleted by migration 0003.
