const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('owner script authenticates only through owner endpoints and exposes the owner views', async () => {
    const script = await fs.readFile(path.join(root, 'admin-pro.mjs'), 'utf8');
    const page = await fs.readFile(path.join(root, 'admin-pro.html'), 'utf8');
    assert.match(script, /\/api\/owner\/login/);
    assert.doesNotMatch(script, /\/api\/sales\/login/);
    for (const route of ['/api/owner/customers', '/api/owner/knowledge', '/api/owner/config', '/api/owner/staff']) {
        assert.match(script, new RegExp(route.replaceAll('/', '\\/')));
    }
    assert.match(script, /autocomplete="new-password"/);
    assert.match(script, /showPrivateJournal/);
    assert.match(script, /\/api\/owner\/config\/private-journal/);
    assert.match(page, /id="privateJournalToggle"/);
    assert.match(page, /id="privateJournalStatus"/);
    for (const view of ['stats', 'customers', 'knowledge', 'prices', 'config', 'staff']) {
        assert.match(page, new RegExp(`data-view="${view}"`));
        assert.match(page, new RegExp(`id="${view}View"`));
    }
});

test('price updates preserve independent currency quotes and publication flags without conversion', async () => {
    const { buildProgramPriceUpdate } = await import('../admin-program-prices.mjs');
    const pricing = {
        revision: 8,
        show: false,
        currency: 'USD',
        quotes: {
            periodontal: { show: true, amounts: {
                JPY: { min: '3300000', max: '', tax: 'inclusive' },
                USD: { min: '120.50', max: '160.75', tax: 'exclusive' },
                CNY: { min: '', max: '', tax: 'unspecified' }
            } },
            'hair-regeneration': { show: false, amounts: {
                JPY: { min: '4600000', max: '7000000', tax: 'exclusive' },
                CNY: { min: '1040.06', max: '', tax: 'unspecified' }
            } }
        }
    };

    assert.deepEqual(buildProgramPriceUpdate(pricing, ' 核对报价 '), {
        reason: '核对报价',
        pricing: {
            revision: 8,
            show: false,
            currency: 'USD',
            quotes: {
                periodontal: { show: true, amounts: {
                    JPY: { min: 3300000, tax: 'inclusive' },
                    USD: { min: 120.5, max: 160.75, tax: 'exclusive' }
                } },
                'hair-regeneration': { show: false, amounts: {
                    JPY: { min: 4600000, max: 7000000, tax: 'exclusive' },
                    CNY: { min: 1040.06, tax: 'unspecified' }
                } }
            }
        }
    });
});

test('price validation identifies the project and amount field that needs correction', async () => {
    const { buildProgramPriceUpdate } = await import('../admin-program-prices.mjs');
    const cases = [
        ['JPY', '12.50', '', 'min'],
        ['JPY', '0', '', 'min'],
        ['USD', '12.001', '', 'min'],
        ['CNY', '100000000.01', '', 'min'],
        ['USD', '', '12', 'min'],
        ['CNY', '100', '99.99', 'max']
    ];
    for (const [currency, min, max, field] of cases) {
        const pricing = { revision: 2, show: true, currency, quotes: {
            second: { show: false, amounts: { [currency]: { min, max, tax: 'unspecified' } } }
        } };
        assert.throws(() => buildProgramPriceUpdate(pricing, '报价复核'), {
            programId: 'second', currency, field
        });
    }
    assert.throws(() => buildProgramPriceUpdate({ revision: 2, quotes: {} }, ' '), { field: 'reason' });
});

test('sales script authenticates through sales endpoint and has no owner API route', async () => {
    const script = await fs.readFile(path.join(root, 'admin.mjs'), 'utf8');
    assert.match(script, /\/api\/sales\/login/);
    assert.match(script, /\/api\/sales\/customers/);
    assert.match(script, /\/api\/sales\/knowledge/);
    assert.doesNotMatch(script, /\/api\/owner\//);
});

test('owner statistics page presents visits, unique IPs and explainable IP intelligence', async () => {
    const page = await fs.readFile(path.join(root, 'admin-pro.html'), 'utf8');
    const script = await fs.readFile(path.join(root, 'admin-pro.mjs'), 'utf8');

    assert.match(page, /id="trafficPeriod"/);
    assert.match(page, /id="trafficClassification"/);
    assert.match(page, /id="trafficIpsBody"/);
    assert.match(page, /访问性质/);
    assert.match(page, /判断依据/);
    assert.match(script, /label:'独立 IP'/);
    assert.match(script, /trafficClassification/);
});

test('initial anonymous visit stays quiet while a lost authenticated session is explained', async () => {
    const { sessionLoginMessage } = await import('../session-state.mjs');

    assert.equal(sessionLoginMessage(false), '');
    assert.equal(sessionLoginMessage(true), '会话已失效，请重新登录');

    for (const file of ['admin.mjs', 'admin-pro.mjs']) {
        const script = await fs.readFile(path.join(root, file), 'utf8');
        assert.match(script, /sessionEstablished/);
        assert.match(script, /sessionLoginMessage\(sessionEstablished\)/);
    }
});
