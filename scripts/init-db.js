require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const pool = require('../db');

async function initDB() {
    // Create tables if they don't exist
    const createTables = [
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

    // Add structural_flags column to parsed_profiles if it doesn't exist
    const addStructuralFlagsColumn = `
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='parsed_profiles' AND column_name='structural_flags'
            ) THEN
                ALTER TABLE parsed_profiles ADD COLUMN structural_flags JSONB DEFAULT '[]';
                RAISE NOTICE 'Added structural_flags column to parsed_profiles';
            END IF;
        END $$;
    `;

    // Add flags column to scoring_records if it doesn't exist
    const addFlagsColumn = `
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='scoring_records' AND column_name='flags'
            ) THEN
                ALTER TABLE scoring_records ADD COLUMN flags JSONB DEFAULT '[]';
                RAISE NOTICE 'Added flags column to scoring_records';
            END IF;
        END $$;
    `;

    // Execute table creation
    for (const sql of createTables) {
        await pool.query(sql);
        const match = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/);
        console.log(`✓ ${match ? match[1] : 'table'}`);
    }

    // Execute column additions
    await pool.query(addStructuralFlagsColumn);
    await pool.query(addFlagsColumn);

    console.log('\nDatabase initialization completed successfully.');
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