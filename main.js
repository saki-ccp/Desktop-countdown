const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen } = require('electron');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

// ==================== 配置管理 ====================
const userDataPath = app.getPath('userData');
const configPath = path.join(userDataPath, 'config.json');

const defaultConfig = {
  examDate: '2026-06-14',
  title: '中考倒计时',
  targetSchool: '',
  alwaysOnTop: false,
  showSeconds: true,
  autoStart: false,
  theme: 'blue-purple',
  darkMode: false,
  compactMode: false,
  wallpaperMode: false,
  wallpaperOriginalPath: '',
  windowX: undefined,
  windowY: undefined,
  importantDates: [
    { name: '一模考试', date: '2026-04-15' },
    { name: '体育中考', date: '2026-04-20' },
    { name: '二模考试', date: '2026-05-20' }
  ]
};

function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf-8');
      return { ...defaultConfig, ...JSON.parse(data) };
    }
  } catch (e) {
    console.error('读取配置失败:', e);
  }
  return { ...defaultConfig };
}

function saveConfig(cfg) {
  try {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf-8');
  } catch (e) {
    console.error('保存配置失败:', e);
  }
}

// ==================== 全局状态 ====================
let mainWindow = null;
let settingsWindow = null;
let wallpaperWindow = null;
let wallpaperTimer = null;
let tray = null;
let config = null;
let updateDialog = null;
let isQuitting = false;

const wallpaperImagePath = path.join(userDataPath, 'wallpaper.png');

// ==================== 工具函数 ====================
function isWinAlive(win) {
  return win && !win.isDestroyed();
}

function getAppIcon() {
  const rootIcon = path.join(__dirname, 'icon.ico');
  const buildIcon = path.join(__dirname, 'build', 'icon.ico');
  const iconPath = fs.existsSync(rootIcon) ? rootIcon : buildIcon;
  if (fs.existsSync(iconPath)) {
    return nativeImage.createFromPath(iconPath);
  }
  return nativeImage.createEmpty();
}

// ==================== 窗口尺寸 ====================
const COMPACT_WIDTH = 420;
const COMPACT_HEIGHT = 620;

function getFullSize() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  return { width, height };
}

// ==================== 每日刷新 ====================
function refreshDailyQuote() {
  const today = new Date().toISOString().slice(0, 10);
  if (config && config.lastQuoteDate !== today) {
    config.currentQuote = null;
    config.lastQuoteDate = today;
    saveConfig(config);
  }
}

// ==================== 壁纸功能 ====================
function getCurrentWallpaper() {
  return new Promise((resolve) => {
    const psScript = [
      'Add-Type -TypeDefinition @"',
      'using System;',
      'using System.Text;',
      'using System.Runtime.InteropServices;',
      'public class WallpaperGetter {',
      '  [DllImport("user32.dll", CharSet = CharSet.Auto)]',
      '  static extern int SystemParametersInfo(int uAction, int uParam, StringBuilder lpvParam, int fuWinIni);',
      '  public static string Get() {',
      '    StringBuilder sb = new StringBuilder(260);',
      '    SystemParametersInfo(0x0073, sb.Capacity, sb, 0);',
      '    return sb.ToString();',
      '  }',
      '}',
      '"@ -ErrorAction SilentlyContinue',
      '[WallpaperGetter]::Get()'
    ].join('\r\n');

    execFile('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-Command', psScript
    ], { timeout: 10000 }, (err, stdout) => {
      if (err) {
        console.error('获取当前壁纸失败:', err);
        resolve('');
        return;
      }
      resolve(stdout.trim());
    });
  });
}

function setWindowsWallpaper(imagePath) {
  return new Promise((resolve, reject) => {
    const winPath = imagePath.replace(/\//g, '\\');
    const psScript = [
      'Set-ItemProperty -Path "HKCU:\\Control Panel\\Desktop" -Name WallpaperStyle -Value "10"',
      'Set-ItemProperty -Path "HKCU:\\Control Panel\\Desktop" -Name TileWallpaper -Value "0"',
      'Add-Type -TypeDefinition @"',
      'using System;',
      'using System.Runtime.InteropServices;',
      'public class WallpaperSetter {',
      '  [DllImport("user32.dll", CharSet = CharSet.Auto)]',
      '  public static extern int SystemParametersInfo(int uAction, int uParam, string lpvParam, int fuWinIni);',
      '}',
      '"@ -ErrorAction SilentlyContinue',
      `[WallpaperSetter]::SystemParametersInfo(0x0014, 0, "${winPath}", 0x01 -bor 0x02)`
    ].join('\r\n');

    execFile('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-Command', psScript
    ], { timeout: 10000 }, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function createWallpaperWindow() {
  return new Promise((resolve) => {
    if (isWinAlive(wallpaperWindow)) { resolve(); return; }

    const { width, height } = screen.getPrimaryDisplay().size;

    wallpaperWindow = new BrowserWindow({
      width,
      height,
      show: false,
      frame: false,
      transparent: false,
      resizable: false,
      skipTaskbar: true,
      focusable: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        offscreen: true
      }
    });

    wallpaperWindow.webContents.setFrameRate(1);

    let resolved = false;
    const done = () => { if (!resolved) { resolved = true; resolve(); } };
    wallpaperWindow.webContents.on('did-finish-load', done);
    setTimeout(done, 10000);

    wallpaperWindow.loadFile(path.join(__dirname, 'src', 'wallpaper.html'));

    wallpaperWindow.on('closed', () => { wallpaperWindow = null; });
  });
}

async function captureAndSetWallpaper() {
  if (!isWinAlive(wallpaperWindow)) return;

  try {
    wallpaperWindow.webContents.send('config-updated', config);
    await new Promise(resolve => setTimeout(resolve, 800));

    const image = await wallpaperWindow.webContents.capturePage();
    if (image.isEmpty()) {
      console.warn('壁纸截图为空，跳过本次更新');
      return;
    }

    fs.writeFileSync(wallpaperImagePath, image.toPNG());
    await setWindowsWallpaper(wallpaperImagePath);
  } catch (err) {
    console.error('壁纸更新失败:', err);
  }
}

function startWallpaperUpdates() {
  stopWallpaperUpdates();
  wallpaperTimer = setInterval(captureAndSetWallpaper, 30 * 60 * 1000);
}

function stopWallpaperUpdates() {
  if (wallpaperTimer) {
    clearInterval(wallpaperTimer);
    wallpaperTimer = null;
  }
}

function showUpdateDialog() {
  if (isWinAlive(updateDialog)) return;

  updateDialog = new BrowserWindow({
    width: 360,
    height: 140,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    center: true,
    focusable: false,
    icon: getAppIcon(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  updateDialog.loadFile(path.join(__dirname, 'src', 'update-dialog.html'));
  updateDialog.once('ready-to-show', () => {
    if (isWinAlive(updateDialog)) updateDialog.show();
  });
  updateDialog.on('closed', () => { updateDialog = null; });
}

function closeUpdateDialog() {
  if (isWinAlive(updateDialog)) {
    updateDialog.close();
    updateDialog = null;
  }
}

async function enableWallpaperMode(showNotification = false) {
  try {
    if (!config.wallpaperOriginalPath) {
      config.wallpaperOriginalPath = await getCurrentWallpaper();
      saveConfig(config);
    }

    if (showNotification) showUpdateDialog();

    await createWallpaperWindow();
    // 等待渲染进程初始化完成
    await new Promise(r => setTimeout(r, 1000));
    await captureAndSetWallpaper();

    if (showNotification && isWinAlive(updateDialog)) {
      updateDialog.webContents.executeJavaScript(
        "document.body.classList.add('done');" +
        "document.querySelector('.message').textContent='壁纸已更新';"
      );
      setTimeout(() => closeUpdateDialog(), 1500);
    }

    startWallpaperUpdates();

    // 开启壁纸模式时自动启用开机自启，确保每天刷新壁纸
    if (!config.autoStart) {
      app.setLoginItemSettings({ openAtLogin: true, path: app.getPath('exe') });
      config.autoStart = true;
      saveConfig(config);
      if (isWinAlive(mainWindow)) {
        mainWindow.webContents.send('config-updated', config);
      }
    }
  } catch (err) {
    console.error('启用壁纸模式失败:', err);
    closeUpdateDialog();
  }
}

async function disableWallpaperMode() {
  try {
    stopWallpaperUpdates();
    if (isWinAlive(wallpaperWindow)) {
      wallpaperWindow.close();
      wallpaperWindow = null;
    }
    if (config.wallpaperOriginalPath) {
      await setWindowsWallpaper(config.wallpaperOriginalPath);
      config.wallpaperOriginalPath = '';
      saveConfig(config);
    }
    try {
      if (fs.existsSync(wallpaperImagePath)) fs.unlinkSync(wallpaperImagePath);
    } catch (e) { /* 非关键，忽略 */ }
  } catch (err) {
    console.error('禁用壁纸模式失败:', err);
  }
}

// ==================== 主窗口（启动优化） ====================
function createMainWindow() {
  config = loadConfig();
  refreshDailyQuote();

  const isCompact = !!config.compactMode;
  const fullSize = getFullSize();

  const winOpts = {
    width: isCompact ? COMPACT_WIDTH : fullSize.width,
    height: isCompact ? COMPACT_HEIGHT : fullSize.height,
    minWidth: 320,
    minHeight: 400,
    show: false,           // 关键：先不显示，等渲染完毕再 show
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: config.alwaysOnTop,
    skipTaskbar: false,
    icon: getAppIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  };

  if (isCompact && config.windowX !== undefined && config.windowY !== undefined) {
    winOpts.x = config.windowX;
    winOpts.y = config.windowY;
  } else if (isCompact) {
    winOpts.center = true;
  } else {
    winOpts.x = 0;
    winOpts.y = 0;
  }

  mainWindow = new BrowserWindow(winOpts);
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  // 渲染就绪后再显示，避免白屏闪烁
  mainWindow.once('ready-to-show', () => {
    if (isWinAlive(mainWindow)) {
      mainWindow.show();
    }
  });

  mainWindow.on('moved', () => {
    if (isWinAlive(mainWindow) && config.compactMode) {
      const [x, y] = mainWindow.getPosition();
      config.windowX = x;
      config.windowY = y;
      saveConfig(config);
    }
  });

  mainWindow.on('close', (e) => {
    if (isQuitting) return;
    e.preventDefault();
    if (isWinAlive(mainWindow)) {
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ==================== 系统托盘 ====================
function createTray() {
  let icon = getAppIcon();
  if (icon.isEmpty()) {
    const pngBuf = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAFElEQVQ4y2N' +
      'kwAT/GYYBYwYDAKLuAf8LSXNHAAAAABJRU5ErkJggg==', 'base64'
    );
    icon = nativeImage.createFromBuffer(pngBuf);
  }
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    { label: '显示主窗口', click: () => showMainWindow() },
    { label: '设置', click: () => openSettings() },
    { type: 'separator' },
    {
      label: '置顶窗口', type: 'checkbox', checked: config.alwaysOnTop,
      click: (item) => {
        config.alwaysOnTop = item.checked;
        if (isWinAlive(mainWindow)) mainWindow.setAlwaysOnTop(item.checked);
        saveConfig(config);
      }
    },
    { type: 'separator' },
    { label: '退出', click: () => doQuit() }
  ]);

  tray.setToolTip('中考倒计时');
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => showMainWindow());
}

function showMainWindow() {
  if (!isWinAlive(mainWindow)) {
    createMainWindow();
  }
  mainWindow.show();
  mainWindow.focus();
}

// ==================== 设置窗口 ====================
function openSettings() {
  if (isWinAlive(settingsWindow)) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 500,
    height: 720,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    parent: isWinAlive(mainWindow) ? mainWindow : undefined,
    modal: false,
    icon: getAppIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  settingsWindow.loadFile(path.join(__dirname, 'src', 'settings.html'));

  settingsWindow.once('ready-to-show', () => {
    if (isWinAlive(settingsWindow)) {
      settingsWindow.show();
    }
  });

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

// ==================== 安全退出 ====================
function doQuit() {
  isQuitting = true;
  stopWallpaperUpdates();
  closeUpdateDialog();
  if (isWinAlive(wallpaperWindow)) wallpaperWindow.close();
  if (isWinAlive(settingsWindow)) settingsWindow.close();
  if (isWinAlive(mainWindow)) mainWindow.close();
  if (tray) { tray.destroy(); tray = null; }
  app.quit();
}

// ==================== IPC 通信 ====================
ipcMain.handle('get-config', () => loadConfig());

ipcMain.handle('save-config', async (_event, newConfig) => {
  const oldWallpaperMode = config.wallpaperMode;
  config = { ...config, ...newConfig };
  saveConfig(config);
  if (isWinAlive(mainWindow)) {
    mainWindow.setAlwaysOnTop(!!config.alwaysOnTop);
    mainWindow.webContents.send('config-updated', config);
  }

  // 壁纸模式处理
  if (config.wallpaperMode && !oldWallpaperMode) {
    await enableWallpaperMode();
  } else if (!config.wallpaperMode && oldWallpaperMode) {
    await disableWallpaperMode();
  } else if (config.wallpaperMode) {
    // 设置变更时立即刷新壁纸
    if (isWinAlive(wallpaperWindow)) {
      wallpaperWindow.webContents.send('config-updated', config);
      setTimeout(() => captureAndSetWallpaper(), 1000);
    }
  }

  return config;
});

ipcMain.handle('open-settings', () => openSettings());

ipcMain.handle('close-window', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return;
  if (win === mainWindow) {
    mainWindow.hide();
  } else {
    win.close();
  }
});

ipcMain.handle('minimize-window', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (isWinAlive(win)) win.minimize();
});

ipcMain.handle('toggle-top', () => {
  config.alwaysOnTop = !config.alwaysOnTop;
  if (isWinAlive(mainWindow)) mainWindow.setAlwaysOnTop(config.alwaysOnTop);
  saveConfig(config);
  return config.alwaysOnTop;
});

ipcMain.handle('toggle-compact', () => {
  config.compactMode = !config.compactMode;
  saveConfig(config);
  if (isWinAlive(mainWindow)) {
    if (config.compactMode) {
      mainWindow.setMinimumSize(320, 400);
      mainWindow.setSize(COMPACT_WIDTH, COMPACT_HEIGHT, true);
      mainWindow.center();
    } else {
      const { width, height } = getFullSize();
      mainWindow.setPosition(0, 0, false);
      mainWindow.setSize(width, height, true);
    }
  }
  return config.compactMode;
});

ipcMain.handle('set-auto-start', (_event, enable) => {
  app.setLoginItemSettings({ openAtLogin: enable, path: app.getPath('exe') });
  config.autoStart = enable;
  saveConfig(config);
});

ipcMain.handle('quit-app', () => doQuit());

// ==================== 应用生命周期 ====================
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => showMainWindow());

  app.whenReady().then(() => {
    createMainWindow();
    // 延迟创建托盘，优先让主窗口渲染
    setTimeout(() => createTray(), 100);
    // 如果壁纸模式已启用，恢复壁纸并显示更新提示
    if (config.wallpaperMode) {
      setTimeout(() => enableWallpaperMode(true), 500);
    }
  });

  app.on('window-all-closed', () => {});

  app.on('before-quit', () => {
    isQuitting = true;
  });
}
