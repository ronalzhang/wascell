export function validateAdvisorData(data) {
    if (!data.name?.trim()) {
        return { valid: false, field: 'name', message: '请填写您的姓名' };
    }
    if (!data.contact?.trim() && !data.email?.trim()) {
        return {
            valid: false,
            field: 'contact',
            message: '请填写微信、手机或邮箱中的至少一项',
        };
    }
    return { valid: true };
}

export function createSubmissionKey(storage, periodId) {
    const storageKey = `arksoma-advisor-key-${periodId || 'unknown'}`;
    const existing = storage?.getItem(storageKey);
    if (existing) return existing;
    const nonce = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const value = `arksoma-${periodId || 'unknown'}-${nonce}`;
    storage?.setItem(storageKey, value);
    return value;
}

export function buildAdvisorFormData(data, files = [], submissionKey) {
    const form = new FormData();
    form.set('submissionKey', submissionKey);
    ['periodId', 'periodLabel', 'name', 'contact', 'email', 'company', 'note', 'sourcePage'].forEach((key) => form.set(key, data[key] || ''));
    files.forEach((file) => form.append('attachments', file, file.name));
    return form;
}

function setBodyLock(locked) {
    document.body.classList.toggle('is-locked', locked);
}

function initPeriodSelector() {
    const trigger = document.querySelector('#periodTrigger');
    const dropdown = document.querySelector('#periodDropdown');
    if (!trigger || !dropdown) return;

    const close = () => {
        dropdown.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
    };

    trigger.addEventListener('click', (event) => {
        event.stopPropagation();
        const opening = dropdown.hidden;
        dropdown.hidden = !opening;
        trigger.setAttribute('aria-expanded', String(opening));
    });
    document.addEventListener('click', (event) => {
        if (!dropdown.contains(event.target)) close();
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !dropdown.hidden) {
            close();
            trigger.focus();
        }
    });
}

function initOriginMenu() {
    const trigger = document.querySelector('#originTrigger');
    const menu = document.querySelector('#originMenu');
    if (!trigger || !menu) return;

    const close = ({ restoreFocus = true } = {}) => {
        menu.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
        setBodyLock(false);
        if (restoreFocus) trigger.focus();
    };
    const open = () => {
        menu.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        setBodyLock(true);
        menu.querySelector('[data-close-menu]')?.focus();
    };

    trigger.addEventListener('click', open);
    menu.querySelectorAll('[data-close-menu]').forEach((button) => {
        button.addEventListener('click', () => close());
    });
    menu.querySelectorAll('[data-menu-link]').forEach((link) => {
        link.addEventListener('click', () => close({ restoreFocus: false }));
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !menu.hidden) close();
    });

    window.setTimeout(() => trigger.classList.add('is-awake'), 1200);
    window.setTimeout(() => trigger.classList.remove('is-awake'), 5200);
}

function initAdvisorDialog() {
    const dialog = document.querySelector('#advisorDialog');
    const form = document.querySelector('#advisorForm');
    const status = document.querySelector('#advisorStatus');
    if (!dialog || !form || !status) return;

    const open = () => {
        if (typeof dialog.showModal === 'function') dialog.showModal();
        else dialog.setAttribute('open', '');
        form.elements.name?.focus();
    };
    const close = () => {
        if (typeof dialog.close === 'function') dialog.close();
        else dialog.removeAttribute('open');
        status.textContent = '';
    };

    document.querySelectorAll('[data-open-advisor]').forEach((button) => {
        button.addEventListener('click', open);
    });
    dialog.querySelector('[data-close-advisor]')?.addEventListener('click', close);
    dialog.addEventListener('click', (event) => {
        if (event.target === dialog) close();
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const values = Object.fromEntries(new FormData(form).entries());
        const files = [...(form.elements.attachments?.files || [])];
        const data = { ...values, sourcePage: window.location.pathname };
        const validation = validateAdvisorData(data);
        if (!validation.valid) {
            status.textContent = validation.message;
            form.elements[validation.field]?.focus();
            return;
        }

        const submit = form.querySelector('[type="submit"]');
        const key = createSubmissionKey(window.sessionStorage, data.periodId);
        submit.disabled = true;
        status.textContent = '正在安全提交申请与附件…';
        try {
            const response = await fetch('/api/advisor-applications', { method: 'POST', body: buildAdvisorFormData(data, files, key) });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || '提交失败，请稍后重试');
            status.textContent = `申请已提交 · ${result.orderId}。私人顾问将与您联系。`;
            form.reset();
            window.sessionStorage.removeItem(`arksoma-advisor-key-${data.periodId || 'unknown'}`);
            submit.textContent = '申请已送达';
        } catch (error) {
            status.textContent = error.message;
            submit.disabled = false;
        }
    });
}

async function initPublicCatalog() {
    try {
        const response = await fetch('/api/public/catalog');
        if (!response.ok) return;
        const catalog = await response.json();
        const special = document.body.classList.contains('period-special');
        document.querySelectorAll('[data-catalog-price]').forEach((node) => {
            node.textContent = `RMB ${Number(special ? catalog.filialPrice : catalog.fullPlanPrice).toLocaleString('en-US')}`;
        });
        document.querySelectorAll('[data-membership-fee]').forEach((node) => {
            node.textContent = `RMB ${Number(catalog.membershipFee).toLocaleString('en-US')} / 年`;
        });
    } catch { /* 静态值继续作为可靠回退 */ }
}

function initRevealMotion() {
    const targets = [...document.querySelectorAll('[data-reveal]')];
    if (!('IntersectionObserver' in window)) {
        targets.forEach((target) => target.classList.add('is-visible'));
        return;
    }

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
        });
    }, { threshold: 0.18 });
    targets.forEach((target) => observer.observe(target));
}

export function initArksomaPage() {
    initPeriodSelector();
    initOriginMenu();
    initAdvisorDialog();
    initRevealMotion();
    initPublicCatalog();
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initArksomaPage, { once: true });
    } else {
        initArksomaPage();
    }
}
