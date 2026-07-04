require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const pool = require('../db');

const tables = [
    `CREATE TABLE IF NOT EXISTS candidates (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255),
        email VARCHAR(255),
        phone VARCHAR(100),
        created_at TIMESTAMP DEFAULT NOW()
    )`,

    `CREATE TABLE IF NOT EXISTS resumes (
        id SERIAL PRIMARY KEY,
        candidate_id INTEGER REFERENCES candidates(id) ON DELETE CASCADE,
        original_filename VARCHAR(500) NOT NULL,
        raw_text TEXT,
        file_size INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
    )`,

    `CREATE TABLE IF NOT EXISTS parsed_profiles (
        id SERIAL PRIMARY KEY,
        resume_id INTEGER REFERENCES resumes(id) ON DELETE CASCADE UNIQUE,
        roles JSONB DEFAULT '[]',
        education JSONB DEFAULT '[]',
        skills JSONB DEFAULT '[]',
        certifications JSONB DEFAULT '[]',
        summary TEXT,
        total_experience_years FLOAT,
        parsed_at TIMESTAMP DEFAULT NOW()
    )`,

    `CREATE TABLE IF NOT EXISTS job_descriptions (
        id SERIAL PRIMARY KEY,
        title VARCHAR(500),
        description TEXT NOT NULL,
        criteria JSONB DEFAULT '[]',
        created_at TIMESTAMP DEFAULT NOW()
    )`,

    `CREATE TABLE IF NOT EXISTS scoring_records (
        id SERIAL PRIMARY KEY,
        resume_id INTEGER REFERENCES resumes(id) ON DELETE CASCADE,
        jd_id INTEGER REFERENCES job_descriptions(id) ON DELETE CASCADE,
        total_score FLOAT NOT NULL,
        criterion_breakdown JSONB DEFAULT '[]',
        flags JSONB DEFAULT '[]',
        overall_rationale TEXT,
        rank INTEGER,
        scored_at TIMESTAMP DEFAULT NOW(),
        UNIQUE (resume_id, jd_id)
    )`,
];

async function initDB() {
    for (const sql of tables) {
        await pool.query(sql);
        const match = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/);
        console.log(`✓ ${match ? match[1] : 'table'}`);
    }
    console.log('\nDatabase initialized successfully.');
}

// Export the function so it can be imported in app.js
module.exports = initDB;

// Also execute the function if this file is run directly (for manual execution)
if (require.main === module) {
    initDB().catch((err) => {
        console.error('Init failed:', err.message);
        process.exit(1);
    });
}