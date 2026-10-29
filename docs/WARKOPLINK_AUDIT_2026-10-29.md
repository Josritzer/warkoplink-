# WarkopLink audit — 29 Oktober 2026

## Scope and safety

- Repository: `Josritzer/warkoplink-`, React 18 + Vite + Firebase Auth/Firestore.
- Public app: `https://sl-community-platform.web.app/`.
- This audit changes client presentation and filtering only. No production document, Firestore rule, authentication setting, secret, or deployment was changed.
- The live read-only Firestore REST endpoint returned four documents in `posts` for the observed feed. This report is a review queue, not a deletion instruction.

## Findings confirmed in source

1. `.bottom-nav` is always rendered by `src/App.jsx`; responsive visibility was spread across older CSS blocks. The final compact rule only styled it under `max-width: 760px`, while a separate `min-width: 900px` rule also adjusted it. A final explicit visibility rule now hides it at widths >= 761px and hides desktop sidebars at <= 760px.
2. Feed query reads `posts` ordered by `createdAt` with a limit of 10 and has no server-side visibility/QA predicate. Firestore rules allow public reads. No consistent QA/demo flag is present on the four observed documents. The client now excludes only explicit non-public markers (`isTest`, `isDemo`, `isFixture`, `qa`, `visibility`, `publicationStatus`, `environment`, `sourceEnvironment`) from the visible feed and cache. It intentionally does not classify by text.
3. The right rail rendered the literal label `DATA`; that is now replaced with `Berdasarkan obrolan`.
4. Verified-warkop loading, empty, and error states previously collapsed into one empty message. They are now distinguished, and the empty state points to the existing registration flow.
5. The directory's `Daftarkan warkop` CTA previously only displayed a notice. It now opens the existing registration form. Directory loading errors now expose a retry action.
6. The install CTA was always rendered and showed generic manual instructions even when no browser install flow was available. It now appears when `beforeinstallprompt` is available or for Safari on iOS, where the manual Add to Home Screen path is supported.
7. The top header and sidebar both printed the full brand name. The sidebar now retains its brand mark without repeating the wordmark; the footer uses a descriptive community label.

## Live feed records for owner review — unchanged

The public Firestore REST read returned these records. The records had no explicit QA/demo marker in the returned fields.

| Document ID | Author label | Body | Category | Created (UTC) | Review suggestion |
|---|---|---|---|---|---|
| `Ab0clj7ZaaUUogdd1nlR` | ali | `tes percobaan` | Legacy `Obrolan Umum` | 2026-10-23 19:06:44 | Likely test based on wording, but owner must confirm. If confirmed, set an explicit reversible non-public marker such as `isTest: true`; do not delete. |
| `jgI1UUWgPRzL7gcFYS45` | sules | `@warkop SL` | Ngopi Bareng | 2026-10-29 00:54:54 | Potential duplicate; compare intent/context before any change. |
| `zTP9ZUmYOXllO4jK1uUE` | sules | `@warkop SL` | Ngopi Bareng | 2026-10-29 00:54:15 | Potential duplicate; same displayed body and author as the record above, posted 39.8 seconds earlier. Could still be intentional. |
| `EnwK5FH1Sgz9ZrMqEMs5` | sules | `@ali ayo ngopi` | Ngopi Bareng | 2026-10-29 01:27:17 | No obvious QA marker in returned fields. Leave unchanged. |

### Reversible cleanup recommendation

1. Owner reviews each document ID and confirms whether it is QA or a genuine community post.
2. For confirmed QA only, add an explicit marker (e.g. `isTest: true`) using a reviewed, auditable owner action; preserve the original body, author, timestamp, and document ID.
3. For a confirmed duplicate, prefer a reviewed `visibility: "hidden"`/soft-hide marker and keep an audit note; do not delete or rewrite content automatically.
4. Current `firestore.rules` uses a strict `hasOnly` field allowlist for post creation and does not permit these QA markers through ordinary client writes; post updates are also restricted. Therefore, only a privileged, reviewed owner/admin workflow can mark existing records under current rules. Any future client-managed publication flag requires a separately reviewed schema/rules change.
5. Longer-term, define a canonical server-side publication field and backfill only after schema and legacy-document behavior are agreed. Do not add a Firestore `where(isPublic == true)` query until existing legitimate records have the field, because legacy documents without it would disappear from results.

## Backend wiring observed

- Public feed: Firestore `posts` snapshot; reactions and replies use Firestore subcollections.
- Auth: Firebase Auth email/password; write actions are guest-gated in the UI and checked by Firestore Rules.
- Warkop directory: reads only `warungs` where `verificationStatus == "verified"`; registration writes a `pending` record, which intentionally does not appear in public directory until verified.
- Search/category: client-side filters over loaded posts; the directory says explicitly that filters apply to currently loaded records and offers pagination.
- PWA: `public/manifest.webmanifest` and `public/sw.js` exist. The install prompt and installation UI still require browser/device verification.
- No production record was modified during this audit.

## Verification limits

The repository CI is the source for automated tests/build. This environment could read the public rendered page and public Firestore REST records, but its metered interactive browser runner did not start because the TinyFish wallet balance is below zero. Therefore, screenshots/computed layout at each requested viewport, keyboard/contrast checks, console/network checks, and Lighthouse/Core Web Vitals measurements are still pending an actual browser session. No performance numbers are inferred.
