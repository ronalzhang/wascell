import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAdvisorFormData, createSubmissionKey, validateAdvisorData } from '../arksoma-ui.mjs';

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
