# ARKSOMA Backoffice Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the deployed ARKSOMA backoffice with separate owner and sales entrances, per-sales customer isolation, membership continuity, commercial configuration, a sales knowledge base, and owner-only staff management.

**Architecture:** Keep the current Express server and private atomic JSON storage, but split new responsibilities into focused stores and pure services. `/admin-pro` authenticates the owner with the existing password-only flow; `/admin` authenticates sales with username and password. Every protected API authorizes a signed principal on the server and filters customer access by `assignedSalesId`.

**Tech Stack:** Node.js, Express 4, native `node:crypto` scrypt/HMAC, atomic JSON/JSONL files, HTML/CSS/ES modules, `node:test`.

## Global Constraints

- `/admin-pro` is owner-only and shows only a password field.
- `/admin` is sales-only and shows only username and password fields.
- The two login pages never link to or mention each other.
- Sales see only Customer Management and Sales Knowledge, and only their assigned customers.
- Only the owner can change assignment, commercial configuration, staff accounts, or membership dates.
- Owner membership gifts/adjustments require reason, before date, after date, actor, and timestamp.
- Attachments remain outside the static root and every download is authorized and audited.
- Preserve the approved black/gold visual system.
- Do not change production until local tests and browser QA pass.

---

### Task 1: Role-aware sessions and staff accounts

**Files:**
- Create: `lib/staff-store.js`
- Modify: `lib/admin-auth.js`
- Create: `tests/staff-auth.test.cjs`
- Modify: `app.js`

**Interfaces:**
- Produces: `createStaffStore({ dataDir, now })` with `createSales`, `verifySales`, `listSales`, `resetPassword`, `changeOwnPassword`, `setActive`, and `getSessionVersion`.
- Produces: `createAdminAuth({ ownerPassword, secret, staffStore, ... })` with `ownerLogin`, `salesLogin`, `logout`, `session`, `requireOwner`, and `requireSalesOrOwner`.
- Session principal: `{ role: 'owner'|'sales', userId: 'owner'|string, username?: string, sessionVersion: number }`.

- [ ] **Step 1: Write failing staff and session tests**

```js
test('owner login requires no username and issues an owner principal', async () => {
  const response = await request('/api/owner/login', { password: 'owner-secret' });
  assert.equal(response.status, 200);
  assert.equal((await session(response.cookie)).principal.role, 'owner');
});

test('sales login verifies a salted hash and issues a sales principal', async () => {
  const sales = await staff.createSales({ username: 'lina', displayName: 'Lina', password: 'initial-pass' });
  const principal = await staff.verifySales('lina', 'initial-pass');
  assert.equal(principal.userId, sales.id);
  assert.equal(principal.role, 'sales');
});
```

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `node --test tests/staff-auth.test.cjs`

Expected: FAIL because `lib/staff-store.js` and role-aware auth methods do not exist.

- [ ] **Step 3: Implement atomic staff storage and scrypt hashes**

Store only `{ id, username, displayName, passwordHash, passwordSalt, active, sessionVersion, createdAt, updatedAt }`. Normalize usernames to lowercase, enforce `^[a-z0-9._-]{3,40}$`, hash with `crypto.scrypt`, and use `timingSafeEqual`. Increment `sessionVersion` on reset or disable.

`changeOwnPassword(userId, currentPassword, nextPassword)` must verify the current hash, reject weak or reused values, replace salt/hash, and increment `sessionVersion` so all existing sessions are invalidated.

- [ ] **Step 4: Extend signed sessions with principals**

Use separate endpoints:

```js
app.post('/api/owner/login', loginLimiter, adminAuth.ownerLogin);
app.post('/api/sales/login', loginLimiter, adminAuth.salesLogin);
app.post('/api/session/logout', adminAuth.logout);
app.get('/api/session', adminAuth.session);
```

Return the same generic `账号或密码错误` for all sales login failures. Limit repeated failures per IP and login name without exposing account existence.

- [ ] **Step 5: Run focused and existing tests**

Run: `node --test tests/staff-auth.test.cjs tests/admin-auth.test.cjs tests/admin-integration.test.cjs`

Expected: PASS; update old tests to use `/api/owner/login` and principal-aware sessions.

- [ ] **Step 6: Commit**

```bash
git add lib/staff-store.js lib/admin-auth.js app.js tests/staff-auth.test.cjs tests/admin-auth.test.cjs tests/admin-integration.test.cjs
git commit -m "feat: separate owner and sales authentication"
```

### Task 2: Commercial configuration, audit log, and public catalog

**Files:**
- Create: `lib/business-config-store.js`
- Create: `lib/audit-log.js`
- Create: `tests/business-config.test.cjs`
- Modify: `app.js`

**Interfaces:**
- Produces: `createBusinessConfigStore({ dataDir, now, auditLog })` with `getPrivate`, `getPublic`, `update`.
- Produces: `createAuditLog({ dataDir, now })` with `append(event)` and `list(filters)`.
- Public configuration shape: `{ fullPlanPrice, membershipFee, membershipMonths, showPrice, publicMembershipCopy, filialPeriod: { price, familyGroups, publicCopy } }`.

- [ ] **Step 1: Write failing configuration tests**

```js
test('public config excludes internal capacity and audit fields', async () => {
  const publicConfig = await store.getPublic();
  assert.equal(publicConfig.fullPlanPrice, 580000);
  assert.equal(publicConfig.membershipFee, 19800);
  assert.equal('standardCapacity' in publicConfig, false);
});

test('owner update records old and new values', async () => {
  await store.update({ membershipFee: 21800 }, { actorId: 'owner', reason: '年度调整' });
  assert.deepEqual(events[0].changes.membershipFee, { before: 19800, after: 21800 });
});
```

- [ ] **Step 2: Run the tests and confirm RED**

Run: `node --test tests/business-config.test.cjs`

Expected: FAIL because the stores do not exist.

- [ ] **Step 3: Implement defaults and validation**

Defaults are `580000`, `19800`, `12`, standard capacity `5`, filial price `560000`, filial groups `3`, filial maximum guests `6`, reminders `[60,30,7]`. Reject negative prices, invalid month counts, filial guests below group count, and empty modification reasons.

- [ ] **Step 4: Register owner and public APIs**

```js
app.get('/api/public/catalog', async (_req, res) => res.json(await configStore.getPublic()));
app.get('/api/owner/config', adminAuth.requireOwner, ownerConfigHandler);
app.patch('/api/owner/config', adminAuth.requireOwner, ownerConfigUpdateHandler);
```

Sales requests to `/api/owner/config` must return 403.

- [ ] **Step 5: Run tests and commit**

Run: `node --test tests/business-config.test.cjs tests/admin-integration.test.cjs`

```bash
git add lib/business-config-store.js lib/audit-log.js app.js tests/business-config.test.cjs tests/admin-integration.test.cjs
git commit -m "feat: add audited commercial configuration"
```

### Task 3: Customer ownership, membership ledger, and internal bookings

**Files:**
- Create: `lib/membership-service.js`
- Modify: `lib/advisor-store.js`
- Create: `tests/membership-service.test.cjs`
- Create: `tests/customer-access.test.cjs`
- Modify: `app.js`

**Interfaces:**
- Produces: `membershipStatus(expiresAt, now)`.
- Produces: `applyMembershipEvent(customer, event, now)` for `plan_confirmed`, `fee_renewed`, and `owner_adjusted`.
- Extends advisor store with `assignSales`, `listForPrincipal`, `getForPrincipal`, `createInternalBooking`, `updateInternalBooking`, and `recordMembershipEvent`.

- [ ] **Step 1: Write failing membership rules**

```js
test('active plan confirmation extends from the existing expiry', () => {
  const customer = { membershipExpiresAt: '2027-01-15T00:00:00.000Z', membershipEvents: [] };
  const updated = applyMembershipEvent(customer, { type: 'plan_confirmed', priceSnapshot: 580000 }, new Date('2026-10-01T00:00:00Z'));
  assert.equal(updated.membershipExpiresAt, '2028-01-15T00:00:00.000Z');
});

test('expired customer cannot renew with fee only', () => {
  assert.throws(() => applyMembershipEvent(expired, { type: 'fee_renewed', priceSnapshot: 19800 }, now), /已到期/);
});
```

- [ ] **Step 2: Write failing ownership tests**

```js
test('sales lists only assigned customers', async () => {
  const result = await store.listForPrincipal({ role: 'sales', userId: 'sales-a' });
  assert.deepEqual(result.items.map(x => x.assignedSalesId), ['sales-a']);
});

test('sales cannot adjust membership dates', async () => {
  const response = await salesPatch('/api/owner/customers/ARK-1/membership', { expiresAt: '2028-01-01', reason: '赠送' });
  assert.equal(response.status, 403);
});
```

- [ ] **Step 3: Run focused tests and confirm RED**

Run: `node --test tests/membership-service.test.cjs tests/customer-access.test.cjs`

- [ ] **Step 4: Implement immutable membership events and principal filtering**

Owner adjustments require `{ expiresAt, reason }` and append `{ type:'owner_adjusted', beforeExpiresAt, afterExpiresAt, reason, actorId, createdAt }`. Sales can create internal bookings only for active assigned customers. A confirmed internal booking records the configured price snapshot and triggers the membership event; creating a draft does not.

- [ ] **Step 5: Add role-scoped routes**

Owner routes use `/api/owner/customers`; sales routes use `/api/sales/customers`. Both reuse store methods, but sales handlers always pass the session principal. Attachment download handlers call `getForPrincipal` before resolving a path.

- [ ] **Step 6: Run focused, integration, and attachment tests**

Run: `node --test tests/membership-service.test.cjs tests/customer-access.test.cjs tests/advisor-store.test.cjs tests/admin-integration.test.cjs`

Expected: PASS, including direct cross-sales IDs and attachment URLs returning 403.

- [ ] **Step 7: Commit**

```bash
git add lib/membership-service.js lib/advisor-store.js app.js tests/membership-service.test.cjs tests/customer-access.test.cjs tests/advisor-store.test.cjs tests/admin-integration.test.cjs
git commit -m "feat: add membership continuity and customer ownership"
```

### Task 4: Sales knowledge base and training modes

**Files:**
- Create: `lib/knowledge-store.js`
- Create: `data/knowledge-seed.zh-CN.json`
- Create: `tests/knowledge-store.test.cjs`
- Modify: `app.js`

**Interfaces:**
- Produces: `createKnowledgeStore({ dataDir, seedFile, now, auditLog })` with `listPublished`, `listAll`, `create`, `update`, `reorder`, and `setPublished`.
- Knowledge item fields: `id, stage, order, question, shortAnswer, fullAnswer, mustSay[], forbidden[], keywords[], sources[], status, createdAt, updatedAt`.

- [ ] **Step 1: Write failing visibility and ordering tests**

```js
test('sales receives only published answers in journey order', async () => {
  const items = await store.listPublished();
  assert.ok(items.every(item => item.status === 'published'));
  assert.deepEqual(items, [...items].sort((a,b) => a.stage - b.stage || a.order - b.order));
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `node --test tests/knowledge-store.test.cjs`

- [ ] **Step 3: Add at least 28 complete Chinese seed answers**

Cover all twelve journey stages from the approved specification. Medical acceptance answers must include authoritative source URLs, a checked date, “可能无法接诊”, and forbidden guarantees such as “交钱就能安排” and “会员一定能接诊”.

- [ ] **Step 4: Implement owner CRUD and sales read APIs**

Owner endpoints live under `/api/owner/knowledge`; sales read endpoint is `/api/sales/knowledge`. Search accepts `query`, `stage`, and `mode=journey|quick|training`; training returns question-first data but never hides the answer from API authorization checks.

- [ ] **Step 5: Run tests and commit**

Run: `node --test tests/knowledge-store.test.cjs tests/customer-access.test.cjs`

```bash
git add lib/knowledge-store.js data/knowledge-seed.zh-CN.json app.js tests/knowledge-store.test.cjs
git commit -m "feat: add sales knowledge and training content"
```

### Task 5: Owner and sales interfaces

**Files:**
- Modify: `admin-pro.html`
- Modify: `admin-pro.css`
- Modify: `admin-pro.mjs`
- Create: `admin.html`
- Create: `admin.css`
- Create: `admin.mjs`
- Create: `tests/admin-pages.test.cjs`
- Modify: `app.js`

**Interfaces:**
- Owner UI consumes `/api/owner/*` and exposes five modules.
- Sales UI consumes `/api/sales/*` and exposes exactly Customer Management and Sales Knowledge.

- [ ] **Step 1: Write failing route and leak tests**

```js
test('/admin-pro is owner-only copy and /admin is sales-only copy', async () => {
  const owner = await get('/admin-pro');
  const sales = await get('/admin');
  assert.doesNotMatch(owner.text, /销售登录|用户名|\/admin\b/);
  assert.doesNotMatch(sales.text, /管理员|admin-pro|访问统计|商业配置|团队权限/);
  assert.match(sales.text, /用户名/);
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `node --test tests/admin-pages.test.cjs`

- [ ] **Step 3: Extend owner UI**

Add Customer, Knowledge, Commercial Configuration, and Team Permission views without changing the approved black/gold sidebar proportions. Customer drawer includes assignment, membership ledger, owner-only gift/adjust action, and internal bookings.

- [ ] **Step 4: Build the separate sales UI**

Reuse design tokens but not owner navigation markup. Customer view lists assigned customers only; Knowledge view supports journey, quick search, copy short answer, and reveal-answer training. No owner endpoints or labels appear in the HTML or module source.

- [ ] **Step 5: Run static and automated tests**

Run: `node --check admin-pro.mjs && node --check admin.mjs && npm test`

- [ ] **Step 6: Browser QA at owner and sales roles**

Verify both entrances at 1366×1024 and 1024×1366. Confirm navigation counts, customer assignment isolation, attachment authorization, internal booking, owner membership gift, knowledge editing, training reveal, password reset, logout, keyboard focus, no horizontal overflow, and zero console errors.

- [ ] **Step 7: Commit**

```bash
git add admin-pro.html admin-pro.css admin-pro.mjs admin.html admin.css admin.mjs app.js tests/admin-pages.test.cjs
git commit -m "feat: complete owner and sales backoffice interfaces"
```

### Task 6: Backoffice security and production verification

**Files:**
- Modify: `tests/verify-risk-fixes.sh`
- Create: `design-qa-admin-platform.md`

**Interfaces:**
- Consumes all backoffice tasks.
- Produces a deployable build and production evidence.

- [ ] **Step 1: Run the complete local gate**

Run: `npm test && bash tests/verify-risk-fixes.sh && node --check app.js && node --check admin-pro.mjs && node --check admin.mjs && npm audit --omit=dev --audit-level=low --registry=https://registry.npmjs.org && git diff --check`

Expected: zero failures and zero production dependency vulnerabilities.

- [ ] **Step 2: Record design QA**

Compare owner UI with the approved black/gold admin reference at the same viewport. Record owner/sales login separation, role navigation, responsive results, and console results in `design-qa-admin-platform.md`.

- [ ] **Step 3: Deploy only after frontend and automation plans also pass**

Use the repository's verified remote-sync path. Preserve the existing owner password, create no production sales accounts, keep all private JSON/upload paths under the current VPS private runtime directory, and restart only `wascell-website`.

- [ ] **Step 4: Verify production**

Check `/admin-pro` 200 with owner-only copy, `/admin` 200 with sales-only copy, unauthenticated APIs 401, sales-to-owner APIs 403, owner login 200, PM2 online, clean Git state, private directory modes 700/600, error log zero, and public homepage 200.

- [ ] **Step 5: Commit QA evidence**

```bash
git add tests/verify-risk-fixes.sh design-qa-admin-platform.md
git commit -m "test: verify ARKSOMA backoffice platform"
```
