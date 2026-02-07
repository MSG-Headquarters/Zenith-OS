require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function check() {
    try {
        const tables = ['email_campaigns','email_templates','email_subscribers','email_segments','email_events','campaign_recipients','email_unsubscribes'];
        for (const t of tables) {
            const cols = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`, [t]);
            const count = await pool.query('SELECT COUNT(*) FROM ' + t);
            console.log('\n' + t + ' (' + count.rows[0].count + ' rows):');
            cols.rows.forEach(c => console.log('  ' + c.column_name + ' (' + c.data_type + ')'));
        }
        console.log('\nDANIMAL LEADS:');
        const d = await pool.query('SELECT COUNT(*) as total FROM danimal_leads');
        console.log('  Total:', d.rows[0].total);
        const sample = await pool.query('SELECT first_name, last_name, email, license_type, county FROM danimal_leads WHERE email IS NOT NULL LIMIT 3');
        console.log('  Sample with emails:');
        sample.rows.forEach(r => console.log('   ', r.first_name, r.last_name, r.email, '-', r.license_type, r.county));
        const withEmail = await pool.query('SELECT COUNT(*) FROM danimal_leads WHERE email IS NOT NULL');
        console.log('  With email:', withEmail.rows[0].count);
    } catch (err) { console.error('Error:', err.message); }
    pool.end();
}
check();
