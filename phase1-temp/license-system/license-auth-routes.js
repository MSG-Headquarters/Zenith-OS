// ============================================
// LICENSE ACTIVATION - Auth Routes
// Add these routes to your auth handling (app.js or separate auth.js)
// ============================================

// GET /activate - Show license activation page
app.get('/activate', (req, res) => {
    // If already logged in, redirect to dashboard
    if (req.session && req.session.user) {
        return res.redirect('/dashboard');
    }
    res.render('activate', { title: 'Activate License' });
});

// POST /auth/verify-license - Verify license key exists and is pending
app.post('/auth/verify-license', async (req, res) => {
    try {
        const { license_key } = req.body;

        if (!license_key) {
            return res.status(400).json({ success: false, error: 'License key is required' });
        }

        // Find user with this license
        const result = await pool.query(`
            SELECT u.id, u.name, u.email, u.license_status, u.password_set,
                   ur.name as role_name
            FROM users u
            LEFT JOIN user_role_assignments ura ON u.id = ura.user_id
            LEFT JOIN user_roles ur ON ura.role_id = ur.id
            WHERE u.license_key = $1
        `, [license_key.toUpperCase()]);

        if (result.rows.length === 0) {
            // Log failed attempt
            await pool.query(`
                INSERT INTO license_audit (license_key, action, ip_address, user_agent, details)
                VALUES ($1, 'verify.failed', $2, $3, $4)
            `, [license_key, req.ip, req.get('User-Agent'), JSON.stringify({ reason: 'not_found' })]);

            return res.status(400).json({ success: false, error: 'Invalid license key' });
        }

        const user = result.rows[0];

        // Check license status
        if (user.license_status === 'revoked') {
            return res.status(400).json({ success: false, error: 'This license has been revoked. Contact your administrator.' });
        }

        if (user.license_status === 'suspended') {
            return res.status(400).json({ success: false, error: 'This license is suspended. Contact your administrator.' });
        }

        if (user.license_status === 'active' && user.password_set) {
            return res.status(400).json({ success: false, error: 'This license is already activated. Please sign in instead.' });
        }

        // Log successful verification
        await pool.query(`
            INSERT INTO license_audit (user_id, license_key, action, ip_address, user_agent)
            VALUES ($1, $2, 'verify.success', $3, $4)
        `, [user.id, license_key, req.ip, req.get('User-Agent')]);

        res.json({
            success: true,
            user: {
                name: user.name,
                email: user.email,
                role: user.role_name || 'User'
            }
        });
    } catch (error) {
        console.error('[License] Verify error:', error);
        res.status(500).json({ success: false, error: 'Verification failed' });
    }
});

// POST /auth/activate-license - Set password and activate license
app.post('/auth/activate-license', async (req, res) => {
    try {
        const { license_key, password } = req.body;

        if (!license_key || !password) {
            return res.status(400).json({ success: false, error: 'License key and password are required' });
        }

        if (password.length < 8) {
            return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
        }

        // Find user
        const result = await pool.query(`
            SELECT id, name, license_status, organization_id
            FROM users
            WHERE license_key = $1
        `, [license_key.toUpperCase()]);

        if (result.rows.length === 0) {
            return res.status(400).json({ success: false, error: 'Invalid license key' });
        }

        const user = result.rows[0];

        if (user.license_status === 'revoked' || user.license_status === 'suspended') {
            return res.status(400).json({ success: false, error: 'This license cannot be activated' });
        }

        // Hash password
        const crypto = require('crypto');
        const passwordHash = crypto.createHash('sha256').update(password).digest('hex');

        // Activate license
        await pool.query(`
            UPDATE users
            SET password_hash = $1,
                password_set = TRUE,
                license_status = 'active',
                license_activated_at = NOW(),
                first_login_at = NOW(),
                status = 'active'
            WHERE id = $2
        `, [passwordHash, user.id]);

        // Audit logs
        await pool.query(`
            INSERT INTO license_audit (user_id, license_key, action, ip_address, user_agent)
            VALUES ($1, $2, 'license.activated', $3, $4)
        `, [user.id, license_key, req.ip, req.get('User-Agent')]);

        await pool.query(`
            INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, new_value)
            VALUES ($1, $2, 'license.activated', 'user', $2, $3)
        `, [user.organization_id, user.id, JSON.stringify({ activated_at: new Date().toISOString() })]);

        res.json({ success: true });
    } catch (error) {
        console.error('[License] Activation error:', error);
        res.status(500).json({ success: false, error: 'Activation failed' });
    }
});

// ============================================
// Update Login Route to Check License Status
// ============================================
// Modify your existing login POST handler to include:

/*
// In your login handler, add this check after verifying credentials:

// Check license status
if (user.license_status === 'revoked') {
    return res.status(401).json({ 
        success: false, 
        error: 'Your license has been revoked. Contact your administrator.' 
    });
}

if (user.license_status === 'suspended') {
    return res.status(401).json({ 
        success: false, 
        error: 'Your license is suspended. Contact your administrator.' 
    });
}

if (user.license_status === 'pending' || !user.password_set) {
    return res.status(401).json({ 
        success: false, 
        error: 'Please activate your license first.',
        redirect: '/activate'
    });
}
*/
