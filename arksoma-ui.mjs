const ADVISOR_EMAIL = 'vip@wascell.com';

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

export function buildAdvisorMailto(data) {
    const subject = `ARKSOMA 方舟计划｜${data.period || '待确认期次'}｜私人顾问申请`;
    const body = [
        '您好，我希望申请 ARKSOMA 方舟计划私人顾问服务。',
        '',
        `期次：${data.period || '待确认'}`,
        `姓名：${data.name || ''}`,
        `微信/手机：${data.contact || ''}`,
        `邮箱：${data.email || ''}`,
        `企业/身份：${data.company || ''}`,
        `希望了解：${data.note || ''}`,
        `附件提示：${data.reportName || '请在邮件客户端添加半年内体检报告（可稍后提供）'}`,
        '',
        '此邮件由 ARKSOMA 私人顾问申请页面生成。',
    ].join('\n');

    return `mailto:${ADVISOR_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
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

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        const values = Object.fromEntries(new FormData(form).entries());
        const report = form.elements.report?.files?.[0];
        const data = { ...values, reportName: report?.name || '' };
        const validation = validateAdvisorData(data);
        if (!validation.valid) {
            status.textContent = validation.message;
            form.elements[validation.field]?.focus();
            return;
        }

        status.textContent = '正在打开邮件客户端，请在发送前确认内容并添加附件。';
        window.location.href = buildAdvisorMailto(data);
    });
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
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initArksomaPage, { once: true });
    } else {
        initArksomaPage();
    }
}
