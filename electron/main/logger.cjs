const winston = require('winston');
const path = require('path');
const { app } = require('electron');
const fs = require('fs');

// Initialize logger lazily to ensure app is ready
let logger = null;

function getLogger() {
  if (logger) return logger;

  const logsDir = path.join(app.getPath('userData'), 'logs');

  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.errors({ stack: true }),
      winston.format.printf(({ timestamp, level, message, stack }) => {
        return `${timestamp} [${level.toUpperCase()}]: ${stack || message}`;
      })
    ),
    transports: [
      // Write all logs to electron.log
      new winston.transports.File({
        filename: path.join(logsDir, 'electron.log'),
        maxsize: 10 * 1024 * 1024, // 10 MB
        maxFiles: 5,
        tailable: true,
      }),
      // Write error logs to error.log
      new winston.transports.File({
        filename: path.join(logsDir, 'error.log'),
        level: 'error',
        maxsize: 10 * 1024 * 1024, // 10 MB
        maxFiles: 5,
        tailable: true,
      }),
    ],
  });

  // Also log to console in development
  if (process.env.NODE_ENV === 'development') {
    logger.add(new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }));
  }

  return logger;
}

// Export a proxy object that lazily initializes the logger
module.exports = new Proxy({}, {
  get(target, prop) {
    return getLogger()[prop];
  }
});
