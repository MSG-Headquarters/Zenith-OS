const {Pool} = require('pg');
const p = new Pool({
    connectionString: 'postgresql://zenith_admin:ZenithDB2026secure@zenith-db.cnqawc0wy3sg.us-east-2.rds.amazonaws.com:5432/zenith_db',
    ssl: {rejectUnauthorized: false}
});
p.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'users' ORDER BY ordinal_position")
.then(r => {
    console.log('Users table columns:');
    r.rows.forEach(x => console.log('  -', x.column_name));
    p.end();
});
