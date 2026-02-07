require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function check() {
    try {
        const cols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'danimal_leads' ORDER BY ordinal_position`);
        console.log('DANIMAL COLUMNS:');
        cols.rows.forEach(c => console.log('  ' + c.column_name));

        const sample = await pool.query('SELECT * FROM danimal_leads LIMIT 2');
        console.log('\nSAMPLE ROW:');
        console.log(JSON.stringify(sample.rows[0], null, 2));

        const withEmail = await pool.query("SELECT COUNT(*) FROM danimal_leads WHERE email IS NOT NULL AND email != ''");
        console.log('\nWith email:', withEmail.rows[0].count);

        // Check existing templates
        const templates = await pool.query('SELECT id, name, category FROM email_templates');
        console.log('\nTEMPLATES:');
        templates.rows.forEach(t => console.log('  ' + t.id + ': ' + t.name + ' (' + t.category + ')'));

        // Check mailer view file
        const fs = require('fs');
        const viewExists = fs.existsSync('views/mailer.ejs');
        const dirExists = fs.existsSync('views/mailer/index.ejs');
        console.log('\nVIEW FILES:');
        console.log('  views/mailer.ejs:', viewExists);
        console.log('  views/mailer/index.ejs:', dirExists);
    } catch (err) { console.error('Error:', err.message); }
    pool.end();
}
check();
