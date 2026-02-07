require('dotenv').config();
const {Pool} = require('pg');
const p = new Pool({connectionString: process.env.DATABASE_URL, ssl: {rejectUnauthorized: false}});

// Delete duplicates keeping lowest id
const query = `
  DELETE FROM danimal_leads 
  WHERE id NOT IN (
    SELECT MIN(id) 
    FROM danimal_leads 
    GROUP BY source, business_name, street_address, city
  )
`;

console.log('Deleting duplicates... this may take a minute');
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
