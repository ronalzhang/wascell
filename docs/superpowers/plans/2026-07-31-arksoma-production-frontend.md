# ARKSOMA Production Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote the approved ARKSOMA interactive preview into the production multi-period frontend with membership messaging, filial-period rules, live public configuration, landscape itineraries, and one-submit advisor applications.

**Architecture:** Keep static generated period pages and shared CSS/ES modules for resilience. Pages contain safe default commercial values, then hydrate public values from `/api/public/catalog`. The form posts multipart data directly to `/api/advisor-applications`; no email handoff or second customer action remains.

**Tech Stack:** Semantic HTML, CSS, browser ES modules, Node generation scripts, Express static hosting, `node:test`.

## Global Constraints

- Match the approved `prototype/arksoma-v2` black-stone/cellular visual target.
- Keep the 1024px portrait artboard behavior and support iPhone, large phones, iPad, tri-fold, and 1366px wide screens.
- Visible primary actions remain period selection and private-advisor application.
- Hero membership copy is restrained: `PRIVATE ACCESS · BY APPOINTMENT`.
- Standard price fallback is RMB 580,000 and includes the first 12 months of annual access.
- Every third monthly period is `敬亲礼遇期`, RMB 560,000, three family groups, up to six internal guests, with solo applications allowed.
- Public pages never expose internal capacity values from private configuration.
- Existing production frontend is not deployed until browser QA passes.

---

### Task 1: Period model and filial-period contract

**Files:**
- Modify: `scripts/arksoma-periods.cjs`
- Modify: `tests/period-window.test.cjs`
- Modify: `scripts/update-period-window.js`

**Interfaces:**
- Produces period objects with `type: 'standard'|'filial'`, `publicCapacityLabel`, `priceFallback`, and `publicCopy`.
- Produces `valuesForPeriod(period, publicConfig?)` without exposing private maximum capacity.

- [ ] **Step 1: Replace the old failing third-period assertions**

```js
test('third period is a filial family edition', () => {
  const period = buildPeriods({ year: 2026, month: 8 }, 5)[2];
  const values = valuesForPeriod(period);
  assert.equal(period.type, 'filial');
  assert.equal(values.price, 'RMB 560,000');
  assert.equal(values.publicCapacityLabel, '仅开放 3 组家庭席位');
  assert.match(values.publicCopy, /两位同行为建议.*单人申请/);
  assert.doesNotMatch(values.publicCapacityLabel, /6/);
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `node --test tests/period-window.test.cjs`

Expected: FAIL because the current output says “限额 6 席” and “父母长辈特惠”.

- [ ] **Step 3: Implement the period contract**

Use `type: slot === 3 ? 'filial' : 'standard'`. Replace public “特惠” language with “敬亲礼遇期”. Keep internal group and guest limits only in the backoffice configuration.

- [ ] **Step 4: Run tests and commit**

Run: `node --test tests/period-window.test.cjs`

```bash
git add scripts/arksoma-periods.cjs scripts/update-period-window.js tests/period-window.test.cjs
git commit -m "feat: define filial family periods"
```

### Task 2: Production template and membership narrative

**Files:**
- Modify: `templates/arksoma-period.html`
- Modify: `arksoma.css`
- Modify: `index.html`
- Modify: `20260801.html`
- Modify: `20260802.html`
- Modify: `20260803.html`
- Modify: `20260901.html`
- Modify: `20260902.html`
- Modify: `tests/period-window.test.cjs`

**Interfaces:**
- Consumes `renderPeriodPage` placeholders.
- Produces the final hero, protocol, itinerary, membership, and application sections.

- [ ] **Step 1: Add failing copy and structure assertions**

```js
assert.match(html, /PRIVATE ACCESS · BY APPOINTMENT/);
assert.match(html, /已包含首个 12 个月方舟年度席位/);
assert.match(html, /未经提前沟通与专业评估.*可能无法接收/);
assert.match(html, /data-public-price/);
assert.match(html, /data-membership-fee/);
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `node --test tests/period-window.test.cjs`

- [ ] **Step 3: Promote the approved preview layout**

Use the selected real raster assets and landscape itinerary cards. Preserve the coordinate menu, fixed scrollable period sheet, concise advisor copy, scroll transitions, reduced-motion behavior, and central safe column. Do not add a membership button.

- [ ] **Step 4: Add the membership protocol copy**

Show the first-year inclusion next to price and explain appointment-only professional preparation in the protocol section. Put the configurable RMB 19,800 renewal explanation in a secondary disclosure near the form, not in the hero.

- [ ] **Step 5: Generate five pages and verify placeholders**

Run: `npm run periods:update -- --start=2026-08 --count=5 && rg -n '\{\{[A-Z_]+' index.html 20260801.html 20260802.html 20260803.html 20260901.html 20260902.html`

Expected: generation succeeds and `rg` returns no matches.

- [ ] **Step 6: Run tests and commit**

Run: `npm test`

```bash
git add templates/arksoma-period.html arksoma.css index.html 20260801.html 20260802.html 20260803.html 20260901.html 20260902.html tests/period-window.test.cjs
git commit -m "feat: promote ARKSOMA membership frontend"
```

### Task 3: Public catalog hydration and resilient pricing

**Files:**
- Modify: `arksoma-ui.mjs`
- Modify: `templates/arksoma-period.html`
- Modify: `tests/arksoma-ui.test.mjs`

**Interfaces:**
- Produces: `normalizePublicCatalog(raw)`.
- Produces: `applyPublicCatalog(document, catalog, periodType)`.
- Consumes `/api/public/catalog` and safe HTML fallbacks.

- [ ] **Step 1: Write failing catalog tests**

```js
test('normalizes only public commercial fields', () => {
  const result = normalizePublicCatalog({ fullPlanPrice: 600000, membershipFee: 21800, standardCapacity: 99 });
  assert.deepEqual(result, { fullPlanPrice: 600000, membershipFee: 21800, membershipMonths: 12, showPrice: true, filialPeriod: { price: 560000, familyGroups: 3 } });
  assert.equal('standardCapacity' in result, false);
});
```

- [ ] **Step 2: Run and confirm RED**

Run: `node --test tests/arksoma-ui.test.mjs`

- [ ] **Step 3: Implement fetch with fallback**

Fetch after DOMContentLoaded with same-origin credentials. On non-200, malformed JSON, timeout, or validation failure, leave generated fallback text untouched and do not block the form. Format currency with `Intl.NumberFormat('zh-CN')`.

- [ ] **Step 4: Run tests and commit**

Run: `node --test tests/arksoma-ui.test.mjs && node --check arksoma-ui.mjs`

```bash
git add arksoma-ui.mjs templates/arksoma-period.html tests/arksoma-ui.test.mjs
git commit -m "feat: hydrate public ARKSOMA pricing"
```

### Task 4: One-submit advisor application

**Files:**
- Modify: `arksoma-ui.mjs`
- Modify: `templates/arksoma-period.html`
- Modify: `tests/arksoma-ui.test.mjs`
- Modify: `tests/admin-integration.test.cjs`

**Interfaces:**
- Produces: `buildAdvisorFormData(form, files, submissionKey)`.
- Produces: `submitAdvisorApplication(fetchImpl, formData)` returning `{ orderId, createdAt, duplicate }`.

- [ ] **Step 1: Replace mailto tests with failing multipart submission tests**

```js
test('buildAdvisorFormData includes customer data and up to three attachments', () => {
  const data = buildAdvisorFormData(fields, files, 'submission-1');
  assert.equal(data.get('periodId'), '20260901');
  assert.equal(data.getAll('attachments').length, 2);
  assert.equal([...data.values()].some(value => String(value).startsWith('mailto:')), false);
});
```

- [ ] **Step 2: Run and confirm RED**

Run: `node --test tests/arksoma-ui.test.mjs`

- [ ] **Step 3: Implement inline validation and API submission**

Keep name plus one direct contact method required. Allow PDF/JPG/JPEG/PNG, maximum 3 files, 10 MB each, 20 MB total. Disable the button while submitting; on failure preserve fields and file names; on success show only order number, selected period, and advisor follow-up message.

- [ ] **Step 4: Verify idempotency and errors**

Reuse one generated `submissionKey` across retries in the current dialog session. Confirm a repeated request returns the same order and no duplicate attachment directory.

- [ ] **Step 5: Run tests and commit**

Run: `npm test && node --check arksoma-ui.mjs`

```bash
git add arksoma-ui.mjs templates/arksoma-period.html tests/arksoma-ui.test.mjs tests/admin-integration.test.cjs
git commit -m "feat: submit advisor applications directly"
```

### Task 5: Multi-device browser and design QA

**Files:**
- Modify: `design-qa.md`
- Create: `.codex-tmp/arksoma-production-qa/` screenshots (local evidence only; do not commit temporary captures)

**Interfaces:**
- Consumes the complete frontend and backoffice public API.
- Produces `final result: passed` only when all blocking checks pass.

- [ ] **Step 1: Run automated gates**

Run: `npm test && node --check arksoma-ui.mjs && npm run periods:dry-run -- --start=2026-08 --count=5 && git diff --check`

- [ ] **Step 2: Verify customer journey in the in-app browser**

Check 390×844, 430×932, 768×1024, 1024×1366, and 1366×1024. Test period-sheet scrolling, coordinate story, standard and filial pages, itinerary cards, file validation, failed-submit retention, success state, Escape, focus return, reduced motion, and no horizontal overflow.

- [ ] **Step 3: Compare against the selected visual**

Capture the same 1024×1536 viewport as the selected reference, compose reference and implementation side by side, and inspect typography, stone/cell image crop, black/gold balance, spacing, and visible controls. Fix all P0/P1/P2 mismatches.

- [ ] **Step 4: Record QA and commit**

Set `final result: passed` only after console error/warn logs are empty and all listed viewports pass.

```bash
git add design-qa.md
git commit -m "test: verify ARKSOMA production frontend"
```
