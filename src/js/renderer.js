// 主窗口渲染逻辑
let config = {};
let countdownTimer = null;

const $ = (sel) => document.querySelector(sel);

// ==================== 初始化 ====================
async function init() {
  config = await window.electronAPI.getConfig();
  applyTheme();
  applyCompactMode(config.compactMode);
  updateUI();
  startCountdown();
  showQuote();
  renderImportantDates();
  bindEvents();
}

// ==================== 主题 ====================
function applyTheme() {
  const app = $('#app');
  const classes = [`theme-${config.theme || 'blue-purple'}`];
  if (config.darkMode) classes.push('dark-mode');
  if (config.compactMode) classes.push('compact');
  app.className = classes.join(' ');
}

// ==================== 紧凑模式 ====================
function applyCompactMode(isCompact) {
  const app = $('#app');
  const shrinkIcon = $('.icon-shrink');
  const expandIcon = $('.icon-expand');
  const btn = $('#btnCompact');

  if (isCompact) {
    app.classList.add('compact');
    shrinkIcon.style.display = 'none';
    expandIcon.style.display = '';
    btn.title = '恢复全屏';
  } else {
    app.classList.remove('compact');
    shrinkIcon.style.display = '';
    expandIcon.style.display = 'none';
    btn.title = '缩小为桌面小窗';
  }
}

// ==================== 界面更新 ====================
function updateUI() {
  const title = config.title || '中考倒计时';
  $('#mainTitle').textContent = title;
  $('#titleBarText').textContent = title;

  if (config.targetSchool) {
    $('#targetSchool').textContent = `🏫 目标：${config.targetSchool}`;
  } else {
    $('#targetSchool').textContent = '';
  }

  // 置顶按钮状态
  $('#btnPin').classList.toggle('active', !!config.alwaysOnTop);

  // 秒级显示
  const showSec = config.showSeconds !== false;
  $('#secSep').style.display = showSec ? '' : 'none';
  $('#secItem').style.display = showSec ? '' : 'none';

  // 目标日期
  const examDate = new Date(config.examDate);
  if (!isNaN(examDate.getTime())) {
    const y = examDate.getFullYear();
    const m = examDate.getMonth() + 1;
    const d = examDate.getDate();
    $('#examDateDisplay').textContent = `目标日期：${y}年${m}月${d}日`;
  }
}

// ==================== 倒计时 ====================
function startCountdown() {
  if (countdownTimer) clearInterval(countdownTimer);

  function update() {
    const now = new Date();
    const examDate = new Date(config.examDate + 'T00:00:00');

    if (isNaN(examDate.getTime())) {
      $('#countdownDays').textContent = '?';
      $('#hours').textContent = '--';
      $('#minutes').textContent = '--';
      $('#seconds').textContent = '--';
      return;
    }

    const diff = examDate.getTime() - now.getTime();

    if (diff <= 0) {
      $('.countdown-section').classList.add('countdown-expired');
      $('#countdownDays').textContent = '加油';
      $('.countdown-label').textContent = '考试已开始，全力以赴！';
      $('#hours').textContent = '00';
      $('#minutes').textContent = '00';
      $('#seconds').textContent = '00';
      return;
    }

    const totalSec = Math.floor(diff / 1000);
    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;

    $('#countdownDays').textContent = days;
    $('#hours').textContent = String(hours).padStart(2, '0');
    $('#minutes').textContent = String(minutes).padStart(2, '0');
    $('#seconds').textContent = String(seconds).padStart(2, '0');
  }

  update();
  countdownTimer = setInterval(update, 1000);
}

// ==================== 名言 ====================
function showQuote() {
  // 如果 config 中已有保存的名言，则使用它；否则用每日名言并保存
  if (config.currentQuote) {
    animateQuote(config.currentQuote, false);
  } else {
    animateQuote(getDailyQuote(), true);
  }
}

function animateQuote(quote, saveToConfig = true) {
  const card = $('#quoteCard');
  card.classList.remove('fade-in');
  card.classList.add('fade-out');

  setTimeout(() => {
    $('#quoteText').textContent = `「${quote.text}」`;
    $('#quoteAuthor').textContent = quote.author ? `—— ${quote.author}` : '';
    card.classList.remove('fade-out');
    card.classList.add('fade-in');
  }, 300);

  // 保存到 config，让壁纸同步显示同一句名言
  if (saveToConfig) {
    config.currentQuote = { text: quote.text, author: quote.author || '' };
    window.electronAPI.saveConfig({ currentQuote: config.currentQuote });
  }
}

// ==================== 重要日期 ====================
function renderImportantDates() {
  const container = $('#datesList');
  const dates = config.importantDates || [];
  const now = new Date();

  if (dates.length === 0) {
    $('#datesSection').style.display = 'none';
    return;
  }

  $('#datesSection').style.display = '';
  container.innerHTML = '';

  const sorted = [...dates].sort((a, b) => new Date(a.date) - new Date(b.date));

  sorted.forEach(item => {
    const dateObj = new Date(item.date + 'T00:00:00');
    if (isNaN(dateObj.getTime())) return;

    const diff = dateObj.getTime() - now.getTime();
    const days = Math.ceil(diff / 86400000);
    const passed = days < 0;

    const div = document.createElement('div');
    div.className = `date-item${passed ? ' passed' : ''}`;

    const dateStr = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`;
    const countdownStr = passed ? '已结束' : (days === 0 ? '今天' : `${days}天`);

    div.innerHTML = `
      <span class="date-item-name">${item.name}</span>
      <div class="date-item-info">
        <span class="date-item-countdown">${countdownStr}</span>
        <span class="date-item-date">${dateStr}</span>
      </div>
    `;
    container.appendChild(div);
  });
}

// ==================== 事件绑定 ====================
function bindEvents() {
  // 关闭 → 隐藏到托盘
  $('#btnClose').addEventListener('click', () => {
    window.electronAPI.closeWindow();
  });

  // 最小化 → 任务栏
  $('#btnMinimize').addEventListener('click', () => {
    window.electronAPI.minimizeWindow();
  });

  // 置顶切换
  $('#btnPin').addEventListener('click', async () => {
    const isTop = await window.electronAPI.toggleTop();
    config.alwaysOnTop = isTop;
    $('#btnPin').classList.toggle('active', isTop);
  });

  // 缩小/放大切换
  $('#btnCompact').addEventListener('click', async () => {
    const isCompact = await window.electronAPI.toggleCompact();
    config.compactMode = isCompact;
    applyCompactMode(isCompact);
  });

  // 换一句
  $('#btnRefreshQuote').addEventListener('click', () => {
    animateQuote(getRandomQuote());
  });

  // 打开设置
  $('#btnSettings').addEventListener('click', () => {
    window.electronAPI.openSettings();
  });

  // 监听配置更新（设置页保存后同步）
  window.electronAPI.onConfigUpdated((newConfig) => {
    config = newConfig;
    applyTheme();
    applyCompactMode(config.compactMode);
    updateUI();
    startCountdown();
    renderImportantDates();
  });
}

document.addEventListener('DOMContentLoaded', init);
