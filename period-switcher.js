// 期数切换器交互增强
// 兼容新旧两种页面风格
document.addEventListener('DOMContentLoaded', function () {
    initializePeriodSwitcher();
});

function initializePeriodSwitcher() {
    const trigger = document.getElementById('periodTrigger');
    const dropdown = document.getElementById('periodDropdown');
    const overlay = document.getElementById('periodOverlay');

    if (!trigger || !dropdown) return;

    // 检测页面风格（新风格使用 .topbar，旧风格使用 .header）
    const isNewStyle = document.querySelector('.topbar') !== null;

    // 获取当前期数并设置触发器文本
    const currentPeriod = getCurrentPeriod();
    // updateTriggerText(currentPeriod); // 注释掉这行，避免覆盖手动设置的状态文字

    // 更新下拉菜单状态
    updateDropdownStatus(currentPeriod, isNewStyle);

    // 触发器点击事件
    trigger.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleDropdown();
    });

    // 遮罩层点击事件
    if (overlay) {
        overlay.addEventListener('click', function () {
            closeDropdown();
        });
    }

    // 下拉菜单选项点击事件
    const options = dropdown.querySelectorAll('.period-option');
    options.forEach(option => {
        option.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            if (href === '#') {
                e.preventDefault();
                showComingSoonMessage(isNewStyle);
                closeDropdown();
            } else {
                // 正常跳转
                closeDropdown();
            }
        });
    });

    // ESC键关闭下拉菜单
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            closeDropdown();
        }
    });

    // 点击页面其他地方关闭下拉菜单
    document.addEventListener('click', function (e) {
        if (!trigger.contains(e.target) && !dropdown.contains(e.target)) {
            closeDropdown();
        }
    });
}

function getCurrentPeriod() {
    // 从URL中获取当前期数
    const path = window.location.pathname;
    
    // 新风格页面期数匹配
    if (path.includes('20260401')) return '2026·四月首期';
    if (path.includes('20260402')) return '2026·四月二期';
    if (path.includes('20260403')) return '2026·四月三期';
    if (path.includes('20260301')) return '2026·三月首期';
    if (path.includes('20260302')) return '2026·三月二期';
    if (path.includes('20260303')) return '2026·三月三期';
    if (path.includes('20260203')) return '2026·二月三期';
    if (path.includes('20260202')) return '2026·二月二期';
    
    // 旧风格页面期数匹配（保持兼容）
    if (path.includes('20260202')) return '20260202期';
    if (path.includes('20260203')) return '20260203期';
    // if (path.includes('20260301')) return '20260301期';
    
    // 首页
    if (path.includes('index2')) return '2026·二月首期';
    if (path.includes('index.html') || path === '/' || path === '') {
        // 检测是新风格还是旧风格
        const isNewStyle = document.querySelector('.topbar') !== null;
        return isNewStyle ? '2026·二月首期' : '20260201期';
    }

    return '20260201期'; // 默认
}

function updateTriggerText(period) {
    const trigger = document.getElementById('periodTrigger');
    if (trigger) {
        const textNode = trigger.childNodes[0];
        if (textNode.nodeType === Node.TEXT_NODE) {
            // 保持原有的状态文字，只更新期数部分
            const currentText = trigger.textContent;
            const statusMatch = currentText.match(/·(.+)$/);
            const statusText = statusMatch ? statusMatch[0] : '';
            textNode.textContent = period + statusText;
        }
    }
}

function updateDropdownStatus(currentPeriod, isNewStyle) {
    const options = document.querySelectorAll('.period-option');

    options.forEach(option => {
        // 新风格：直接获取第一个span的文本；旧风格：获取.period-name
        let periodText;
        if (isNewStyle) {
            const firstSpan = option.querySelector('span:first-child');
            periodText = firstSpan ? firstSpan.textContent.trim() : option.textContent.trim();
        } else {
            const periodNameElement = option.querySelector('.period-name');
            periodText = periodNameElement ? periodNameElement.textContent.trim() : option.textContent.trim();
        }

        // 移除所有active类
        option.classList.remove('active');

        // 如果匹配当前期数，添加active类
        if (periodText === currentPeriod) {
            option.classList.add('active');
        }
    });
}

function toggleDropdown() {
    const trigger = document.getElementById('periodTrigger');
    const dropdown = document.getElementById('periodDropdown');
    const overlay = document.getElementById('periodOverlay');

    if (dropdown.classList.contains('show')) {
        closeDropdown();
    } else {
        openDropdown();
    }
}

function openDropdown() {
    const trigger = document.getElementById('periodTrigger');
    const dropdown = document.getElementById('periodDropdown');
    const overlay = document.getElementById('periodOverlay');

    trigger.classList.add('active');
    dropdown.classList.add('show');
    overlay.classList.add('show');
}

function closeDropdown() {
    const trigger = document.getElementById('periodTrigger');
    const dropdown = document.getElementById('periodDropdown');
    const overlay = document.getElementById('periodOverlay');

    trigger.classList.remove('active');
    dropdown.classList.remove('show');
    overlay.classList.remove('show');
}

function showComingSoonMessage(isNewStyle) {
    // 创建提示消息
    const message = document.createElement('div');
    message.textContent = '即将开放，敬请期待！';
    
    // 根据页面风格调整样式
    if (isNewStyle) {
        message.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(17, 17, 17, 0.95);
            color: #c9a962;
            padding: 16px 32px;
            border: 1px solid rgba(201, 169, 98, 0.3);
            font-size: 14px;
            letter-spacing: 2px;
            z-index: 1001;
            animation: fadeInOut 2s ease-in-out;
        `;
    } else {
        message.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 14px;
            z-index: 1001;
            animation: fadeInOut 2s ease-in-out;
        `;
    }

    // 添加动画样式
    const style = document.createElement('style');
    style.textContent = `
        @keyframes fadeInOut {
            0% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
            20% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
            80% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
            100% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
        }
    `;
    document.head.appendChild(style);

    document.body.appendChild(message);

    // 2秒后移除消息
    setTimeout(() => {
        if (document.body.contains(message)) {
            document.body.removeChild(message);
        }
    }, 2000);
} 