const {Pool} = require('pg');
const p = new Pool({
    connectionString: 'postgresql://zenith_admin:ZenithDB2026secure@zenith-db.cnqawc0wy3sg.us-east-2.rds.amazonaws.com:5432/zenith_db',
    ssl: {rejectUnauthorized: false}
});

p.query("SELECT id, name, email, role, organization_id FROM users ORDER BY id")
.then(r => {
    console.log('All users:');
    r.rows.forEach(u => console.log('  ID:', u.id, '|', u.name, '|', u.email, '| role:', u.role, '| org:', u.organization_id));
    p.end();
});
