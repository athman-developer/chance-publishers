# Chance Publishers — Publishing Management Portal
## Master Specification

Status: Phase 1 in progress
Owner: Athman Mohamed (chancepublishersltd@gmail.com)
Public site: https://chancepublishers.com (Astro 6, static+SSR hybrid, deployed on Netlify from GitHub `athman-developer/chance-publishers`)

## 1. Non-negotiable constraint

The existing public website is live and approved. This project is a pure **addition**:
new routes under `/portal/*`, a new backend, and a small number of explicitly authorised
integration points on the public site (manuscript submission gating, portal login entry
point, launch enquiry form, printing quotation entry point). No existing page's design,
copy, routing, or functionality is to be altered outside those points.

## 2. Audit findings (as of Phase 1 start)

- Framework: Astro 6.3.3, hybrid rendering (`export const prerender = false` per-route),
  `@astrojs/netlify` adapter v7.
- No database, no ORM, no auth, no file storage today.
- Existing backend surface: two Netlify Function API routes
  (`src/pages/api/submit-manuscript.ts`, `src/pages/api/submit-contact.ts`) using Resend
  for transactional email. `RESEND_API_KEY` is set in Netlify env vars.
- Existing public manuscript upload (footer form, `src/components/Footer.astro`) sends
  the file straight to Resend with no NDA gate — this is the one flow Section 4A of the
  spec requires us to replace.
- Git checkpoint tagged `pre-portal-checkpoint` at commit `407f43a` before any portal
  work began.

## 3. Chosen infrastructure

| Concern | Choice | Why |
|---|---|---|
| Database | Neon (serverless Postgres) | Free tier, branching, works well with Netlify Functions (no persistent connections needed if using their serverless driver / connection pooling). |
| ORM | Prisma | Type-safe, good migration story, works fine on Netlify Functions with `@prisma/client` binary targets configured. |
| File storage | Cloudflare R2 | S3-compatible API, no egress fees, cheap, works with any S3 SDK. |
| Auth | Custom, session-cookie based (not a third-party auth SaaS) | Full control over roles/permissions model described in the spec; avoids vendor lock-in for something this central. |
| Payments | Safaricom Daraja (M-Pesa), card provider TBD, bank/cash/cheque as manual-entry workflows | Per spec Section 10; card provider intentionally left as an interface until a provider is chosen. |
| Email | Resend (already live) | Reused as-is. |
| PDF generation | TBD in Phase 2 (NDA/invoice PDFs) | Likely `@react-pdf/renderer` or a headless HTML→PDF approach; decided when we reach Phase 2. |

## 4. Architecture shape

The public Astro site and the portal live in the **same Astro project**, under `/portal/*`
routes, sharing the same Netlify deploy. Portal routes are SSR (`prerender = false`) and
talk to Postgres via Prisma from Netlify Functions. This avoids standing up a second
application/deploy target and keeps one git history, one build, one deploy pipeline.

Conceptual center of the data model is the **Book Project** — see Section 59 of the
original spec prompt for the full entity list. Phase 1 implements the subset needed for
accounts, roles, and a project shell; later phases add NDA, finance, printing, launch,
messaging, and reporting entities incrementally, without needing to redesign earlier
phases' tables (additive migrations only).

## 5. Phased delivery

Following the original spec's Section 72 phase breakdown exactly:

1. **Foundation** — DB, auth, roles/permissions, portal shell, dashboards, profiles, Book Projects, settings foundation. *(current phase)*
2. **NDA + manuscript gate** — NDA templates, e-signature, fee invoice, Daraja scaffold, secure manuscript upload.
3. **Production workflow** — tasks, assignments, file versions, approvals, revisions.
4. **Finance** — quotations, invoices, receipts, all payment methods, payment gates, expenses/payables, profitability.
5. **Printing** — pricing reference, estimator, print jobs, supplier quotes vs client quotes, turnaround tracking.
6. **Launch** — public launch form, Resend integration, launch quotations.
7. **Communication & automation** — messaging, internal notes, notifications, reminders, activity timeline, contact sharing.
8. **Reporting/intelligence** — management reports, aging, performance, profitability.

Each phase must build, pass its critical-path tests, and get logged in
`docs/PORTAL_IMPLEMENTATION_PROGRESS.md` before the next phase starts.

## 6. Explicit deferrals (require credentials/decisions not yet available)

- Card payment provider — interface built, disabled until a provider + credentials are chosen.
- Daraja production credentials — sandbox-ready interface built; production keys needed later.
- NDA legal wording — the technical template system is built; actual clause wording needs
  legal sign-off before any template is marked ACTIVE (spec Section 8).
- Production deployment of the portal — not performed without explicit approval, per spec
  Section 75/79.
