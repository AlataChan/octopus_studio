/**
 * Alata Studio - Electron 主进程入口
 * 使用 node_modules 模式，标准 require('electron') 即可正常工作
 */
const { app, BrowserWindow, dialog, Menu, shell } = require('electron');
const path = require('path');
const ServerManager = require('./serverManager.cjs');
const logger = require('./logger.cjs');
const {
  buildAppContentSecurityPolicy,
  decideNavigationPolicy,
  handleWindowOpenPolicy,
} = require('./securityPolicy.cjs');

const serverManager = new ServerManager();
let mainWindow = null;

/**
 * Create the main application window
 * @param {number} serverPort - The port the server is running on
 * @param {string} serverHost - The loopback host the server is bound to
 */
function createWindow(serverPort, serverHost = '127.0.0.1') {
  logger.info('Creating main window...');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
    show: false,
  });

  // Load the frontend from the server
  const appUrl = `http://${serverHost}:${serverPort}`;
  const appOrigin = new URL(appUrl).origin;
  logger.info(`Loading app from: ${appUrl}`);

  // Set Content Security Policy BEFORE loading URL to suppress Electron security warning
  const contentSecurityPolicy = buildAppContentSecurityPolicy({
    isDevelopment: process.env.NODE_ENV === 'development',
    serverHost,
    serverPort,
  });
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [contentSecurityPolicy],
      }
    });
  });

  const applyNavigationPolicy = (event, url) => {
    const decision = decideNavigationPolicy({ url, appOrigin });
    if (decision.action !== 'deny') return;

    event.preventDefault();
    if (!decision.openExternal) return;

    shell.openExternal(url).catch((error) => {
      logger.warn(`Failed to open external navigation URL: ${error.message}`);
    });
  };

  mainWindow.webContents.on('will-navigate', (event, url) => {
    applyNavigationPolicy(event, event.url || url);
  });

  mainWindow.webContents.on('will-redirect', (event, url) => {
    applyNavigationPolicy(event, event.url || url);
  });

  mainWindow.webContents.on('will-frame-navigate', (event) => {
    // Main-frame attempts are already covered by will-navigate; avoid duplicate external opens.
    if (event.isMainFrame) return;
    applyNavigationPolicy(event, event.url);
  });

  mainWindow.loadURL(appUrl);

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    logger.info('Main window shown');
  });

  // Handle window close
  mainWindow.on('closed', () => {
    mainWindow = null;
    logger.info('Main window closed');
  });

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    return handleWindowOpenPolicy({
      url,
      openExternal: shell.openExternal,
    });
  });

  // Development only - open DevTools
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

/**
 * Create the application menu
 */
function createMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'Open Data Directory',
          click: async () => {
            const dataDir = path.join(app.getPath('userData'), 'storage');
            shell.openPath(dataDir);
          },
        },
        {
          label: 'Open Logs Directory',
          click: async () => {
            const logsDir = path.join(app.getPath('userData'), 'logs');
            shell.openPath(logsDir);
          },
        },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
  ];

  // Add DevTools menu in development
  if (process.env.NODE_ENV === 'development') {
    template[2].submenu.push(
      { type: 'separator' },
      { role: 'toggleDevTools' }
    );
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

/**
 * Setup global exception handlers
 */
function setupExceptionHandlers() {
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    logger.error(`Uncaught Exception: ${error.message}`, error);

    dialog.showErrorBox(
      'An Error Occurred',
      `An unexpected error occurred:\n\n${error.message}\n\nPlease check the logs for more details.`
    );
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection:', reason);
    logger.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
  });
}

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.warn('Another instance is already running, quitting...');
  app.quit();
} else {
  app.on('second-instance', () => {
    // Someone tried to run a second instance, focus our window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // App ready
  app.on('ready', async () => {
    // Setup exception handlers now that app is ready
    setupExceptionHandlers();

    logger.info('App is ready');
    logger.info(`App version: ${app.getVersion()}`);
    logger.info(`Electron version: ${process.versions.electron}`);
    logger.info(`Node version: ${process.versions.node}`);
    logger.info(`User data path: ${app.getPath('userData')}`);

    try {
      // Start backend services
      logger.info('Starting backend services...');
      const { serverHost, serverPort } = await serverManager.start();

      // Create menu
      createMenu();

      // Create main window
      createWindow(serverPort, serverHost);

      logger.info('Application started successfully');
    } catch (error) {
      logger.error(`Failed to start application: ${error.message}`, error);
      dialog.showErrorBox(
        'Startup Failed',
        `Failed to start the application:\n\n${error.message}\n\nPlease check the logs for more details.`
      );
      app.quit();
    }
  });

  // All windows closed
  app.on('window-all-closed', () => {
    // On macOS, keep the app running until explicitly quit
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  // App activated (macOS)
  app.on('activate', async () => {
    // On macOS, re-create window when dock icon is clicked
    if (mainWindow === null && !serverManager.isShuttingDown) {
      try {
        const { serverHost, serverPort } = await serverManager.start();
        createWindow(serverPort, serverHost);
      } catch (error) {
        logger.error(`Failed to restart application: ${error.message}`, error);
        dialog.showErrorBox(
          'Restart Failed',
          `Failed to restart the application:\n\n${error.message}`
        );
      }
    }
  });

  // Before quit
  app.on('before-quit', async (event) => {
    if (!serverManager.isShuttingDown) {
      event.preventDefault();
      logger.info('Application is quitting...');

      try {
        await serverManager.stop();
        logger.info('Services stopped, quitting app...');
        app.quit();
      } catch (error) {
        logger.error(`Error during shutdown: ${error.message}`, error);
        // Force quit anyway
        app.quit();
      }
    }
  });
}
