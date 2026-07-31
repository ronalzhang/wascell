import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAdvisorMailto, validateAdvisorData } from '../arksoma-ui.mjs';

test('buildAdvisorMailto generates a complete private-advisor draft without file contents', () => {
    const href = buildAdvisorMailto({
        period: '2026·八月首期',
        name: '方舟客户',
        contact: 'wx_arksoma',
        email: 'client@example.com',
        company: '示例控股',
        note: '希望先了解细胞采集流程',
        reportName: 'health-report.pdf',
    });

    assert.match(href, /^mailto:vip@wascell\.com\?/);

    const decoded = decodeURIComponent(href);
    assert.match(decoded, /ARKSOMA 方舟计划｜2026·八月首期｜私人顾问申请/);
    assert.match(decoded, /姓名：方舟客户/);
    assert.match(decoded, /微信\/手机：wx_arksoma/);
    assert.match(decoded, /企业\/身份：示例控股/);
    assert.match(decoded, /附件提示：health-report\.pdf/);
    assert.doesNotMatch(decoded, /data:application\/pdf/);
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
