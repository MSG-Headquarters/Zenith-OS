require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  try {
    const sources = await pool.query(
      'SELECT source, COUNT(*) as count FROM danimal_leads GROUP BY source ORDER BY count DESC'
    );
    console.log('Records by source:');
    sources.rows.forEach(r => console.log('  ' + r.source.padEnd(30) + Number(r.count).toLocaleString()));
    console.log('\nTotal sources:', sources.rows.length);
    console.log('Total records:', sources.rows.reduce((sum, r) => sum + parseInt(r.count), 0).toLocaleString());
  } catch (err) {
    console.error('Error:', err.message);
  }
  pool.end();
})();
