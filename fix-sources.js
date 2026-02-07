require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  try {
    // 1. Delete the 380 cross-case duplicates (keep the DBPR ones, delete dbpr dupes)
    const deleted = await pool.query(
      "DELETE FROM danimal_leads WHERE source = 'dbpr' AND source_id IN (SELECT source_id FROM danimal_leads WHERE source = 'DBPR')"
    );
    console.log('Deleted cross-case duplicates:', deleted.rowCount);

    // 2. Normalize remaining 'dbpr' to 'DBPR'
    const updated = await pool.query(
      "UPDATE danimal_leads SET source = 'DBPR' WHERE source = 'dbpr'"
    );
    console.log('Normalized dbpr -> DBPR:', updated.rowCount);

    // 3. Final count
    const total = await pool.query('SELECT COUNT(*) FROM danimal_leads');
    console.log('Final total records:', Number(total.rows[0].count).toLocaleString());

    const sources = await pool.query('SELECT source, COUNT(*) as count FROM danimal_leads GROUP BY source');
    sources.rows.forEach(r => console.log('  ' + r.source + ': ' + Number(r.count).toLocaleString()));
  } catch (err) {
    console.error('Error:', err.message);
  }
  pool.end();
})();
