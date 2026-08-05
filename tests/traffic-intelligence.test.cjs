const test = require('node:test');
const assert = require('node:assert/strict');

const {
    accumulateTrafficSignal,
    classifyTrafficSignals,
} = require('../lib/traffic-intelligence');

test('classifies a hostile automated pattern as a high risk scan with an explanation', () => {
    assert.deepEqual(
        classifyTrafficSignals({
            count: 18,
            maliciousCount: 16,
            automatedCount: 14,
            pageCount: 0,
            assetCount: 0,
            apiCount: 0,
            nonGetCount: 0,
        }),
        {
            kind: 'high_risk',
            label: '高风险扫描',
            reason: '恶意路径占比高，且自动化特征明显',
            rank: 4,
        },
    );
});

test('classifies a clean browser navigation sequence as a possible normal visit', () => {
    const signal = accumulateTrafficSignal({}, {
        method: 'GET',
        url: '/',
        userAgent: 'Mozilla/5.0 Safari/605.1.15',
        isMalicious: false,
    });
    const enriched = accumulateTrafficSignal(signal, {
        method: 'GET',
        url: '/imgs/arksoma/hero-longevity-stone.webp',
        userAgent: 'Mozilla/5.0 Safari/605.1.15',
        isMalicious: false,
    });

    assert.deepEqual(enriched, {
        automatedCount: 0,
        pageCount: 1,
        assetCount: 1,
        apiCount: 0,
        nonGetCount: 0,
    });
    assert.equal(classifyTrafficSignals({ count: 2, maliciousCount: 0, ...enriched }).kind, 'likely_human');
});
