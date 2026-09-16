# La Comarca repository guidance

This repository contains the public La Comarca site and its separate Cloudflare Worker-backed team platform. Read `.codex/skills/la-comarca-platform/SKILL.md` for project-specific rules and load only the linked references relevant to the change.

## Mandatory publication rule

- **Every public-site edit must finish by updating and verifying `https://la-comarca.github.io/`.** A commit, local build or PR is not the final state.
- The canonical public deployment for this repository is GitHub Pages via `.github/workflows/portal.yml`. Every approved change must reach `main`, the Pages workflow must succeed, and the affected routes must be checked on the live site.
- Public deployment and backend deployment are different. GitHub Pages is static; it does not run authentication, D1, private Notion writes or the CMS API. Changes under `api/`, authentication, permissions, migrations or Worker configuration require their own reviewed backend rollout.
- Never claim `comarca.kipadmon.com` or the CMS was updated merely because GitHub Pages deployed.
- In the final handoff for a meaningful change, report the commit, tests/build result, Pages deployment result and the live routes checked.

## Visual system: homepage and Agenda are the reference

- **The homepage and `/agenda/` define the public visual language.** New or repaired public pages must feel like the same product before introducing page-specific styling.
- Reuse the existing tokens and typography: deep blue `#133b58`, ink `#111519`, paper `#fafafa`, muted text `#65686d`, rules `#d9dbde`, DM Sans for the main interface and Barlow Condensed for display headings. Georgia may be used only for long-form prayer text where it improves reading; it must not replace the shared interface typography.
- Keep the layout editorial, restrained and spacious: strong hierarchy, fine rules, few surfaces, minimal decoration, responsive behavior and reduced-motion support.
- Do not invent a separate visual theme for Devocionario, Iniciar sesión, Agenda or another route unless the user explicitly requests a distinct identity. Avoid decorative palettes, tilted cards, novelty typefaces and dense dashboard-like chrome on public pages.
- Devocionario should be fast to use: one search box, a few contextual quick filters (for example Rosario, Bendición con el Santísimo, Misa, María), then a single vertical stack of prayers. Do not make its filter sticky or turn it into a dashboard.
- Inside every opened prayer, **Spanish and Latin must remain visible side-by-side even on phones.** Reduce type and spacing responsibly on narrow screens rather than collapsing to a single language column.
- The public `/equipo/` route should present itself as **Iniciar sesión** and use the same header, footer, typography and spacing as the public site. It is a sign-in entry to the real back office, not a separate branded microsite.
- GitHub Pages must never pretend to authenticate locally. The public sign-in entry hands the user to the real private backend, where email/password authentication and permissions are actually enforced.
- Before changing a public page, inspect `public/index.html`, `public/styles.css`, `public/editorial-fix.css`, `scripts/pages.mjs` and the affected generator. Preserve working navigation, mobile dock, accessibility and established content structure.

## Security and architecture

- Keep public publishing fail-closed: export only explicitly approved public fields from Notion.
- Keep participant, student/minor, tutor, attendance, transport, budget, private notes and operational data out of public exports.
- Treat server-side authentication and authorization as the source of access decisions; do not rely on UI visibility.
- Preserve the existing static-site and Worker separation unless an audited change proves a smaller incremental design cannot meet the requirement.
- Use Notion as an integration boundary, not as an excuse to couple every UI component directly to its API.
- Run `npm ci --prefix api` when dependencies are needed, then `npm run check` from the repository root. For the root Pages site, verify a `BASE_PATH=/ npm run build` build when applicable.
- Review desktop and mobile behavior for public visual changes, including focus states and `prefers-reduced-motion` behavior.
- Do not print or commit secrets, `.dev.vars`, `.env*`, tokens, private Notion payloads or personal data.
