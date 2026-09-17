---
name: la-comarca-platform
description: Apply La Comarca's repository-specific domain, architecture, security, UX, Notion ownership, and definition-of-done rules when changing the platform.
---

# La Comarca Platform

Use this skill for work inside the La Comarca web application, especially CMS, Worker, Notion, authentication, operations, and public/admin UX changes. It supplements generic engineering skills.

## Non-negotiables

- Preserve the public site's visual direction and evolve the management experience incrementally; do not start a rewrite without evidence.
- Treat public data, operational data, and sensitive participant/minor data as separate security boundaries.
- Enforce authorization on the server through centralized permissions; hidden controls are never security.
- Keep Notion ownership and synchronization direction explicit. Never introduce ambiguous bidirectional sync.
- Prefer domain workflows and related-record views over isolated CRUD screens.
- For Catecismo/LMS work, map requests to reusable LMS domain objects and state transitions before adding isolated buttons, fields, or tabs.
- Make schema changes through migrations and verify tests/build plus authorization and critical workflow regressions.

## Progressive references

- Read [architecture.md](references/architecture.md) for the current stack and target boundaries.
- Read [domain.md](references/domain.md) for the evidence-backed domain map and source-of-truth rules.
- Read [lms.md](references/lms.md) before changing Catecismo curriculum, groups, sessions, activities, assessments, progress, permissions, reporting, or navigation.
- Read [security.md](references/security.md) before touching auth, permissions, private records, files, or integrations.
- Read [ux.md](references/ux.md) before changing the CMS shell, navigation, dashboards, or operational workflows.
- Read [definition-of-done.md](references/definition-of-done.md) for required verification and rollout checks.
