/**
 * Logger Utility
 * Centralized logging for the application
 */

const fs = require('fs');
const path = require('path');

const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logFile = path.join(logsDir, `app-${new Date().toISOString().split('T')[0]}.log`);

// Save original console functions to bypass our production silencer when needed
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development';

// Override global console.log and console.debug in production to silence direct console calls
if (isProduction) {
  console.log = () => {};
  console.debug = () => {};
}

class Logger {
  static formatLog(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    return JSON.stringify({
      timestamp,
      level,
      message,
      ...data,
    });
  }

  static writeLog(level, message, data = {}) {
    const logEntry = this.formatLog(level, message, data);

    // Always write to log file in production for tracking
    if (isProduction) {
      try {
        fs.appendFileSync(logFile, logEntry + '\n');
      } catch (err) {
        // Fail-safe: write to original console error
        originalError('Failed to write log file:', err);
      }
    }
  }

  static info(message, data = {}) {
    // Info logs show only in non-production environments
    if (!isProduction) {
      const dataStr = Object.keys(data).length ? ` ${JSON.stringify(data)}` : '';
      originalLog(`[INFO] ${message}${dataStr}`);
    }
    this.writeLog('INFO', message, data);
  }

  static warn(message, data = {}) {
    // Warnings print to console in all environments
    const dataStr = Object.keys(data).length ? ` ${JSON.stringify(data)}` : '';
    originalWarn(`[WARN] ${message}${dataStr}`);
    this.writeLog('WARN', message, data);
  }

  static error(message, data = {}) {
    // Errors print to console in all environments
    const dataStr = Object.keys(data).length ? ` ${JSON.stringify(data)}` : '';
    originalError(`[ERROR] ${message}${dataStr}`);
    this.writeLog('ERROR', message, data);
  }

  static debug(message, data = {}) {
    // Debug logs only print to console in development mode
    if (isDevelopment) {
      const dataStr = Object.keys(data).length ? ` ${JSON.stringify(data)}` : '';
      originalLog(`[DEBUG] ${message}${dataStr}`);
    }
    this.writeLog('DEBUG', message, data);
  }

  // Bypasses console silence to print startup and database connection messages
  static logAlways(message) {
    originalLog(message);
  }
}

module.exports = Logger;
