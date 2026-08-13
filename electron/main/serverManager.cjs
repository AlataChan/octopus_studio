const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const net = require('net');
const crypto = require('crypto');
const { app, dialog } = require('electron');
const logger = require('./logger.cjs');

const DESKTOP_BIND_HOST = '127.0.0.1';

function getDesktopAppOrigin(serverPort) {
  return `http://${DESKTOP_BIND_HOST}:${serverPort}`;
}

/**
 * 生成或读取持久化的 JWT_SECRET
 * 在打包环境中，我们需要确保 JWT_SECRET 存在且在应用重启后保持一致
 */
function getOrCreateJwtSecret() {
  const secretPath = path.join(app.getPath('userData'), '.jwt-secret');

  try {
    if (fs.existsSync(secretPath)) {
      const secret = fs.readFileSync(secretPath, 'utf-8').trim();
      if (secret && secret.length >= 32) {
        return secret;
      }
    }
  } catch (e) {
    logger.warn(`Failed to read JWT secret from ${secretPath}: ${e.message}`);
  }

  // 生成新的 secret (64 字符的随机十六进制字符串)
  const newSecret = crypto.randomBytes(32).toString('hex');

  try {
    fs.writeFileSync(secretPath, newSecret, { mode: 0o600 });
    logger.info('Generated new JWT secret');
  } catch (e) {
    logger.warn(`Failed to persist JWT secret: ${e.message}`);
  }

  return newSecret;
}

/**
 * 获取资源路径
 * 在开发模式下使用项目根目录，在生产模式下使用 extraResources 目录
 */
function getResourcePath(subPath) {
  if (app.isPackaged) {
    // 生产环境：extraResources 被放在 Resources 目录下
    return path.join(process.resourcesPath, subPath);
  } else {
    // 开发环境：直接使用项目目录
    return path.join(app.getAppPath(), subPath);
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function resolveUserDataStorageDir() {
  return path.join(app.getPath('userData'), 'storage');
}

function resolveGatewayDataDir() {
  return path.join(app.getPath('userData'), 'im-gateway');
}

function ensureServerStorageDirs(storageDir) {
  try {
    ensureDir(storageDir);
  } catch (e) {
    logger.warn(`Failed to prepare storage directory: ${e.message}`);
    return;
  }

  const subDirs = ['documents', 'direct-uploads', 'vector-cache', 'assets', 'models', 'plugins'];
  for (const name of subDirs) {
    try {
      ensureDir(path.join(storageDir, name));
    } catch (e) {
      logger.warn(`Failed to prepare storage subdir "${name}": ${e.message}`);
    }
  }
}

function ensureCollectorSharedDirs(storageDir) {
  // In desktop builds STORAGE_DIR points to `<userData>/storage`, so collector
  // shared directories should live under `<userData>/collector/...`.
  const hotDir = path.resolve(storageDir, '../collector/hotdir');
  const tmpDir = path.resolve(storageDir, '../collector/storage/tmp');
  try {
    ensureDir(hotDir);
  } catch (e) {
    logger.warn(`Failed to prepare collector hotdir: ${e.message}`);
  }
  try {
    ensureDir(tmpDir);
  } catch (e) {
    logger.warn(`Failed to prepare collector tmp dir: ${e.message}`);
  }
}

function ensureGatewayDataDir(gatewayDataDir) {
  try {
    ensureDir(gatewayDataDir);
  } catch (e) {
    logger.warn(`Failed to prepare gateway data dir: ${e.message}`);
  }
}

function ensureUserDataDatabase({ serverDir, storageDir }) {
  ensureDir(storageDir);

  const dbPath = path.join(storageDir, 'anythingllm.db');
  if (fs.existsSync(dbPath)) {
    return { dbPath, templatePath: null, created: false };
  }

  // Prefer the staged template DB (generated during Electron sidecar staging).
  const templateCandidates = [
    path.join(serverDir, 'prisma', 'template-anythingllm.db'),
    // Backwards-compat: older builds may still ship a db under server/storage.
    path.join(serverDir, 'storage', 'anythingllm.db'),
  ];

  const templatePath = templateCandidates.find((candidate) =>
    fs.existsSync(candidate)
  );

  if (!templatePath) {
    throw new Error(
      `Template database not found. Expected one of:\n- ${templateCandidates.join(
        '\n- '
      )}`
    );
  }

  fs.copyFileSync(templatePath, dbPath);
  return { dbPath, templatePath, created: true };
}

function formatBool(value) {
  return value ? 'yes' : 'no';
}

function logDesktopEnvDiagnostics({
  name,
  serverDir,
  collectorDir,
  gatewayDir,
  storageDir,
  dbPath,
  templatePath,
  env,
}) {
  const isPackaged = app.isPackaged;
  logger.info(`[${name}] Desktop diagnostics: packaged=${formatBool(isPackaged)}`);
  logger.info(
    `[${name}] Paths: resources=${process.resourcesPath} userData=${app.getPath(
      'userData'
    )}`
  );
  if (serverDir) logger.info(`[${name}] ServerDir: ${serverDir}`);
  if (collectorDir) logger.info(`[${name}] CollectorDir: ${collectorDir}`);
  if (gatewayDir) logger.info(`[${name}] GatewayDir: ${gatewayDir}`);
  if (storageDir) logger.info(`[${name}] StorageDir: ${storageDir}`);
  if (dbPath) {
    logger.info(
      `[${name}] Database: ${dbPath} exists=${formatBool(fs.existsSync(dbPath))}`
    );
  }
  if (templatePath) {
    logger.info(
      `[${name}] Template DB: ${templatePath} exists=${formatBool(
        fs.existsSync(templatePath)
      )}`
    );
  }

  if (env) {
    const jwtSource = process.env.JWT_SECRET ? 'env' : 'userData';
    logger.info(
      `[${name}] Env: NODE_ENV=${env.NODE_ENV} SERVER_HOST=${env.SERVER_HOST} SERVER_PORT=${env.SERVER_PORT} COLLECTOR_HOST=${env.COLLECTOR_HOST} COLLECTOR_PORT=${env.COLLECTOR_PORT} GATEWAY_HOST=${env.GATEWAY_HOST} GATEWAY_PORT=${env.GATEWAY_PORT} VECTOR_DB=${env.VECTOR_DB} ANYTHING_LLM_RUNTIME=${env.ANYTHING_LLM_RUNTIME} CORS_ALLOWED_ORIGINS=${env.CORS_ALLOWED_ORIGINS} JWT_SECRET_SOURCE=${jwtSource}`
    );
    if (env.DATABASE_URL) logger.info(`[${name}] Env: DATABASE_URL=${env.DATABASE_URL}`);
  }
}

class ServerManager {
  constructor() {
    this.serverProcess = null;
    this.collectorProcess = null;
    this.gatewayProcess = null;
    this.isShuttingDown = false;
    this.serverRestartCount = 0;
    this.collectorRestartCount = 0;
    this.gatewayRestartCount = 0;
    this.maxRestartAttempts = 3;
	    // 记录当前实际使用的端口，便于日志与后续诊断
	    this.serverPort = null;
	    this.collectorPort = null;
      this.gatewayPort = null;
	    // 防止重复调用 start() 时并发启动多份服务
	    this.startPromise = null;
  }

  /**
   * Check if a port is available
   * @param {number} port - The port to check
   * @returns {Promise<boolean>}
   */
  isPortAvailable(port) {
    return new Promise((resolve) => {
      const server = net.createServer();

      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          resolve(false);
        } else {
          resolve(false);
        }
      });

      server.once('listening', () => {
        server.close();
        resolve(true);
      });

      server.listen(port, DESKTOP_BIND_HOST);
    });
  }

  /**
   * Find an available port starting from preferredPort
   * @param {number} preferredPort - The preferred port to start searching from
   * @param {number} maxAttempts - Maximum number of ports to try
   * @returns {Promise<number>}
   */
  async findAvailablePort(preferredPort, maxAttempts = 10) {
    for (let i = 0; i < maxAttempts; i++) {
      const port = preferredPort + i;
      const available = await this.isPortAvailable(port);
      if (available) {
        logger.info(`Found available port: ${port}`);
        return port;
      }
      logger.warn(`Port ${port} is in use, trying next...`);
    }
    throw new Error(`No available port found in range ${preferredPort}-${preferredPort + maxAttempts - 1}`);
  }

	  /**
	   * Start the backend server process
	   * @param {number} port - The port to run the server on
	   * @param {number} collectorPort - The port used by collector service
	   */
	  async startServer(port, collectorPort) {
    return new Promise((resolve, reject) => {
      const serverDir = getResourcePath('server');
      const serverPath = path.join(serverDir, 'index.js');
      logger.info(`Starting server on ${DESKTOP_BIND_HOST}:${port}...`);
      logger.info(`Server path: ${serverPath}`);
      logger.info(`Server directory: ${serverDir}`);

	      try {
	        if (!fs.existsSync(serverPath)) {
	          throw new Error(`Server entry not found: ${serverPath}`);
	        }
	      } catch (e) {
	        const message = e?.message || String(e);
	        logger.error(`[Server Error] ${message}`);
	        dialog.showErrorBox(
	          'Server Error',
	          `Failed to start backend server.\n\n${message}\n\nPlease reinstall the app or rebuild the Electron sidecars.`
	        );
	        reject(e);
	        return;
	      }

	      const storageDir = resolveUserDataStorageDir();
	      ensureServerStorageDirs(storageDir);
	      ensureCollectorSharedDirs(storageDir);
	      let dbPath = null;
	      let templatePath = null;
	      try {
	        const dbInfo = ensureUserDataDatabase({ serverDir, storageDir });
	        dbPath = dbInfo.dbPath;
	        templatePath = dbInfo.templatePath;
	      } catch (e) {
	        const message = e?.message || String(e);
	        logger.error(`[Server Error] Failed to prepare database: ${message}`);
	        dialog.showErrorBox(
	          'Database Error',
	          `Failed to prepare the local database.\n\n${message}\n\nPlease reinstall the app or rebuild the Electron sidecars.`
	        );
	        reject(e);
	        return;
	      }

	      const env = {
	        ...process.env,
	        SERVER_HOST: DESKTOP_BIND_HOST,
	        SERVER_PORT: port.toString(), // Server 使用 SERVER_PORT 环境变量
	        // Collector 端口通过 COLLECTOR_PORT 传入，确保与 Electron 侧保持一致
	        // 避免 collector 默认死锁在 8888 导致端口冲突
	        COLLECTOR_PORT: (collectorPort || 8888).toString(),
	        CORS_ALLOWED_ORIGINS: getDesktopAppOrigin(port),
	        // 注意：在 Electron 中强制以 "production" 模式运行后端 Server，
	        // 这样 server/index.js 才会挂载静态资源与 SSR 首页，否则会返回 404 "Not Found"。
	        // Electron 主进程仍然可以通过其它环境变量区分 dev / prod，这里只关心服务行为。
	        NODE_ENV: 'production',
	        STORAGE_DIR: storageDir,
	        // Vector DB defaults to LanceDB in code; make it explicit for desktop builds.
	        VECTOR_DB: process.env.VECTOR_DB || 'lancedb',
	        DATABASE_URL: process.env.DATABASE_URL || `file:${dbPath}`,
	        ANYTHING_LLM_RUNTIME: process.env.ANYTHING_LLM_RUNTIME || 'desktop',
	        SEED_GSTACK_ASSISTANTS: process.env.SEED_GSTACK_ASSISTANTS || 'true',
	        // JWT_SECRET 用于签发和验证用户登录 token，必须设置否则登录会失败
	        JWT_SECRET: process.env.JWT_SECRET || getOrCreateJwtSecret(),
	      };
	      logDesktopEnvDiagnostics({
	        name: 'Server',
	        serverDir,
	        storageDir,
	        dbPath,
	        templatePath,
	        env,
	      });

	      // 在打包环境中不能依赖系统全局的 `node` 命令，否则会出现
	      // spawn node ENOENT。这里统一使用当前 Electron 进程的可执行文件
	      //（process.execPath），并通过 ELECTRON_RUN_AS_NODE=1 让其以 Node 模式运行。
	      const serverEnv = {
	        ...env,
	        ELECTRON_RUN_AS_NODE: '1',
	      };
	      this.serverProcess = spawn(process.execPath, [serverPath], {
	        env: serverEnv,
	        cwd: serverDir,
	        stdio: ['ignore', 'pipe', 'pipe'],
	      });

      this.serverProcess.stdout.on('data', (data) => {
        const message = data.toString().trim();
        logger.info(`[Server] ${message}`);
        console.log(`[Server] ${message}`);
      });

      this.serverProcess.stderr.on('data', (data) => {
        const message = data.toString().trim();
        logger.error(`[Server Error] ${message}`);
        console.error(`[Server Error] ${message}`);
      });

      this.serverProcess.on('error', (error) => {
        logger.error(`Failed to start server: ${error.message}`);
        reject(error);
      });

      this.serverProcess.on('exit', async (code, signal) => {
        logger.warn(`Server process exited with code ${code}, signal ${signal}`);

        if (!this.isShuttingDown) {
          if (this.serverRestartCount < this.maxRestartAttempts) {
            this.serverRestartCount++;
            logger.info(`Attempting to restart server (${this.serverRestartCount}/${this.maxRestartAttempts})...`);

            // Exponential backoff: 1s, 2s, 4s
            const delay = Math.pow(2, this.serverRestartCount - 1) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));

            try {
              await this.startServer(port, collectorPort);
            } catch (error) {
              logger.error(`Failed to restart server: ${error.message}`);
            }
          } else {
            logger.error('Server restart limit reached');
            dialog.showErrorBox(
              'Server Crashed',
              `The backend server has crashed ${this.maxRestartAttempts} times and could not be restarted. Please check the logs and restart the application.`
            );
          }
        }
      });

      // Give the server some time to start
      setTimeout(() => {
        if (this.serverProcess && this.serverProcess.exitCode === null && !this.serverProcess.killed) {
          logger.info('Server started successfully');
	          // Server 成功启动后重置重启计数，避免偶发退出导致累积到错误弹窗
	          this.serverRestartCount = 0;
          resolve();
        } else {
          reject(new Error('Server process died during startup'));
        }
      }, 3000);
    });
  }

	  /**
	   * Start the collector service process
	   * @param {number} port - The port to run the collector on
	   */
	  async startCollector(port) {
    return new Promise((resolve, reject) => {
      const collectorDir = getResourcePath('collector');
      const collectorPath = path.join(collectorDir, 'index.js');
	      logger.info(`Starting collector service on ${DESKTOP_BIND_HOST}:${port || 8888}...`);
      logger.info(`Collector path: ${collectorPath}`);
      logger.info(`Collector directory: ${collectorDir}`);

	      try {
	        if (!fs.existsSync(collectorPath)) {
	          throw new Error(`Collector entry not found: ${collectorPath}`);
	        }
	      } catch (e) {
	        const message = e?.message || String(e);
	        logger.error(`[Collector Error] ${message}`);
	        dialog.showErrorBox(
	          'Collector Error',
	          `Failed to start collector service.\n\n${message}\n\nPlease reinstall the app or rebuild the Electron sidecars.`
	        );
	        reject(e);
	        return;
	      }

	      const storageDir = resolveUserDataStorageDir();
	      try {
	        ensureServerStorageDirs(storageDir);
	        ensureCollectorSharedDirs(storageDir);
	      } catch (e) {
	        logger.error(`Failed to prepare storage directory: ${e.message}`);
	      }

	      const env = {
	        ...process.env,
	        COLLECTOR_HOST: DESKTOP_BIND_HOST,
	        // Collector 监听端口通过 COLLECTOR_PORT 控制，避免与其它进程冲突
	        COLLECTOR_PORT: (port || 8888).toString(),
	        CORS_ALLOWED_ORIGINS: getDesktopAppOrigin(this.serverPort || 3001),
	        // Collector 也统一使用 production 行为，避免与 Server 行为不一致
	        NODE_ENV: 'production',
	        STORAGE_DIR: storageDir,
	        ANYTHING_LLM_RUNTIME: process.env.ANYTHING_LLM_RUNTIME || 'desktop',
	      };
	      logDesktopEnvDiagnostics({
	        name: 'Collector',
	        collectorDir,
	        storageDir,
	        env,
	      });

	      const collectorEnv = {
	        ...env,
	        ELECTRON_RUN_AS_NODE: '1',
	      };
	      this.collectorProcess = spawn(process.execPath, [collectorPath], {
	        env: collectorEnv,
	        cwd: collectorDir,
	        stdio: ['ignore', 'pipe', 'pipe'],
	      });

      this.collectorProcess.stdout.on('data', (data) => {
        const message = data.toString().trim();
        logger.info(`[Collector] ${message}`);
        console.log(`[Collector] ${message}`);
      });

      this.collectorProcess.stderr.on('data', (data) => {
        const message = data.toString().trim();
        logger.error(`[Collector Error] ${message}`);
        console.error(`[Collector Error] ${message}`);
      });

      this.collectorProcess.on('error', (error) => {
        logger.error(`Failed to start collector: ${error.message}`);
        reject(error);
      });

      this.collectorProcess.on('exit', async (code, signal) => {
        logger.warn(`Collector process exited with code ${code}, signal ${signal}`);

        if (!this.isShuttingDown) {
          if (this.collectorRestartCount < this.maxRestartAttempts) {
	            this.collectorRestartCount++;
            logger.info(`Attempting to restart collector (${this.collectorRestartCount}/${this.maxRestartAttempts})...`);

            // Exponential backoff: 1s, 2s, 4s
	            const delay = Math.pow(2, this.collectorRestartCount - 1) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));

            try {
	              await this.startCollector(port);
            } catch (error) {
              logger.error(`Failed to restart collector: ${error.message}`);
            }
          } else {
            logger.error('Collector restart limit reached');
            dialog.showErrorBox(
              'Collector Crashed',
              `The collector service has crashed ${this.maxRestartAttempts} times and could not be restarted. Please check the logs and restart the application.`
            );
          }
        }
      });

      // Give the collector some time to start
      setTimeout(() => {
	        if (this.collectorProcess && this.collectorProcess.exitCode === null && !this.collectorProcess.killed) {
	          logger.info('Collector started successfully');
	          // Collector 成功启动后重置重启计数，避免偶发退出导致累积到错误弹窗
	          this.collectorRestartCount = 0;
	          resolve();
	        } else {
	          reject(new Error('Collector process died during startup'));
	        }
      }, 3000);
    });
  }

  /**
   * Start the IM gateway sidecar
   * @param {number} port - The port to run the gateway on
   * @param {number} serverPort - The local Alata server port
   */
  async startGateway(port, serverPort) {
    return new Promise((resolve, reject) => {
      const gatewayDir = getResourcePath('alata-im-gateway');
      const gatewayPath = path.join(gatewayDir, 'bin', 'alata-gateway.js');
      logger.info(`Starting IM gateway on ${DESKTOP_BIND_HOST}:${port}...`);
      logger.info(`Gateway path: ${gatewayPath}`);
      logger.info(`Gateway directory: ${gatewayDir}`);

      try {
        if (!fs.existsSync(gatewayPath)) {
          throw new Error(`Gateway entry not found: ${gatewayPath}`);
        }
      } catch (e) {
        const message = e?.message || String(e);
        logger.error(`[Gateway Error] ${message}`);
        dialog.showErrorBox(
          'Gateway Error',
          `Failed to start IM gateway.\n\n${message}\n\nPlease reinstall the app or rebuild the Electron sidecars.`
        );
        reject(e);
        return;
      }

      const gatewayDataDir = resolveGatewayDataDir();
      ensureGatewayDataDir(gatewayDataDir);

      const longConnEnv = {};
      [
        'FEISHU_DELIVERY_MODE',
        'FEISHU_LONGCONN_LOG_LEVEL',
        'FEISHU_LONGCONN_AUTO_RECONNECT',
        'FEISHU_LONGCONN_READY_TIMEOUT_MS',
      ].forEach((name) => {
        if (Object.prototype.hasOwnProperty.call(process.env, name)) {
          longConnEnv[name] = process.env[name];
        }
      });

      const env = {
        ...process.env,
        NODE_ENV: 'production',
        ANYTHING_LLM_RUNTIME: process.env.ANYTHING_LLM_RUNTIME || 'desktop',
        GATEWAY_HOST: DESKTOP_BIND_HOST,
        GATEWAY_PORT: (port || 3100).toString(),
        GATEWAY_DATA_DIR: gatewayDataDir,
        GATEWAY_CONFIG_MODE: process.env.GATEWAY_CONFIG_MODE || 'standalone',
        ALATA_BASE_URL:
          process.env.ALATA_BASE_URL || `${getDesktopAppOrigin(serverPort)}/api`,
        ...longConnEnv,
      };

      logDesktopEnvDiagnostics({
        name: 'Gateway',
        gatewayDir,
        storageDir: gatewayDataDir,
        env,
      });

      const gatewayEnv = {
        ...env,
        ELECTRON_RUN_AS_NODE: '1',
      };

      this.gatewayProcess = spawn(process.execPath, [gatewayPath, 'run'], {
        env: gatewayEnv,
        cwd: gatewayDir,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      this.gatewayProcess.stdout.on('data', (data) => {
        const message = data.toString().trim();
        logger.info(`[Gateway] ${message}`);
        console.log(`[Gateway] ${message}`);
      });

      this.gatewayProcess.stderr.on('data', (data) => {
        const message = data.toString().trim();
        logger.error(`[Gateway Error] ${message}`);
        console.error(`[Gateway Error] ${message}`);
      });

      this.gatewayProcess.on('error', (error) => {
        logger.error(`Failed to start gateway: ${error.message}`);
        reject(error);
      });

      this.gatewayProcess.on('exit', async (code, signal) => {
        logger.warn(`Gateway process exited with code ${code}, signal ${signal}`);

        if (!this.isShuttingDown) {
          if (this.gatewayRestartCount < this.maxRestartAttempts) {
            this.gatewayRestartCount++;
            logger.info(
              `Attempting to restart gateway (${this.gatewayRestartCount}/${this.maxRestartAttempts})...`
            );

            const delay = Math.pow(2, this.gatewayRestartCount - 1) * 1000;
            await new Promise(resolveDelay => setTimeout(resolveDelay, delay));

            try {
              await this.startGateway(port, serverPort);
            } catch (error) {
              logger.error(`Failed to restart gateway: ${error.message}`);
            }
          } else {
            logger.error('Gateway restart limit reached');
            dialog.showErrorBox(
              'Gateway Crashed',
              `The IM gateway has crashed ${this.maxRestartAttempts} times and could not be restarted. Please check the logs and restart the application.`
            );
          }
        }
      });

      setTimeout(() => {
        if (this.gatewayProcess && this.gatewayProcess.exitCode === null && !this.gatewayProcess.killed) {
          logger.info('Gateway started successfully');
          this.gatewayRestartCount = 0;
          resolve();
        } else {
          reject(new Error('Gateway process died during startup'));
        }
      }, 3000);
    });
  }

  /**
   * Start all services
   * @returns {Promise<{serverPort: number}>}
   */
	  async start() {
	    if (this.startPromise) {
	      // 避免重复并发调用导致多份子进程被启动
	      return this.startPromise;
	    }

	    this.startPromise = (async () => {
	      try {
	        // 为 Server 与 Collector 各自选择可用端口
	        const serverPort = await this.findAvailablePort(3001);
	        const collectorPort = await this.findAvailablePort(8888);
          const gatewayPort = await this.findAvailablePort(3100);

	        this.serverPort = serverPort;
	        this.collectorPort = collectorPort;
          this.gatewayPort = gatewayPort;

	        // Start server, collector, and IM gateway
	        await Promise.all([
	          this.startServer(serverPort, collectorPort),
	          this.startCollector(collectorPort),
            this.startGateway(gatewayPort, serverPort),
	        ]);

	        logger.info('All services started successfully');
	        logger.info(`Server running on ${DESKTOP_BIND_HOST}:${serverPort}`);
	        logger.info(`Collector running on ${DESKTOP_BIND_HOST}:${collectorPort}`);
          logger.info(`Gateway running on ${DESKTOP_BIND_HOST}:${gatewayPort}`);

	        return {
            serverHost: DESKTOP_BIND_HOST,
            serverPort,
            collectorPort,
            gatewayPort,
          };
	      } catch (error) {
	        logger.error(`Failed to start services: ${error.message}`);
	        // 出错时清理 startPromise 以便后续重试
	        this.startPromise = null;
	        throw error;
	      }
	    })();

	    return this.startPromise;
	  }

  /**
   * Stop all services
   */
  async stop() {
    this.isShuttingDown = true;
    logger.info('Shutting down services...');

    const killProcess = (process, name) => {
      return new Promise((resolve) => {
        if (!process) {
          resolve();
          return;
        }

        // Safety-net SIGKILL if a child ignores SIGTERM. Kept short (2s) so quit
        // stays snappy on the desktop; children are expected to exit in ms once
        // they destroy their keep-alive sockets on SIGTERM.
        const timeout = setTimeout(() => {
          logger.warn(`${name} did not exit gracefully, forcing kill`);
          process.kill('SIGKILL');
          resolve();
        }, 2000);

        process.once('exit', () => {
          clearTimeout(timeout);
          logger.info(`${name} stopped`);
          resolve();
        });

        process.kill('SIGTERM');
      });
    };

    await Promise.all([
      killProcess(this.serverProcess, 'Server'),
      killProcess(this.collectorProcess, 'Collector'),
      killProcess(this.gatewayProcess, 'Gateway'),
    ]);

    this.serverProcess = null;
    this.collectorProcess = null;
    this.gatewayProcess = null;
	    this.serverPort = null;
	    this.collectorPort = null;
      this.gatewayPort = null;
	    this.startPromise = null;
	    this.serverRestartCount = 0;
	    this.collectorRestartCount = 0;
      this.gatewayRestartCount = 0;
    // NOTE: deliberately do NOT reset isShuttingDown to false here.
    // stop() is only ever called from the app 'before-quit' handler, which then
    // calls app.quit(), re-firing 'before-quit'. If this flag were cleared, the
    // guard `if (!isShuttingDown)` would pass again, re-entering stop()/preventDefault
    // in a loop (the quit "hang"), eventually corrupting Electron's quit machinery
    // into a native EXC_BREAKPOINT/SIGTRAP crash. Keeping it true lets the second
    // 'before-quit' short-circuit so the app exits cleanly, and stops the killed
    // child-process 'exit' handlers from auto-restarting the services we just stopped.
    logger.info('All services stopped');
  }
}

module.exports = ServerManager;
