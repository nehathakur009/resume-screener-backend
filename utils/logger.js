const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'resume-scanner' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const extras = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
          return `${timestamp} [${level}]: ${message}${extras}`;
        })
      ),
    }),
    new DailyRotateFile({
      filename: path.join(__dirname, '../logs/app-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: '14d',
      createSymlink: true,
      symlinkName: 'current.log',
    }),
  ],
});

module.exports = logger;
