const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
    connectionString: 'postgres://zenith_admin:ZenithDB2026secure@zenith-db.cnqawc0wy3sg.us-east-2.rds.amazonaws.com:5432/zenith_db',
    ssl: { rejectUnauthorized: false }
});

async function run() {
    const sql = fs.readFileSync('./huddle-schema.sql', 'utf8');
    try {
        await pool.query(sql);
        console.log('✓ Huddle schema created successfully!');
    } catch (err) {
        console.error('Error:', err.message);
    }
    await pool.end();
}

run();
