require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function check() {
    try {
        const leads = await pool.query('SELECT COUNT(*) FROM leads');
        console.log('CRM LEADS:', leads.rows[0].count);
        
        const withEmail = await pool.query("SELECT COUNT(*) FROM leads WHERE email IS NOT NULL AND email != ''");
        console.log('With email:', withEmail.rows[0].count);
        
        const sample = await pool.query("SELECT id, first_name, last_name, email, company, stage FROM leads WHERE email IS NOT NULL LIMIT 5");
        console.log('\nSample:');
        sample.rows.forEach(r => console.log('  ' + r.id + ': ' + r.first_name + ' ' + r.last_name + ' <' + r.email + '> - ' + r.company + ' (' + r.stage + ')'));

        // Check leads columns
        const cols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'leads' ORDER BY ordinal_position");
        console.log('\nLEADS COLUMNS:');
        cols.rows.forEach(c => console.log('  ' + c.column_name));
    } catch (err) { console.error('Error:', err.message); }
    pool.end();
}
check();
