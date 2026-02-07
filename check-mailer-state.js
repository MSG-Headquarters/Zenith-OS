require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function check() {
    try {
        const tables = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`);
        console.log('=== ALL TABLES ===');
        tables.rows.forEach(r => console.log(' ', r.table_name));

        const danimal = await pool.query('SELECT COUNT(*) FROM danimal_leads');
        console.log('\nDANIMAL LEADS:', danimal.rows[0].count);

        const users = await pool.query('SELECT id, name, email, role FROM users ORDER BY id');
        console.log('\n=== USERS ===');
        users.rows.forEach(u => console.log('  ' + u.id + ': ' + u.name + ' (' + u.email + ') - ' + u.role));
    } catch (err) {
        console.error('Error:', err.message);
    }
    pool.end();
}
check();
