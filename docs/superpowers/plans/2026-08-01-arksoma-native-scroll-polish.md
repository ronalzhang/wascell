# ARKSOMA Native Scroll Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove internal application copy, lengthen the coordinate glyph glow by about 13%, and replace inconsistent scroll snapping and continuous image animation with native scrolling plus one-shot viewport reveals.

**Architecture:** Keep the generated static-page architecture. CSS owns the visual states and native scrolling; the existing reveal initializer uses one injected `IntersectionObserver` to add final-state classes once and then unobserve each target. No scroll listener, wheel interception, animation dependency, API change, or backend change is introduced.

**Tech Stack:** Node.js 20, generated HTML templates, CSS transitions, ESM browser UI, `node:test`, in-app browser QA, Express/PM2 deployment.

## Global Constraints

- Delete `资料与附件一次提交并直接生成私密申请订单，无需跳转或重复操作。` without replacement or residual spacing.
- Change the coordinate sweep from `0.9s` to exactly `1.02s`; keep the `1.1s` delay, current colors, single iteration and glyph clipping.
- Remove `scroll-snap-type`, `scroll-snap-align`, and the `animation-timeline: view()` journey-image animation.
- Do not intercept wheel or touch input and do not add continuous `scroll` listeners.
- Main content reveals once with approximately `12px` vertical travel.
- Journey cards remain readable before enhancement; only their images receive a one-shot `1.018` scale/brightness settle when entering view.
- Reduced-motion and missing-`IntersectionObserver` paths immediately show final states.
- Preserve routes, images, layout, pricing, membership rules, advisor submission, backend permissions and runtime data directories.
- Verify 390px, 768px, 1024px and 1440px before production deployment.

---

### Task 1: Lock The Customer Copy And CSS Motion Contract

**Files:**
- Modify: `tests/period-window.test.cjs`
- Modify: `templates/arksoma-period.html`
- Modify: `arksoma.css`

**Interfaces:**
- Consumes: the generated period template, `.coordinate-trigger`, `[data-reveal]`, `.journey-card` and `.journey-card.is-in-view`.
- Produces: a customer-facing advisor header without internal implementation copy and CSS final/entry states used by Task 2.

- [ ] **Step 1: Write the failing template and CSS assertions**

Replace the old snap assertion and add exact behavioral checks:

```js
assert.doesNotMatch(html, /资料与附件一次提交并直接生成私密申请订单/);
assert.doesNotMatch(css, /scroll-snap-type|scroll-snap-align/);
assert.doesNotMatch(css, /animation-timeline:\s*view\(\)/);
assert.match(css, /animation:[^;]*coordinate-glyph-sweep\s+1\.02s[^;]*1\.1s\s+1\s+both/);
assert.match(css, /\[data-reveal\]\s*\{[^}]*translateY\(12px\)/s);
assert.match(css, /\.journey-card\.is-in-view\s+img\s*\{[^}]*scale\(1\)/s);
assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*\.journey-card\s+img\s*\{[^}]*transform:\s*none/s);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/period-window.test.cjs`

Expected: FAIL because the internal sentence, snap CSS, `0.9s` glow and view-timeline animation still exist, while the one-shot card state does not.

- [ ] **Step 3: Implement the minimal template and CSS changes**

In `templates/arksoma-period.html`, remove only:

```html
<p class="dialog-intro">资料与附件一次提交并直接生成私密申请订单，无需跳转或重复操作。</p>
```

In `arksoma.css`:

```css
html { width: 100%; scroll-behavior: smooth; background: var(--ink); }

[data-reveal] {
    opacity: 0;
    transform: translateY(12px);
    transition: opacity .78s ease, transform .78s cubic-bezier(.22,.7,.24,1);
}
[data-reveal].is-visible { opacity: 1; transform: none; }

.journey-card img {
    transform: scale(1.018);
    filter: saturate(.72) contrast(1.03) brightness(.88);
    transition: transform .9s cubic-bezier(.22,.7,.24,1), filter .9s ease;
}
.journey-card.is-in-view img {
    transform: scale(1);
    filter: saturate(.72) contrast(1.03) brightness(1);
}
```

Delete the `.hero, .thesis, .access-section, .itinerary, .closing` snap rule and the entire `@supports (animation-timeline: view())` block. Set the coordinate animation to:

```css
animation: coordinate-glyph-sweep 1.02s cubic-bezier(.3,.68,.24,1) 1.1s 1 both;
```

Add to the existing reduced-motion block:

```css
.journey-card img { transform: none; transition: none; }
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test tests/period-window.test.cjs`

Expected: all period/template/style tests pass.

- [ ] **Step 5: Commit the isolated visual contract**

```bash
git add tests/period-window.test.cjs templates/arksoma-period.html arksoma.css
git commit -m "fix: simplify ARKSOMA native scroll motion"
```

### Task 2: Make Viewport Reveals One-Shot And Fail-Safe

**Files:**
- Modify: `tests/arksoma-ui.test.mjs`
- Modify: `arksoma-ui.mjs`

**Interfaces:**
- Consumes: `initRevealMotion({ root, reducedMotion, Observer })`, `[data-reveal]` elements and `.journey-card` elements.
- Produces: `.is-visible` for content and `.is-in-view` for journey cards; returns the observer instance or `null` for immediate fallback.

- [ ] **Step 1: Write failing real-behavior tests**

Import `initRevealMotion` and use small real class-list fakes:

```js
test('initRevealMotion reveals content and journey cards once', () => {
    const content = { classList: new Set() };
    const card = { classList: new Set() };
    const observed = [];
    const unobserved = [];
    let callback;
    class Observer {
        constructor(handler) { callback = handler; }
        observe(target) { observed.push(target); }
        unobserve(target) { unobserved.push(target); }
    }
    const root = {
        querySelectorAll(selector) {
            return selector === '[data-reveal]' ? [content] : [card];
        },
    };

    initRevealMotion({ root, reducedMotion: false, Observer });
    assert.deepEqual(observed, [content, card]);
    callback([{ target: content, isIntersecting: true }, { target: card, isIntersecting: true }]);
    assert.equal(content.classList.has('is-visible'), true);
    assert.equal(card.classList.has('is-in-view'), true);
    assert.deepEqual(unobserved, [content, card]);
});

test('initRevealMotion immediately reveals every target without motion support', () => {
    const content = { classList: new Set() };
    const card = { classList: new Set() };
    const root = { querySelectorAll: (selector) => selector === '[data-reveal]' ? [content] : [card] };
    assert.equal(initRevealMotion({ root, reducedMotion: true, Observer: null }), null);
    assert.equal(content.classList.has('is-visible'), true);
    assert.equal(card.classList.has('is-in-view'), true);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/arksoma-ui.test.mjs`

Expected: FAIL because `initRevealMotion` is not exported and cannot receive injected browser dependencies.

- [ ] **Step 3: Implement the observer with explicit final classes**

Replace the existing initializer with:

```js
export function initRevealMotion({
    root = document,
    reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    Observer = globalThis.IntersectionObserver,
} = {}) {
    const contentTargets = [...root.querySelectorAll('[data-reveal]')];
    const journeyTargets = [...root.querySelectorAll('.journey-card')];
    const targets = [...contentTargets, ...journeyTargets];
    const reveal = (target) => target.classList.add(
        journeyTargets.includes(target) ? 'is-in-view' : 'is-visible',
    );
    if (reducedMotion || typeof Observer !== 'function') {
        targets.forEach(reveal);
        return null;
    }
    const observer = new Observer((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            reveal(entry.target);
            observer.unobserve(entry.target);
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -8% 0px' });
    targets.forEach((target) => observer.observe(target));
    return observer;
}
```

Keep `initArksomaPage()` calling `initRevealMotion()` once.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `node --test tests/arksoma-ui.test.mjs tests/period-window.test.cjs`

Expected: all UI and period/style tests pass.

- [ ] **Step 5: Commit the one-shot observer behavior**

```bash
git add tests/arksoma-ui.test.mjs arksoma-ui.mjs
git commit -m "feat: add one-shot ARKSOMA journey reveals"
```

### Task 3: Regenerate Pages, Verify And Deploy

**Files:**
- Modify: `templates/arksoma-period.html`
- Generated: `index.html`, `20260901.html`, `20260902.html`, `20260903.html`, `20261001.html`, `20261002.html`
- Modify: `design-qa.md`
- Evidence only: `.codex-tmp/arksoma-native-scroll-qa/`

**Interfaces:**
- Consumes: current period generator, local server at `http://localhost:3013`, production at `https://wascell.com`, PM2 process `wascell-website`.
- Produces: cache-busted generated pages, local/production QA evidence and deployed Git HEAD.

- [ ] **Step 1: Bump assets and regenerate the current window**

Change both template asset versions from `v=20260801-3` to `v=20260801-4`, then run:

```bash
npm run periods:dry-run
npm run periods:update
```

Expected window: `2026·九月首期 - 2026·十月二期`; only the template and six current public pages receive the version/content update.

- [ ] **Step 2: Run the full automated gate**

```bash
git diff --check
npm test
```

Expected: zero whitespace errors and all Node tests pass.

- [ ] **Step 3: Verify local native scrolling and interactions**

At 390, 768, 1024 and 1440px require:

- computed root `scrollSnapType` is `none`;
- scrolling stops at the gesture result instead of being pulled to a section boundary;
- journey cards receive `is-in-view` once and remain visible;
- no `animation-timeline` runs on journey images;
- no horizontal overflow and no console errors;
- advisor dialog omits the deleted sentence;
- coordinate computed duration is `1.02s`, iteration count is `1`, and the origin story still opens/closes with focus return.

- [ ] **Step 4: Record QA and commit generated output**

Append accepted results and evidence paths to `design-qa.md`, then:

```bash
git add templates/arksoma-period.html index.html 20260901.html 20260902.html 20260903.html 20261001.html 20261002.html design-qa.md
git commit -m "docs: verify ARKSOMA native scroll polish"
```

- [ ] **Step 5: Deploy through the scoped production path**

Push reviewed HEAD to `origin/main`. Confirm `/ubuntu/wascell` is clean and `wascell-website` is online, then run only `git pull --ff-only origin main` and `pm2 restart wascell-website --update-env`. Do not run the destructive cleanup path in `deploy.sh` and do not restart unrelated services.

- [ ] **Step 6: Verify production**

Require:

- `/`, `/admin`, `/admin-pro`, `/session-state.mjs` and `/api/public/catalog` return `200`;
- unauthenticated owner and sales data APIs return `401`;
- production HTML omits the internal application sentence and includes asset version `20260801-4`;
- in-app browser confirms native scroll, one-shot journey image settling, `1.02s` coordinate sweep, zero overflow and zero console errors;
- remote HEAD equals pushed HEAD, remote worktree is clean, and PM2 reports `online` with zero unstable restarts.
