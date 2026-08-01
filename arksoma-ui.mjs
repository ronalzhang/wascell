const ALLOWED_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png']);
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_TOTAL_SIZE = 20 * 1024 * 1024;

export function validateAdvisorData(data) {
    if (!data.name?.trim()) return { valid: false, field: 'name', message: '请填写您的姓名' };
    if (!data.contact?.trim() && !data.email?.trim()) {
        return { valid: false, field: 'contact', message: '请填写微信、手机或邮箱中的至少一项' };
    }
    return { valid: true };
}

export function validateAdvisorFiles(files = []) {
    if (files.length > 3) return { valid: false, field: 'attachments', message: '最多选择 3 个附件' };
    if (files.some((file) => !ALLOWED_EXTENSIONS.has(String(file.name || '').toLowerCase().split('.').pop()))) {
        return { valid: false, field: 'attachments', message: '仅支持 PDF、JPG、JPEG、PNG 文件' };
    }
    if (files.some((file) => Number(file.size || 0) > MAX_FILE_SIZE)) {
        return { valid: false, field: 'attachments', message: '单个附件不能超过 10 MB' };
    }
    if (files.reduce((total, file) => total + Number(file.size || 0), 0) > MAX_TOTAL_SIZE) {
        return { valid: false, field: 'attachments', message: '附件总大小不能超过 20 MB' };
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
    ['periodId', 'periodLabel', 'name', 'contact', 'email', 'company', 'note', 'sourcePage']
        .forEach((key) => form.set(key, data[key] || ''));
    files.forEach((file) => form.append('attachments', file, file.name));
    return form;
}

function positiveNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
}

export function normalizePublicCatalog(raw = {}) {
    const fullPlanPrice = positiveNumber(raw.fullPlanPrice);
    const membershipFee = positiveNumber(raw.membershipFee);
    const membershipMonths = positiveNumber(raw.membershipMonths);
    const filialPrice = positiveNumber(raw.filialPeriod?.price);
    const familyGroups = positiveNumber(raw.filialPeriod?.familyGroups);
    if (!fullPlanPrice || !membershipFee || !membershipMonths || !filialPrice || !familyGroups) return null;
    return {
        fullPlanPrice,
        membershipFee,
        membershipMonths,
        showPrice: raw.showPrice !== false,
        publicMembershipCopy: String(raw.publicMembershipCopy || ''),
        filialPeriod: {
            price: filialPrice,
            familyGroups,
            publicCopy: String(raw.filialPeriod?.publicCopy || ''),
        },
    };
}

function priceLabel(value) {
    return `RMB ${Number(value).toLocaleString('en-US')}`;
}

export function applyPublicCatalog(root, catalog, periodType = 'standard') {
    if (!catalog) return;
    const filial = periodType === 'filial';
    const price = filial ? catalog.filialPeriod.price : catalog.fullPlanPrice;
    root.querySelectorAll('[data-catalog-price]').forEach((node) => {
        node.hidden = !catalog.showPrice;
        node.textContent = priceLabel(price);
    });
    root.querySelectorAll('[data-membership-fee]').forEach((node) => {
        node.textContent = `${priceLabel(catalog.membershipFee)} / 年`;
    });
    if (catalog.publicMembershipCopy) {
        root.querySelectorAll('[data-membership-copy]').forEach((node) => {
            node.textContent = catalog.publicMembershipCopy;
        });
    }
}

function setBodyLock(locked) {
    document.body.classList.toggle('is-locked', locked);
}

function initOverlay({ triggerSelector, overlaySelector, closeSelector }) {
    const trigger = document.querySelector(triggerSelector);
    const overlay = document.querySelector(overlaySelector);
    if (!trigger || !overlay) return null;
    const close = ({ restoreFocus = true } = {}) => {
        overlay.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
        setBodyLock(false);
        if (restoreFocus) trigger.focus();
    };
    const open = () => {
        overlay.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        setBodyLock(true);
        overlay.querySelector('.text-close')?.focus();
    };
    trigger.addEventListener('click', open);
    overlay.querySelectorAll(closeSelector).forEach((control) => control.addEventListener('click', () => close({
        restoreFocus: control.tagName !== 'A',
    })));
    return { overlay, trigger, open, close };
}

function renderFileList(container, files) {
    container.replaceChildren();
    if (!files.length) {
        container.textContent = '尚未选择附件';
        return;
    }
    files.forEach((file) => {
        const row = document.createElement('span');
        const name = document.createElement('b');
        const size = document.createElement('small');
        name.textContent = file.name;
        size.textContent = `${(file.size / 1024 / 1024).toFixed(1)} MB`;
        row.append(name, size);
        container.append(row);
    });
}

function initAdvisorDialog() {
    const dialog = document.querySelector('#advisorDialog');
    const form = document.querySelector('#advisorForm');
    const formView = document.querySelector('#advisorFormView');
    const successView = document.querySelector('#advisorSuccess');
    const status = document.querySelector('#advisorStatus');
    const fileInput = document.querySelector('#advisorFiles');
    const fileList = document.querySelector('#fileList');
    if (!dialog || !form || !formView || !successView || !status || !fileInput || !fileList) return;

    const close = () => {
        if (typeof dialog.close === 'function') dialog.close();
        else dialog.removeAttribute('open');
    };
    const open = () => {
        formView.hidden = false;
        successView.hidden = true;
        status.textContent = '';
        if (typeof dialog.showModal === 'function') dialog.showModal();
        else dialog.setAttribute('open', '');
        form.elements.name?.focus();
    };
    document.querySelectorAll('[data-open-advisor]').forEach((button) => button.addEventListener('click', open));
    dialog.querySelectorAll('[data-close-advisor], [data-close-success]').forEach((button) => button.addEventListener('click', close));
    dialog.addEventListener('click', (event) => { if (event.target === dialog) close(); });
    fileInput.addEventListener('change', () => {
        const files = [...fileInput.files];
        const validation = validateAdvisorFiles(files);
        status.textContent = validation.valid ? '' : validation.message;
        renderFileList(fileList, files);
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const values = Object.fromEntries(new FormData(form).entries());
        const files = [...fileInput.files];
        const data = { ...values, sourcePage: window.location.pathname };
        const fieldValidation = validateAdvisorData(data);
        const fileValidation = validateAdvisorFiles(files);
        const validation = fieldValidation.valid ? fileValidation : fieldValidation;
        if (!validation.valid) {
            status.textContent = validation.message;
            form.elements[validation.field]?.focus();
            return;
        }

        const submit = form.querySelector('[type="submit"]');
        const key = createSubmissionKey(window.sessionStorage, data.periodId);
        submit.disabled = true;
        submit.textContent = '正在提交…';
        status.textContent = '正在安全提交申请与附件…';
        try {
            const response = await fetch('/api/advisor-applications', {
                method: 'POST',
                body: buildAdvisorFormData(data, files, key),
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(result.message || '提交失败，请稍后重试');
            document.querySelector('#successOrderId').textContent = result.orderId;
            document.querySelector('#successPeriod').textContent = data.periodLabel;
            formView.hidden = true;
            successView.hidden = false;
            form.reset();
            renderFileList(fileList, []);
            window.sessionStorage.removeItem(`arksoma-advisor-key-${data.periodId || 'unknown'}`);
        } catch (error) {
            status.textContent = error.message;
        } finally {
            submit.disabled = false;
            submit.textContent = '提交申请';
        }
    });
}

async function initPublicCatalog() {
    try {
        const response = await fetch('/api/public/catalog', { credentials: 'same-origin' });
        if (!response.ok) return;
        const catalog = normalizePublicCatalog(await response.json());
        applyPublicCatalog(document, catalog, document.body.dataset.periodType);
    } catch { /* 静态值作为可靠回退 */ }
}

function initRevealMotion() {
    const targets = [...document.querySelectorAll('[data-reveal]')];
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
        targets.forEach((target) => target.classList.add('is-visible'));
        return;
    }
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
        });
    }, { threshold: 0.12 });
    targets.forEach((target) => observer.observe(target));
}

export function initArksomaPage() {
    const origin = initOverlay({ triggerSelector: '#coordinateTrigger', overlaySelector: '#originMenu', closeSelector: '[data-close-origin]' });
    const periods = initOverlay({ triggerSelector: '#periodTrigger', overlaySelector: '#periodSheet', closeSelector: '[data-close-period]' });
    initAdvisorDialog();
    initRevealMotion();
    initPublicCatalog();
    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        if (origin && !origin.overlay.hidden) origin.close();
        else if (periods && !periods.overlay.hidden) periods.close();
    });
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initArksomaPage, { once: true });
    else initArksomaPage();
}
