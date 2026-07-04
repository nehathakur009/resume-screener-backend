require('dotenv').config();
const express = require('express');
const cors = require('cors');
const router = require('./routes');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:8000',
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.use('/api', router);

// Global error handler
app.use((err, req, res, next) => {
  logger.error(err.message, { stack: err.stack, path: req.path });
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  logger.info(`Resume Scanner API running on port ${PORT}`);
});

module.exports = app;
