# Catecismo LMS architecture reference

Use this reference before adding or substantially changing Catecismo functionality. The purpose is to keep La Comarca simple in the interface while giving it a coherent LMS domain model underneath.

## Research base

This map is informed by mature open-source LMS implementations, not by copying their UI or source code:

- Moodle — https://github.com/moodle/moodle
- Canvas LMS — https://github.com/instructure/canvas-lms
- Open edX — https://github.com/openedx/openedx-platform
- Sakai — https://github.com/sakaiproject/sakai
- Chamilo — https://github.com/chamilo/chamilo-lms
- Frappe Learning — https://github.com/frappe/lms

The systems differ substantially, but repeatedly separate the same concerns: curriculum structure, a particular course/group run, membership, activities, attempts/submissions, assessment, outcomes/competencies, progress/completion, calendar, availability/release rules, communication, roles/capabilities, reporting and content reuse.

### Evidence that matters for La Comarca

- Moodle organizes major concerns as distinct subsystems/plugins: calendar, cohort, competency, completion, availability, communication, analytics, badges, auth, backup and activity modules. Completion and availability are cross-cutting systems rather than buttons embedded into one screen.
- Canvas separates `ContextModule` from the items it organizes, has per-user `ContextModuleProgression`, first-class `Assignment`, `Submission`, `Rubric`, `LearningOutcome` and grouped outcomes. This prevents content organization, assessment and learner progress from collapsing into one record.
- Open edX explicitly separates enrollment responsibilities into dedicated apps and has an independent grades subsystem with persistent course-grade logic. Its own student-app documentation warns against turning a broad app into a catch-all and recommends extracting functionality into dedicated apps.
- Sakai maintains a substantial gradebook domain/tool rather than treating grades as fields on assignments.
- Chamilo exposes learning-path/exercise/course tools as separate concepts and connects exercises to gradebook workflows.
- Frappe Learning deliberately keeps a simpler UI but still uses a structured hierarchy (course → chapter → lesson), separates learner batches from reusable course content, and has separate assignment, submission, assessment, evaluator and certification objects. This is a useful product-design reference for La Comarca: deep model, simple surface.

## Core rule

**Do not implement a user request as an isolated button or field when it is actually a state transition or operation on a reusable domain object.**

Examples:

- “Cancelar la clase” is not a standalone feature. It is an exception/state change on a session occurrence that may belong to a recurring series.
- “Que el catequista pueda calificar” is not a role label. It is a scoped capability (`grades.write`) on assigned groups.
- “Poner contenido” is not a textarea tab. It belongs to curriculum/module/resource objects with ordering, publication and availability.
- “Entregó la tarea” is not a boolean on the assignment. It is the state of a submission/attempt belonging to one learner/enrollment.
- “Ya vio este tema” is not inferred from attendance. It is learning progress/evidence aligned to an outcome/topic.

## Target object model

### 1. Program / curriculum definition

Reusable academic definition independent of a particular cycle or group.

Contains:
- program metadata;
- ordered modules/units;
- topics or learning outcomes;
- reusable resources;
- default activities/assessments where appropriate;
- prerequisite relationships;
- completion expectations.

A program must survive cycle rollover without copying student data.

### 2. Module / unit

An ordered container inside a program or group. This is missing as a first-class object today.

A module can organize heterogeneous items, for example:
- lesson/topic;
- resource;
- assignment;
- quiz/exam;
- in-person session linkage;
- reflection/service activity.

Do not force every item to be a “topic”. The module provides sequence/context; the underlying item retains its own type and lifecycle.

### 3. Group / offering / cohort run

A concrete delivery of a program during a cycle. In Catecismo this is the operational hub.

Owns or references:
- cycle;
- program/curriculum version;
- roster/enrollments;
- assigned staff;
- calendar/session series;
- group-specific overrides/resources/activities;
- gradebook configuration;
- operational documents and reporting.

Global directories may exist for search/admin, but normal work happens in the group context.

### 4. Enrollment

The relationship between a learner and a group, with its own lifecycle:

`pending → active → paused → completed | withdrawn`

History must be preserved. Moving a learner should not overwrite prior participation.

### 5. Calendar series and session occurrence

Keep recurrence definition separate from concrete occurrences.

- **Series**: “every Saturday 10:00–11:30 from September to December”.
- **Session**: one date on that series.
- **Exception**: cancel, move, replace, retitle or change one occurrence without mutating the whole series.

Future editing should explicitly offer scopes such as “this session”, “this and following”, or “entire series” when supported safely.

### 6. Learning activity

Use one conceptual activity layer with typed implementations/statuses:

- assignment;
- in-class work;
- project;
- quiz;
- exam;
- participation;
- service/reflection where useful.

Lifecycle should be explicit, e.g. `draft → published → closed → archived`.

The activity defines requirements; it does not contain per-learner completion state.

### 7. Submission / attempt

Per-learner execution of an activity.

Keep separate from the activity itself so the platform can represent:
- assigned;
- submitted;
- late;
- missing;
- excused;
- graded;
- multiple attempts;
- text/file evidence;
- feedback;
- timestamps and grader.

This separation is required before building a serious grading/review workflow.

### 8. Assessment, rubric and gradebook

Separate:
- grade categories/policies;
- activity max points/weight;
- submission score;
- rubric definition;
- rubric assessment;
- calculated course/group grade.

A rubric is reusable and should not be embedded as opaque JSON inside a single assignment if/when implemented.

The operational UX should include both:
- a grid gradebook for overview/bulk entry;
- a focused review queue (SpeedGrader-like) for one activity/submission at a time.

### 9. Outcome / competency / topic

Do not conflate “content topic” with “learner mastery”. A curriculum item can align to one or more outcomes; learner outcome progress is a separate relationship supported by evidence.

Potential evidence sources:
- attendance at a teaching session;
- assessment result;
- makeup session;
- manual pastoral/academic verification;
- another activity.

Attendance may contribute evidence but must not automatically mean mastery.

### 10. Progress / completion engine

Completion is a cross-cutting service, not a checkbox scattered through screens.

It can eventually evaluate rules such as:
- required module items complete;
- minimum attendance;
- required documents verified;
- assessment threshold;
- manual approval;
- required sacramental/preparatory milestone.

Keep completion state explainable: the UI should show *why* something is complete or blocked.

### 11. Availability / release rules

Visibility and editability should eventually support rule-based release instead of ad-hoc booleans:

- date/time;
- prerequisite module/item;
- learner/group status;
- role/capability;
- manual publication;
- completion of another requirement.

Do not implement this until a real workflow needs it, but preserve the boundary in the model.

### 12. Resource library

Resources should be reusable assets/links, optionally aligned to program/module/topic/activity/session.

Avoid re-uploading or duplicating the same resource for every group. Group-specific attachments can override or extend program resources.

Private student documents are a different security domain and must never share the public/course-resource storage boundary.

### 13. Roles, scope and capabilities

Separate **who the account is** from **what it may do** and **where**.

- Account role: admin / coordinator / catechist / editor / reader (or future equivalents).
- Scope: assigned groups/programs.
- Capabilities: attendance, roster, calendar, content, activities, grades, documents, reports, etc.

A role is a convenient preset, not the ultimate authorization check. Server-side capability checks are authoritative.

### 14. Work queues and notifications

A useful LMS is not just directories. It surfaces work that needs attention:

- attendance pending;
- submissions to review;
- missing/expired documents;
- upcoming session preparation;
- unpublished content due soon;
- learner progress exceptions;
- staff coverage gaps.

“Hoy” should increasingly become this task queue rather than a static dashboard.

Notifications should be event-driven and separate from the action that caused them. Store delivery/consent/status rather than assuming an email was delivered.

### 15. Templates, copy and cycle rollover

Mature LMS systems repeatedly support copying/importing/reusing structure. Catecismo will need a safe cycle rollover:

- copy program/module/content definitions;
- optionally copy group schedule/staff templates;
- never silently copy learner enrollments, private documents, attendance or grades;
- preserve source/version provenance.

### 16. Reporting / exports

Reports are first-class outputs, not database dumps. Design them around real consumers:

- catechist operational report;
- coordinator progress/attendance report;
- diocesan document batch;
- grade/progress export;
- roster/contact export with privacy controls.

## UX architecture

### Global navigation

Keep global destinations for cross-group work:
- Hoy / work queue;
- Calendar;
- Groups;
- Learner directory;
- Configuration/admin.

Do not make global directories mandatory for tasks that naturally belong to a group.

### Group workspace

The group is the primary instructor/coordinator workspace. A target structure is:

- **Inicio** — next class, pending tasks, summary, alerts;
- **Plan** — modules/topics/resources and learning sequence;
- **Calendario** — series, sessions and exceptions;
- **Alumnos** — roster, enrollment, learner drill-down, attendance context;
- **Actividades** — assignments/quizzes/projects and review queue;
- **Evaluación** — gradebook, rubrics/outcomes/progress;
- **Equipo** — staff assignments and group-scoped capabilities.

Do not expose every subsystem as a top-level tab if a contextual subview is clearer. Keep desktop information density useful without turning the UI into generic SaaS cards.

### Creation workflows

Prefer type-aware, short workflows over giant forms. Example for an activity:

1. choose type;
2. write content/instructions;
3. choose audience/release and due date;
4. choose grading/rubric if applicable;
5. review/publish.

Defaults should make the common path fast while advanced options remain available.

## Current La Comarca mapping

Existing primitives already align reasonably well:

- `catechism_programs` → curriculum/program;
- `catechism_groups` → offering/cohort run;
- `catechism_enrollments` → enrollment lifecycle;
- `catechism_session_series` + `catechism_sessions` → recurrence + occurrence;
- `catechism_curriculum_topics` → curriculum topics (not yet modules/outcomes);
- `catechism_resources` → reusable/contextual resources;
- `catechism_assignments` → typed learning activities;
- `catechism_submissions` → learner submission lifecycle;
- quiz/question tables → assessment attempts/items;
- `catechism_grade_categories` → part of gradebook policy;
- `catechism_student_topic_progress` → early progress/evidence model;
- workspace membership scope + group-catechist assignment → foundation for role/scope/capabilities.

Important missing or immature concepts:

1. first-class module/unit hierarchy and generic ordered module items;
2. reusable outcomes/competencies distinct from content topics;
3. reusable rubrics + per-submission rubric assessment;
4. focused grading/review queue;
5. richer completion/rule engine;
6. availability/release rules;
7. notifications/event outbox;
8. templates/versioning/cycle rollover;
9. richer reporting/analytics;
10. learner/guardian-facing workspace later, after staff operations are solid.

## Priority order

Do not add all mature-LMS complexity at once. Recommended sequence:

1. stabilize Group Hub and calendar/roster/permissions/documents;
2. add Program → Module → ordered item structure;
3. make Activities + Submissions + review queue complete;
4. add rubrics and outcomes/progress evidence;
5. add completion/work queues and notifications;
6. add templates/cycle rollover and reporting;
7. only then expand learner/guardian self-service, certificates/badges or advanced integrations where the ministry has a real use case.

## What not to copy

- Do not copy Moodle's surface complexity or expose every configuration field by default.
- Do not reproduce Canvas/Open edX institutional scale that La Comarca does not need.
- Do not collapse the model merely to achieve Frappe-like simplicity; keep the model explicit and make the UI simple.
- Do not build certificates, badges, discussion forums, commerce, SCORM/LTI, proctoring or AI features just because another LMS has them. Introduce them only when a real La Comarca workflow justifies them.
- Do not put private minor data or diocesan documents into GitHub/public assets/content repositories.

The target is **Frappe-like clarity over a Canvas/Moodle-like separation of concerns**, adapted to in-person catechesis rather than a generic online course marketplace.
