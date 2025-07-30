// 期数切换器交互增强
document.addEventListener('DOMContentLoaded', function() {
    // 获取当前页面的期数
    const currentPeriod = getCurrentPeriod();
    
    // 更新切换器状态
    updateSwitcherStatus(currentPeriod);
    
    // 添加切换器悬停效果
    addSwitcherHoverEffects();
});

function getCurrentPeriod() {
    // 从页面标题或badge中获取当前期数
    const badge = document.querySelector('.badge');
    if (badge) {
        return badge.textContent.trim();
    }
    
    // 从URL中获取
    const path = window.location.pathname;
    if (path.includes('20250902')) {
        return '20250902期';
    } else if (path.includes('index.html') || path === '/' || path === '') {
        return '20250901期';
    }
    
    return '20250901期'; // 默认
}

function updateSwitcherStatus(currentPeriod) {
    const options = document.querySelectorAll('.period-option');
    
    options.forEach(option => {
        const periodText = option.textContent.trim();
        
        // 移除所有active类
        option.classList.remove('active');
        
        // 如果匹配当前期数，添加active类
        if (periodText === currentPeriod) {
            option.classList.add('active');
        }
    });
}

function addSwitcherHoverEffects() {
    const switcher = document.querySelector('.period-switcher');
    if (!switcher) return;
    
    // 添加鼠标悬停时的轻微放大效果
    switcher.addEventListener('mouseenter', function() {
        this.style.transform = 'scale(1.02)';
        this.style.transition = 'transform 0.2s ease';
    });
    
    switcher.addEventListener('mouseleave', function() {
        this.style.transform = 'scale(1)';
    });
    
    // 为每个选项添加点击反馈
    const options = document.querySelectorAll('.period-option');
    options.forEach(option => {
        option.addEventListener('click', function(e) {
            // 如果链接是#，阻止默认行为
            if (this.getAttribute('href') === '#') {
                e.preventDefault();
                showComingSoonMessage();
            }
        });
    });
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
        z-index: 1000;
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
        document.body.removeChild(message);
    }, 2000);
}

// 添加键盘导航支持
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        // ESC键关闭任何打开的提示
        const messages = document.querySelectorAll('[style*="position: fixed"]');
        messages.forEach(msg => msg.remove());
    }
}); 