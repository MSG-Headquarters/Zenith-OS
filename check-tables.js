require('dotenv').config();
const { Pool } = require('pg');
const p = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

p.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name LIKE '%campaign%' OR table_name LIKE '%email_%')")
  .then(r => {
    console.log('Campaign/Email Tables:', r.rows.map(x => x.table_name));
    p.end();
  });
