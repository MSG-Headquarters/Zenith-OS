require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function simulate() {
    // Simulate what loadPermissions does for user id 1 (admin)
    var roleResult = await pool.query(
        'SELECT ur.id, ur.slug, ur.name, ur.is_admin FROM user_role_assignments ura JOIN user_roles ur ON ura.role_id = ur.id WHERE ura.user_id = $1', [1]
    );
    console.log('Roles:', roleResult.rows);

    var permResult = await pool.query(
        "SELECT m.slug as module_slug, m.name as module_name, m.icon, m.route, m.sort_order, rp.access_level FROM role_permissions rp JOIN modules m ON rp.module_id = m.id JOIN user_role_assignments ura ON rp.role_id = ura.role_id WHERE ura.user_id = $1 AND m.is_active = true ORDER BY m.sort_order", [1]
    );
    console.log('\nModules returned for user 1:');
    permResult.rows.forEach(function(r) { console.log('  ', r.sort_order, '|', r.module_slug, '|', r.module_name, '|', r.access_level); });

    var hawkFound = permResult.rows.find(function(r) { return r.module_slug === 'hawk'; });
    console.log('\nHAWK found:', hawkFound ? 'YES' : 'NO');

    pool.end();
}
simulate().catch(e => { console.error(e.message); pool.end(); });
