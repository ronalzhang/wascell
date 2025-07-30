// 期数切换器交互增强
document.addEventListener('DOMContentLoaded', function() {
    initializePeriodSwitcher();
});

function initializePeriodSwitcher() {
    const trigger = document.getElementById('periodTrigger');
    const dropdown = document.getElementById('periodDropdown');
    const overlay = document.getElementById('periodOverlay');
    
    if (!trigger || !dropdown) return;
    
    // 获取当前期数并设置触发器文本
    const currentPeriod = getCurrentPeriod();
    //updateTriggerText(currentPeriod);
    
    // 更新下拉菜单状态
    updateDropdownStatus(currentPeriod);
    
    // 触发器点击事件
    trigger.addEventListener('click', function(e) {
        e.stopPropagation();
        toggleDropdown();
    });
    
    // 遮罩层点击事件
    overlay.addEventListener('click', function() {
        closeDropdown();
    });
    
    // 下拉菜单选项点击事件
    const options = dropdown.querySelectorAll('.period-option');
    options.forEach(option => {
        option.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (href === '#') {
                e.preventDefault();
                showComingSoonMessage();
                closeDropdown();
            } else {
                // 正常跳转
                closeDropdown();
            }
        });
    });
    
    // ESC键关闭下拉菜单
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeDropdown();
        }
    });
    
    // 点击页面其他地方关闭下拉菜单
    document.addEventListener('click', function(e) {
        if (!trigger.contains(e.target) && !dropdown.contains(e.target)) {
            closeDropdown();
        }
    });
}

function getCurrentPeriod() {
    // 从URL中获取当前期数
    const path = window.location.pathname;
    if (path.includes('20250902')) {
        return '20250902期';
    } else if (path.includes('index.html') || path === '/' || path === '') {
        return '20250901期';
    }
    
    return '20250901期'; // 默认
}

function updateTriggerText(period) {
    const trigger = document.getElementById('periodTrigger');
    if (trigger) {
        const textNode = trigger.childNodes[0];
        if (textNode.nodeType === Node.TEXT_NODE) {
            textNode.textContent = period;
        }
    }
}

function updateDropdownStatus(currentPeriod) {
    const options = document.querySelectorAll('.period-option');
    
    options.forEach(option => {
        const periodNameElement = option.querySelector('.period-name');
        const periodText = periodNameElement ? periodNameElement.textContent.trim() : option.textContent.trim();
        
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

function showComingSoonMessage() {
    // 创建提示消息
    const message = document.createElement('div');
    message.textContent = '即将开放，敬请期待！';
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