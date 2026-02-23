const {
  app,
  BrowserWindow,
  Tray,
  nativeImage,
  clipboard,
  ipcMain,
  globalShortcut,
  screen,
  nativeTheme,
} = require('electron');
const path = require('path');

// Set app name so login items shows "ClipVault" not "Electron"
app.name = 'ClipVault';

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

let tray = null;
let mainWindow = null;
let clipboardWatcher = null;

// ── Tray + Window ────────────────────────────────────────────────

function createTray() {
  const iconPath = path.join(__dirname, 'tray-icon.png');
  let trayIcon;

  try {
    trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 18, height: 18 });
    trayIcon.setTemplateImage(true);
  } catch (e) {
    trayIcon = createDefaultIcon();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('ClipVault');

  tray.on('click', (event, bounds) => {
    toggleWindow(bounds);
  });

  tray.on('right-click', (event, bounds) => {
    toggleWindow(bounds);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 600,
    minWidth: 360,
    maxWidth: 500,
    minHeight: 400,
    maxHeight: 800,
    show: false,
    frame: false,
    resizable: true,
    movable: false,
    fullscreenable: false,
    skipTaskbar: true,
    transparent: false,
    backgroundColor: '#0d0f14',
    vibrancy: 'under-window',
    roundedCorners: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Hide instead of close
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  // Auto-hide when window loses focus
  mainWindow.on('blur', () => {
    if (mainWindow && mainWindow.isVisible()) {
      mainWindow.hide();
    }
  });
}

function toggleWindow(trayBounds) {
  if (!mainWindow) return;

  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    positionWindow(trayBounds);
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('window-shown');
  }
}

function positionWindow(trayBounds) {
  if (!mainWindow || !trayBounds) return;

  const windowBounds = mainWindow.getBounds();
  const display = screen.getDisplayMatching(trayBounds);

  // Center horizontally under the tray icon
  const x = Math.round(trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2);
  // Position just below the tray icon
  const y = Math.round(trayBounds.y + trayBounds.height + 4);

  // Clamp to screen bounds
  const clampedX = Math.max(display.workArea.x, Math.min(x, display.workArea.x + display.workArea.width - windowBounds.width));
  const clampedY = Math.max(display.workArea.y, Math.min(y, display.workArea.y + display.workArea.height - windowBounds.height));

  mainWindow.setPosition(clampedX, clampedY, false);
}

// ── Clipboard Monitoring ─────────────────────────────────────────

function startClipboardWatcher() {
  let lastText = clipboard.readText();

  clipboardWatcher = setInterval(() => {
    const currentText = clipboard.readText();
    if (currentText && currentText !== lastText) {
      lastText = currentText;
      if (mainWindow) {
        mainWindow.webContents.send('clipboard-change', currentText);
      }
    }
  }, 800);
}

function stopClipboardWatcher() {
  if (clipboardWatcher) {
    clearInterval(clipboardWatcher);
    clipboardWatcher = null;
  }
}

// ── IPC Handlers ─────────────────────────────────────────────────

ipcMain.handle('clipboard-write', (event, text) => {
  clipboard.writeText(text);
  return true;
});

ipcMain.handle('clipboard-read', () => {
  return clipboard.readText();
});

ipcMain.on('hide-window', () => {
  if (mainWindow) mainWindow.hide();
});

ipcMain.on('app-quit', () => {
  app.isQuitting = true;
  app.quit();
});

// Login Item (Start at Login)
ipcMain.handle('login-item-get', () => {
  return app.getLoginItemSettings();
});

ipcMain.handle('login-item-set', (event, openAtLogin) => {
  app.setLoginItemSettings({ openAtLogin, name: 'ClipVault' });
  return app.getLoginItemSettings();
});

// ── Fallback Icon ────────────────────────────────────────────────

function createDefaultIcon() {
  const size = 36;
  const canvas = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>`;
  const buffer = Buffer.from(canvas);
  const icon = nativeImage.createFromBuffer(buffer);
  icon.setTemplateImage(true);
  return icon;
}

// ── App Lifecycle ────────────────────────────────────────────────

// Hide dock icon (tray-only app)
app.dock?.hide();

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  stopClipboardWatcher();
});

app.on('window-all-closed', (e) => {
  e.preventDefault(); // Keep running in tray
});

app.on('before-quit', () => {
  app.isQuitting = true;
});

app.on('second-instance', () => {
  // If user launches again, show the window
  if (mainWindow) {
    if (tray) {
      toggleWindow(tray.getBounds());
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  }
});

app.whenReady().then(() => {
  createWindow();
  createTray();

  // Register global shortcut to toggle
  globalShortcut.register('CommandOrControl+Shift+V', () => {
    if (tray) {
      toggleWindow(tray.getBounds());
    }
  });

  // Start clipboard monitoring
  startClipboardWatcher();

  console.log('ClipVault is ready in the menu bar! 📋');
});
