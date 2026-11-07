# Cari Warkop Premium Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the existing Cari Warkop route into a premium, photo-led Coffee Discovery experience while preserving current registration, profile navigation, Firebase Auth, and Firestore data.

**Architecture:** Keep `WarungDirectory` as the route-compatible entry point and preserve its registration mode. Separate discovery presentation and pure discovery-state logic into focused modules; reuse the existing region picker, map, filter helpers, profile callback, and Firestore source. Use bounded pagination and do not introduce a new backend/search service or schema migration in this implementation.

**Tech Stack:** React 18, Vite, JavaScript, Firebase Firestore, Vitest, React Testing Library, existing CSS design tokens, Leaflet 1.9.4, OpenStreetMap.

**Spec:** `docs/superpowers/specs/2026-11-06-cari-warkop-premium-discovery-design.md`

## Global Constraints

- Preserve Firebase Auth and existing Firestore collections/documents.
- Do not delete or alter `profiles` or `posts`.
- Do not change Firestore Rules, Storage Rules, secrets, billing, or production configuration.
- Keep WarkopLink geographically nationwide; never hard-code Lamongan as the directory boundary.
- Keep Leaflet + OpenStreetMap; do not add Google Maps/Routes to WarkopLink.
- Do not add paid services, external search providers, new dependencies, or schema/index migrations in this plan.
- Keep registration mode and its existing validation/upload flow behavior unchanged.
- Show only verified warkop and only display operational status, distance, events, and popularity when supported by valid data.
- Never fetch every verified warkop automatically when a filter, search, category, or map is activated.
- Merge/deploy only after explicit user approval.

## Review Focus

1. **Large national directory:** changing a filter or opening the map must not trigger an automatic full-collection scan; pagination must remain explicit and bounded.
2. **Search completeness:** current Firestore schema has no verified full-text token index. Search must not imply it searched all Indonesia when it only examined loaded pages; communicate loaded-result scope and preserve explicit load-more. A true nationwide multi-field search requires a separately approved schema/search decision.
3. **Sparse or malformed records:** missing photos, coordinates, schedules, menus, event dates, and region fields must not break cards or produce invented labels.
4. **Location permission failures:** denied, unavailable, and unsupported GPS must leave manual nationwide/regional discovery usable.
5. **Popular/event data reads:** do not reintroduce per-card follower-count reads or unbounded event queries; labels must match the data actually loaded.

---

## Existing File Map (verified on current `main`)

- `src/directory/WarungDirectory.jsx`: route-compatible directory and registration entry point; currently owns registration form, Firestore loading, filters, map toggle, and result-card markup.
- `src/directory/WarungDirectory.test.jsx`: directory, registration, pagination, category, and map integration tests.
- `src/directory/directoryFilters.js` and `src/directory/directoryFilters.test.js`: normalization, filtering, distance, schedule, event, and sorting helpers.
- `src/directory/OfficialRegionPicker.jsx` and test: official nationwide region selection.
- `src/directory/WarungDiscoveryMap.jsx` and test: Leaflet map and marker-to-profile behavior.
- `src/directory/warung-discovery-map.css`: map sizing.
- `src/App.jsx`: renders `WarungDirectory` for Cari Warkop and registration, and passes location/profile callbacks.
- `src/main.jsx`: global stylesheet imports.
- `src/style.css`: legacy directory/card/filter styles.
- `src/wl-luxury-2026.css`: global Coffee Culture design tokens and dark theme.
- `package.json`: Vitest test command is `npm test`; production build is `npm run build`.

## Task 1: Add a testable discovery state model

**Files:**
- Create: `src/directory/discoveryState.js`
- Create: `src/directory/discoveryState.test.js`
- Modify: `src/directory/WarungDirectory.jsx` only where needed to consume the helpers.

**Interfaces:**
- Export `createInitialDiscoveryState(location)` returning `{ query, category, regionScope, facilities, activities, operational, sort, viewMode }`.
- Export `discoveryReducer(state, action)` supporting `SET_QUERY`, `SET_CATEGORY`, `SET_REGION`, `TOGGLE_FACILITY`, `TOGGLE_ACTIVITY`, `SET_OPERATIONAL`, `SET_SORT`, `SET_VIEW_MODE`, and `RESET_FILTERS`.
- Keep GPS runtime state separate from serializable discovery filter state.

- [ ] **Step 1: Write failing reducer tests**
  - Test `createInitialDiscoveryState` defaults to all locations, all categories, list view, and empty filters.
  - Test every action changes only its intended field.
  - Test toggling the same facility/activity twice removes it.
  - Test `RESET_FILTERS` clears query and filters but preserves region scope and view mode.
  - Test invalid/unknown actions return the same state.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `npm test -- --run src/directory/discoveryState.test.js`

Expected: FAIL because the module/exports do not exist yet.

- [ ] **Step 3: Implement the pure reducer**

Implement the exported functions in `src/directory/discoveryState.js`. Do not add React or Firebase dependencies to this module.

- [ ] **Step 4: Run the focused test**

Run: `npm test -- --run src/directory/discoveryState.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

`git add src/directory/discoveryState.js src/directory/discoveryState.test.js && git commit -m "feat(directory): add discovery state model"`

## Task 2: Separate discovery presentation from registration mode

**Files:**
- Create: `src/directory/WarungDiscoveryPage.jsx`
- Create: `src/directory/warung-discovery.css`
- Create: `src/directory/WarungDiscoveryPage.test.jsx`
- Modify: `src/directory/WarungDirectory.jsx`
- Modify: `src/main.jsx` to import the scoped discovery stylesheet.

**Interfaces:**
- `WarungDiscoveryPage({ warungs, status, location, onOpenWarung, onRegister, discoveryState, dispatch, visitorLocation, locationStatus, onRequestLocation, hasMore, loadingMore, onLoadMore, events, eventsStatus })`.
- `WarungDirectory` remains the public route component and continues to accept the same props from `App.jsx`.
- Registration mode remains rendered by the existing registration branch; it must not be moved into the new discovery component.

- [ ] **Step 1: Add failing presentation tests**
  - Test that the discovery page renders the Coffee Discovery hero, search input, category rail, result region, and Ajukan Warkop action.
  - Test that the category rail exposes one accessible selected state at a time using `aria-pressed`.
  - Test that clicking Ajukan Warkop calls `onRegister`.
  - Test that loading, error, and empty states are distinguishable and accessible.
  - Test that a record without a photo uses the intentional fallback and does not render a broken `img`.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `npm test -- --run src/directory/WarungDiscoveryPage.test.jsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Extract the discovery result presentation**

Create `WarungDiscoveryPage` with semantic sections and explicit props. Move only directory discovery markup into it; leave registration form state, validation, uploads, and submission in `WarungDirectory`. Preserve `onOpenWarung` profile navigation and `onRegister`.

- [ ] **Step 4: Add scoped CSS and wire stylesheet**

Use existing global tokens (`--wl-*`) from `wl-luxury-2026.css`; avoid duplicating global theme variables. Keep all new selectors under `.warung-discovery-page` so Beranda and registration styles are not unintentionally changed.

- [ ] **Step 5: Run focused and existing directory tests**

Run: `npm test -- --run src/directory/WarungDiscoveryPage.test.jsx src/directory/WarungDirectory.test.jsx`

Expected: PASS; existing registration and directory behaviors remain intact.

- [ ] **Step 6: Commit**

`git add src/directory/WarungDiscoveryPage.jsx src/directory/warung-discovery.css src/directory/WarungDiscoveryPage.test.jsx src/directory/WarungDirectory.jsx src/main.jsx && git commit -m "refactor(directory): separate discovery presentation"`

## Task 3: Implement premium editorial hero, mood rail, and photo cards

**Files:**
- Modify: `src/directory/WarungDiscoveryPage.jsx`
- Modify: `src/directory/warung-discovery.css`
- Modify: `src/directory/WarungDiscoveryPage.test.jsx`

**Interfaces:**
- `DiscoveryHero`, `MoodCategoryRail`, and `WarungEditorialCard` may be private components in `WarungDiscoveryPage.jsx` initially; split only if file size or reuse warrants it.
- Card props: `{ warung, category, distanceKm, event, openState, onOpen }`.

- [ ] **Step 1: Add failing visual-contract tests**
  - Test that hero search is labelled and accepts text.
  - Test that mood categories render in one horizontal rail with accessible labels and selected state.
  - Test that cards show actual name, available region, specialties, and valid status only.
  - Test that missing address, specialty, photo, or coordinates omit the corresponding detail instead of rendering fake values.
  - Test that card action opens the correct `warung.id`.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `npm test -- --run src/directory/WarungDiscoveryPage.test.jsx`

Expected: FAIL for the new contracts.

- [ ] **Step 3: Implement editorial hierarchy**

Build a responsive hero with image-led presentation, high-contrast text overlay, search field, and region entry point. Build a single-row scrollable mood rail using existing activity values where a mapping is valid. Build photo-led cards with consistent aspect ratios, restrained brass accents, and concise metadata.

- [ ] **Step 4: Add responsive styling**

Implement mobile-first layouts for 360–430 px, tablet 768–1024 px, and desktop 1280 px+. Use `object-fit: cover`, stable media aspect ratios, no excessive blur, and no horizontal page overflow. Honor `prefers-reduced-motion` and `:focus-visible`.

- [ ] **Step 5: Run focused tests**

Run: `npm test -- --run src/directory/WarungDiscoveryPage.test.jsx`

Expected: PASS.

- [ ] **Step 6: Commit**

`git add src/directory/WarungDiscoveryPage.jsx src/directory/warung-discovery.css src/directory/WarungDiscoveryPage.test.jsx && git commit -m "feat(directory): add premium editorial discovery UI"`

## Task 4: Wire search, region, GPS, categories, and progressive filters

**Files:**
- Modify: `src/directory/WarungDirectory.jsx`
- Modify: `src/directory/WarungDiscoveryPage.jsx`
- Modify: `src/directory/WarungDirectory.test.jsx`
- Modify: `src/directory/WarungDiscoveryPage.test.jsx`
- Reuse: `src/directory/OfficialRegionPicker.jsx`, `src/directory/discoveryState.js`, `src/directory/directoryFilters.js`.

**Interfaces:**
- Search input dispatches `SET_QUERY`; debounce is 300 ms and must clean up on unmount/query change.
- Region selector consumes existing `OfficialRegionPicker` callback values and passes the selected scope to the existing location filtering path.
- GPS action calls the existing browser geolocation flow; GPS denial never disables manual region selection.
- Filter sheet receives current filter state and dispatches reducer actions; mobile uses a bottom sheet, desktop uses an anchored panel.

- [ ] **Step 1: Add failing interaction tests**
  - Test that search input updates the discovery query after the debounce interval.
  - Test that changing region updates the visible scope without hard-coding a city or province.
  - Test that GPS denial leaves region selection and text search usable.
  - Test that category/filter state is preserved when switching list/map.
  - Test that reset filters preserves selected region and view mode.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `npm test -- --run src/directory/WarungDirectory.test.jsx src/directory/WarungDiscoveryPage.test.jsx`

Expected: FAIL for missing state wiring/new interactions.

- [ ] **Step 3: Wire reducer and existing region/GPS helpers**

Replace scattered discovery filter setters with the reducer where practical. Keep registration form state independent. Reuse the existing official region picker and global location props; do not create a second region catalogue or location source.

- [ ] **Step 4: Add filter sheet and debounced search**

Move secondary filters into a mobile bottom sheet and a desktop panel. Search only loaded records in memory, debounce at 300 ms, and show a clear scope indicator when more directory pages remain. Keep the existing explicit `Muat 30 warkop lagi` progression available after filtering; do not automatically fetch all pages.

- [ ] **Step 5: Run focused tests**

Run: `npm test -- --run src/directory/WarungDirectory.test.jsx src/directory/WarungDiscoveryPage.test.jsx src/directory/OfficialRegionPicker.test.jsx`

Expected: PASS.

- [ ] **Step 6: Commit**

`git add src/directory/WarungDirectory.jsx src/directory/WarungDiscoveryPage.jsx src/directory/WarungDirectory.test.jsx src/directory/WarungDiscoveryPage.test.jsx src/directory/discoveryState.js src/directory/discoveryState.test.js && git commit -m "feat(directory): wire discovery search and filters"`

## Task 5: Integrate list/map, nearby results, and real events

**Files:**
- Modify: `src/directory/WarungDiscoveryPage.jsx`
- Modify: `src/directory/WarungDirectory.jsx`
- Modify: `src/directory/WarungDiscoveryMap.jsx` only if required for selected-result preview or accessibility.
- Modify: `src/directory/WarungDiscoveryMap.test.jsx`
- Modify: `src/directory/WarungDirectory.test.jsx`
- Reuse: `src/directory/warung-discovery-map.css`, `src/directory/directoryFilters.js`.

**Interfaces:**
- List and map consume the same `visibleWarungs` array and `viewMode`.
- Map marker action continues to call `onOpenWarung(warungId)`.
- Event card data is passed only from the existing event query and must retain current status/date validation.
- Distance is calculated from valid coordinates using the existing Haversine helper; it is labelled as straight-line distance.

- [ ] **Step 1: Add failing integration tests**
  - Test list/map toggle preserves query, category, region, and filters.
  - Test map markers are generated only for records with valid coordinates.
  - Test marker click opens the matching profile.
  - Test events exclude cancelled/expired records and display valid upcoming/ongoing status only.
  - Test nearby mode with unavailable/denied GPS retains a usable directory and explanatory status.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `npm test -- --run src/directory/WarungDirectory.test.jsx src/directory/WarungDiscoveryMap.test.jsx`

Expected: FAIL for new shared-state expectations.

- [ ] **Step 3: Connect shared results and map state**

Pass the same filtered/sorted array to list and map. Preserve existing Leaflet loading behavior and map teardown. Add a selected place preview only if it can be implemented without duplicating profile data or breaking marker-to-profile navigation.

- [ ] **Step 4: Render event and nearby modules from valid data**

Use existing event query/status helpers and coordinate validation. Do not create a new event query or add per-card Firestore reads. Hide unavailable fields.

- [ ] **Step 5: Run focused tests**

Run: `npm test -- --run src/directory/WarungDirectory.test.jsx src/directory/WarungDiscoveryMap.test.jsx src/directory/directoryFilters.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

`git add src/directory/WarungDiscoveryPage.jsx src/directory/WarungDirectory.jsx src/directory/WarungDiscoveryMap.jsx src/directory/WarungDiscoveryMap.test.jsx src/directory/WarungDirectory.test.jsx && git commit -m "feat(directory): unify map and list discovery"`

## Task 6: Performance, regression, and responsive verification

**Files:**
- Modify only the relevant directory files/tests identified by evidence.
- Do not modify `firestore.rules`, `firestore.indexes.json`, Firebase config, or schema as part of this task.

- [ ] **Step 1: Add/adjust bounded-loading tests**
  - Test that opening map, changing category, typing search, or applying filters does not call an automatic loop that reads every remaining page.
  - Test that one explicit load-more action requests at most one page of 30 documents.
  - Test that popular mode does not issue one `getCountFromServer` request per warung. If no efficient existing popularity aggregate is available, remove the expensive ranking claim from this iteration rather than fabricate popularity.
  - Test that event loading remains bounded and category-scoped.

- [ ] **Step 2: Run focused tests**

Run: `npm test -- --run src/directory`

Expected: PASS.

- [ ] **Step 3: Run the complete test suite**

Run: `npm test`

Expected: PASS with no skipped/disabled tests introduced by this work.

- [ ] **Step 4: Run production build**

Run: `npm run build`

Expected: exit code 0. Record any existing non-fatal bundle warnings without hiding them.

- [ ] **Step 5: Verify responsive layouts**

Inspect screenshots or browser-rendered output at 360, 390, and 430 px; 768 and 1024 px; and 1280 px or wider. Confirm no horizontal overflow, clipped controls, category wrapping, unstable image ratios, or collisions with global/bottom navigation. Verify light and dark themes, keyboard focus, and reduced-motion behavior.

- [ ] **Step 6: Review data and security diff**

Confirm only intended discovery UI/query/test files changed. Confirm no changes to Auth, profiles, posts, Firestore/Storage rules, production secrets, billing, or unrelated Bookingpijat/SULES files.

- [ ] **Step 7: Commit**

`git add <verified-discovery-files> && git commit -m "test(directory): verify discovery performance and responsive UX"`

## Execution Notes / Known Product Boundary

The current repository has no verified full-text search index for arbitrary matching across name, region, menu, ambience, facilities, and activities. A correct, scalable nationwide full-text search cannot be promised from the current schema without either scanning many/all documents or introducing a search-token/index strategy. This plan intentionally chooses bounded page loading and transparent loaded-result scope for the first implementation. If the product requires complete nationwide multi-field search in one query, stop and submit a separate architecture proposal for approval before changing document fields, indexes, rules, or adding a provider.

The current “popular” mode reads follower counts per warung. Do not preserve that read pattern merely to retain a label. Use an existing verified aggregate if one is discovered during implementation; otherwise defer popularity ranking until a separate data design is approved.

## Handoff

After implementation tasks pass review, open a PR from the isolated feature branch. Do not merge or deploy until the user explicitly approves.
