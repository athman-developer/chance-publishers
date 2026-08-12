# Portal Implementation Progress

Legend: COMPLETED · PARTIALLY COMPLETED · REQUIRES CREDENTIAL · REQUIRES LEGAL APPROVAL · REQUIRES MANAGEMENT DECISION · REMAINING

## Post-Phase-8 — UX polish, notifications integrations, full walkthrough (2026-08-11)

### UX/clarity fixes (in response to "the portal is hard to understand")

- **Sidebar was too plain** — added an identity card (avatar initials, name, role
  badge), icons on every nav link, more nav items for authors (Printing estimate,
  Request a launch, Publishing packages), and a branded footer card with tagline +
  WhatsApp help link. `src/layouts/PortalLayout.astro`.
- **Author dashboard had nothing below the empty state** — added quick-link cards,
  a 4-step "How publishing works" guide, and a live publishing-packages preview.
  `src/pages/portal/author/index.astro`.
- **Stage tracker** — added a 10-step horizontal progress tracker (done/current/
  upcoming) plus a "Your next step" callout with a direct action link, computed
  from real project state (NDA status, pending approvals, manuscript presence) —
  not just the raw stage label, so it stays accurate even in edge cases. Verified
  live: a project artificially set to "Cover Design" stage correctly still flagged
  "sign your NDA" as the real next step, since the NDA hadn't actually been done.
  `src/pages/portal/author/projects/[id].astro`, `src/lib/workflow.ts`.
- **Genre/category field** was a blank text input — replaced with a dropdown of the
  real public-site categories plus "Not sure yet" and "Other (please specify)".
  Found and fixed a CSS-specificity bug where the "Other" field wasn't actually
  hiding (Astro's scoped `<style>` outweighs the browser's default `[hidden]`
  rule). `src/pages/portal/author/projects/new.astro`.
- **Publishing package prices were wrong** (Bronze 30k/Silver 40k/Gold 60k vs. the
  real public site's 40k/50k/60k) — fixed in `prisma/seed.ts` (now upserts prices
  on every run) and corrected the already-seeded DB rows directly.
- **Login/register pages were off-center** — root cause was `.portal-shell{grid-
  template-columns:240px 1fr}` always reserving the sidebar's grid track even when
  logged out. Fixed with a conditional `no-sidebar` class; also enlarged the logo
  and added decorative background gradients.
- **Redirect after creating a project** changed from landing on the project detail
  page to landing directly on the NDA intake form, per explicit instruction — the
  NDA page's existing state machine (intake → fee → payment → sign → witness →
  countersign → executed) already handled everything after that.
- **Demo accounts** created and documented in `docs/DEMO_ACCOUNTS.md` for all 4
  roles (admin, author, 2 employees, partner), password `ChangeMe123!` for all.
- **Favicon** — the whole site had no real favicon (only an unused Astro default).
  Generated a full set (16/32/192/512px PNGs + .ico + apple-touch-icon) from the
  logo's pen/leaf/book emblem, cropped and re-rendered as a black silhouette per
  request, wired into `InnerPage.astro`, `index.astro`, and `PortalLayout.astro`.

### Real bugs found and fixed

- **Payment verification wasn't idempotent** — `verifyPayment()` would crash with a
  Prisma unique-constraint error if called twice for the same payment (double-
  click, browser back-button resubmit), because `generateReceipt()` tried to
  create a second `FileAsset` row against a `paymentId` that's `@unique`. Fixed by
  making both functions return early/idempotently on a repeat call. Verified via a
  scripted double-call against the live dev server: second call now succeeds
  cleanly, exactly one receipt exists. `src/lib/payments.ts`.
- **Kenyan phone normalization only recognized the `07x` prefix** — numbers in
  Safaricom/Airtel's newer `01x` range (e.g. `0115645196`) were silently rejected
  as invalid. Found while live-testing SMS delivery with a real number. Fixed in
  `src/lib/sms.ts`.
- **Stage label "Manuscript submitted"** read as a completed action even when
  shown as the *current* (not-yet-done) stage right after NDA execution. Renamed
  to the neutral "Manuscript" so it reads correctly whether current or completed.

### New integrations — SMS, email, WhatsApp on payment verification

Added three notification channels, all firing from the single `verifyPayment()`
chokepoint in `src/lib/payments.ts`, each following the same graceful "do nothing
until configured" pattern already used for Resend/Daraja — no channel being unset
breaks anything.

- **SMS (Africa's Talking)** — `src/lib/sms.ts`. User's sandbox account had a
  multi-hour "invalid authentication" error after signup, ultimately resolved on
  its own (likely account-activation propagation delay) — confirmed working via a
  real test SMS to `+254734214032`. Sandbox mode itself only *simulates* SMS
  though — the "Success" response doesn't mean a real phone received anything;
  going live for real delivery requires the production environment, a dedicated
  Sender ID application, and real billing. Credentials are in the user's local
  `.env`, not yet in Netlify.
- **Email (Resend)** — `src/lib/email.ts`, new shared helper (the existing Resend
  usage in `register.ts`/`submit-contact.ts`/`launch-request.ts` was inline each
  time). Confirmed working end-to-end: test email delivered to the user's real
  inbox. `RESEND_API_KEY` was already live on Netlify for the public contact form;
  added to local `.env` for dev testing too.
- **WhatsApp (Meta Cloud API)** — `src/lib/whatsapp.ts`. **Blocked** — user hit a
  persistent email-verification-code mismatch during Meta developer registration
  that a private-window restart didn't immediately resolve; user opted to finish
  this later. Code is complete and will activate the moment `WHATSAPP_ACCESS_TOKEN`
  / `WHATSAPP_PHONE_NUMBER_ID` are set — no further code changes needed. Note left
  in the file: Meta only allows free-form business-initiated messages to numbers
  that messaged first within 24h, or to test recipients — real client
  notifications will eventually need an approved message template.

### Full end-to-end walkthrough (self-verified, not just built)

Registered a brand-new author account and drove the entire pipeline for real:
register → create project → redirect to NDA → NDA intake form → fee invoice →
admin records cash payment → `verifyPayment()` fires (receipt generated, NDA
auto-generated, SMS/email attempted) → author signs → witness signs → admin
countersigns → NDA executed PDF downloads correctly → manuscript upload unlocks
and succeeds → admin assigns an editing task → employee accepts and submits a
deliverable → admin approves → project stage/progress advances correctly at every
step (5% → 10% → 15% → 35%), stage tracker and "next step" guidance updated
correctly at each stage. Zero errors in the server log across the whole chain
(one transient Africa's Talking sandbox auth flake, self-healed on retry, handled
gracefully by the existing try/catch — did not block anything). All test data
(user, project, NDA, invoice, payment, tasks) cleaned up afterward.

Native file-upload dialogs aren't drivable through the remote browser tool used
for testing, so the two file-upload steps (bank-transfer proof, manuscript,
deliverable) were exercised via direct authenticated `curl` multipart requests
against the real API routes instead of clicking a file picker — same code path,
same validation, same server-side handling as a real browser would produce.

## Post-Phase-8 — Security hardening pass

After all 8 phases were built, did a dedicated review against spec Section 57 rather than
treating security as implicit. Found and fixed one real, concrete gap:

**Found**: 4 file-upload endpoints (`nda/pay-bank-transfer.ts`, `invoices/pay-bank-
transfer.ts`, `admin/print-jobs/upload-sample.ts`, `employee/tasks/submit.ts`) accepted
files with no size limit and no MIME-type restriction — unlike the manuscript upload
endpoint from Phase 2, which always had both. This meant an authenticated user could
upload an arbitrarily large or arbitrarily-typed file (e.g. an executable) through those
four forms.

**Fixed**: added `src/lib/upload-validation.ts` (shared 25MB limit + allowed-type sets
for documents/images/proofs) and wired it into all four endpoints. Verified live: sent a
fake `.exe` disguised as a payment proof directly to the API and confirmed it was
rejected with `error=unsupported-file-type` before ever touching storage.

**Reviewed and confirmed already correct** (no changes needed):
- Session cookies: httpOnly, secure in production, SameSite=Lax.
- Object-level access control on file downloads (`api/portal/files/download.ts`) — only
  the project's author, an assigned employee, or Admin can fetch a given file.
- Path-traversal guard on local dev storage (`..` stripped from storage keys); not
  applicable to Netlify Blobs in production since it's a flat key-value store.
- No secrets committed to git; `.env` gitignored throughout.
- Rate limiting present on login and both public lead-capture forms (contact, launch
  request); other POST endpoints require authentication first, which is a reasonable
  boundary rather than a gap.

**Deliberate, documented trade-off — not a gap**: CSRF protection relies on
`SameSite=Lax` cookies rather than per-request CSRF tokens. This is meaningful real
protection (modern browsers exclude Lax cookies from cross-site POST subrequests), and a
`csrfToken` field already exists on the Session model for a future token-based upgrade
if ever needed, but wiring explicit tokens into 30+ existing forms wasn't done here — it
would be mechanical, wide-reaching, and lower value than the concrete upload-validation
fix above.

## Post-Phase-8 — Migration history consolidation

Replaced the 5 partial migrations from early phases (which only covered Phase 1-3 schema
changes — Phases 4 through 8 were applied via `prisma db push` because the CLI's
`migrate dev` needs a shadow database not available in this environment) with a single
clean migration representing the complete current schema.

**How, without a shadow database**: `prisma migrate diff --from-empty
--to-schema-datamodel prisma/schema.prisma --script` diffs two schema states directly
(empty → current) rather than replaying historical migration files, so it needs no
shadow database at all — only `--from-migrations` mode requires one. This produced an
824-line SQL script that creates the entire schema from scratch.

Replaced `prisma/migrations/*` with one folder (`20260810012500_consolidated_schema`)
containing that script, cleared the live database's `_prisma_migrations` tracking table
of the 5 old entries, and marked the new migration as already applied via `prisma
migrate resolve --applied` (without re-running it, since the schema already matched).
Verified `prisma migrate status` reports "Database schema is up to date!" and confirmed
in the browser that all previously-entered data (projects, NDAs, invoices, print jobs)
is still intact and reads correctly after the change.

This means: on this same database, nothing changes functionally. On a **fresh**
database, `prisma migrate deploy` will now apply one migration and get the complete
schema in one step — the actual goal of doing this before a real production deploy.

## Phase 1 — Foundation — COMPLETED (not yet deployed to production)

Auth (cookie sessions, scrypt hashing, role-based middleware), Neon Postgres via Prisma,
/portal shell with Author/Employee/Admin dashboards on real site branding, and Book
Project creation with atomic `CP-PRJ-YYYY-NNNN` numbering. See git history for the full
file list from this phase.

## Phase 2 — NDA + Manuscript Gate — COMPLETED (not yet deployed to production)

| Item | Status |
|---|---|
| Storage abstraction | COMPLETED — Netlify Blobs (production) / local filesystem (dev), provider-agnostic interface so R2 can be added later without touching calling code |
| NDA template system | COMPLETED — DB-driven, versioned, DRAFT/ACTIVE/RETIRED states. One DRAFT template seeded with the required placeholder set |
| NDA legal wording | REQUIRES LEGAL APPROVAL — seeded template is clearly marked DRAFT and will never be auto-activated. Chance Publishers' counsel must review confidentiality scope, ownership clause, and term/duration wording before any template is moved to ACTIVE |
| NDA fee invoice | COMPLETED — KSh 1,000 pulled from `SystemSetting` (admin-configurable), atomic `CP-NDA-`/`CP-INV-` numbering |
| Payment recording | COMPLETED for bank transfer (author uploads proof → admin verifies) and cash (admin-recorded, auto-verified). M-Pesa/Daraja and card are REQUIRES CREDENTIAL — not built this phase since no keys exist yet; the payment model (`PaymentMethod` enum, `Payment`/`Invoice` tables) already supports adding them without a schema change |
| Payment verification safety | COMPLETED — server-side only; there is no "I have paid" client-trust path anywhere. NDA only advances once an admin explicitly verifies a payment |
| NDA PDF generation | COMPLETED — real PDFs via `pdf-lib`, generated server-side from the template + project data, stored privately, served through an authenticated download route (never a public URL) |
| E-signature | COMPLETED — typed and drawn (canvas) signatures for Author, Witness, and Publisher, each with signer name, method, IP, user-agent, and timestamp recorded per signature |
| Executed NDA generation | COMPLETED — final PDF regenerated with real signer names/dates baked in once the publisher countersigns; original unsigned PDF is never mutated |
| Manuscript upload gate | COMPLETED and verified two ways: (1) the upload form simply does not render in the UI unless `NdaAgreement.status === EXECUTED`; (2) the API route independently re-checks that same condition server-side, so it can't be bypassed by calling the endpoint directly |
| Public manuscript entry point | COMPLETED — footer's direct-to-email upload form replaced with NDA-first messaging + links into `/portal/register` and `/portal/login`, per the one explicitly authorised public-site change for this phase. Old `/api/submit-manuscript.ts` route removed as fully superseded |
| Admin verification views | COMPLETED — `/portal/admin/payments` (verify/reject queue) and `/portal/admin/nda/[id]` (view signatures, countersign) |
| Build verification | COMPLETED — `npm run build` succeeds, all 19 public pages still statically prerendered |
| Responsive check | COMPLETED — mobile (375px) NDA page confirmed, no horizontal overflow |
| Public site impact | COMPLETED — only the one authorised change (footer manuscript CTA); no other public page touched |

### Verified end-to-end in this session (real browser test, not just code review)
Author fills NDA details → KSh 1,000 invoice created → uploads bank transfer proof →
admin verifies payment → invoice marked PAID → unsigned NDA PDF auto-generated →
author downloads and signs (typed) → witness signs → status moves to awaiting publisher
→ admin sees a dashboard alert → admin countersigns → executed PDF generated → author
sees "NDA executed" + manuscript upload form appears → uploads a file → project status
flips to ACTIVE / ADMIN REVIEW. Separately confirmed a second project with no NDA shows
no manuscript upload option at all.

### Known limitations to revisit
- M-Pesa (Daraja) and card payments are not implemented — only bank transfer and cash,
  which was enough to prove the full gate mechanic end-to-end. Building the real Daraja
  STK push + callback verification is Phase 4 work per the original phase plan, once
  credentials exist.
- The seeded NDA template's wording is a reasonable technical draft, not a legally
  reviewed document — do not activate it for a real author without legal sign-off.
- Witness requirement is a boolean on the template (`witnessRequired`); there's no UI yet
  to change it per-template beyond the seed script — fine for now since there's one
  template.
- Rate limiting on login remains in-process only (noted in Phase 1, still true).

## Phase 3 — Production Workflow — COMPLETED (not yet deployed to production)

| Item | Status |
|---|---|
| Task model + lifecycle | COMPLETED — ASSIGNED → ACCEPTED/IN_PROGRESS → SUBMITTED_FOR_REVIEW → (APPROVED → author decision) or COMPLETED, plus CHANGES_REQUESTED loop back to the employee |
| Task types | COMPLETED for 4 types (Editing, Proofreading, Layout, Cover Design) via a small config table in `src/lib/workflow.ts`, not hardcoded per-route. A full admin-configurable task-type builder is future work |
| Admin task assignment UI | COMPLETED — `/portal/admin/projects/[id]` lets Admin assign a task to an employee, with each employee's live workload (active count, due this week, overdue, AVAILABLE/MODERATELY BUSY/HIGH WORKLOAD label) shown at the point of assignment |
| Employee task lifecycle UI | COMPLETED — real dashboard (active/due today/due this week/awaiting review counts), task detail page with instructions, source file, accept button, deliverable upload |
| File versioning | COMPLETED via `FileAsset.version`, scoped per task so resubmissions after a changes-requested cycle don't overwrite history |
| Admin review | COMPLETED — approve or request-changes (with a note), from `/portal/admin/tasks/[id]` |
| Internal notes | COMPLETED — task-scoped, explicitly labelled "Not visible to client" in the UI, only reachable from admin/employee routes |
| Progress recalculation | COMPLETED — `completeTaskAndAdvanceProject()` in `src/lib/workflow.ts` increments `BookProject.overallProgress` by that stage's configured weight and advances `currentStageKey`, driven by task completion rather than anyone typing a percentage by hand |
| Author-facing "My Publishing Team" | COMPLETED — shows job title and staff ID for everyone assigned to the project; deliberately omits phone/email per the contact-privacy rule from the spec (no `ContactShareGrant` system yet, so nothing is ever shown, not even after admin action — that grant/revoke mechanic is still future work) |
| Author approval workflow | COMPLETED — Layout and Cover Design deliverables require explicit author sign-off before they count as complete; version-locked to the exact `FileAsset` that was submitted. Editing and Proofreading complete on admin approval alone, matching the spec's distinction between internal-only and client-facing stages |
| Build verification | COMPLETED — `npm run build` succeeds |
| Responsive check | COMPLETED — mobile (375px), no horizontal overflow |

### Verified end-to-end in this session (real browser test)
Admin assigned an Editing task to the seeded Editor → editor accepted, uploaded a
deliverable, submitted for review → admin approved → task completed directly and
project progress moved 15% → 35% (exactly the configured Editing weight), stage
advanced. Separately: admin assigned a Cover Design task (author-approval-required
type) → designer submitted → admin approved (task became `APPROVED`, not `COMPLETED`,
and created a `PENDING` `Approval` row) → author saw the deliverable under "Action
required", downloaded it through the secure file route, approved it → task flipped to
`COMPLETED`, progress moved 35% → 50%, stage advanced to `FINAL_AUTHOR_APPROVAL`, "My
Publishing Team" correctly showed both assigned staff with job titles only (no contact
info). Then repeated the Layout task type end-to-end through the *rejection* branch:
admin approved → author clicked "Request changes" with a note → task returned to
`CHANGES_REQUESTED` → logged in as the assigned employee and confirmed the author's
exact note was visible and the resubmit form was available.

### Known limitations to revisit
- Only 4 task types are wired up (Editing, Proofreading, Layout, Cover Design) — ISBN/
  copyright support, print quotation, and other later-pipeline stages aren't task types
  yet; add them the same way when Phases 5/6 need them.
- Task assignment is single-assignee only; task reassignment (with old/new assignee,
  reason, audit trail per spec Section 50) isn't built — currently an Admin would need
  to cancel and recreate a task to reassign it.
- No notifications yet (Phase 7) — an employee or author only learns about a new
  task/approval by checking the portal, not via email/in-app alert.
- Workload labels are computed live on every page load (no caching) — fine at current
  scale, would need indexing/caching before hundreds of employees.

## Phase 4 — Finance — COMPLETED (not yet deployed to production)

| Item | Status |
|---|---|
| Quotation module | COMPLETED — Publishing/Printing/Launch/Additional Services/Custom types, line items, DRAFT→SENT→VIEWED→ACCEPTED/DECLINED→CONVERTED_TO_INVOICE lifecycle, configurable validity period |
| Quotation → Invoice conversion | COMPLETED — `convertQuotationToInvoices()` in `src/lib/finance.ts` splits by payment terms (70/30, 50/50, 100% upfront, on completion) with zero re-entry of line items, proportionally split |
| Invoice line items | COMPLETED — `InvoiceItem` generalizes what was a single `amountKes` in Phase 2; NDA fee invoices still work unchanged (single implicit item) |
| Bank transfer payment | COMPLETED — generalized from the NDA-only version in Phase 2 to work on any invoice (`/api/portal/invoices/pay-bank-transfer.ts`) |
| Cash payment | COMPLETED — admin-recorded, auto-verified, generates a receipt immediately |
| Cheque payment | COMPLETED — full RECEIVED → DEPOSITED → AWAITING_CLEARANCE → CLEARED/BOUNCED lifecycle; the invoice is **not** marked paid until CLEARED, matching the spec's explicit requirement that a cheque never counts as settled revenue on receipt alone |
| M-Pesa (Daraja) | COMPLETED as sandbox-ready architecture — real STK push request/response handling, a `MpesaTransaction` table tracking merchant/checkout request IDs, and a webhook (`/api/portal/webhooks/daraja-callback.ts`) that is the *only* place a payment can become VERIFIED. REQUIRES CREDENTIAL for actual sandbox/production testing — verified instead that it fails gracefully ("not yet configured") without them |
| Card payments | Interface-only stub (`src/lib/card-provider.ts`), always reports not configured. REQUIRES MANAGEMENT DECISION (which provider) + REQUIRES CREDENTIAL |
| Receipts | COMPLETED — a real branded PDF is generated and stored (not just implied) every time any payment (bank/cash/cheque) becomes VERIFIED, via `generateReceipt()` in `src/lib/payments.ts` |
| Author finance summary | COMPLETED — project page shows invoiced/paid/outstanding totals plus links to every quotation and invoice |
| Admin finance summary | COMPLETED — same totals on the admin project page, plus the quotation-creation form and full quotation/invoice tables |
| Branded PDF documents | COMPLETED for Quotation, Invoice implicitly via receipt itemization, and Receipt — all via `src/lib/finance-pdf.ts`, reusing the NDA PDF's rendering approach |
| Build verification | COMPLETED — `npm run build` succeeds |
| Responsive check | COMPLETED — mobile (375px), no horizontal overflow |

### Verified end-to-end in this session (real browser test)
Admin created a Publishing quotation (Gold package + extra revision round, KSh 65,000,
70/30 terms) → author viewed it (auto-marked VIEWED) → accepted it → two invoices were
generated automatically (Deposit KSh 45,500, Balance KSh 19,500 — exact 70/30 split, zero
manual re-entry) → author attempted M-Pesa payment first and got the correct "not yet
configured, use bank transfer" message → paid the deposit via bank transfer → admin
verified it → invoice flipped to PAID and a real receipt PDF was generated and
downloadable → admin recorded the balance as a cheque → confirmed the invoice stayed
unpaid while the cheque was RECEIVED → advanced it to AWAITING_CLEARANCE → marked it
CLEARED → only then did the invoice become PAID and its receipt generate. Final project
totals reconciled exactly: KSh 1,000 (NDA) + 45,500 + 19,500 = KSh 66,000 invoiced, KSh
66,000 paid, KSh 0 outstanding — matching on both the admin and author views.

### Known limitations to revisit
- ~~Migration history gap~~ — RESOLVED post-Phase-8 (see "Post-Phase-8" section at the
  top of this document): the migration history was consolidated into a single clean
  migration matching the live schema exactly, without needing a shadow database.
- Quotation line items are entered as plain text (`description | qty | price`, one per
  line) rather than a dynamic multi-row form — functional, but not the eventual desired
  admin UX.
- No expenses/supplier-bills/profitability tracking yet (spec Sections 46-48) — that's
  genuinely separate from the client-facing finance flow just built and fits better
  alongside Phase 5's printing supplier-quote-vs-client-quote distinction.
- Payment gates beyond the NDA fee (e.g. blocking printing until publishing balance is
  paid) aren't built as a distinct reusable mechanism yet — the pieces (invoice status,
  payment verification) all exist; Phase 5 will need an explicit gate check when
  printing work is requested.

## Phase 5 — Printing — COMPLETED (not yet deployed to production)

| Item | Status |
|---|---|
| Printing pricing reference | COMPLETED — `src/lib/pricing.ts`, per-size/per-quantity KSh bands sourced from the spec's historical reference ranges, explicitly documented as estimate-only, never a fixed price list |
| Public printing estimator | COMPLETED — new page `/printing-estimate`, the one new public page this phase adds. Computes a live range client-side, always frames it as "estimated" with "final cost subject to formal quotation" |
| Public entry point | COMPLETED — the existing "Request a printing consultation" link on the Publishing Guide page's printing section now points to `/printing-estimate` instead of `/contact`; no other public page touched |
| Printing quotation request | COMPLETED — logged-in authors submit a full specification (size, quantity, pages, interior colour, cover, binding, paper, notes) tied to one of their book projects; unauthenticated visitors are naturally routed through login/register by the existing middleware, no extra code needed |
| Client quote vs supplier quote | COMPLETED — `PrintJob.clientPriceKes` (author-visible) vs `PrintJob.supplierPriceKes` (admin-only); verified in the browser that the author's rendered page contains the client price but never the supplier price or margin figure |
| Printer turnaround tracking | COMPLETED — admin sets `turnaroundDays`; moving to PRODUCTION_STARTED stamps a start date and computes `expectedDeliveryDate`; the print job page shows "N working days remaining" or "N days overdue" |
| Print job workflow | COMPLETED — REQUESTED → QUOTE_APPROVED → CLIENT_INVOICED → PRINTER_ACCEPTED → PRODUCTION_STARTED → SAMPLE_READY → QC_APPROVED → FULL_PRINT_RUN → COMPLETED → DELIVERED, admin-driven stage advancement |
| Payment gate | COMPLETED — production cannot start until the client invoice is fully PAID; verified the exact failure message and that it clears immediately once payment is recorded, matching the spec's own "PRINTING — ON PAYMENT HOLD" example |
| Client invoice generation | COMPLETED — reuses the entire Phase 4 finance module unchanged (Invoice type PRINTING, bank/cash/cheque/M-Pesa payment, receipt generation) — no new payment code was needed |
| Sample/dummy QC approval | COMPLETED — admin uploads a sample photo/PDF, which reuses the exact same generic Approval system built in Phase 3 (the `SAMPLE_DUMMY` approval kind and task-less approval handling were already anticipated there) — author approves or requests changes through the same UI pattern as editing/layout approvals |
| Printer identity | Stored as a free-text `printerName` field rather than a full Partner account — see limitations below |
| Build verification | COMPLETED — `npm run build` succeeds; 20 static public pages now (was 19), `/printing-estimate` newly prerendered |
| Responsive check | COMPLETED — mobile (375px) on both the public estimator and the print job page, no horizontal overflow |
| Public site impact | COMPLETED — one new page, one existing link's href changed; nothing else on the public site touched |

### Verified end-to-end in this session (real browser test)
Public estimator: A5, 500 copies, softcover → KSh 90,000–165,000 (exactly matching the
server-side calculation). Logged in as author → requested a formal quotation with a full
spec → the print job showed the identical estimate range. Logged in as admin → set
supplier price KSh 82,000 and client price KSh 120,000, 10-day turnaround → generated the
client invoice → attempted to advance to production and was correctly blocked with
"the client invoice has not been paid yet" → paid the invoice (cash) → retried and the
job advanced to PRINTER_ACCEPTED → advanced to PRODUCTION_STARTED, which showed "10
working days remaining" → uploaded a sample photo, which created a pending approval →
switched to the author, confirmed the page showed the KSh 120,000 client price with no
trace of the KSh 82,000 supplier cost or the KSh 38,000 margin anywhere in the page text
→ approved the sample → switched back to admin and advanced through QC_APPROVED →
FULL_PRINT_RUN → COMPLETED → DELIVERED, confirming the workflow correctly stops offering
further "advance" actions once DELIVERED is reached.

### Known limitations to revisit
- Printers are identified by a free-text name (`printerName`), not a full Partner user
  account with its own portal login, turnaround defaults, and payment terms (spec
  Sections 35, 38). Building real Partner accounts is meaningful scope on its own —
  fits naturally as an extension of Phase 1's auth system whenever it's prioritized.
- No printer performance dashboard yet (jobs completed, on-time %, average delay) —
  needs multiple real print jobs across multiple printers to be meaningful anyway.
- Print job specification uses a fixed set of dropdown/text fields rather than fully
  configurable book-size/paper/binding/finish reference tables (spec Section 17-18's
  "Admin manages pricing rules" ambition) — the pricing bands live in code
  (`src/lib/pricing.ts`), not an admin-editable settings table yet.
- QC is a single admin-driven stage transition plus one author approval, not the full
  itemized checklist (cover colours, binding, margins, trim, etc. as separate tracked
  booleans) described in spec Section 39 — the essential gate (author must approve the
  sample before full print run) is real and enforced; the itemization is cosmetic on
  top of that and can be added later without restructuring anything.

## Phase 6 — Launch — COMPLETED (not yet deployed to production)

| Item | Status |
|---|---|
| Public launch enquiry form | COMPLETED — new section added to the existing `/launches` page (spec Section 41's exact field set: contact details, book title, proposed date, guests, location, venue-secured, budget, a 24-item services checklist, additional info). Existing page content (hero, gallery, filmstrip, "planning your own launch" section) left completely untouched — only one CTA link's target changed, from `/contact` to the new form's anchor |
| Spam protection | COMPLETED — same honeypot + minimum-fill-time pattern as the contact form, plus rate limiting |
| LaunchRequest capture | COMPLETED — deliberately NOT tied to a user account at creation time (a visitor may not have one yet), atomic `CP-LR-YYYY-NNNN` numbering |
| Resend notifications | COMPLETED — admin notification with full request details + client acknowledgement, gracefully skipped if `RESEND_API_KEY` is absent (same pattern as every other transactional email in this project) |
| Admin launch leads inbox | COMPLETED — `/portal/admin/launches`, shows every request with full details, status dropdown (NEW/CONTACTED/QUOTED/CONVERTED/CLOSED), dashboard alert for new requests |
| Link request → project | COMPLETED — admin picks an existing book project from a dropdown (searchable by title/author); linking auto-advances status to CONTACTED |
| Launch quotation | COMPLETED — deliberately built with **zero new code**: once a request is linked to a project, the admin uses the exact same generic Quotation form from Phase 4 (it already had a LAUNCH type option), proving the earlier phases' genericity was worth it |
| Suggested launch price | COMPLETED — `LAUNCH_SUGGESTED_PRICE_KES` seeded as an admin-configurable `SystemSetting` (KSh 50,000, per spec Section 43), informational only, not enforced anywhere |
| Build verification | COMPLETED — `npm run build` succeeds |
| Responsive check | COMPLETED — mobile (375px), no horizontal overflow |
| Public site impact | COMPLETED — one new section on one existing page, one link's destination changed; nothing else touched |

### Verified end-to-end in this session (real browser test)
Filled and submitted the public launch form (Grace Mwangi, "Still I Breathe", 80 guests,
KSh 60,000 budget, 3 services checked) → confirmation dialog appeared → logged in as
admin → dashboard showed "1 new launch request" alert → leads inbox showed every field
captured correctly including the exact services selected → linked the request to the
"Still I Breathe" project (status auto-advanced to CONTACTED) → went to that project's
existing admin page and created a LAUNCH-type quotation (organising + photography +
venue coordination, 100% upfront) using the same quotation form built in Phase 4 — no
launch-specific quotation code exists or was needed.

### Known limitations to revisit
- No separate "Launch Project" or launch-specific task types yet (spec Section 43's
  "create Launch project/tasks" after acceptance) — once a launch quotation is accepted,
  it becomes a normal invoice on the existing project like any other, but there's no
  dedicated launch-day checklist/task tracking. Would reuse Phase 3's Task system the
  same way this phase reused Phase 4's Quotation system.
- LaunchRequest → BookProject linking is manual (admin searches a dropdown) rather than
  automatic matching by email — reasonable given names/emails on a public form can't be
  trusted to exactly match an existing account.

## Phase 7 — Communication & Automation — COMPLETED (not yet deployed to production)

| Item | Status |
|---|---|
| Project messaging | COMPLETED — single project-wide thread (`/portal/projects/[id]/messages`) visible to the author and anyone with an assigned task on the project or Admin; scoped down from the spec's per-channel (GENERAL/EDITING/COVER/...) design to one thread — see limitations |
| Internal notes | COMPLETED — admin/employee-only notes on the same page, visually marked "INTERNAL — NOT VISIBLE TO CLIENT", never queried or rendered on any author-facing page |
| In-app notifications | COMPLETED — bell icon with live unread count in the portal sidebar, a notifications list page that marks everything read on view, wired into 8 real event types: task assigned, approval required/decided, payment verified, NDA executed, quotation accepted/declined, launch request received, print sample ready, message posted |
| Activity timeline | COMPLETED — chronological, human-readable event log auto-recorded at the same mutation points as notifications, shown on both the author's and admin's project pages |
| Contact sharing | COMPLETED — `ContactShareGrant` model, admin UI to grant (work email / phone / both) or revoke per team member per project; "My Publishing Team" only reveals contact details when an active grant exists, otherwise shows "Contact via project messages" |
| Reminders | PARTIALLY COMPLETED — `/portal/admin/reminders` computes real reminder-worthy items live on every page load (quotations expiring within 3 days, invoices outstanding 14+ days, overdue print jobs, overdue employee tasks). True scheduled push notifications (email/SMS) REQUIRES DEPLOYMENT — Netlify Scheduled Functions can't be exercised in this local dev environment, so that wiring is documented but not built |
| Build verification | COMPLETED — `npm run build` succeeds |
| Responsive check | COMPLETED — mobile (375px), no horizontal overflow |
| Public site impact | COMPLETED — zero changes; this phase is entirely inside the portal |

### Verified end-to-end in this session (real browser test)
As the author, posted a project message → confirmed it rendered correctly with author
name and timestamp → switched to admin → confirmed the notification bell showed "1",
opened it, saw the correct message, confirmed the badge cleared after viewing → granted
"Phone" contact sharing to the assigned Editor for that project → confirmed the grant
row updated to show "Sharing: PHONE" → switched to the author and confirmed the
Editor's card no longer showed the "Contact via project messages" fallback (no phone
number appeared only because that seeded demo employee has no phone on file — the
suppression logic itself was confirmed correct) → assigned a fresh Proofreading task as
admin → confirmed both the notification and the activity timeline picked up the event
with the exact right text and timestamp, cross-checked directly against the database →
confirmed the reminders page loads all four sections without error.

### Known limitations to revisit
- Messaging is one thread per project, not the spec's per-channel design
  (GENERAL/EDITING/COVER DESIGN/LAYOUT/PRINTING/FINANCE/LAUNCH) — the single thread
  covers the actual communication need (author ↔ team, staff-only notes kept separate)
  without the added complexity of channel routing; could be split later if a real need
  for separated channels emerges.
- Reminders are read-only/pull (admin has to visit the page) rather than push
  (scheduled email/SMS) — the underlying queries are exactly what a scheduled function
  would need, so wiring a Netlify Scheduled Function to call these and email a digest
  is the natural next step once this is actually deployed.
- Notification delivery is in-app only, no email digest/push — acceptable per spec's
  own "avoid spamming" guidance, but worth revisiting once real usage data exists.

## Phase 8 — Reporting & Intelligence — COMPLETED (not yet deployed to production)

| Item | Status |
|---|---|
| Reports landing page | COMPLETED — `/portal/admin/reports`, 7 report cards |
| Receivables aging | COMPLETED — Current/1-30/31-60/61-90/90+ buckets by real invoice age and unpaid amount |
| Publishing pipeline | COMPLETED — project counts by status, full table with package/stage/progress |
| Payments by method | COMPLETED — verified payments totalled per method (M-Pesa/card/bank/cash/cheque) |
| Employee workload | COMPLETED — active/overdue/completed task counts per employee |
| Project profitability | COMPLETED — revenue (verified payments) vs supplier cost (print job supplier prices) vs margin, per project. Confirmed admin-only via the existing middleware role gate — an author account was redirected away when attempting to load it directly |
| Package performance | COMPLETED — projects and revenue collected per publishing package |
| Printer performance | COMPLETED — jobs, on-time delivery %, total spend per printer |
| CSV export | COMPLETED on every report — same page handles `?format=csv` and returns a real CSV `Response`, no separate API routes needed |
| Build verification | COMPLETED — `npm run build` succeeds |
| Responsive check | COMPLETED — no page-level horizontal overflow at any width; wide tables scroll inside their own container |
| Public site impact | COMPLETED — zero changes; entirely inside the portal |

### Verified end-to-end in this session (real browser test, cross-checked against the database)
Every report was checked against the actual data accumulated across all prior phases'
testing, and the numbers reconcile exactly: Payments by Method totals KSh 186,000
(Cash 120,000 + Cheque 19,500 + Bank transfer 46,500) — the same figures from the
individual invoice tests in Phases 4 and 5. Project Profitability shows "Second Book No
NDA" at KSh 120,000 revenue / KSh 82,000 supplier cost / KSh 38,000 margin — the exact
print job numbers from Phase 5. Printer Performance shows 1 job, 100% on-time, KSh
82,000 spend for Colourprint Kenya — matching that same print job. CSV export was
fetched directly and confirmed to return real `text/csv` content. Finally, confirmed the
access-control boundary holds without any extra per-page code: navigating directly to
`/portal/admin/reports/profitability` as the author account (which would reveal
supplier costs and margins) redirected to `/portal/author` — the existing middleware
role gate protects every route under `/portal/admin/*` automatically.

### Known limitations to revisit
- No date-range filtering yet — reports show all-time totals. Adding `?from=&to=` query
  params would be a small addition given the queries are already centralized.
- Package performance's "revenue collected" sums verified payments across every invoice
  tied to projects on that package, not just the publishing-package invoice itself — so
  it's closer to "total lifetime revenue from projects using this package" than "package
  fee revenue" in the strictest sense. Worth clarifying with the business which framing
  is actually wanted.

---

## Overall project status — all 8 phases complete (locally)

Every phase from the original spec is now built and individually verified in the
browser against real data: Foundation (auth/roles/projects), NDA & manuscript gating,
production workflow (tasks/approvals), finance (quotations/invoices/all payment
methods/receipts), printing (estimator/jobs/QC/turnaround), launch (public form/leads/
quotations), communication & automation (messaging/notifications/timeline/contact
sharing/reminders), and reporting (7 reports with CSV export).

**Nothing has been pushed to GitHub or deployed to Netlify.** Everything lives locally
and in the real Neon database (migrations applied there directly via `db push`, since
there's no separate dev/staging database). Netlify does not have `DATABASE_URL` or any
of the other portal environment variables set. Before any real deployment:

1. Regenerate a clean Prisma migration history (this session used `db push` throughout
   due to the CLI's shadow-database requirement not being available locally).
2. Get NDA template wording legally reviewed before marking any template ACTIVE.
3. Decide on and configure a card payment provider, if wanted.
4. Get Daraja (M-Pesa) production credentials, if wanted before launch.
5. Add all required environment variables to Netlify (see `.env.example`).
6. Explicit user approval to push/deploy.

---

## Files created in Phase 2

- `src/lib/storage/index.ts`, `local.ts`, `netlify-blobs.ts`
- `src/lib/nda.ts`, `src/lib/payments.ts`
- `src/pages/api/portal/nda/start.ts`, `pay-bank-transfer.ts`, `sign.ts`, `download.ts`, `proof-download.ts`
- `src/pages/api/portal/admin/verify-payment.ts`, `countersign.ts`
- `src/pages/api/portal/manuscript/upload.ts`
- `src/pages/portal/author/projects/[id]/nda.astro`
- `src/pages/portal/admin/payments/index.astro`, `admin/nda/[id].astro`
- Modified: `src/pages/portal/author/projects/[id].astro` (NDA status + manuscript block),
  `src/components/Footer.astro` (public entry point), `src/layouts/PortalLayout.astro`
  (admin nav), `prisma/seed.ts` (DRAFT NDA template)
- Removed: `src/pages/api/submit-manuscript.ts` (superseded)

## Database models added in Phase 2

NdaTemplate, NdaAgreement, NdaSignature, Invoice, Payment, FileAsset, DocumentSequence
(document numbering added in Phase 1, used more heavily here).

## Environment variables

```
DATABASE_URL=              # set locally in .env; NOT yet added to Netlify
RESEND_API_KEY=            # already live in Netlify production
```

Netlify Blobs needs no separate credentials — it's provisioned automatically per-site by
the Netlify adapter. `STORAGE_PROVIDER`/`STORAGE_BUCKET`/etc. and `SESSION_SECRET` were
listed in `.env.example` speculatively in Phase 1 but are unused by the current
implementation (sessions are DB-backed random IDs, storage picks its adapter by
`import.meta.env.DEV`, not an env var) — left in `.env.example` as a placeholder for if
R2 is added later, but not required today.

## Credentials/decisions still needed

- Daraja (M-Pesa) production credentials — Phase 4
- Card payment provider choice + credentials — Phase 4
- NDA legal wording sign-off — before any template goes ACTIVE
- Cloudflare R2 — no longer blocking anything (Netlify Blobs covers Phase 2 storage
  needs); only revisit if there's a specific reason to move off Netlify Blobs later

## Decisions log

- 2026-08-08 — Chose Neon (Postgres), custom cookie-session auth, Phase 1 foundation as
  the starting point.
- 2026-08-08 — Pinned Prisma to the 6.x line instead of 7.x (driver-adapter migration is
  a bigger change than warranted this early).
- 2026-08-08 — Cloudflare R2 signup blocked by a payment-page error on Cloudflare's side
  (unrelated to this project); switched to Netlify Blobs for file storage since it's
  already available on the account at no extra cost and cost nothing in delay.
- 2026-08-08 — Payment verification is manual-admin-driven (bank transfer proof + cash)
  for Phase 2, deferring Daraja/card to Phase 4 when credentials exist. This kept the
  core "no manuscript without executed NDA" business rule fully working and testable
  without waiting on external payment credentials.

## Deployment status

**Not deployed.** All of Phase 1 and Phase 2 exist locally and in the real Neon database
(migrations applied there — there is no separate dev/prod database yet). Nothing pushed
to GitHub or Netlify. Netlify does not have `DATABASE_URL` set. Explicit approval needed
before pushing/deploying.
