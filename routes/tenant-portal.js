/**
 * TENANT PORTAL - Route Handler
 * 
 * Tenant-facing portal for:
 * - Authenticated maintenance request submission & tracking
 * - Mitch Minutes video feed per property
 * - Property updates & notifications
 * 
 * PM Admin endpoints for:
 * - Enable/disable tenant portal access
 * - Upload Mitch Minutes videos
 * - Create property updates/notifications
 * 
 * Main Street Group Technology Division
 * © 2026 All Rights Reserved
 */
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// ═══════════════════════════════════════════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════════

/** Require authenticated portal tenant */
const requireTenantAuth = (req, res, next) => {
    if (!req.session || !req.session.portalTenant) {
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        return res.redirect('/tenant-portal/login');
    }
    next();
};

/** Require internal Zenith OS user (PM team) */
const requireInternalAuth = (req, res, next) => {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};


// ═══════════════════════════════════════════════════════════════════════════════
// TENANT AUTH ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/** GET /tenant-portal/login - Login page */
router.get('/login', (req, res) => {
    if (req.session.portalTenant) {
        return res.redirect('/tenant-portal');
    }
    res.render('tenant-portal/login', { error: null });
});

/** POST /tenant-portal/login - Authenticate tenant */
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.render('tenant-portal/login', { error: 'Email and password are required.' });
        }

        const result = await pool.query(`
            SELECT t.*, p.short_name as property_name, p.property_address, p.id as prop_id
            FROM pm_tenants t
            JOIN pm_properties p ON t.property_id = p.id
            WHERE LOWER(t.portal_email) = LOWER($1)
              AND t.portal_enabled = true
              AND t.portal_password_hash IS NOT NULL
        `, [email.trim()]);

        if (result.rows.length === 0) {
            return res.render('tenant-portal/login', { error: 'Invalid email or password.' });
        }

        const tenant = result.rows[0];
        const valid = await bcrypt.compare(password, tenant.portal_password_hash);
        if (!valid) {
            return res.render('tenant-portal/login', { error: 'Invalid email or password.' });
        }

        // Update last login
        await pool.query('UPDATE pm_tenants SET portal_last_login = NOW() WHERE id = $1', [tenant.id]);

        // Create portal session
        req.session.portalTenant = {
            id: tenant.id,
            tenantName: tenant.tenant_name,
            dbaName: tenant.dba_name,
            unitNumber: tenant.unit_number,
            propertyId: tenant.property_id,
            propertyName: tenant.property_name,
            propertyAddress: tenant.property_address,
            email: tenant.portal_email
        };

        res.redirect('/tenant-portal');

    } catch (err) {
        console.error('[TenantPortal] Login error:', err);
        res.render('tenant-portal/login', { error: 'An error occurred. Please try again.' });
    }
});

/** GET /tenant-portal/setup - Password setup from invite link */
router.get('/setup', async (req, res) => {
    try {
        const { token } = req.query;
        if (!token) {
            return res.render('tenant-portal/setup', { error: 'Invalid or missing invite link.', tenant: null, token: null });
        }

        const result = await pool.query(`
            SELECT t.*, p.short_name as property_name
            FROM pm_tenants t
            JOIN pm_properties p ON t.property_id = p.id
            WHERE t.portal_token = $1 
              AND t.portal_token_expires > NOW()
        `, [token]);

        if (result.rows.length === 0) {
            return res.render('tenant-portal/setup', { error: 'This invite link has expired or is invalid.', tenant: null, token: null });
        }

        res.render('tenant-portal/setup', { error: null, tenant: result.rows[0], token });

    } catch (err) {
        console.error('[TenantPortal] Setup GET error:', err);
        res.render('tenant-portal/setup', { error: 'An error occurred.', tenant: null, token: null });
    }
});

/** POST /tenant-portal/setup - Save password from invite */
router.post('/setup', async (req, res) => {
    try {
        const { token, password, confirmPassword } = req.body;
        if (!token || !password) {
            return res.render('tenant-portal/setup', { error: 'All fields are required.', tenant: null, token: null });
        }
        if (password.length < 8) {
            return res.render('tenant-portal/setup', { error: 'Password must be at least 8 characters.', tenant: null, token });
        }
        if (password !== confirmPassword) {
            return res.render('tenant-portal/setup', { error: 'Passwords do not match.', tenant: null, token });
        }

        const result = await pool.query(`
            SELECT t.*, p.short_name as property_name
            FROM pm_tenants t
            JOIN pm_properties p ON t.property_id = p.id
            WHERE t.portal_token = $1 AND t.portal_token_expires > NOW()
        `, [token]);

        if (result.rows.length === 0) {
            return res.render('tenant-portal/setup', { error: 'This invite link has expired.', tenant: null, token: null });
        }

        const tenant = result.rows[0];
        const hash = await bcrypt.hash(password, 12);

        await pool.query(`
            UPDATE pm_tenants 
            SET portal_password_hash = $1, 
                portal_enabled = true, 
                portal_token = NULL, 
                portal_token_expires = NULL,
                updated_at = NOW()
            WHERE id = $2
        `, [hash, tenant.id]);

        // Auto-login after setup
        req.session.portalTenant = {
            id: tenant.id,
            tenantName: tenant.tenant_name,
            dbaName: tenant.dba_name,
            unitNumber: tenant.unit_number,
            propertyId: tenant.property_id,
            propertyName: tenant.property_name,
            propertyAddress: tenant.property_address,
            email: tenant.portal_email
        };

        res.redirect('/tenant-portal');

    } catch (err) {
        console.error('[TenantPortal] Setup POST error:', err);
        res.render('tenant-portal/setup', { error: 'An error occurred.', tenant: null, token: null });
    }
});

/** GET /tenant-portal/logout */
router.get('/logout', (req, res) => {
    delete req.session.portalTenant;
    res.redirect('/tenant-portal/login');
});


// ═══════════════════════════════════════════════════════════════════════════════
// TENANT PORTAL PAGES (Authenticated)
// ═══════════════════════════════════════════════════════════════════════════════

/** GET /tenant-portal - Main Dashboard */
router.get('/', requireTenantAuth, async (req, res) => {
    try {
        const tenant = req.session.portalTenant;

        // Get maintenance requests for this tenant
        const requests = await pool.query(`
            SELECT * FROM pm_maintenance_requests 
            WHERE property_id = $1 AND contact_email = $2
            ORDER BY submitted_at DESC LIMIT 5
        `, [tenant.propertyId, tenant.email]);

        // Get latest Mitch Minutes for this property
        const videos = await pool.query(`
            SELECT * FROM pm_mitch_minutes
            WHERE property_id = $1 AND is_active = true AND published_at <= NOW()
            ORDER BY published_at DESC LIMIT 3
        `, [tenant.propertyId]);

        // Get active property updates
        const updates = await pool.query(`
            SELECT * FROM pm_property_updates
            WHERE (property_id = $1 OR property_id IS NULL)
              AND is_active = true
            ORDER BY 
                CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
                created_at DESC
            LIMIT 10
        `, [tenant.propertyId]);

        // Count open requests
        const openCount = await pool.query(`
            SELECT COUNT(*) as c FROM pm_maintenance_requests
            WHERE property_id = $1 AND contact_email = $2
              AND status NOT IN ('Completed', 'Closed')
        `, [tenant.propertyId, tenant.email]);

        res.render('tenant-portal/dashboard', {
            tenant,
            requests: requests.rows,
            videos: videos.rows,
            updates: updates.rows,
            openRequests: parseInt(openCount.rows[0].c)
        });

    } catch (err) {
        console.error('[TenantPortal] Dashboard error:', err);
        res.status(500).send('An error occurred loading the portal.');
    }
});

/** GET /tenant-portal/maintenance - Full maintenance request list + form */
router.get('/maintenance', requireTenantAuth, async (req, res) => {
    try {
        const tenant = req.session.portalTenant;

        const requests = await pool.query(`
            SELECT * FROM pm_maintenance_requests
            WHERE property_id = $1 AND contact_email = $2
            ORDER BY submitted_at DESC
        `, [tenant.propertyId, tenant.email]);

        res.render('tenant-portal/maintenance', {
            tenant,
            requests: requests.rows
        });

    } catch (err) {
        console.error('[TenantPortal] Maintenance page error:', err);
        res.status(500).send('An error occurred.');
    }
});

/** GET /tenant-portal/mitch-minutes - Video feed */
router.get('/mitch-minutes', requireTenantAuth, async (req, res) => {
    try {
        const tenant = req.session.portalTenant;

        const videos = await pool.query(`
            SELECT * FROM pm_mitch_minutes
            WHERE property_id = $1 AND is_active = true AND published_at <= NOW()
            ORDER BY published_at DESC
        `, [tenant.propertyId]);

        res.render('tenant-portal/mitch-minutes', {
            tenant,
            videos: videos.rows
        });

    } catch (err) {
        console.error('[TenantPortal] Mitch Minutes error:', err);
        res.status(500).send('An error occurred.');
    }
});

/** GET /tenant-portal/updates - Property updates feed */
router.get('/updates', requireTenantAuth, async (req, res) => {
    try {
        const tenant = req.session.portalTenant;

        const updates = await pool.query(`
            SELECT * FROM pm_property_updates
            WHERE (property_id = $1 OR property_id IS NULL)
              AND is_active = true
            ORDER BY 
                CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
                created_at DESC
        `, [tenant.propertyId]);

        res.render('tenant-portal/updates', {
            tenant,
            updates: updates.rows
        });

    } catch (err) {
        console.error('[TenantPortal] Updates page error:', err);
        res.status(500).send('An error occurred.');
    }
});


// ═══════════════════════════════════════════════════════════════════════════════
// TENANT API ROUTES (Authenticated)
// ═══════════════════════════════════════════════════════════════════════════════

/** POST /tenant-portal/api/maintenance - Submit maintenance request */
router.post('/api/maintenance', requireTenantAuth, async (req, res) => {
    try {
        const tenant = req.session.portalTenant;
        const { request_type, priority, location_in_building, description, preferred_date, access_instructions } = req.body;

        if (!request_type || !description) {
            return res.status(400).json({ error: 'Request type and description are required.' });
        }

        // Generate request ID
        const countResult = await pool.query('SELECT COUNT(*) FROM pm_maintenance_requests');
        const nextNum = parseInt(countResult.rows[0].count) + 1;
        const requestId = `MR-${new Date().getFullYear()}-${String(nextNum).padStart(4, '0')}`;

        // Get property account number
        const prop = await pool.query('SELECT account_number FROM pm_properties WHERE id = $1', [tenant.propertyId]);
        const accountNumber = prop.rows[0]?.account_number || 'N/A';

        const result = await pool.query(`
            INSERT INTO pm_maintenance_requests 
            (request_id, property_id, account_number, contact_name, contact_phone, contact_email, 
             unit_number, request_type, priority, location_in_building, description, 
             preferred_date, access_instructions, status, submitted_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'New', NOW())
            RETURNING *
        `, [
            requestId, tenant.propertyId, accountNumber,
            tenant.dbaName || tenant.tenantName,
            null, // phone - they can add in form
            tenant.email,
            tenant.unitNumber,
            request_type,
            priority || 'Medium',
            location_in_building || '',
            description,
            preferred_date || null,
            access_instructions || ''
        ]);

        res.json({ success: true, request: result.rows[0] });

    } catch (err) {
        console.error('[TenantPortal] Submit request error:', err);
        res.status(500).json({ error: err.message });
    }
});

/** GET /tenant-portal/api/maintenance - Get tenant's requests */
router.get('/api/maintenance', requireTenantAuth, async (req, res) => {
    try {
        const tenant = req.session.portalTenant;
        const result = await pool.query(`
            SELECT * FROM pm_maintenance_requests
            WHERE property_id = $1 AND contact_email = $2
            ORDER BY submitted_at DESC
        `, [tenant.propertyId, tenant.email]);

        res.json({ success: true, requests: result.rows });

    } catch (err) {
        console.error('[TenantPortal] Get requests error:', err);
        res.status(500).json({ error: err.message });
    }
});


// ═══════════════════════════════════════════════════════════════════════════════
// PM ADMIN API ROUTES (Internal Zenith OS Users)
// ═══════════════════════════════════════════════════════════════════════════════

/** POST /tenant-portal/admin/enable-portal/:tenantId - Enable portal for tenant */
router.post('/admin/enable-portal/:tenantId', requireInternalAuth, async (req, res) => {
    try {
        const { tenantId } = req.params;
        
        // Check tenant exists
        const tenant = await pool.query(`
            SELECT t.*, p.short_name as property_name 
            FROM pm_tenants t 
            JOIN pm_properties p ON t.property_id = p.id
            WHERE t.id = $1
        `, [tenantId]);

        if (tenant.rows.length === 0) {
            return res.status(404).json({ error: 'Tenant not found' });
        }

        const t = tenant.rows[0];
        if (!t.portal_email && !t.contact_email) {
            return res.status(400).json({ error: 'Tenant has no email address on file.' });
        }

        // Generate invite token (valid 7 days)
        const token = crypto.randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        await pool.query(`
            UPDATE pm_tenants 
            SET portal_enabled = true,
                portal_email = COALESCE(portal_email, contact_email),
                portal_token = $1,
                portal_token_expires = $2,
                updated_at = NOW()
            WHERE id = $3
        `, [token, expires, tenantId]);

        const setupUrl = `${req.protocol}://${req.get('host')}/tenant-portal/setup?token=${token}`;

        res.json({ 
            success: true, 
            message: `Portal enabled for ${t.dba_name || t.tenant_name}`,
            setupUrl,
            email: t.portal_email || t.contact_email,
            note: 'Send this setup URL to the tenant to complete registration.'
        });

    } catch (err) {
        console.error('[TenantPortal] Enable portal error:', err);
        res.status(500).json({ error: err.message });
    }
});

/** POST /tenant-portal/admin/disable-portal/:tenantId */
router.post('/admin/disable-portal/:tenantId', requireInternalAuth, async (req, res) => {
    try {
        await pool.query(`
            UPDATE pm_tenants 
            SET portal_enabled = false, portal_token = NULL, portal_token_expires = NULL, updated_at = NOW()
            WHERE id = $1
        `, [req.params.tenantId]);

        res.json({ success: true, message: 'Portal access disabled.' });
    } catch (err) {
        console.error('[TenantPortal] Disable portal error:', err);
        res.status(500).json({ error: err.message });
    }
});

/** GET /tenant-portal/admin/portal-status - Get all tenants with portal status */
router.get('/admin/portal-status', requireInternalAuth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT t.id, t.tenant_name, t.dba_name, t.unit_number, t.contact_email, 
                   t.portal_email, t.portal_enabled, t.portal_last_login,
                   t.portal_password_hash IS NOT NULL as has_password,
                   p.short_name as property_name
            FROM pm_tenants t
            JOIN pm_properties p ON t.property_id = p.id
            WHERE t.tenant_status IN ('Current', 'MTM')
            ORDER BY p.short_name, t.unit_number
        `);
        res.json({ success: true, tenants: result.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Mitch Minutes Admin ────────────────────────────────────────────────────

/** POST /tenant-portal/admin/mitch-minutes - Create new video */
router.post('/admin/mitch-minutes', requireInternalAuth, async (req, res) => {
    try {
        const { property_id, title, description, video_url, thumbnail_url, duration_seconds } = req.body;
        if (!property_id || !title || !video_url) {
            return res.status(400).json({ error: 'Property, title, and video URL are required.' });
        }

        const result = await pool.query(`
            INSERT INTO pm_mitch_minutes (property_id, title, description, video_url, thumbnail_url, duration_seconds, created_by, published_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
            RETURNING *
        `, [property_id, title, description || '', video_url, thumbnail_url || null, duration_seconds || null, req.session.user.id]);

        res.json({ success: true, video: result.rows[0] });
    } catch (err) {
        console.error('[TenantPortal] Create Mitch Minutes error:', err);
        res.status(500).json({ error: err.message });
    }
});

/** GET /tenant-portal/admin/mitch-minutes - List all videos */
router.get('/admin/mitch-minutes', requireInternalAuth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT m.*, p.short_name as property_name
            FROM pm_mitch_minutes m
            JOIN pm_properties p ON m.property_id = p.id
            WHERE m.is_active = true
            ORDER BY m.published_at DESC
        `);
        res.json({ success: true, videos: result.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/** DELETE /tenant-portal/admin/mitch-minutes/:id */
router.delete('/admin/mitch-minutes/:id', requireInternalAuth, async (req, res) => {
    try {
        await pool.query('UPDATE pm_mitch_minutes SET is_active = false WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Property Updates Admin ─────────────────────────────────────────────────

/** POST /tenant-portal/admin/property-updates - Create notification */
router.post('/admin/property-updates', requireInternalAuth, async (req, res) => {
    try {
        const { property_id, title, body, category, priority, starts_at, ends_at, send_email } = req.body;
        if (!title || !body) {
            return res.status(400).json({ error: 'Title and body are required.' });
        }

        const result = await pool.query(`
            INSERT INTO pm_property_updates (property_id, title, body, category, priority, starts_at, ends_at, send_email, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `, [
            property_id || null, title, body,
            category || 'general', priority || 'normal',
            starts_at || null, ends_at || null,
            send_email || false, req.session.user.id
        ]);

        res.json({ success: true, update: result.rows[0] });
    } catch (err) {
        console.error('[TenantPortal] Create update error:', err);
        res.status(500).json({ error: err.message });
    }
});

/** GET /tenant-portal/admin/property-updates - List all updates */
router.get('/admin/property-updates', requireInternalAuth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT u.*, p.short_name as property_name
            FROM pm_property_updates u
            LEFT JOIN pm_properties p ON u.property_id = p.id
            WHERE u.is_active = true
            ORDER BY u.created_at DESC
        `);
        res.json({ success: true, updates: result.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/** DELETE /tenant-portal/admin/property-updates/:id */
router.delete('/admin/property-updates/:id', requireInternalAuth, async (req, res) => {
    try {
        await pool.query('UPDATE pm_property_updates SET is_active = false WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


module.exports = router;
