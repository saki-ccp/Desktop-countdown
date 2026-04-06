// 设置页面逻辑
let config = {};

async function init() {
  config = await window.electronAPI.getConfig();
  applyTheme();
  populateForm();
  bindEvents();
}

function applyTheme() {
  const app = document.getElementById('settingsApp');
  app.className = '';
  app.classList.add(`theme-${config.theme || 'blue-purple'}`);
  if (config.darkMode) app.classList.add('dark-mode');
}

function populateForm() {
  document.getElementById('examDate').value = config.examDate || '';
  document.getElementById('customTitle').value = config.title || '中考倒计时';
  document.getElementById('targetSchool').value = config.targetSchool || '';
  document.getElementById('showSeconds').checked = config.showSeconds !== false;
  document.getElementById('alwaysOnTop').checked = !!config.alwaysOnTop;
  document.getElementById('darkMode').checked = !!config.darkMode;
  document.getElementById('autoStart').checked = !!config.autoStart;
  document.getElementById('wallpaperMode').checked = !!config.wallpaperMode;
  updateThemeSelection(config.theme || 'blue-purple');
  renderDatesEditor();
}

function updateThemeSelection(theme) {
  document.querySelectorAll('.theme-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });
}

function renderDatesEditor() {
  const container = document.getElementById('importantDates');
  container.innerHTML = '';
  const dates = config.importantDates || [];
  dates.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'date-edit-row';
    row.innerHTML = `
      <input type="text" value="${item.name}" placeholder="名称" data-index="${index}" data-field="name">
      <input type="date" value="${item.date}" data-index="${index}" data-field="date">
      <button class="date-remove-btn" data-index="${index}" title="删除">\u00d7</button>
    `;
    container.appendChild(row);
  });
}

function collectDates() {
  const rows = document.querySelectorAll('.date-edit-row');
  const dates = [];
  rows.forEach(row => {
    const nameInput = row.querySelector('input[data-field="name"]');
    const dateInput = row.querySelector('input[data-field="date"]');
    if (nameInput && dateInput && nameInput.value.trim() && dateInput.value) {
      dates.push({ name: nameInput.value.trim(), date: dateInput.value });
    }
  });
  return dates;
}

function bindEvents() {
  // 关闭
  document.getElementById('btnCloseSettings').addEventListener('click', () => {
    window.electronAPI.closeWindow();
  });

  // 主题选择
  document.querySelectorAll('.theme-option').forEach(btn => {
    btn.addEventListener('click', () => {
      config.theme = btn.dataset.theme;
      updateThemeSelection(config.theme);
      applyTheme();
    });
  });

  // 深色模式实时预览
  document.getElementById('darkMode').addEventListener('change', (e) => {
    config.darkMode = e.target.checked;
    applyTheme();
  });

  // 添加日期
  document.getElementById('btnAddDate').addEventListener('click', () => {
    if (!config.importantDates) config.importantDates = [];
    config.importantDates.push({ name: '', date: '' });
    renderDatesEditor();
  });

  // 删除日期
  document.getElementById('importantDates').addEventListener('click', (e) => {
    if (e.target.classList.contains('date-remove-btn')) {
      const index = parseInt(e.target.dataset.index);
      config.importantDates.splice(index, 1);
      renderDatesEditor();
    }
  });

  // 保存
  document.getElementById('btnSave').addEventListener('click', async () => {
    const newConfig = {
      examDate: document.getElementById('examDate').value,
      title: document.getElementById('customTitle').value || '中考倒计时',
      targetSchool: document.getElementById('targetSchool').value,
      showSeconds: document.getElementById('showSeconds').checked,
      alwaysOnTop: document.getElementById('alwaysOnTop').checked,
      darkMode: document.getElementById('darkMode').checked,
      autoStart: document.getElementById('autoStart').checked,
      wallpaperMode: document.getElementById('wallpaperMode').checked,
      theme: config.theme || 'blue-purple',
      importantDates: collectDates()
    };

    if (newConfig.autoStart !== config.autoStart) {
      await window.electronAPI.setAutoStart(newConfig.autoStart);
    }

    config = await window.electronAPI.saveConfig(newConfig);

    const btn = document.getElementById('btnSave');
    btn.textContent = '\u2713 已保存';
    btn.classList.add('saved');
    setTimeout(() => {
      btn.textContent = '保存设置';
      btn.classList.remove('saved');
    }, 1500);
  });
}

document.addEventListener('DOMContentLoaded', init);
