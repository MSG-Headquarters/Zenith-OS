// ============================================
// LICENSE KEY SYSTEM - Routes
// Add these to routes/admin.js before "return router;"
// ============================================

    // ============================================
    // API: Generate license key for new user
    // ============================================
    router.post('/api/users/:id/generate-license', async (req, res) => {
        try {
            const userId = req.params.id;
            const orgId = req.session.org?.id || 1;

            // Get user info
            const userResult = await pool.query(`
                SELECT u.*, ur.slug as role_slug 
                FROM users u
                LEFT JOIN user_role_assignments ura ON u.id = ura.user_id
                LEFT JOIN user_roles ur ON ura.role_id = ur.id
                WHERE u.id = $1
            `, [userId]);

            if (userResult.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'User not found' });
            }

            const user = userResult.rows[0];

            // Check if already has license
            if (user.license_key && user.license_status === 'active') {
                return res.status(400).json({ success: false, error: 'User already has an active license' });
            }

            // Generate license key
            const licenseResult = await pool.query(`
                SELECT generate_license_key($1, $2) as license_key
            `, [user.name, user.role_slug || 'user']);

            let licenseKey = licenseResult.rows[0].license_key;

            // Ensure uniqueness by adding random suffix if needed
            let attempts = 0;
            while (attempts < 10) {
                const existing = await pool.query(`SELECT id FROM users WHERE license_key = $1`, [licenseKey]);
                if (existing.rows.length === 0) break;
                licenseKey = licenseKey.substring(0, licenseKey.lastIndexOf('-') + 1) + 
                             Math.random().toString(36).substring(2, 6).toUpperCase();
                attempts++;
            }

            // Update user with license
            await pool.query(`
                UPDATE users 
                SET license_key = $1, 
                    license_status = 'pending',
                    license_issued_by = $2,
                    license_issued_at = NOW()
                WHERE id = $3
            `, [licenseKey, req.session.user.id, userId]);

            // Audit log
            await pool.query(`
                INSERT INTO license_audit (user_id, license_key, action, performed_by, details)
                VALUES ($1, $2, 'license.generated', $3, $4)
            `, [userId, licenseKey, req.session.user.id, JSON.stringify({ role: user.role_slug })]);

            await pool.query(`
                INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, new_value)
                VALUES ($1, $2, 'license.generated', 'user', $3, $4)
            `, [orgId, req.session.user.id, userId, JSON.stringify({ license_key: licenseKey })]);

            res.json({ success: true, license_key: licenseKey });
        } catch (error) {
            console.error('[License] Generate error:', error);
            res.status(500).json({ success: false, error: 'Failed to generate license' });
        }
    });

    // ============================================
    // API: Revoke license
    // ============================================
    router.post('/api/users/:id/revoke-license', async (req, res) => {
        try {
            const userId = req.params.id;
            const orgId = req.session.org?.id || 1;
            const { reason } = req.body;

            // Prevent self-revocation
            if (userId == req.session.user.id) {
                return res.status(400).json({ success: false, error: 'Cannot revoke your own license' });
            }

            // Get current license
            const userResult = await pool.query(`SELECT license_key, license_status FROM users WHERE id = $1`, [userId]);
            const oldLicense = userResult.rows[0];

            // Update license status
            await pool.query(`
                UPDATE users 
                SET license_status = 'revoked',
                    status = 'terminated',
                    status_reason = $1,
                    status_changed_by = $2,
                    status_changed_at = NOW()
                WHERE id = $3
            `, [reason || 'License revoked', req.session.user.id, userId]);

            // Audit logs
            await pool.query(`
                INSERT INTO license_audit (user_id, license_key, action, performed_by, details)
                VALUES ($1, $2, 'license.revoked', $3, $4)
            `, [userId, oldLicense?.license_key, req.session.user.id, JSON.stringify({ reason })]);

            await pool.query(`
                INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, old_value, new_value)
                VALUES ($1, $2, 'license.revoked', 'user', $3, $4, $5)
            `, [orgId, req.session.user.id, userId, 
                JSON.stringify({ status: oldLicense?.license_status }),
                JSON.stringify({ status: 'revoked', reason })]);

            // Clear permission cache
            clearPermissionCache(userId, orgId);

            res.json({ success: true });
        } catch (error) {
            console.error('[License] Revoke error:', error);
            res.status(500).json({ success: false, error: 'Failed to revoke license' });
        }
    });

    // ============================================
    // API: Reissue license (generate new key)
    // ============================================
    router.post('/api/users/:id/reissue-license', async (req, res) => {
        try {
            const userId = req.params.id;
            const orgId = req.session.org?.id || 1;

            // Get user info
            const userResult = await pool.query(`
                SELECT u.*, ur.slug as role_slug 
                FROM users u
                LEFT JOIN user_role_assignments ura ON u.id = ura.user_id
                LEFT JOIN user_roles ur ON ura.role_id = ur.id
                WHERE u.id = $1
            `, [userId]);

            if (userResult.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'User not found' });
            }

            const user = userResult.rows[0];
            const oldKey = user.license_key;

            // Generate new license key
            const licenseResult = await pool.query(`
                SELECT generate_license_key($1, $2) as license_key
            `, [user.name, user.role_slug || 'user']);

            let licenseKey = licenseResult.rows[0].license_key;

            // Ensure uniqueness
            let attempts = 0;
            while (attempts < 10) {
                const existing = await pool.query(`SELECT id FROM users WHERE license_key = $1 AND id != $2`, [licenseKey, userId]);
                if (existing.rows.length === 0) break;
                licenseKey = licenseKey + '-' + Math.random().toString(36).substring(2, 4).toUpperCase();
                attempts++;
            }

            // Update user
            await pool.query(`
                UPDATE users 
                SET license_key = $1, 
                    license_status = 'pending',
                    license_activated_at = NULL,
                    password_set = FALSE,
                    license_issued_by = $2,
                    license_issued_at = NOW()
                WHERE id = $3
            `, [licenseKey, req.session.user.id, userId]);

            // Audit logs
            await pool.query(`
                INSERT INTO license_audit (user_id, license_key, action, performed_by, details)
                VALUES ($1, $2, 'license.reissued', $3, $4)
            `, [userId, licenseKey, req.session.user.id, JSON.stringify({ old_key: oldKey })]);

            res.json({ success: true, license_key: licenseKey });
        } catch (error) {
            console.error('[License] Reissue error:', error);
            res.status(500).json({ success: false, error: 'Failed to reissue license' });
        }
    });
