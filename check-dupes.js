require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  try {
    const total = await pool.query('SELECT COUNT(*) FROM danimal_leads');
    console.log('Total records:', total.rows[0].count);

    // Faster: count unique combos vs total
    const unique = await pool.query('SELECT COUNT(*) FROM (SELECT DISTINCT source, source_id FROM danimal_leads) sub');
    console.log('Unique records:', unique.rows[0].count);
    console.log('Estimated duplicates:', total.rows[0].count - unique.rows[0].count);
  } catch (err) {
    console.error('Error:', err.message);
  }
  pool.end();
})();
