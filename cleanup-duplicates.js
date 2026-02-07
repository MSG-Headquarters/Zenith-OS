require('dotenv').config();
const {Pool} = require('pg');
const p = new Pool({connectionString: process.env.DATABASE_URL, ssl: {rejectUnauthorized: false}});

const query = "DELETE FROM danimal_leads a USING danimal_leads b WHERE a.id > b.id AND a.source = b.source AND a.license_number = b.license_number AND a.license_number IS NOT NULL AND a.license_number != ''";

p.query(query).then(r => {
  console.log('Deleted duplicates:', r.rowCount);
  return p.query('SELECT COUNT(*) FROM danimal_leads');
}).then(r => {
  console.log('Remaining records:', r.rows[0].count);
  p.end();
}).catch(e => {
  console.error(e);
  p.end();
});
