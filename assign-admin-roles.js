const {Pool} = require('pg');
const p = new Pool({
    connectionString: 'postgresql://zenith_admin:ZenithDB2026secure@zenith-db.cnqawc0wy3sg.us-east-2.rds.amazonaws.com:5432/zenith_db',
    ssl: {rejectUnauthorized: false}
});

async function assignAdminRoles() {
    // Get admin role ID for tenant 1
    const roleResult = await p.query("SELECT id FROM user_roles WHERE slug = 'admin' AND tenant_id = 1");
    const adminRoleId = roleResult.rows[0].id;
    console.log('Admin role ID:', adminRoleId);
    
    // Assign admin role to users 1, 7, 8, 9, 10 (all the admins/principals)
    const adminUserIds = [1, 7, 8, 9, 10];
    
    for (const userId of adminUserIds) {
        await p.query(
            "INSERT INTO user_role_assignments (user_id, role_id) VALUES ($1, $2) ON CONFLICT (user_id, role_id) DO NOTHING",
            [userId, adminRoleId]
        );
        console.log('  Assigned admin role to user ID:', userId);
    }
    
    // Verify
    const verify = await p.query("SELECT u.name, u.email, ur.name as role_name FROM user_role_assignments ura JOIN users u ON ura.user_id = u.id JOIN user_roles ur ON ura.role_id = ur.id");
    console.log('\nVerified assignments:');
    verify.rows.forEach(r => console.log('  ', r.name, '-', r.role_name));
    
    console.log('\nDone!');
    await p.end();
}

assignAdminRoles();
