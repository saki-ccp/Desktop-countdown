// 壁纸渲染逻辑 —— 无交互，无秒数显示
let config = {};

async function init() {
  config = await window.electronAPI.getConfig();
  applyTheme();
  updateContent();

  // 监听配置更新
  window.electronAPI.onConfigUpdated((newConfig) => {
    config = newConfig;
    applyTheme();
    updateContent();
  });
}

function applyTheme() {
  const app = document.getElementById('wallpaperApp');
  const classes = [`theme-${config.theme || 'blue-purple'}`];
  if (config.darkMode) classes.push('dark-mode');
  app.className = classes.join(' ');
}

function updateContent() {
  // 标题
  document.getElementById('wpTitle').textContent = config.title || '中考倒计时';

  // 目标学校
  const schoolEl = document.getElementById('wpSchool');
  schoolEl.textContent = config.targetSchool ? `\u{1F3EB} 目标：${config.targetSchool}` : '';

  // 倒计时
  const now = new Date();
  const examDate = new Date(config.examDate + 'T00:00:00');
  const countdownEl = document.querySelector('.wp-countdown');

  if (isNaN(examDate.getTime())) {
    document.getElementById('wpDays').textContent = '?';
  } else {
    const diff = examDate.getTime() - now.getTime();
    if (diff <= 0) {
      countdownEl.classList.add('expired');
      document.getElementById('wpDays').textContent = '加油';
      document.querySelector('.wp-countdown-label').textContent = '考试已开始，全力以赴！';
    } else {
      countdownEl.classList.remove('expired');
      const totalSec = Math.floor(diff / 1000);
      const days = Math.floor(totalSec / 86400);
      document.getElementById('wpDays').textContent = days;
    }

    const y = examDate.getFullYear();
    const m = examDate.getMonth() + 1;
    const d = examDate.getDate();
    document.getElementById('wpExamDate').textContent = `目标日期：${y}年${m}月${d}日`;
  }

  // 每日名言 —— 优先使用 config 中保存的名言（与主窗口同步）
  const quote = config.currentQuote || getDailyQuote();
  document.getElementById('wpQuoteText').textContent = `「${quote.text}」`;
  document.getElementById('wpQuoteAuthor').textContent = quote.author ? `—— ${quote.author}` : '';

  // 重要日期
  renderDates();
}

function renderDates() {
  const container = document.getElementById('wpDates');
  const dates = config.importantDates || [];
  const now = new Date();

  container.innerHTML = '';
  if (dates.length === 0) return;

  const sorted = [...dates].sort((a, b) => new Date(a.date) - new Date(b.date));

  sorted.forEach(item => {
    const dateObj = new Date(item.date + 'T00:00:00');
    if (isNaN(dateObj.getTime())) return;

    const diff = dateObj.getTime() - now.getTime();
    const days = Math.ceil(diff / 86400000);
    const passed = days < 0;
    const countdownStr = passed ? '已结束' : (days === 0 ? '今天' : `${days}天`);

    const chip = document.createElement('div');
    chip.className = `wp-date-chip${passed ? ' passed' : ''}`;
    chip.innerHTML = `
      <span class="wp-date-chip-name">${item.name}</span>
      <span class="wp-date-chip-countdown">${countdownStr}</span>
    `;
    container.appendChild(chip);
  });
}

document.addEventListener('DOMContentLoaded', init);
