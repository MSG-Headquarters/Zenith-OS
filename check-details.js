require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  try {
    // Check cross-case duplicates (same source_id, different case source)
    const crossDupes = await pool.query(
      "SELECT COUNT(*) FROM danimal_leads a INNER JOIN danimal_leads b ON a.source_id = b.source_id AND a.source = 'dbpr' AND b.source = 'DBPR'"
    );
    console.log('Cross-case duplicates (dbpr vs DBPR same source_id):', crossDupes.rows[0].count);

    // What license types exist?
    const types = await pool.query(
      'SELECT license_type, COUNT(*) as count FROM danimal_leads GROUP BY license_type ORDER BY count DESC LIMIT 20'
    );
    console.log('\nTop 20 license types:');
    types.rows.forEach(r => console.log('  ' + (r.license_type || 'NULL').padEnd(40) + Number(r.count).toLocaleString()));
  } catch (err) {
    console.error('Error:', err.message);
  }
  pool.end();
})();
