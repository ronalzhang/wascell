# ARKSOMA Coordinate Glow And Continuity Pricing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the coordinate underline with a one-shot glyph-only glow and make every visible `RMB 580,000` reference clearly mean one cell service while introducing “三次起可制定连续方案” without publishing a discount.

**Architecture:** Keep the existing generated static-page architecture and public catalog hydration. Update the single public membership/continuity copy source with a legacy-default compatibility rule, render the same copy in the closing section and advisor dialog, and implement the coordinate light sweep entirely on the button text with a safe static fallback. No new API, pricing tier, page module, or dependency is introduced.

**Tech Stack:** Node.js 20, CommonJS configuration store, ESM browser UI, generated HTML templates, CSS animations, `node:test`, in-app browser QA, Express/PM2 deployment.

## Global Constraints

- Standard single-service public price remains exactly `RMB 580,000`; filial periods retain their configured price.
- Public copy must say `三次起可制定连续方案 · 首年方舟席位已含`.
- Never publish `RMB 560,000`, a percentage discount, savings amount, multi-service total, or six-service tier.
- Coordinate resting content remains only `37°32′10″N / 139°36′20″E`.
- Remove `ENTER`, pseudo-element borders, underlines, lightning, external beams, looping glow, and repeated autoplay.
- Preserve the existing origin-story click interaction, advisor submission flow, layout, typography, routes, backend permissions, and data directories.
- Support `prefers-reduced-motion: reduce` and a non-transparent fallback when text clipping is unavailable.
- Verify 390px, 768px, 1024px, and 1440px viewports before deployment.

---

### Task 1: Lock The Commercial Copy And Legacy Migration

**Files:**
- Modify: `tests/business-config.test.cjs`
- Modify: `lib/business-config-store.js`

**Interfaces:**
- Consumes: `createBusinessConfigStore({ dataDir, now, auditLog })` and `DEFAULT_CONFIG.publicMembershipCopy`.
- Produces: `normalizeLegacyPublicMembershipCopy(value: string): string`, used by `validateConfig()` so only the exact former default is upgraded and administrator-authored copy remains unchanged.

- [ ] **Step 1: Write the failing tests**

Add tests that assert:

```js
assert.equal(DEFAULT_CONFIG.publicMembershipCopy, '三次起可制定连续方案 · 首年方舟席位已含');

await fs.writeFile(path.join(tempDir, 'business-config.json'), JSON.stringify({
    ...DEFAULT_CONFIG,
    publicMembershipCopy: '已包含首个 12 个月方舟年度席位',
}));
assert.equal((await store.getPublic()).publicMembershipCopy, '三次起可制定连续方案 · 首年方舟席位已含');

await fs.writeFile(path.join(tempDir, 'business-config.json'), JSON.stringify({
    ...DEFAULT_CONFIG,
    publicMembershipCopy: '管理员自定义公开说明',
}));
assert.equal((await store.getPublic()).publicMembershipCopy, '管理员自定义公开说明');
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node --test tests/business-config.test.cjs`

Expected: FAIL because the default still contains the old annual-seat sentence and no compatibility migration exists.

- [ ] **Step 3: Implement the minimal copy migration**

In `lib/business-config-store.js`:

```js
const LEGACY_PUBLIC_MEMBERSHIP_COPY = '已包含首个 12 个月方舟年度席位';
const CONTINUITY_PUBLIC_COPY = '三次起可制定连续方案 · 首年方舟席位已含';

function normalizeLegacyPublicMembershipCopy(value) {
    const clean = cleanText(value);
    return clean === LEGACY_PUBLIC_MEMBERSHIP_COPY ? CONTINUITY_PUBLIC_COPY : clean;
}
```

Set `DEFAULT_CONFIG.publicMembershipCopy` to `CONTINUITY_PUBLIC_COPY` and call `normalizeLegacyPublicMembershipCopy(input.publicMembershipCopy)` inside `validateConfig()`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `node --test tests/business-config.test.cjs`

Expected: all business-configuration tests pass.

- [ ] **Step 5: Commit the isolated data behavior**

```bash
git add lib/business-config-store.js tests/business-config.test.cjs
git commit -m "feat: add continuity plan public copy"
```

### Task 2: Render Single-Service And Continuity Meaning Without More Rows

**Files:**
- Modify: `tests/period-window.test.cjs`
- Modify: `tests/arksoma-ui.test.mjs`
- Modify: `templates/arksoma-period.html`
- Modify: `arksoma-ui.mjs`
- Generated: `index.html`, `20260901.html`, `20260902.html`, `20260903.html`, `20261001.html`, `20261002.html`

**Interfaces:**
- Consumes: `applyPublicCatalog(root, catalog, periodType)` and the existing `[data-catalog-price]`, `[data-membership-copy]`, `{{PERIOD_LABEL}}`, `{{PRICE}}`, `{{CUTOFF}}` placeholders.
- Produces: `[data-service-period]` text formatted as `单次细胞服务 · {period label without year prefix}` and consistent two-line closing/advisor price contexts.

- [ ] **Step 1: Write failing rendering tests**

Assert generated standard HTML contains:

```js
assert.match(html, /单次细胞服务/);
assert.match(html, /三次起可制定连续方案 · 首年方舟席位已含/);
assert.match(html, /单次细胞服务[^<]*RMB 580,000[^<]*截止/);
assert.doesNotMatch(html, /closing-price[^<]*限额 5 席/);
assert.doesNotMatch(html, /RMB 560,000\/次|折扣|立省|六次套餐/);
```

Extend `applyPublicCatalog` test fixtures with an element using `[data-service-period]` and assert it retains `单次细胞服务` while the price hydrates for both standard and filial periods.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test tests/period-window.test.cjs tests/arksoma-ui.test.mjs`

Expected: FAIL because the template still uses the raw period label, the closing price still contains capacity, and the old copy is rendered.

- [ ] **Step 3: Implement the two-line contexts**

Update the template to use:

```html
<p class="closing-price"><span>单次细胞服务</span> · <span data-catalog-price>{{PRICE}}</span> · 截止 {{CUTOFF}}</p>
<small data-membership-copy>三次起可制定连续方案 · 首年方舟席位已含</small>
```

and inside `.advisor-context`:

```html
<span data-service-period>单次细胞服务 · {{PERIOD_LABEL}}</span>
<strong data-catalog-price>{{PRICE}}</strong>
<small data-membership-copy>三次起可制定连续方案 · 首年方舟席位已含</small>
```

Add a small exported formatter to `arksoma-ui.mjs`:

```js
export function servicePeriodLabel(periodLabel = '') {
    return `单次细胞服务 · ${String(periodLabel).replace(/^\d{4}·/, '')}`;
}
```

Use it during catalog application for `[data-service-period]` elements, reading the full period from `document.body.dataset.period` at initialization. Keep the success view price-free.

- [ ] **Step 4: Regenerate period pages**

Run:

```bash
npm run periods:dry-run
npm run periods:update
```

Expected window: `2026·九月首期 - 2026·十月二期`; only `index.html` and the five current period pages change.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `node --test tests/period-window.test.cjs tests/arksoma-ui.test.mjs tests/business-config.test.cjs`

Expected: all focused tests pass and no public output contains a discount amount or tier.

- [ ] **Step 6: Commit the copy and generated pages**

```bash
git add templates/arksoma-period.html arksoma-ui.mjs lib/business-config-store.js tests/business-config.test.cjs tests/period-window.test.cjs tests/arksoma-ui.test.mjs index.html 20260901.html 20260902.html 20260903.html 20261001.html 20261002.html
git commit -m "feat: frame ARKSOMA services as continuity plans"
```

### Task 3: Replace The Underline With A Glyph-Only Sweep

**Files:**
- Modify: `tests/period-window.test.cjs`
- Modify: `arksoma.css`
- Generated references: the same six current HTML pages only for cache-version changes if required.

**Interfaces:**
- Consumes: `.coordinate-trigger`, existing one-shot narrow/touch media query, and global reduced-motion rule.
- Produces: `coordinate-glyph-sweep` keyframes with one iteration and no pseudo-element content or border.

- [ ] **Step 1: Write the failing CSS regression test**

Add assertions:

```js
assert.doesNotMatch(css, /\.coordinate-trigger::before/);
assert.doesNotMatch(css, /content:\s*["']ENTER["']/);
assert.doesNotMatch(css, /coordinate-trace|border-top:[^;]*coordinate/);
assert.match(css, /@keyframes\s+coordinate-glyph-sweep/);
assert.match(css, /background-clip:\s*text|-webkit-background-clip:\s*text/);
assert.match(css, /animation:[^;]*coordinate-glyph-sweep[^;]*1\s+both/);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/period-window.test.cjs`

Expected: FAIL on the existing `::before` border, `ENTER`, and absent glyph-sweep keyframes.

- [ ] **Step 3: Implement the minimal visual behavior**

Remove both coordinate pseudo-element rules. Keep a safe bronze `color` as the baseline. Under `@supports ((-webkit-background-clip: text) or (background-clip: text))`, apply a bronze-to-ivory-to-bronze linear light band clipped to the glyphs, with `background-size: 240% 100%`, and animate `background-position` once from right to left after `1.1s` for `0.9s`. Use a weak `text-shadow` only near the animation midpoint. Desktop hover/focus changes brightness without replaying the sweep. Reduced motion keeps the baseline bronze text and disables all animation.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `node --test tests/period-window.test.cjs`

Expected: all period/template/style tests pass.

- [ ] **Step 5: Commit the coordinate effect**

```bash
git add arksoma.css tests/period-window.test.cjs templates/arksoma-period.html index.html 20260901.html 20260902.html 20260903.html 20261001.html 20261002.html
git commit -m "fix: replace coordinate underline with glyph glow"
```

### Task 4: Visual QA, Full Regression, And Production Deployment

**Files:**
- Modify: `design-qa.md`
- Evidence only: `.codex-tmp/arksoma-continuity-qa/`

**Interfaces:**
- Consumes: local server at `http://localhost:3013`, production at `https://wascell.com`, PM2 process `wascell-website`.
- Produces: accepted before/after screenshots, final QA notes, deployed Git commit, and verified production health.

- [ ] **Step 1: Run the complete automated suite**

Run:

```bash
git diff --check
npm test
```

Expected: zero whitespace errors and all Node tests pass.

- [ ] **Step 2: Capture local visual states**

At 390px, capture the coordinate during its light-sweep midpoint and after it returns to bronze. Verify computed styles report no `::before` content/border and exactly one `coordinate-glyph-sweep` iteration. Open the advisor dialog and capture the two-line price context. Repeat the closing/advisor layout at 768px, 1024px, and 1440px; require zero horizontal overflow.

- [ ] **Step 3: Verify functional behavior**

Click the coordinate and confirm the origin story opens; close it and confirm focus returns. Submit only validation-safe test data locally or use existing integration tests—do not create a production customer. Confirm the success view still has no price.

- [ ] **Step 4: Update QA evidence and commit**

Append the accepted viewport, motion, copy, console, and interaction results to `design-qa.md`, then run `git diff --check` and `npm test` again.

```bash
git add design-qa.md
git commit -m "docs: verify ARKSOMA continuity pricing polish"
```

- [ ] **Step 5: Deploy only after local gates pass**

Push the reviewed HEAD to `origin/main`. On the VPS, first confirm `/ubuntu/wascell` is clean and `wascell-website` is online, then `git pull --ff-only origin main` and restart only `wascell-website` with PM2. Do not run destructive cleanup or restart unrelated services.

- [ ] **Step 6: Verify production**

Require:

- `/`, `/admin`, `/admin-pro`, `/session-state.mjs`, and `/api/public/catalog` return `200`.
- Unauthenticated owner and sales APIs return `401`.
- Production HTML contains `单次细胞服务` and public catalog contains `三次起可制定连续方案`; standard-period public copy contains no `RMB 560,000/次`, `折扣`, `立省`, savings amount, or package total. The existing filial-period configured price may legitimately remain `560000` in the catalog and is not a continuity discount.
- In-app browser at 390px shows no coordinate underline, one-line price hierarchy, zero console errors, zero horizontal overflow, and a price-free success view.
- Remote Git HEAD equals the pushed commit, worktree is clean, and PM2 reports `wascell-website: online` with zero unstable restarts.
