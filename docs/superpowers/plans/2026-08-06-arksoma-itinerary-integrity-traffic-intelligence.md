# ARKSOMA Itinerary Integrity and Traffic Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair itinerary semantic accuracy, make Private Journal publishing immediate, and provide explainable owner-only traffic intelligence.

**Architecture:** A small semantic itinerary catalog remains inside `scripts/arksoma-periods.cjs` and renders the current period pages. A dedicated owner API updates only the public journal flag with a fixed audit reason. A pure traffic-intelligence module enriches existing `stats.json` IP counters from `access.log`; the existing owner stats API and dark admin UI display the derived results.

**Tech Stack:** Node.js, Express, node:test, Chart.js, static HTML/CSS/ES modules, PM2.

## Global Constraints

- Public five-day cards are “当期参考路径”; final arrangements depend on health, season, reservation and reception conditions.
- Never claim unverified exclusivity. Owner-only IP data must never reach sales or public APIs.
- Traffic labels are probabilistic and explainable. Do not auto-block IPs, delete logs or add a third-party analytics dependency.
- Preserve ARKSOMA’s existing dark visual system and responsive breakpoints.

---

### Task 1: Correct the reusable itinerary source

**Files:**
- Modify: `scripts/arksoma-periods.cjs`, `templates/arksoma-period.html`, `all.html`
- Test: `tests/period-window.test.cjs`

**Interfaces:**
- Produces: `itineraryForPeriod(period)` with card property `visualContext`.

- [ ] **Step 1: Write failing tests**

```js
const itinerary = itineraryForPeriod({ type: 'standard', special: false });
assert.match(itinerary[1].title, /医疗准备/);
assert.equal(itinerary[1].image, 'imgs/geisha.jpg');
assert.match(itinerary[1].visualContext, /下午文化安排/);
assert.equal(itinerary[4].image, 'imgs/incense.jpg');
assert.match(itinerary[4].title, /香道/);
assert.match(itinerary[4].copy, /当期确认/);
```

- [ ] **Step 2: Verify the test fails**

Run: `node --test tests/period-window.test.cjs`

Expected: FAIL because Day 2 combines image and medical semantics and Day 5 uses `caiguoqiang.jpg`.

- [ ] **Step 3: Implement minimal semantic catalog**

Create `REFERENCE_EXPERIENCES` and use these exact Day 2/5 records:

```js
{ image: 'imgs/geisha.jpg', alt: '介绍制茶与舞文化接待', visualContext: '图片呈现当日下午文化安排', title: '医疗准备之后，进入介绍制的茶与舞。' }
{ image: 'imgs/incense.jpg', alt: '和室香道雅集', visualContext: '图片呈现香道接待场景', title: '以香道雅集，为首阶段留下一次安静收束。' }
```

Day 2 copy keeps the morning medical preparation and makes final scheduling conditional. Day 5 copy states that the cultural item is confirmed for the current period. Render `visualContext` as the image caption and one compact “当期参考路径” notice. Update the matching public `/all` description to 香道 and remove the inaccurate visible reuse of `caiguoqiang.jpg`.

- [ ] **Step 4: Verify and commit**

Run: `node --test tests/period-window.test.cjs && npm run periods:dry-run`

```bash
git add scripts/arksoma-periods.cjs templates/arksoma-period.html all.html tests/period-window.test.cjs
git commit -m "fix: align ARKSOMA itinerary imagery and claims"
```

### Task 2: Make Private Journal publishing immediate

**Files:**
- Modify: `app.js`, `admin-pro.html`, `admin-pro.mjs`, `admin-pro.css`
- Test: `tests/admin-integration.test.cjs`, `tests/admin-pages.test.cjs`

**Interfaces:**
- Produces: `PATCH /api/owner/config/private-journal` with `{ enabled: boolean }` and result `{ success: true, showPrivateJournal: boolean }`.

- [ ] **Step 1: Write failing endpoint and UI tests**

```js
const response = await fetch(`${baseUrl}/api/owner/config/private-journal`, {
  method: 'PATCH', headers: { cookie: ownerCookie, 'content-type': 'application/json' }, body: JSON.stringify({ enabled: true }),
});
assert.equal(response.status, 200);
assert.equal((await response.json()).showPrivateJournal, true);
assert.match(ownerHtml, /id="privateJournalToggle"/);
```

- [ ] **Step 2: Verify the tests fail**

Run: `node --test tests/admin-integration.test.cjs tests/admin-pages.test.cjs`

Expected: FAIL with HTTP 404 and missing independent control.

- [ ] **Step 3: Implement only the dedicated publication control**

```js
app.patch('/api/owner/config/private-journal', adminAuth.requireOwner, async (req, res) => {
  if (typeof req.body?.enabled !== 'boolean') return res.status(400).json({ message: '公开状态无效' });
  const config = await businessConfigStore.update({ showPrivateJournal: req.body.enabled }, {
    actorId: req.auth.userId,
    reason: req.body.enabled ? '所有者公开方舟生命纪行' : '所有者停止公开方舟生命纪行',
  });
  res.json({ success: true, showPrivateJournal: config.showPrivateJournal });
});
```

Move the switch out of the price form. Display `未公开`/`已公开` and `立即公开`/`停止公开`. Disable during save, refresh state on success, restore server state and show error on failure. Keep price changes’ mandatory reason unchanged.

- [ ] **Step 4: Verify and commit**

Run: `node --test tests/admin-integration.test.cjs tests/admin-pages.test.cjs tests/business-config.test.cjs tests/arksoma-ui.test.mjs`

```bash
git add app.js admin-pro.html admin-pro.mjs admin-pro.css tests/admin-integration.test.cjs tests/admin-pages.test.cjs
git commit -m "fix: make private journal publication immediate"
```

### Task 3: Add rebuildable, explainable traffic intelligence

**Files:**
- Create: `lib/traffic-intelligence.js`, `scripts/rebuild-traffic-intelligence.cjs`, `tests/traffic-intelligence.test.cjs`
- Modify: `app.js`, `tests/admin-integration.test.cjs`

**Interfaces:**
- Produces: `accumulateTrafficSignal(signal, logEntry)`, `classifyTrafficSignals(signal)`, and `rebuildTrafficIntelligence({ logFiles, statsFile })`.
- Extends: owner-only `GET /api/owner/stats` with `{ periodData, summary, topIPs, pagination, blacklistCount }`.

- [ ] **Step 1: Write failing classification tests**

```js
assert.deepEqual(classifyTrafficSignals({ count: 18, maliciousCount: 16, automatedCount: 14, pageCount: 0, assetCount: 0, apiCount: 0, nonGetCount: 0 }), {
  kind: 'high_risk', label: '高风险扫描', reason: '恶意路径占比高，且自动化特征明显', rank: 4,
});
assert.equal(classifyTrafficSignals({ count: 6, maliciousCount: 0, automatedCount: 0, pageCount: 2, assetCount: 4, apiCount: 0, nonGetCount: 0 }).kind, 'likely_human');
```

- [ ] **Step 2: Verify the tests fail**

Run: `node --test tests/traffic-intelligence.test.cjs tests/admin-integration.test.cjs`

Expected: FAIL because the module and enriched API response do not exist.

- [ ] **Step 3: Implement signals, verdicts and API enrichment**

Persist `automatedCount`, `pageCount`, `assetCount`, `apiCount` and `nonGetCount` in `stats.ipStats[ip].signals`. The verdict order is high-risk if five or more malicious requests with 50% malicious ratio or 50+ requests; scan if any malicious request; automated if automated UA; likely human if a clean page sequence; otherwise information insufficient. The rebuild script streams `access*.log`, atomically writes the stats file and prints aggregate results only. Add `classification=all|likely_human|automated|scan|high_risk` to the owner API while mapping legacy `filter=blacklist` to `high_risk`.

- [ ] **Step 4: Verify and commit**

Run: `node --test tests/traffic-intelligence.test.cjs tests/admin-integration.test.cjs && node scripts/rebuild-traffic-intelligence.cjs --help`

```bash
git add lib/traffic-intelligence.js scripts/rebuild-traffic-intelligence.cjs app.js tests/traffic-intelligence.test.cjs tests/admin-integration.test.cjs
git commit -m "feat: add explainable owner traffic intelligence"
```

### Task 4: Build the responsive owner traffic workspace

**Files:**
- Modify: `admin-pro.html`, `admin-pro.mjs`, `admin-pro.css`
- Test: `tests/admin-pages.test.cjs`

**Interfaces:**
- Consumes: Task 3 statistics response.
- Produces: period/classification controls, two trend datasets and owner-only IP pagination.

- [ ] **Step 1: Write failing view tests**

```js
assert.match(ownerHtml, /id="trafficPeriod"/);
assert.match(ownerHtml, /id="trafficClassification"/);
assert.match(ownerHtml, /id="trafficIpsBody"/);
assert.match(script, /label:'独立 IP'/);
assert.match(script, /classification=/);
```

- [ ] **Step 2: Verify the test fails**

Run: `node --test tests/admin-pages.test.cjs`

Expected: FAIL because the old page has one chart and no IP intelligence controls.

- [ ] **Step 3: Implement minimal dark UI**

Add day/week/month and classification selectors. Display gold `访问次数` and muted-green `独立 IP` lines, four summary counts, and an IP table: `IP`, `地区`, `访问`, `最后访问`, `访问性质`, `判断依据`. Use full text labels alongside color. At narrow width stack selectors and retain a horizontally scrollable table without abbreviating IPs or reasons.

- [ ] **Step 4: Verify and commit**

Run: `node --test tests/admin-pages.test.cjs && npm test`

```bash
git add admin-pro.html admin-pro.mjs admin-pro.css tests/admin-pages.test.cjs
git commit -m "feat: present ARKSOMA traffic and IP intelligence"
```

### Task 5: Generate, inspect and deploy

**Files:**
- Modify generated files only through: `scripts/update-period-window.js`
- Verify: `index.html`, current period pages, production `/ubuntu/wascell`, PM2 `wascell-website`

- [ ] **Step 1: Generate and run the full regression suite**

Run: `npm run periods:dry-run && npm run periods:update && git diff --check && npm test`

Expected: generated pages include the Day 2 caption, Day 5 incense image and reference-path notice; all tests pass.

- [ ] **Step 2: Inspect responsive public and owner views**

Use the selected in-app browser at 390 px and 1024 px. Confirm that journal stays absent while disabled, appears after owner publication, and that IP/risk data never appears on public or sales pages.

- [ ] **Step 3: Deploy only this application and rebuild signals**

```bash
./deploy.sh
cd /ubuntu/wascell
node scripts/rebuild-traffic-intelligence.cjs --log-dir /ubuntu/wascell --stats-file /ubuntu/wascell/stats.json
pm2 status wascell-website
```

Expected: only `wascell-website` restarts, rebuild prints aggregate counts only, and HAProxy/Nginx are untouched.

- [ ] **Step 4: Verify live behavior**

Check the public catalog, five-day live path, owner journal toggle, owner stats response and PM2 process state. Record the deployed commit and any remaining limitation.
