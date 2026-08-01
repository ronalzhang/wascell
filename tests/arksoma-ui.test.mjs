import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildAdvisorFormData,
    createSubmissionKey,
    focusWithoutScroll,
    initRevealMotion,
    normalizePublicCatalog,
    servicePeriodLabel,
    validateAdvisorData,
    validateAdvisorFiles,
} from '../arksoma-ui.mjs';

function createClassList() {
    const values = new Set();
    return {
        add: (...names) => names.forEach((name) => values.add(name)),
        remove: (...names) => names.forEach((name) => values.delete(name)),
        has: (name) => values.has(name),
    };
}

test('servicePeriodLabel frames the selected period as one cell service', () => {
    assert.equal(servicePeriodLabel('2026·九月首期'), '单次细胞服务 · 九月首期');
    assert.equal(servicePeriodLabel('九月二期'), '单次细胞服务 · 九月二期');
});

test('focusWithoutScroll keeps the advisor heading in view on open', () => {
    let options;
    focusWithoutScroll({ focus: (value) => { options = value; } });
    assert.deepEqual(options, { preventScroll: true });
});

test('buildAdvisorFormData creates one backend application with period and attachment', () => {
    const report = new File(['medical'], 'health-report.pdf', { type: 'application/pdf' });
    const form = buildAdvisorFormData({
        periodId: '20260801',
        periodLabel: '2026·八月首期',
        name: '方舟客户',
        contact: 'wx_arksoma',
        email: 'client@example.com',
        company: '示例控股',
        note: '希望先了解细胞采集流程',
    }, [report], 'submission-test-001');
    assert.equal(form.get('submissionKey'), 'submission-test-001');
    assert.equal(form.get('periodId'), '20260801');
    assert.equal(form.get('periodLabel'), '2026·八月首期');
    assert.equal(form.get('name'), '方舟客户');
    assert.equal(form.getAll('attachments')[0].name, 'health-report.pdf');
});

test('createSubmissionKey remains stable in session storage', () => {
    const memory = new Map();
    const storage = { getItem: (key) => memory.get(key) || null, setItem: (key, value) => memory.set(key, value) };
    const first = createSubmissionKey(storage, '20260801');
    const second = createSubmissionKey(storage, '20260801');
    assert.equal(first, second);
    assert.match(first, /^arksoma-20260801-/);
});

test('validateAdvisorData requires name and a direct contact method', () => {
    assert.deepEqual(validateAdvisorData({ name: '', contact: '', email: '' }), {
        valid: false,
        field: 'name',
        message: '请填写您的姓名',
    });

    assert.deepEqual(validateAdvisorData({ name: '方舟客户', contact: '', email: '' }), {
        valid: false,
        field: 'contact',
        message: '请填写微信、手机或邮箱中的至少一项',
    });

    assert.equal(validateAdvisorData({ name: '方舟客户', contact: 'wx_arksoma', email: '' }).valid, true);
});

test('validateAdvisorFiles enforces the production attachment contract', () => {
    const base = { name: 'report.pdf', type: 'application/pdf', size: 1024 };
    assert.equal(validateAdvisorFiles([base]).valid, true);
    assert.equal(validateAdvisorFiles(Array.from({ length: 4 }, () => base)).message, '最多选择 3 个附件');
    assert.equal(validateAdvisorFiles([{ ...base, name: 'report.exe', type: 'application/octet-stream' }]).message, '仅支持 PDF、JPG、JPEG、PNG 文件');
    assert.equal(validateAdvisorFiles([{ ...base, size: 11 * 1024 * 1024 }]).message, '单个附件不能超过 10 MB');
    assert.equal(validateAdvisorFiles([
        { ...base, name: 'a.pdf', size: 10 * 1024 * 1024 },
        { ...base, name: 'b.pdf', size: 10 * 1024 * 1024 },
        { ...base, name: 'c.pdf', size: 1 },
    ]).message, '附件总大小不能超过 20 MB');
});

test('normalizePublicCatalog keeps only public commercial fields', () => {
    assert.deepEqual(normalizePublicCatalog({
        fullPlanPrice: 600000,
        membershipFee: 21800,
        membershipMonths: 12,
        showPrice: true,
        publicMembershipCopy: '首个十二个月已包含',
        standardCapacity: 99,
        filialPeriod: { price: 570000, familyGroups: 3, publicCopy: '三组家庭席位' },
    }), {
        fullPlanPrice: 600000,
        membershipFee: 21800,
        membershipMonths: 12,
        showPrice: true,
        publicMembershipCopy: '首个十二个月已包含',
        filialPeriod: { price: 570000, familyGroups: 3, publicCopy: '三组家庭席位' },
    });
});

test('initRevealMotion reveals content and journey cards once', () => {
    const content = { classList: createClassList() };
    const card = { classList: createClassList() };
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
    assert.equal(card.classList.has('is-motion-pending'), true);
    callback([{ target: content, isIntersecting: true }, { target: card, isIntersecting: true }]);
    assert.equal(content.classList.has('is-visible'), true);
    assert.equal(card.classList.has('is-in-view'), true);
    assert.equal(card.classList.has('is-motion-pending'), false);
    assert.deepEqual(unobserved, [content, card]);
});

test('initRevealMotion immediately reveals every target without motion support', () => {
    const content = { classList: createClassList() };
    const card = { classList: createClassList() };
    const root = {
        querySelectorAll: (selector) => selector === '[data-reveal]' ? [content] : [card],
    };

    assert.equal(initRevealMotion({ root, reducedMotion: true, Observer: null }), null);
    assert.equal(content.classList.has('is-visible'), true);
    assert.equal(card.classList.has('is-in-view'), true);
    assert.equal(card.classList.has('is-motion-pending'), false);
});
