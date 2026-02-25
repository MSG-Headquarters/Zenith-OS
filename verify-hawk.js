require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function verify() {
    // Verify HAWK module exists with correct data
    var r = await pool.query("SELECT id, name, slug, route, icon, is_active, sort_order FROM modules WHERE slug = 'hawk'");
    console.log('HAWK module:', r.rows[0]);

    // Verify permissions exist
    var p = await pool.query("SELECT rp.role_id, ur.name, rp.access_level FROM role_permissions rp JOIN user_roles ur ON ur.id = rp.role_id WHERE rp.module_id = (SELECT id FROM modules WHERE slug = 'hawk')");
    console.log('HAWK permissions:');
    p.rows.forEach(function(row) { console.log('  ', row.name, ':', row.access_level); });

    pool.end();
}
verify().catch(e => { console.error(e.message); pool.end(); });
