require('dotenv').config();
const express = require('express');
const cors = require('cors');
const router = require('./routes');
const logger = require('./utils/logger');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:8000',
    credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Database health check endpoint
app.get('/api/health/db', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW()');
        res.json({
            status: 'ok',
            database: 'connected',
            timestamp: result.rows[0].now,
            server: new Date().toISOString()
        });
    } catch (error) {
        console.error('Database health check failed:', error);
        res.status(500).json({
            status: 'error',
            database: 'disconnected',
            error: error.message
        });
    }
});

// API routes
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