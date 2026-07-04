// require('dotenv').config();
// const { Pool } = require('pg');

// const pool = new Pool({
//   user: process.env.PG_USER,
//   host: process.env.PG_HOST,
//   database: process.env.PG_DATABASE,
//   password: process.env.PG_PASSWORD,
//   port: parseInt(process.env.PG_PORT) || 5432,
// });

// pool.on('error', (err) => {
//   console.error('Unexpected pg pool error', err);
// });

require('dotenv').config();
const { Pool } = require('pg');

// Log environment variables for debugging (without showing passwords)
console.log('DEBUG: DATABASE_URL exists:', !!process.env.DATABASE_URL);
console.log('DEBUG: PG_USER:', process.env.PG_USER || 'not set');
console.log('DEBUG: PG_HOST:', process.env.PG_HOST || 'not set');
console.log('DEBUG: PG_DATABASE:', process.env.PG_DATABASE || 'not set');

// Use DATABASE_URL if it's set, otherwise use individual connection parameters
const connectionString = process.env.DATABASE_URL ||
    `postgresql://${process.env.PG_USER}:${process.env.PG_PASSWORD}@${process.env.PG_HOST}:${process.env.PG_PORT || 5432}/${process.env.PG_DATABASE}`;

console.log('DEBUG: Connection string:', connectionString);

const pool = new Pool({
    connectionString
});

// Test database connection immediately
pool.connect((err, _client, done) => {
    if (err) {
        console.error('❌❌❌ DATABASE CONNECTION FAILED:', err.message);
        console.error('❌❌❌ This will prevent API routes from loading properly!');
        // Don't exit - keep server running but log the error
    } else {
        console.log('✅✅✅ DATABASE CONNECTION SUCCESSFUL');
        done(); // Release the client
    }
});

pool.on('error', (err) => {
    console.error('❌ Unexpected pg pool error:', err.message);
});

module.exports = pool;