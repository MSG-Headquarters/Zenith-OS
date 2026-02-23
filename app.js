// ============================================
// ZENITH OS v2.8.0
// Enterprise Platform by Main Street Group
// ============================================

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const path = require('path');
const { Pool } = require('pg');
const { loadPermissions, getSidebarModules } = require('./middleware/permissions');
const { SESClient, SendEmailCommand, SendBulkTemplatedEmailCommand } = require('@aws-sdk/client-ses');
const adminRoutes = require('./routes/admin');
const danimalApi = require('./routes/danimal-api');
const huddleApi = require('./routes/huddle-api');
const huddlePortalApi = require('./routes/huddle-portal-api');
const sundayMailRoutes = require('./routes/sunday-mail-routes');
const intelApi = require('./routes/intel-api');
const { registerIntelAIRoutes } = require('./routes/intel-ai-chat');
const marketingApi = require('./routes/marketing-api');
const app = express();
const PORT = process.env.PORT || 8080;

// ============================================
// AWS SES EMAIL SERVICE
// ============================================
const sesClient = new SESClient({
    region: process.env.AWS_REGION || 'us-east-2',
    credentials: process.env.AWS_ACCESS_KEY_ID ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    } : undefined // Use IAM role if no credentials provided
});

const EmailService = {
    // Default sending configuration
    defaultFrom: process.env.SES_FROM_EMAIL || 'noreply@cre-us.com',
    defaultFromName: process.env.SES_FROM_NAME || 'CRE Consultants',
    
    // Send a single email
    async sendEmail({ to, subject, html, text, from, fromName, replyTo }) {
        const params = {
            Source: `${fromName || this.defaultFromName} <${from || this.defaultFrom}>`,
            Destination: {
                ToAddresses: Array.isArray(to) ? to : [to]
            },
            Message: {
                Subject: { Data: subject, Charset: 'UTF-8' },
                Body: {
                    Html: { Data: html, Charset: 'UTF-8' },
                    Text: { Data: text || html.replace(/<[^>]*>/g, ''), Charset: 'UTF-8' }
                }
            },
            ReplyToAddresses: replyTo ? [replyTo] : undefined
        };
        
        try {
            const command = new SendEmailCommand(params);
            const result = await sesClient.send(command);
            console.log('Email sent:', result.MessageId);
            return { success: true, messageId: result.MessageId };
        } catch (error) {
            console.error('Email send error:', error);
            return { success: false, error: error.message };
        }
    },
    
    // Send bulk emails (for campaigns)
    async sendBulkEmail({ recipients, subject, html, text, from, fromName }) {
        const results = [];
        
        // SES allows 50 recipients per call, so batch them
        const batchSize = 50;
        for (let i = 0; i < recipients.length; i += batchSize) {
            const batch = recipients.slice(i, i + batchSize);
            
            // Send individual emails in batch (for personalization)
            for (const recipient of batch) {
                const personalizedHtml = html
                    .replace(/{{name}}/g, recipient.name || 'there')
                    .replace(/{{email}}/g, recipient.email)
                    .replace(/{{unsubscribe_link}}/g, `https://zenith.umbrassi.com/unsubscribe?email=${encodeURIComponent(recipient.email)}`);
                
                const result = await this.sendEmail({
                    to: recipient.email,
                    subject: subject.replace(/{{name}}/g, recipient.name || 'there'),
                    html: personalizedHtml,
                    text,
                    from,
                    fromName
                });
                
                results.push({ email: recipient.email, ...result });
                
                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        
        return results;
    },
    
    // Pre-built email templates
    templates: {
        leadWelcome: (leadName, companyName) => ({
            subject: `Welcome ${leadName} - CRE Consultants`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: linear-gradient(135deg, #10B981, #3B82F6); padding: 30px; text-align: center;">
                        <h1 style="color: white; margin: 0;">CRE Consultants</h1>
                    </div>
                    <div style="padding: 30px; background: #f8f9fa;">
                        <h2>Welcome, ${leadName}!</h2>
                        <p>Thank you for your interest in commercial real estate opportunities. We're excited to help you find the perfect property for ${companyName || 'your business'}.</p>
                        <p>A member of our team will be in touch shortly to discuss your needs.</p>
                        <p style="margin-top: 30px;">
                            <a href="https://cre-us.com" style="background: #3B82F6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">View Properties</a>
                        </p>
                    </div>
                    <div style="padding: 20px; text-align: center; color: #666; font-size: 12px;">
                        <p>CRE Consultants | Commercial Real Estate Services</p>
                        <p><a href="{{unsubscribe_link}}" style="color: #666;">Unsubscribe</a></p>
                    </div>
                </div>
            `
        }),
        
        propertyAlert: (leadName, propertyName, propertyDetails) => ({
            subject: `New Property Alert: ${propertyName}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: linear-gradient(135deg, #10B981, #3B82F6); padding: 30px; text-align: center;">
                        <h1 style="color: white; margin: 0;">Property Alert</h1>
                    </div>
                    <div style="padding: 30px; background: #f8f9fa;">
                        <h2>Hi ${leadName},</h2>
                        <p>A new property matching your criteria is now available:</p>
                        <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
                            <h3 style="margin-top: 0; color: #3B82F6;">${propertyName}</h3>
                            <p>${propertyDetails}</p>
                        </div>
                        <p style="margin-top: 30px;">
                            <a href="https://cre-us.com" style="background: #10B981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">View Details</a>
                        </p>
                    </div>
                    <div style="padding: 20px; text-align: center; color: #666; font-size: 12px;">
                        <p>CRE Consultants | Commercial Real Estate Services</p>
                        <p><a href="{{unsubscribe_link}}" style="color: #666;">Unsubscribe</a></p>
                    </div>
                </div>
            `
        }),
        
        newsletter: (content) => ({
            subject: `CRE Market Update - ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: linear-gradient(135deg, #10B981, #3B82F6); padding: 30px; text-align: center;">
                        <h1 style="color: white; margin: 0;">Market Update</h1>
                        <p style="color: rgba(255,255,255,0.8); margin: 10px 0 0 0;">${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
                    </div>
                    <div style="padding: 30px; background: #f8f9fa;">
                        <h2>Hi {{name}},</h2>
                        ${content}
                    </div>
                    <div style="padding: 20px; text-align: center; color: #666; font-size: 12px;">
                        <p>CRE Consultants | Commercial Real Estate Services</p>
                        <p><a href="{{unsubscribe_link}}" style="color: #666;">Unsubscribe</a></p>
                    </div>
                </div>
            `
        })
    }
};

// ============================================
// DATABASE CONNECTION
// ============================================
let pool;

function initDatabase() {
    const connectionString = process.env.DATABASE_URL;
    
    if (connectionString) {
        pool = new Pool({
            connectionString,
            ssl: { rejectUnauthorized: false }
        });
    } else {
        pool = new Pool({
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 5432,
            database: process.env.DB_NAME || 'zenith_db',
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || 'postgres',
            ssl: { rejectUnauthorized: false }
        });
    }
    
    pool.on('error', (err) => {
        console.error('Unexpected database error:', err);
    });
    
    return pool;
}

initDatabase();

// Auto-create inventory/listings table
pool.query(`CREATE TABLE IF NOT EXISTS listings (
    id SERIAL PRIMARY KEY, org_id INTEGER, lead_id INTEGER, intel_project_id INTEGER,
    listing_agent_id INTEGER, listing_agent_name VARCHAR(255),
    property_name VARCHAR(255), property_address VARCHAR(500), property_city VARCHAR(100),
    property_state VARCHAR(10) DEFAULT 'FL', property_zip VARCHAR(20), property_county VARCHAR(100),
    property_type VARCHAR(50), property_subtype VARCHAR(100),
    listing_type VARCHAR(50) NOT NULL DEFAULT 'For Sale',
    price DECIMAL(14,2), price_per_sf DECIMAL(10,2), lease_rate DECIMAL(10,2), lease_type VARCHAR(50),
    building_sf INTEGER, lot_sf INTEGER, lot_acres DECIMAL(10,4), year_built INTEGER, zoning VARCHAR(50),
    cap_rate DECIMAL(5,2), noi DECIMAL(14,2), occupancy DECIMAL(5,2),
    status VARCHAR(50) NOT NULL DEFAULT 'pending_marketing', status_changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_by INTEGER, approved_at TIMESTAMP,
    flyer_url VARCHAR(500), flyer_approved BOOLEAN DEFAULT false, thumbnail_url VARCHAR(500),
    description TEXT, highlights TEXT,
    listed_at TIMESTAMP, under_contract_at TIMESTAMP, closed_at TIMESTAMP, close_price DECIMAL(14,2),
    is_featured BOOLEAN DEFAULT false, notes TEXT, metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`).then(() => console.log('[DB] Listings table ready')).catch(err => console.error('[DB] Listings table error:', err.message));

// ============================================
// MIDDLEWARE
// ============================================

app.use('/api/huddle', huddleApi);
app.use('/api/portal', huddlePortalApi);
app.use('/api', (req, res, next) => { req.pool = pool; next(); }, sundayMailRoutes);
// Trust proxy for AWS ELB
app.set('trust proxy', 1);

// HTTPS redirect in production
app.use((req, res, next) => {
    if (process.env.NODE_ENV === 'production' && req.headers['x-forwarded-proto'] === 'http') {
        // Skip redirect for health check
        if (req.path === '/health') return next();
        return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
});

// Security headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-hashes'", "https://static.cloudflareinsights.com", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
            scriptSrcAttr: ["'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://cloudflareinsights.com", "https://cdn.jsdelivr.net"]
        }
    }
}));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'zenith-os-secret-2026',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Load user permissions
app.use(loadPermissions(pool));

// Make permissions available to all views
app.use((req, res, next) => {
    res.locals.permissions = req.permissions || null;
    const allModules = req.permissions ? getSidebarModules(req.permissions) : [];
    const ft = req.session.features || {};
    res.locals.sidebarModules = allModules.filter(m => ft[m.slug] !== false);
    res.locals.hasModuleAccess = req.hasModuleAccess || (() => false);
    next();
    });


// Make session data available to views
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.org = req.session.org || null;
    res.locals.theme = req.session.theme || 'light';
    res.locals.features = req.session.features || {
        crm: true, intel: true, marketing: true, huddle: true,
        vault: true, cfo: true, danimal: true, inventory: true,
        mailer: true, pm: true, command: true
    };
    next();
});

// API Routes (must be after session middleware)
app.use('/system', adminRoutes(pool));
app.use('/api/danimal', danimalApi);
app.use('/api/intel', intelApi(pool));
app.use('/api/marketing', marketingApi(pool));
app.get('/marketing/files/:tenantId/:filename', (req, res) => {
  const filePath = require('path').join(__dirname, 'marketing-output', req.params.tenantId, req.params.filename);
  if (require('fs').existsSync(filePath)) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${req.params.filename}"`);
    res.sendFile(filePath);
  } else {
    res.status(404).send('PDF not found — it may need to be regenerated.');
  }
});

// Serve marketing photos
app.get('/marketing/photos/:filename', (req, res) => {
  const filePath = require('path').join(__dirname, 'marketing-output', 'photos', req.params.filename);
  if (require('fs').existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send('Photo not found');
  }
});
registerIntelAIRoutes(app, pool);
const adminApiRoutes = require('./routes/admin-api');
app.use('/api/admin', adminApiRoutes);

// ============================================
// USER SETTINGS
// ============================================

app.get('/settings', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/auth/login');
    }
    res.render('settings', {
        user: req.session.user,
        org: req.session.org,
        success: req.query.success,
        error: req.query.error
    });
});

app.post('/settings/profile', async (req, res) => {
    if (!req.session.user) return res.redirect('/auth/login');
    const { name } = req.body;
    try {
        await pool.query('UPDATE users SET name = $1 WHERE id = $2', [name, req.session.user.id]);
        req.session.user.name = name;
        res.redirect('/settings?success=Profile updated successfully');
    } catch (error) {
        console.error('[SETTINGS] Profile update error:', error);
        res.redirect('/settings?error=Failed to update profile');
    }
});

app.post('/settings/password', async (req, res) => {
    if (!req.session.user) return res.redirect('/auth/login');
    const { current_password, new_password, confirm_password } = req.body;
    try {
        if (!new_password || new_password.length < 6) {
            return res.redirect('/settings?error=New password must be at least 6 characters');
        }
        if (new_password !== confirm_password) {
            return res.redirect('/settings?error=New passwords do not match');
        }
        const userResult = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.session.user.id]);
        if (userResult.rows.length === 0) return res.redirect('/settings?error=User not found');
        const bcrypt = require('bcryptjs');
        const validPassword = await bcrypt.compare(current_password, userResult.rows[0].password_hash);
        if (!validPassword) return res.redirect('/settings?error=Current password is incorrect');
        const hashedPassword = await bcrypt.hash(new_password, 10);
        await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashedPassword, req.session.user.id]);
        console.log(`[SETTINGS] Password changed for user ${req.session.user.email}`);
        res.redirect('/settings?success=Password changed successfully');
    } catch (error) {
        console.error('[SETTINGS] Password change error:', error);
        res.redirect('/settings?error=Failed to change password');
    }
});

// ============================================
// LICENSE CHECK MIDDLEWARE
// ============================================
async function checkLicense(req, res, next) {
    // Skip license check for public routes
    const publicRoutes = ['/auth/login', '/auth/logout', '/auth/activate', '/auth/under-review', '/lockout', '/health', '/api/leads/capture'];
    if (publicRoutes.some(route => req.path.startsWith(route))) {
        return next();
    }
    
    // Check if user is logged in
    if (!req.session.user || !req.session.org) {
        return res.redirect('/auth/login');
    }
    
    try {
        // Check organization license status
        const result = await pool.query(
            'SELECT license_status, license_expiry FROM organizations WHERE id = $1',
            [req.session.org.id]
        );
        
        if (result.rows.length === 0) {
            req.session.destroy();
            return res.redirect('/auth/login?reason=org_not_found');
        }
        
        const org = result.rows[0];
        
        // Check if suspended or revoked
        if (org.license_status === 'suspended') {
            return res.redirect('/lockout?reason=suspended');
        }
        
        if (org.license_status === 'revoked') {
            req.session.destroy();
            return res.redirect('/lockout?reason=terminated');
        }
        
        // Check if expired
        if (org.license_expiry && new Date(org.license_expiry) < new Date()) {
            return res.redirect('/lockout?reason=expired');
        }
        
        next();
    } catch (err) {
        console.error('License check error:', err);
        next(); // Continue on error to prevent lockout during db issues
    }
}

// Apply license check to protected routes
app.use(checkLicense);

// ============================================
// ROUTES
// ============================================

// Health check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', version: '2.4.0' });
});

// Auth routes

// ============================================
// USER LICENSE ACTIVATION
// ============================================

// GET - Show activation page
app.get('/auth/activate', (req, res) => {
    res.render('activate-license', { 
        error: req.query.error,
        success: req.query.success,
        email: req.query.email || ''
    });
});

// POST - Validate license and set password
app.post('/auth/activate', async (req, res) => {
    const { email, license_key, password, confirm_password } = req.body;
    
    try {
        // Validate inputs
        if (!email || !license_key) {
            return res.render('activate-license', { 
                error: 'Email and license key are required',
                email 
            });
        }
        
        if (!password || password.length < 6) {
            return res.render('activate-license', { 
                error: 'Password must be at least 6 characters',
                email 
            });
        }
        
        if (password !== confirm_password) {
            return res.render('activate-license', { 
                error: 'Passwords do not match',
                email 
            });
        }
        
        // Find user by email and license key
        const userResult = await pool.query(`
            SELECT u.*, o.id as org_id, o.name as org_name, o.license_status as org_license_status
            FROM users u
            JOIN organizations o ON u.organization_id = o.id
            WHERE LOWER(u.email) = LOWER($1) AND u.license_key = $2
        `, [email, license_key.toUpperCase().trim()]);
        
        if (userResult.rows.length === 0) {
            return res.render('activate-license', { 
                error: 'Invalid email or license key. Please check and try again.',
                email 
            });
        }
        
        const user = userResult.rows[0];
        
        // Check if license has expired
        if (user.license_expires && new Date(user.license_expires) < new Date()) {
            return res.render('activate-license', { 
                error: 'This license key has expired. Please contact your administrator for a new one.',
                email 
            });
        }
        
        // Check if user is already active
        if (user.status === 'active') {
            return res.render('activate-license', { 
                error: 'This account is already activated. Please log in instead.',
                email 
            });
        }
        
        // Hash the password
        const bcrypt = require('bcryptjs');
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Activate the user
        await pool.query(`
            UPDATE users 
            SET password_hash = $1, 
                status = 'active', 
                license_status = 'active',
                license_activated_at = NOW(),
                password_set = true
            WHERE id = $2
        `, [hashedPassword, user.id]);
        
        console.log(`[AUTH] User ${user.email} activated successfully`);
        
        // Auto-login the user
        req.session.user = {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role
        };
        req.session.org = {
            id: user.org_id,
            name: user.org_name
        };
        
        // Update last login
        await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
        
        res.redirect('/dashboard?welcome=true');
        
    } catch (error) {
        console.error('[AUTH] Activation error:', error);
        res.render('activate-license', { 
            error: 'An error occurred. Please try again.',
            email 
        });
    }
});

app.get('/auth/login', (req, res) => {
    if (req.session.user) {
        return res.redirect('/dashboard');
    }
    res.render('login', { 
        error: req.query.error,
        reason: req.query.reason
    });
});

app.post('/auth/login', async (req, res) => {
    const { email, password, license_key } = req.body;
    
    try {
        let user, org;
        
        if (license_key) {
            // License key login
            const keyResult = await pool.query(`
                SELECT u.*, o.id as org_id, o.name as org_name, o.license_key, o.license_status, o.license_type
                FROM users u
                JOIN organizations o ON u.organization_id = o.id
                WHERE o.license_key = $1 AND u.role = 'Admin'
                LIMIT 1
            `, [license_key.toUpperCase()]);
            
            if (keyResult.rows.length === 0) {
                return res.render('login', { error: 'Invalid license key' });
            }
            
            user = keyResult.rows[0];
            org = {
                id: user.org_id,
                name: user.org_name,
                license_key: user.license_key,
                license_status: user.license_status,
                license_type: user.license_type
            };
        } else {
            // Email/password login
            const userResult = await pool.query(`
                SELECT u.*, o.id as org_id, o.name as org_name, o.license_key, o.license_status, o.license_type
                FROM users u
                JOIN organizations o ON u.organization_id = o.id
                WHERE LOWER(u.email) = LOWER($1)
            `, [email]);
            
            if (userResult.rows.length === 0) {
                return res.render('login', { error: 'Account not found' });
            }
            
            user = userResult.rows[0];
            
            // Verify password
            const bcrypt = require('bcryptjs');
            const validPassword = await bcrypt.compare(password, user.password_hash);
            
            if (!validPassword) {
                return res.render('login', { error: 'Invalid password' });
            }
            
            org = {
                id: user.org_id,
                name: user.org_name,
                license_key: user.license_key,
                license_status: user.license_status,
                license_type: user.license_type
            };
        }
        
       // Check license status
        if (org.license_status === 'suspended') {
            return res.redirect('/lockout?reason=suspended');
        }
        
        if (org.license_status === 'revoked') {
            return res.redirect('/lockout?reason=terminated');
        }
        
        // Check user status
        if (user.status === 'terminated') {
            return res.render('login', { error: 'Your account has been terminated. Contact your administrator.' });
        }
        if (user.status === 'under_review') {
            // Create limited session for under_review users
            req.session.user = {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                status: user.status,
                status_changed_at: user.status_changed_at
            };
            req.session.org = org;
            return res.redirect('/auth/under-review');
        }
        
        // Create session
        req.session.user = {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            status: user.status || 'active'
        };
        req.session.org = org;
        // Load feature toggles
        try {
            const ftResult = await pool.query('SELECT feature_toggles FROM organizations WHERE id = $1', [org.id]);
            const orgFeatures = ftResult.rows[0]?.feature_toggles || {};
            const userOverrides = user.feature_overrides || {};
            const merged = { ...orgFeatures };
            for (const key of Object.keys(userOverrides)) {
                if (userOverrides[key] !== null) merged[key] = userOverrides[key];
            }
            req.session.features = merged;
        } catch (e) { req.session.features = {}; }
        // Update last login
        await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
        res.redirect('/dashboard');
        
    } catch (err) {
        console.error('Login error:', err);
        res.render('login', { error: 'Login failed. Please try again.' });
    }
});

app.get('/auth/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/auth/login');
});

// Lockout page
app.get('/lockout', (req, res) => {
    res.render('lockout', { reason: req.query.reason || 'suspended' });
});

// License Activation
app.get('/activate', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/auth/login');
    }
    res.render('activate', { 
        user: req.session.user,
        error: req.query.error,
        success: req.query.success
    });
});

app.post('/activate', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/auth/login');
    }
    
    const { license_key } = req.body;
    const userId = req.session.user.id;
    
    try {
        // Verify the license key matches what was assigned to this user
        const userResult = await pool.query(
            `SELECT license_key, license_status FROM users WHERE id = $1`,
            [userId]
        );
        
        if (userResult.rows.length === 0) {
            return res.render('activate', { user: req.session.user, error: 'User not found' });
        }
        
        const user = userResult.rows[0];
        
        // Check if key matches
        if (user.license_key !== license_key.toUpperCase().trim()) {
            return res.render('activate', { user: req.session.user, error: 'Invalid license key. Please check and try again.' });
        }
        
        // Check if already activated
        if (user.license_status === 'active') {
            return res.redirect('/dashboard');
        }
        
        // Activate the license
        await pool.query(`
            UPDATE users SET license_status = 'active', license_activated_at = NOW(), status = 'active' WHERE id = $1
        `, [userId]);
        
        // Log the activation
        await pool.query(`
            INSERT INTO license_audit (user_id, license_key, action, performed_by, details)
            VALUES ($1, $2, 'license.activated', $1, $3)
        `, [userId, license_key, JSON.stringify({ activated_by: 'user' })]);
        
        // Update session
        req.session.user.status = 'active';
        
        res.redirect('/dashboard?activated=true');
        
    } catch (error) {
        console.error('[Activate] Error:', error);
        res.render('activate', { user: req.session.user, error: 'Activation failed. Please try again.' });
    }
});

// Under Review page (frozen accounts)
app.get('/auth/under-review', (req, res) => {
    // If user is not frozen, redirect to dashboard
    if (req.session.user && req.session.user.status !== 'under_review') {
        return res.redirect('/dashboard');
    }
    res.render('auth/under-review', {
        userEmail: req.session.user?.email || '',
        reviewDate: req.session.user?.status_changed_at ? new Date(req.session.user.status_changed_at).toLocaleString() : 'Recently'
    });
});

// Clarification request submission
app.post('/auth/clarification-request', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    
    try {
        const { message } = req.body;
        await pool.query(`
            INSERT INTO user_freeze_requests (user_id, message)
            VALUES ($1, $2)
        `, [req.session.user.id, message]);
        
        // Audit log
        await pool.query(`
            INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, new_value)
            VALUES ($1, $2, 'user.clarification_request', 'user', $2, $3)
        `, [req.session.org?.id || 1, req.session.user.id, JSON.stringify({ message })]);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Clarification request error:', error);
        res.status(500).json({ success: false, error: 'Failed to submit request' });
    }
});

// Dashboard (AXIS Home)
app.get('/', (req, res) => res.redirect('/dashboard'));

app.get('/dashboard', async (req, res) => {
    try {
        // Get stats
        const leadsResult = await pool.query(
            'SELECT COUNT(*) as count FROM leads WHERE organization_id = $1',
            [req.session.org.id]
        );
        
        const pipelineResult = await pool.query(
            'SELECT COALESCE(SUM(value), 0) as total FROM leads WHERE organization_id = $1 AND stage != $2',
            [req.session.org.id, 'Closed Won']
        );
        
        const messagesResult = await pool.query(
            'SELECT COUNT(*) as count FROM messages WHERE channel_id IN (SELECT id FROM channels WHERE organization_id = $1)',
            [req.session.org.id]
        );
        
        // Get recent activity
        const activityResult = await pool.query(`
            SELECT * FROM activity_log 
            WHERE organization_id = $1 
            ORDER BY created_at DESC LIMIT 10
        `, [req.session.org.id]);
        
        res.render('dashboard', {
            stats: {
                leads: leadsResult.rows[0]?.count || 0,
                pipelineValue: pipelineResult.rows[0]?.total || 0,
                messages: messagesResult.rows[0]?.count || 0
            },
            activities: activityResult.rows
        });
    } catch (err) {
        console.error('Dashboard error:', err);
        res.render('dashboard', { stats: { leads: 0, pipelineValue: 0, messages: 0 }, activities: [] });
    }
});

// CRM Pipeline
app.get('/crm', async (req, res) => {
    try {
        const stagesResult = await pool.query(
            'SELECT * FROM pipeline_stages WHERE organization_id = $1 ORDER BY position',
            [req.session.org.id]
        );
        
        const leadsResult = await pool.query(
            'SELECT * FROM leads WHERE organization_id = $1 ORDER BY created_at DESC',
            [req.session.org.id]
        );
        
        // Group leads by stage
        const stages = stagesResult.rows.map(stage => ({
            ...stage,
            leads: leadsResult.rows.filter(lead => lead.stage === stage.name)
        }));
        
        // Calculate stats
        const totalLeads = leadsResult.rows.length;
        const pipelineValue = leadsResult.rows
            .filter(l => l.stage !== 'Closed Won')
            .reduce((sum, l) => sum + (parseFloat(l.value) || 0), 0);
        const closedWon = leadsResult.rows.filter(l => l.stage === 'Closed Won');
        const conversionRate = totalLeads > 0 ? Math.round((closedWon.length / totalLeads) * 100) : 0;
        const avgDealSize = closedWon.length > 0 
            ? closedWon.reduce((sum, l) => sum + (parseFloat(l.value) || 0), 0) / closedWon.length 
            : 0;
        
        res.render('crm', {
            stages,
            stats: {
                totalLeads,
                pipelineValue,
                conversionRate,
                avgDealSize
            }
        });
    } catch (err) {
        console.error('CRM error:', err);
        res.render('crm', { stages: [], stats: {} });
    }
});

// ── INVENTORY ──
app.get('/inventory', async (req, res) => {
    if (!req.session.user) return res.redirect('/auth/login');
    try {
        const orgId = req.session.org?.id;
        const userId = req.session.user.id;
        
        const listingsResult = await pool.query(
            `SELECT l.*, u.name as listing_agent_name 
             FROM listings l 
             LEFT JOIN users u ON l.listing_agent_id = u.id 
             WHERE l.org_id = $1 
             ORDER BY l.created_at DESC`,
            [orgId]
        );
        
        const statsResult = await pool.query(
            `SELECT 
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'active') as active,
                COUNT(*) FILTER (WHERE status IN ('pending_marketing','in_production','pending_approval')) as in_production,
                COUNT(*) FILTER (WHERE status = 'under_contract') as under_contract,
                COALESCE(SUM(price) FILTER (WHERE status = 'active'), 0) as total_value
             FROM listings WHERE org_id = $1`,
            [orgId]
        );
        
        const stats = statsResult.rows[0] || {};
        
        res.render('inventory', {
            user: req.session.user,
            org: req.session.org,
            listings: listingsResult.rows,
            stats: {
                total: parseInt(stats.total) || 0,
                active: parseInt(stats.active) || 0,
                inProduction: parseInt(stats.in_production) || 0,
                underContract: parseInt(stats.under_contract) || 0,
                totalValue: parseFloat(stats.total_value) || 0
            }
        });
    } catch (err) {
        console.error('[INVENTORY] Error:', err);
        res.render('inventory', { user: req.session.user, org: req.session.org, listings: [], stats: {} });
    }
});

// Inventory status update API
app.put('/api/inventory/:id/status', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false });
    try {
        const { status } = req.body;
        const validStatuses = ['pending_marketing', 'in_production', 'pending_approval', 'active', 'under_contract', 'closed'];
        if (!validStatuses.includes(status)) return res.status(400).json({ success: false, error: 'Invalid status' });
        
        const updates = { status, status_changed_at: new Date() };
        if (status === 'active') { updates.listed_at = new Date(); updates.approved_by = req.session.user.id; updates.approved_at = new Date(); }
        if (status === 'under_contract') updates.under_contract_at = new Date();
        if (status === 'closed') updates.closed_at = new Date();
        
        const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`).join(', ');
        const values = [req.params.id, ...Object.values(updates)];
        
        await pool.query(`UPDATE listings SET ${setClauses} WHERE id = $1`, values);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});


// The Huddle (Team Messaging)
app.get('/huddle', async (req, res) => {
    try {
        const userId = req.session.user?.id || 1;
        const tenantId = req.session.tenant?.id || 1;
        
        // Get user's workspaces
        const workspacesResult = await pool.query(`
            SELECT w.* FROM huddle_workspaces w
            JOIN huddle_workspace_members wm ON w.id = wm.workspace_id
            WHERE wm.user_id = $1
            ORDER BY w.name
        `, [userId]);
        
        const workspaces = workspacesResult.rows;
        const activeWorkspace = workspaces[0] || null;
        
        let channels = [];
        let activeChannel = null;
        let messages = [];
        
        if (activeWorkspace) {
            // Get channels for this workspace
            const channelsResult = await pool.query(`
                SELECT * FROM huddle_channels 
                WHERE workspace_id = $1 
                ORDER BY is_default DESC, name
            `, [activeWorkspace.id]);
            channels = channelsResult.rows;
            activeChannel = channels.find(c => c.is_default) || channels[0];
            
            if (activeChannel) {
                // Get messages for active channel
                const messagesResult = await pool.query(`
                    SELECT m.*, u.name, u.email
                    FROM huddle_messages m
                    LEFT JOIN users u ON m.user_id = u.id
                    WHERE m.channel_id = $1
                    ORDER BY m.created_at DESC
                    LIMIT 50
                `, [activeChannel.id]);
                messages = messagesResult.rows.reverse();
            }
        }
        
        res.render('huddle/index', {
            title: 'Huddle - Zenith OS',
            workspaces,
            activeWorkspace,
            channels,
            activeChannel,
            messages,
            currentUser: req.session.user,
            dmMode: false
        });
    } catch (err) {
        console.error('Huddle error:', err);
        res.render('huddle/index', {
            title: 'Huddle - Zenith OS',
            workspaces: [],
            activeWorkspace: null,
            channels: [],
            activeChannel: null,
            messages: [],
            currentUser: req.session.user,
            dmMode: false,
            error: 'Failed to load Huddle'
        });
    }
});

// ============================================
// HUDDLE API ROUTES
// ============================================

// Get channel by ID with messages
app.get('/huddle/channel/:id', async (req, res) => {
    try {
        const channelId = req.params.id;
        const userId = req.session.user?.id || 1;

        // Get channel
        const channelResult = await pool.query('SELECT * FROM huddle_channels WHERE id = $1', [channelId]);
        if (channelResult.rows.length === 0) {
            return res.redirect('/huddle');
        }
        const activeChannel = channelResult.rows[0];

        // Get workspace
        const workspaceResult = await pool.query('SELECT * FROM huddle_workspaces WHERE id = $1', [activeChannel.workspace_id]);
        const activeWorkspace = workspaceResult.rows[0];

        // Get all channels for this workspace
        const channelsResult = await pool.query(
            'SELECT * FROM huddle_channels WHERE workspace_id = $1 ORDER BY is_default DESC, name',
            [activeChannel.workspace_id]
        );
        const channels = channelsResult.rows;

        // Get messages for this channel
        const messagesResult = await pool.query(`
            SELECT m.*, u.name, u.email
            FROM huddle_messages m
            LEFT JOIN users u ON m.user_id = u.id
            WHERE m.channel_id = $1
            ORDER BY m.created_at ASC
            LIMIT 100
        `, [channelId]);
        const messages = messagesResult.rows;

        // Get workspaces for sidebar
        const workspacesResult = await pool.query(`
            SELECT w.* FROM huddle_workspaces w
            JOIN huddle_workspace_members wm ON w.id = wm.workspace_id
            WHERE wm.user_id = $1
        `, [userId]);
        const workspaces = workspacesResult.rows;

        res.render('huddle/index', {
            title: 'Huddle - Zenith OS',
            workspaces,
            activeWorkspace,
            channels,
            activeChannel,
            messages,
            currentUser: req.session.user,
            dmMode: false
        });
    } catch (err) {
        console.error('Huddle channel error:', err);
        res.redirect('/huddle');
    }
});

// Send message to channel
app.post('/api/huddle/messages', async (req, res) => {
    try {
        const { channelId, content } = req.body;
        const userId = req.session.user?.id || 1;

        if (!channelId || !content) {
            return res.status(400).json({ success: false, error: 'Channel ID and content required' });
        }

        const result = await pool.query(`
            INSERT INTO huddle_messages (channel_id, user_id, content, created_at)
            VALUES ($1, $2, $3, NOW())
            RETURNING *
        `, [channelId, userId, content]);

        res.json({ success: true, message: result.rows[0] });
    } catch (err) {
        console.error('Send message error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get messages for a channel (for real-time updates)
app.get('/api/huddle/channels/:id/messages', async (req, res) => {
    try {
        const channelId = req.params.id;
        const after = req.query.after;

        let query = `
            SELECT m.*, u.name, u.email
            FROM huddle_messages m
            LEFT JOIN users u ON m.user_id = u.id
            WHERE m.channel_id = $1
        `;
        const params = [channelId];

        if (after) {
            query += ' AND m.id > $2';
            params.push(after);
        }

        query += ' ORDER BY m.created_at ASC LIMIT 100';

        const result = await pool.query(query, params);
        res.json({ success: true, messages: result.rows });
    } catch (err) {
        console.error('Get messages error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Create new channel
app.post('/api/huddle/channels', async (req, res) => {
    try {
        const { name, workspaceId, description } = req.body;
        const userId = req.session.user?.id || 1;

        if (!name || !workspaceId) {
            return res.status(400).json({ success: false, error: 'Name and workspace ID required' });
        }

        const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

        const result = await pool.query(`
            INSERT INTO huddle_channels (workspace_id, name, slug, description, type, created_by, is_default)
            VALUES ($1, $2, $3, $4, 'public', $5, false)
            RETURNING *
        `, [workspaceId, name, slug, description || '', userId]);

        res.json({ success: true, channel: result.rows[0] });
    } catch (err) {
        console.error('Create channel error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Add reaction to message
app.post('/api/huddle/messages/:id/reactions', async (req, res) => {
    try {
        const messageId = req.params.id;
        const { emoji } = req.body;
        const userId = req.session.user?.id || 1;

        const existing = await pool.query(
            'SELECT * FROM huddle_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3',
            [messageId, userId, emoji]
        );

        if (existing.rows.length > 0) {
            await pool.query(
                'DELETE FROM huddle_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3',
                [messageId, userId, emoji]
            );
            res.json({ success: true, action: 'removed' });
        } else {
            await pool.query(
                'INSERT INTO huddle_reactions (message_id, user_id, emoji, created_at) VALUES ($1, $2, $3, NOW())',
                [messageId, userId, emoji]
            );
            res.json({ success: true, action: 'added' });
        }
    } catch (err) {
        console.error('Reaction error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================
// HUDDLE DIRECT MESSAGE API ROUTES
// ============================================

// Get all DM conversations for current user
app.get('/api/huddle/conversations', async (req, res) => {
    try {
        const userId = req.session.user?.id || 1;

        const result = await pool.query(`
            SELECT 
                c.*,
                (
                    SELECT json_agg(json_build_object(
                        'id', u.id,
                        'name', u.name,
                        'email', u.email
                    ))
                    FROM huddle_direct_participants p2
                    JOIN users u ON p2.user_id = u.id
                    WHERE p2.conversation_id = c.id AND p2.user_id != $1
                ) as other_participants,
                (
                    SELECT content FROM huddle_direct_messages 
                    WHERE conversation_id = c.id 
                    ORDER BY created_at DESC LIMIT 1
                ) as last_message
            FROM huddle_direct_conversations c
            JOIN huddle_direct_participants p ON c.id = p.conversation_id
            WHERE p.user_id = $1
            ORDER BY c.last_message_at DESC NULLS LAST
        `, [userId]);

        res.json({ success: true, conversations: result.rows });
    } catch (err) {
        console.error('Get conversations error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get or create a DM conversation with another user
app.post('/api/huddle/conversations', async (req, res) => {
    try {
        const userId = req.session.user?.id || 1;
        const { recipientId } = req.body;

        if (!recipientId) {
            return res.status(400).json({ success: false, error: 'Recipient ID required' });
        }

        // Check if conversation already exists between these two users
        const existing = await pool.query(`
            SELECT c.* FROM huddle_direct_conversations c
            WHERE c.id IN (
                SELECT conversation_id FROM huddle_direct_participants WHERE user_id = $1
            )
            AND c.id IN (
                SELECT conversation_id FROM huddle_direct_participants WHERE user_id = $2
            )
            AND c.type = 'direct'
            LIMIT 1
        `, [userId, recipientId]);

        if (existing.rows.length > 0) {
            return res.json({ success: true, conversation: existing.rows[0], isNew: false });
        }

        // Create new conversation
        const conv = await pool.query(`
            INSERT INTO huddle_direct_conversations (tenant_id, type, created_at)
            VALUES (1, 'direct', NOW())
            RETURNING *
        `);
        const conversationId = conv.rows[0].id;

        // Add both participants
        await pool.query(`
            INSERT INTO huddle_direct_participants (conversation_id, user_id, joined_at)
            VALUES ($1, $2, NOW()), ($1, $3, NOW())
        `, [conversationId, userId, recipientId]);

        res.json({ success: true, conversation: conv.rows[0], isNew: true });
    } catch (err) {
        console.error('Create conversation error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get messages for a DM conversation
app.get('/api/huddle/conversations/:id/messages', async (req, res) => {
    try {
        const conversationId = req.params.id;
        const userId = req.session.user?.id || 1;

        // Verify user is participant
        const participant = await pool.query(
            'SELECT * FROM huddle_direct_participants WHERE conversation_id = $1 AND user_id = $2',
            [conversationId, userId]
        );

        if (participant.rows.length === 0) {
            return res.status(403).json({ success: false, error: 'Not a participant' });
        }

        const messages = await pool.query(`
            SELECT m.*, u.name, u.email
            FROM huddle_direct_messages m
            LEFT JOIN users u ON m.user_id = u.id
            WHERE m.conversation_id = $1 AND m.is_deleted = false
            ORDER BY m.created_at ASC
            LIMIT 100
        `, [conversationId]);

        // Update last read
        await pool.query(
            'UPDATE huddle_direct_participants SET last_read_at = NOW() WHERE conversation_id = $1 AND user_id = $2',
            [conversationId, userId]
        );

        res.json({ success: true, messages: messages.rows });
    } catch (err) {
        console.error('Get DM messages error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Send a DM
app.post('/api/huddle/conversations/:id/messages', async (req, res) => {
    try {
        const conversationId = req.params.id;
        const { content } = req.body;
        const userId = req.session.user?.id || 1;

        if (!content) {
            return res.status(400).json({ success: false, error: 'Content required' });
        }

        // Verify user is participant
        const participant = await pool.query(
            'SELECT * FROM huddle_direct_participants WHERE conversation_id = $1 AND user_id = $2',
            [conversationId, userId]
        );

        if (participant.rows.length === 0) {
            return res.status(403).json({ success: false, error: 'Not a participant' });
        }

        // Insert message
        const result = await pool.query(`
            INSERT INTO huddle_direct_messages (conversation_id, user_id, content, content_type, is_edited, is_deleted, created_at)
            VALUES ($1, $2, $3, 'text', false, false, NOW())
            RETURNING *
        `, [conversationId, userId, content]);

        // Update conversation last_message_at
        await pool.query(
            'UPDATE huddle_direct_conversations SET last_message_at = NOW() WHERE id = $1',
            [conversationId]
        );

        res.json({ success: true, message: result.rows[0] });
    } catch (err) {
        console.error('Send DM error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get list of users available for DM
app.get('/api/huddle/users', async (req, res) => {
    try {
        const userId = req.session.user?.id || 1;
        const orgId = req.session.org?.id || 1;

        const users = await pool.query(`
            SELECT id, name, email, role 
            FROM users 
            WHERE organization_id = $1 AND id != $2
            ORDER BY name
        `, [orgId, userId]);

        res.json({ success: true, users: users.rows });
    } catch (err) {
        console.error('Get users error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// DM View route - render DM conversation
app.get('/huddle/dm/:id', async (req, res) => {
    try {
        const conversationId = req.params.id;
        const userId = req.session.user?.id || 1;

        // Verify user is participant
        const participant = await pool.query(
            'SELECT * FROM huddle_direct_participants WHERE conversation_id = $1 AND user_id = $2',
            [conversationId, userId]
        );

        if (participant.rows.length === 0) {
            return res.redirect('/huddle');
        }

        // Get conversation details
        const conv = await pool.query('SELECT * FROM huddle_direct_conversations WHERE id = $1', [conversationId]);

        // Get other participant
        const otherParticipant = await pool.query(`
            SELECT u.* FROM huddle_direct_participants p
            JOIN users u ON p.user_id = u.id
            WHERE p.conversation_id = $1 AND p.user_id != $2
        `, [conversationId, userId]);

        // Get messages
        const messages = await pool.query(`
            SELECT m.*, u.name, u.email
            FROM huddle_direct_messages m
            LEFT JOIN users u ON m.user_id = u.id
            WHERE m.conversation_id = $1 AND m.is_deleted = false
            ORDER BY m.created_at ASC
            LIMIT 100
        `, [conversationId]);

        // Get workspaces for sidebar
        const workspacesResult = await pool.query(`
            SELECT w.* FROM huddle_workspaces w
            JOIN huddle_workspace_members wm ON w.id = wm.workspace_id
            WHERE wm.user_id = $1
        `, [userId]);

        // Get channels for sidebar
        const channelsResult = await pool.query(`
            SELECT * FROM huddle_channels WHERE workspace_id = $1 ORDER BY is_default DESC, name
        `, [workspacesResult.rows[0]?.id || 1]);

        // Get all DM conversations for sidebar
        const conversations = await pool.query(`
            SELECT 
                c.*,
                (
                    SELECT u.name FROM huddle_direct_participants p2
                    JOIN users u ON p2.user_id = u.id
                    WHERE p2.conversation_id = c.id AND p2.user_id != $1
                    LIMIT 1
                ) as other_name,
                (
                    SELECT u.id FROM huddle_direct_participants p2
                    JOIN users u ON p2.user_id = u.id
                    WHERE p2.conversation_id = c.id AND p2.user_id != $1
                    LIMIT 1
                ) as other_id
            FROM huddle_direct_conversations c
            JOIN huddle_direct_participants p ON c.id = p.conversation_id
            WHERE p.user_id = $1
            ORDER BY c.last_message_at DESC NULLS LAST
        `, [userId]);

        res.render('huddle/index', {
            title: 'Huddle - Zenith OS',
            workspaces: workspacesResult.rows,
            activeWorkspace: workspacesResult.rows[0],
            channels: channelsResult.rows,
            activeChannel: null,
            messages: messages.rows,
            currentUser: req.session.user,
            dmMode: true,
            activeConversation: conv.rows[0],
            otherParticipant: otherParticipant.rows[0],
            dmConversations: conversations.rows
        });
    } catch (err) {
        console.error('DM view error:', err);
        res.redirect('/huddle');
    }
});

// Mailer
app.get('/mailer', async (req, res) => {
    try {
        const campaignsResult = await pool.query(
            'SELECT * FROM email_campaigns WHERE organization_id = $1 ORDER BY created_at DESC',
            [req.session.org.id]
        );
        
        const subscribersResult = await pool.query(
            'SELECT * FROM email_subscribers WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 10',
            [req.session.org.id]
        );
        
        const statsResult = await pool.query(`
            SELECT 
                COUNT(*) as total_subscribers,
                COALESCE(SUM(emails_sent), 0) as total_sent
            FROM email_subscribers WHERE organization_id = $1
        `, [req.session.org.id]);
        
        res.render('mailer', {
            campaigns: campaignsResult.rows,
            subscribers: subscribersResult.rows,
            stats: statsResult.rows[0] || { total_subscribers: 0, total_sent: 0 }
        });
    } catch (err) {
        console.error('Mailer error:', err);
        res.render('mailer', { campaigns: [], subscribers: [], stats: {} });
    }
});

// ============================================
// EMAIL API ENDPOINTS
// ============================================

// Send a single email (e.g., to a lead from CRM)
app.post('/api/email/send', async (req, res) => {
    try {
        const { to, subject, html, text, template, templateData } = req.body;
        
        let emailContent = { subject, html, text };
        
        // Use template if specified
        if (template && EmailService.templates[template]) {
            emailContent = EmailService.templates[template](...(templateData || []));
        }
        
        const result = await EmailService.sendEmail({
            to,
            subject: emailContent.subject,
            html: emailContent.html,
            text: emailContent.text
        });
        
        // Log the email in activity
        if (result.success) {
            await pool.query(
                'INSERT INTO activity_log (organization_id, user_id, action, details, type) VALUES ($1, $2, $3, $4, $5)',
                [req.session.org.id, req.session.user.id, 'Email Sent', `Sent to ${to}: ${emailContent.subject}`, 'email']
            );
        }
        
        res.json(result);
    } catch (err) {
        console.error('Send email error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Send email to a lead (from CRM)
app.post('/api/email/lead/:leadId', async (req, res) => {
    try {
        const { leadId } = req.params;
        const { subject, message, template } = req.body;
        
        // Get lead info
        const leadResult = await pool.query(
            'SELECT * FROM leads WHERE id = $1 AND organization_id = $2',
            [leadId, req.session.org.id]
        );
        
        if (leadResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Lead not found' });
        }
        
        const lead = leadResult.rows[0];
        
        let emailContent;
        if (template === 'welcome') {
            emailContent = EmailService.templates.leadWelcome(lead.name, lead.company);
        } else if (template === 'property') {
            emailContent = EmailService.templates.propertyAlert(lead.name, req.body.propertyName, req.body.propertyDetails);
        } else {
            emailContent = {
                subject,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <div style="background: linear-gradient(135deg, #10B981, #3B82F6); padding: 30px; text-align: center;">
                            <h1 style="color: white; margin: 0;">CRE Consultants</h1>
                        </div>
                        <div style="padding: 30px; background: #f8f9fa;">
                            <h2>Hi ${lead.name},</h2>
                            ${message}
                        </div>
                        <div style="padding: 20px; text-align: center; color: #666; font-size: 12px;">
                            <p>CRE Consultants | Commercial Real Estate Services</p>
                        </div>
                    </div>
                `
            };
        }
        
        const result = await EmailService.sendEmail({
            to: lead.email,
            subject: emailContent.subject,
            html: emailContent.html,
            replyTo: req.session.user.email
        });
        
        if (result.success) {
            await pool.query(
                'INSERT INTO activity_log (organization_id, user_id, action, details, type) VALUES ($1, $2, $3, $4, $5)',
                [req.session.org.id, req.session.user.id, 'Lead Email', `Emailed ${lead.name}: ${emailContent.subject}`, 'email']
            );
        }
        
        res.json(result);
    } catch (err) {
        console.error('Lead email error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Create and send a campaign
app.post('/api/campaign/create', async (req, res) => {
    try {
        const { name, subject, html, sendNow } = req.body;
        
        // Create campaign record
        const campaignResult = await pool.query(`
            INSERT INTO email_campaigns (organization_id, name, subject, status, created_at)
            VALUES ($1, $2, $3, $4, NOW())
            RETURNING id
        `, [req.session.org.id, name, subject, sendNow ? 'sending' : 'draft']);
        
        const campaignId = campaignResult.rows[0].id;
        
        if (sendNow) {
            // Get all active subscribers
            const subscribersResult = await pool.query(
                "SELECT * FROM email_subscribers WHERE organization_id = $1 AND status = 'active'",
                [req.session.org.id]
            );
            
            const recipients = subscribersResult.rows;
            
            // Send emails
            const results = await EmailService.sendBulkEmail({
                recipients,
                subject,
                html
            });
            
            // Update campaign stats
            const successCount = results.filter(r => r.success).length;
            await pool.query(`
                UPDATE email_campaigns 
                SET status = 'active', sent_count = $1
                WHERE id = $2
            `, [successCount, campaignId]);
            
            res.json({
                success: true,
                campaignId,
                sent: successCount,
                failed: results.length - successCount
            });
        } else {
            res.json({ success: true, campaignId, status: 'draft' });
        }
    } catch (err) {
        console.error('Campaign create error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Add subscriber
app.post('/api/subscribers/add', async (req, res) => {
    try {
        const { email, name, source } = req.body;
        
        // Check if already exists
        const existing = await pool.query(
            'SELECT id FROM email_subscribers WHERE organization_id = $1 AND email = $2',
            [req.session.org.id, email]
        );
        
        if (existing.rows.length > 0) {
            return res.json({ success: false, error: 'Subscriber already exists' });
        }
        
        await pool.query(`
            INSERT INTO email_subscribers (organization_id, email, name, source, status)
            VALUES ($1, $2, $3, $4, 'active')
        `, [req.session.org.id, email, name, source || 'Manual']);
        
        res.json({ success: true });
    } catch (err) {
        console.error('Add subscriber error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Import subscribers (bulk)
app.post('/api/subscribers/import', async (req, res) => {
    try {
        const { subscribers } = req.body; // Array of { email, name }
        
        let added = 0;
        let skipped = 0;
        
        for (const sub of subscribers) {
            const existing = await pool.query(
                'SELECT id FROM email_subscribers WHERE organization_id = $1 AND email = $2',
                [req.session.org.id, sub.email]
            );
            
            if (existing.rows.length === 0) {
                await pool.query(`
                    INSERT INTO email_subscribers (organization_id, email, name, source, status)
                    VALUES ($1, $2, $3, 'Import', 'active')
                `, [req.session.org.id, sub.email, sub.name]);
                added++;
            } else {
                skipped++;
            }
        }
        
        res.json({ success: true, added, skipped });
    } catch (err) {
        console.error('Import subscribers error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Unsubscribe endpoint (public)
app.get('/unsubscribe', async (req, res) => {
    try {
        const { email } = req.query;
        
        if (!email) {
            return res.send('<h1>Invalid unsubscribe link</h1>');
        }
        
        await pool.query(
            "UPDATE email_subscribers SET status = 'unsubscribed' WHERE email = $1",
            [email]
        );
        
        res.send(`
            <html>
            <head><title>Unsubscribed</title></head>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                <h1>You've been unsubscribed</h1>
                <p>You will no longer receive marketing emails from CRE Consultants.</p>
                <p style="color: #666; margin-top: 30px;">If this was a mistake, please contact us to re-subscribe.</p>
            </body>
            </html>
        `);
    } catch (err) {
        console.error('Unsubscribe error:', err);
        res.status(500).send('Error processing unsubscribe request');
    }
});

// Public lead capture endpoint (for landing page)
app.post('/api/public/lead', async (req, res) => {
    try {
        const { name, email, company, phone, message, source } = req.body;
        
        // Get CRE Consultants org ID (or make configurable)
        const orgResult = await pool.query("SELECT id FROM organizations WHERE slug = 'cre'");
        if (orgResult.rows.length === 0) {
            return res.status(400).json({ success: false, error: 'Organization not found' });
        }
        const orgId = orgResult.rows[0].id;
        
        // Create lead
        const leadResult = await pool.query(`
            INSERT INTO leads (organization_id, name, email, company, phone, notes, source, stage, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'New', NOW())
            RETURNING id
        `, [orgId, name, email, company, phone, message, source || 'Landing Page']);
        
        // Also add as subscriber
        const existingSub = await pool.query(
            'SELECT id FROM email_subscribers WHERE organization_id = $1 AND email = $2',
            [orgId, email]
        );
        
        if (existingSub.rows.length === 0) {
            await pool.query(`
                INSERT INTO email_subscribers (organization_id, email, name, source, status)
                VALUES ($1, $2, $3, $4, 'active')
            `, [orgId, email, name, source || 'Landing Page']);
        }
        
        // Send welcome email
        const welcomeEmail = EmailService.templates.leadWelcome(name, company);
        await EmailService.sendEmail({
            to: email,
            subject: welcomeEmail.subject,
            html: welcomeEmail.html
        });
        
        // Log activity
        await pool.query(
            'INSERT INTO activity_log (organization_id, action, details, type) VALUES ($1, $2, $3, $4)',
            [orgId, 'New Lead', `${name} from ${source || 'Landing Page'}`, 'lead']
        );
        
        res.json({ success: true, leadId: leadResult.rows[0].id });
    } catch (err) {
        console.error('Lead capture error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// The Vault (Documents)
app.get('/vault', async (req, res) => {
    try {
        const foldersResult = await pool.query(
            'SELECT * FROM vault_folders WHERE organization_id = $1 ORDER BY name',
            [req.session.org.id]
        );
        
        const filesResult = await pool.query(
            'SELECT * FROM vault_files WHERE organization_id = $1 ORDER BY created_at DESC',
            [req.session.org.id]
        );
        
        res.render('vault', {
            folders: foldersResult.rows,
            files: filesResult.rows
        });
    } catch (err) {
        console.error('Vault error:', err);
        res.render('vault', { folders: [], files: [] });
    }
});

// CFO Dashboard
app.get('/cfo', async (req, res) => {
    // Require admin or principal role
    if (!['Admin', 'Principal'].includes(req.session.user.role)) {
        return res.redirect('/dashboard');
    }
    
    try {
        const transactionsResult = await pool.query(
            'SELECT * FROM transactions WHERE organization_id = $1 ORDER BY date DESC LIMIT 20',
            [req.session.org.id]
        );
        
        const statsResult = await pool.query(`
            SELECT 
                COALESCE(SUM(amount), 0) as total_revenue,
                COALESCE(SUM(platform_fee), 0) as total_fees
            FROM transactions WHERE organization_id = $1
        `, [req.session.org.id]);
        
        res.render('cfo', {
            transactions: transactionsResult.rows,
            stats: statsResult.rows[0] || {}
        });
    } catch (err) {
        console.error('CFO error:', err);
        res.render('cfo', { transactions: [], stats: {} });
    }
});

// Command Center
app.get('/command', async (req, res) => {
    // Require admin or principal role
    if (!['Admin', 'Principal'].includes(req.session.user.role)) {
        return res.redirect('/dashboard');
    }
    
    try {
        // Get portfolio companies (all orgs if MSG admin)
        let orgsResult;
        if (req.session.org.name === 'Main Street Group') {
            orgsResult = await pool.query('SELECT * FROM organizations ORDER BY name');
        } else {
            orgsResult = await pool.query(
                'SELECT * FROM organizations WHERE id = $1',
                [req.session.org.id]
            );
        }
        
        res.render('command', {
            organizations: orgsResult.rows
        });
    } catch (err) {
        console.error('Command center error:', err);
        res.render('command', { organizations: [] });
    }
});

// Admin
// Old /admin route - redirect to new system
// ============================================
// ADMIN MODULE
// ============================================
app.get('/admin', async (req, res) => {
    if (!req.session.user) return res.redirect('/auth/login');
    try {
        const orgId = req.session.org?.id;
        const statsResult = await pool.query(`SELECT 
            COUNT(*) FILTER (WHERE status = 'active' OR status IS NULL) as active_count,
            COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
            COUNT(*) FILTER (WHERE status = 'review') as review_count,
            COUNT(*) FILTER (WHERE status = 'terminated') as terminated_count
            FROM users WHERE org_id = $1`, [orgId]);
        const rolesResult = await pool.query(`SELECT role as name, COUNT(*) as user_count FROM users WHERE org_id = $1 GROUP BY role ORDER BY role`, [orgId]);
        res.render('admin/dashboard', { user: req.session.user, org: req.session.org, stats: statsResult.rows[0] || {}, recentAudit: [], roleCounts: rolesResult.rows || [] });
    } catch (err) {
        console.error('[ADMIN] Dashboard error:', err);
        res.render('admin/dashboard', { user: req.session.user, org: req.session.org, stats: {}, recentAudit: [], roleCounts: [] });
    }
});

app.get('/admin/roles', async (req, res) => {
    if (!req.session.user) return res.redirect('/auth/login');
    try {
        const orgId = req.session.org?.id;
        const rolesResult = await pool.query(`
            SELECT 
                role as name,
                role as id,
                CASE WHEN role IN ('Super Admin', 'Admin', 'Owner') THEN true ELSE false END as is_admin,
                COUNT(*) as user_count,
                COALESCE(
                    CASE role
                        WHEN 'Super Admin' THEN 'Full platform access with cross-tenant management'
                        WHEN 'Admin' THEN 'Organization administration and user management'
                        WHEN 'Owner' THEN 'Organization owner with billing access'
                        WHEN 'Director' THEN 'Department leadership with module management'
                        WHEN 'Manager' THEN 'Team management and reporting access'
                        WHEN 'Agent' THEN 'Standard broker access to CRM, INTEL, and listings'
                        WHEN 'Associate' THEN 'Junior broker with guided access'
                        ELSE 'Custom role'
                    END
                ) as description,
                0 as permission_count
            FROM users 
            WHERE org_id = $1
            GROUP BY role
            ORDER BY 
                CASE role 
                    WHEN 'Super Admin' THEN 1 WHEN 'Admin' THEN 2 WHEN 'Owner' THEN 3 
                    WHEN 'Director' THEN 4 WHEN 'Manager' THEN 5 ELSE 6 
                END
        `, [orgId]);

        const roles = rolesResult.rows.map(r => ({
            ...r,
            user_count: parseInt(r.user_count),
            permissions: []
        }));

        res.render('admin/roles', { user: req.session.user, org: req.session.org, activeTab: 'roles', roles });
    } catch (err) {
        console.error('[ADMIN] Roles error:', err);
        res.render('admin/roles', { user: req.session.user, org: req.session.org, activeTab: 'roles', roles: [] });
    }
});

app.get('/admin/users', async (req, res) => {
    if (!req.session.user) return res.redirect('/auth/login');
    try {
        const users = await pool.query('SELECT * FROM users WHERE organization_id = $1 ORDER BY name', [req.session.org?.id]);
        const roles = [
            { id: 'Super Admin', name: 'Super Admin' },
            { id: 'Admin', name: 'Admin' },
            { id: 'Principal', name: 'Principal' },
            { id: 'Broker', name: 'Broker' },
            { id: 'Associate', name: 'Associate' },
            { id: 'Marketing', name: 'Marketing' },
            { id: 'Agent', name: 'Agent' },
            { id: 'User', name: 'User' }
        ];
        res.render('admin/users', { user: req.session.user, org: req.session.org, activeTab: 'users', users: users.rows, roles });
    } catch (err) {
        console.error('[ADMIN] Users error:', err);
        res.render('admin/users', { user: req.session.user, org: req.session.org, activeTab: 'users', users: [], roles: [] });
    }
});

app.get('/admin/audit', async (req, res) => {
    if (!req.session.user) return res.redirect('/auth/login');
    try {
        const users = await pool.query('SELECT id, name FROM users WHERE organization_id = $1 ORDER BY name', [req.session.org?.id]);
        res.render('admin/audit', { user: req.session.user, org: req.session.org, activeTab: 'audit', users: users.rows });
    } catch (err) {
        console.error('[ADMIN] Audit error:', err);
        res.render('admin/audit', { user: req.session.user, org: req.session.org, activeTab: 'audit', users: [] });
    }
});

// ── Feature Toggles ─────────────────────────────────────────
app.get('/admin/features', async (req, res) => {
    if (!req.session.user) return res.redirect('/auth/login');
    if (!['Admin', 'Principal', 'Super Admin'].includes(req.session.user.role)) return res.redirect('/dashboard');
    try {
        const orgResult = await pool.query('SELECT feature_toggles FROM organizations WHERE id = $1', [req.session.org?.id]);
        const features = orgResult.rows[0]?.feature_toggles || {};
        res.render('admin/features', { user: req.session.user, org: req.session.org, activeTab: 'features', features });
    } catch (err) {
        console.error('[ADMIN] Features error:', err);
        res.render('admin/features', { user: req.session.user, org: req.session.org, activeTab: 'features', features: {} });
    }
});

app.post('/admin/features', async (req, res) => {
    if (!req.session.user) return res.redirect('/auth/login');
    if (!['Admin', 'Principal', 'Super Admin'].includes(req.session.user.role)) return res.redirect('/dashboard');
    try {
        const modules = ['crm', 'intel', 'marketing', 'huddle', 'vault', 'cfo', 'danimal', 'inventory', 'mailer', 'pm', 'command'];
        const toggles = {};
        modules.forEach(m => { toggles[m] = req.body[m] === 'on'; });
        await pool.query('UPDATE organizations SET feature_toggles = $1 WHERE id = $2', [JSON.stringify(toggles), req.session.org?.id]);
        req.session.features = toggles;
        res.redirect('/admin/features?success=Feature settings updated');
    } catch (err) {
        console.error('[ADMIN] Features save error:', err);
        res.redirect('/admin/features?error=Failed to save settings');
    }
});


// ============================================
// SYSTEM API - USER MANAGEMENT
// ============================================

// POST - Create new user
app.post('/system/api/users', async (req, res) => {
    try {
        const orgId = req.session.org?.id;
        if (!orgId) return res.json({ success: false, error: 'Not authenticated' });

        const { name, email, role_id, password } = req.body;
        if (!name || !email) return res.json({ success: false, error: 'Name and email are required' });

        // Check for duplicate email
        const existing = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
        if (existing.rows.length > 0) return res.json({ success: false, error: 'Email already exists' });

        // Generate license key: ZENO-XXXX-2026-ROLE
        const code = name.split(' ').map(n => n.substring(0, 2).toUpperCase()).join('').substring(0, 4);
        const roleLookup = await pool.query('SELECT name FROM roles WHERE id = $1', [role_id]);
        const roleName = roleLookup.rows[0]?.name || 'User';
        const roleCode = roleName.substring(0, 5).toUpperCase().replace(/\s/g, '');
        const licenseKey = 'ZENO-' + code + '-2026-' + roleCode;

        // If password provided, hash it and set active; otherwise pending activation
        let passwordHash = 'PENDING_ACTIVATION';
        let status = 'pending';
        if (password && password.trim()) {
            const bcrypt = require('bcryptjs');
            passwordHash = await bcrypt.hash(password, 10);
            status = 'active';
        }

        const result = await pool.query(`
            INSERT INTO users (organization_id, name, email, password_hash, role, status, license_key, license_status, license_issued_at, license_issued_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'issued', NOW(), $8)
            RETURNING id, name, email, role, license_key, status
        `, [orgId, name, email, passwordHash, roleName, status, licenseKey, req.session.user?.name || 'Admin']);

        const newUser = result.rows[0];
        const activationLink = 'https://zenith.cre-us.com/auth/activate?email=' + encodeURIComponent(email);

        console.log(`[ADMIN] User created: ${email} by ${req.session.user?.email}`);

        res.json({
            success: true,
            user: newUser,
            license_key: licenseKey,
            activation_link: status === 'pending' ? activationLink : null
        });
    } catch (err) {
        console.error('[ADMIN] Create user error:', err);
        res.json({ success: false, error: 'Failed to create user' });
    }
});

// PUT - Update existing user
app.put('/system/api/users/:id', async (req, res) => {
    try {
        const orgId = req.session.org?.id;
        if (!orgId) return res.json({ success: false, error: 'Not authenticated' });

        const { name, email, role_id, password, feature_overrides } = req.body;
        const userId = req.params.id;

        // Save feature overrides if provided
        if (feature_overrides && typeof feature_overrides === 'object') {
            await pool.query('UPDATE users SET feature_overrides = $1 WHERE id = $2 AND organization_id = $3',
                [JSON.stringify(feature_overrides), userId, orgId]);
        }

        const roleLookup = await pool.query('SELECT name FROM roles WHERE id = $1', [role_id]);
        const roleName = roleLookup.rows[0]?.name || 'User';

        if (password && password.trim()) {
            const bcrypt = require('bcryptjs');
            const hash = await bcrypt.hash(password, 10);
            await pool.query(
                'UPDATE users SET name = $1, email = $2, role = $3, password_hash = $4 WHERE id = $5 AND organization_id = $6',
                [name, email, roleName, hash, userId, orgId]
            );
        } else {
            await pool.query(
                'UPDATE users SET name = $1, email = $2, role = $3 WHERE id = $4 AND organization_id = $5',
                [name, email, roleName, userId, orgId]
            );
        }

        console.log(`[ADMIN] User updated: ${email} by ${req.session.user?.email}`);
        res.json({ success: true });
    } catch (err) {
        console.error('[ADMIN] Update user error:', err);
        res.json({ success: false, error: 'Failed to update user' });
    }
});

// GET - Single user for edit modal
app.get('/system/api/users/:id', async (req, res) => {
    try {
        const orgId = req.session.org?.id;
        const result = await pool.query(
            'SELECT id, name, email, role, status, license_key, feature_overrides FROM users WHERE id = $1 AND organization_id = $2',
            [req.params.id, orgId]
        );
        if (result.rows.length === 0) return res.json({ success: false, error: 'User not found' });
        res.json({ success: true, user: result.rows[0] });
    } catch (err) {
        res.json({ success: false, error: 'Failed to load user' });
    }
});

// PUT - Update user status (freeze/terminate/activate)
app.put('/system/api/users/:id/status', async (req, res) => {
    try {
        const orgId = req.session.org?.id;
        if (!orgId) return res.json({ success: false, error: 'Not authenticated' });

        const { status, reason } = req.body;
        const userId = req.params.id;

        // Don't let users terminate themselves
        if (parseInt(userId) === req.session.user?.id && (status === 'terminated' || status === 'under_review')) {
            return res.json({ success: false, error: 'Cannot change your own status' });
        }

        await pool.query(`
            UPDATE users SET status = $1, status_reason = $2, status_changed_by = $3, status_changed_at = NOW()
            WHERE id = $4 AND organization_id = $5
        `, [status, reason || null, req.session.user?.name || 'Admin', userId, orgId]);

        console.log(`[ADMIN] User ${userId} status -> ${status} by ${req.session.user?.email}`);
        res.json({ success: true });
    } catch (err) {
        console.error('[ADMIN] Status update error:', err);
        res.json({ success: false, error: 'Failed to update status' });
    }
});


// Theme preference API
app.post('/api/user/theme', async (req, res) => {
    try {
        if (!req.session.user) return res.json({ success: false });
        const theme = req.body.theme === 'dark' ? 'dark' : 'light';
        req.session.theme = theme;
        res.json({ success: true, theme });
    } catch (err) {
        res.json({ success: false });
    }
});

// Super Admin (MSG only)
app.get('/superadmin', async (req, res) => {
    // Verify MSG super admin
    const email = req.session.user?.email?.toLowerCase();
    if (email !== 'koda@mainstgroup.com') {
        return res.redirect('/dashboard');
    }
    
    try {
        const orgsResult = await pool.query('SELECT * FROM organizations ORDER BY name');
        const usersResult = await pool.query(`
            SELECT u.*, o.name as org_name 
            FROM users u 
            JOIN organizations o ON u.organization_id = o.id 
            ORDER BY o.name, u.name
        `);
        
        res.render('superadmin', {
            organizations: orgsResult.rows,
            users: usersResult.rows
        });
    } catch (err) {
        console.error('Super admin error:', err);
        res.render('superadmin', { organizations: [], users: [] });
    }
});

// Super Admin Actions
app.post('/superadmin/suspend/:orgId', async (req, res) => {
    const email = req.session.user?.email?.toLowerCase();
    if (email !== 'koda@mainstgroup.com') {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    
    try {
        await pool.query(
            'UPDATE organizations SET license_status = $1 WHERE id = $2',
            ['suspended', req.params.orgId]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/superadmin/activate/:orgId', async (req, res) => {
    const email = req.session.user?.email?.toLowerCase();
    if (email !== 'koda@mainstgroup.com') {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    
    try {
        await pool.query(
            'UPDATE organizations SET license_status = $1 WHERE id = $2',
            ['active', req.params.orgId]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Public Lead Capture API
app.post('/api/leads/capture', async (req, res) => {
    const { name, email, phone, company, message, source, org_slug } = req.body;
    
    try {
        // Find organization by slug
        const orgResult = await pool.query(
            'SELECT id FROM organizations WHERE slug = $1',
            [org_slug || 'cre']
        );
        
        if (orgResult.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid organization' });
        }
        
        const orgId = orgResult.rows[0].id;
        
        // Create lead
        await pool.query(`
            INSERT INTO leads (organization_id, name, email, phone, company, notes, source, stage, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'New', NOW())
        `, [orgId, name, email, phone, company, message, source || 'Landing Page']);
        
        res.json({ success: true, message: 'Lead captured successfully' });
    } catch (err) {
        console.error('Lead capture error:', err);
        res.status(500).json({ error: 'Failed to capture lead' });
    }
});
// ============================================
// CRM LEAD MANAGEMENT API
// ============================================

// Create new lead
app.post('/api/crm/leads', async (req, res) => {
    try {
        const orgId = req.session.org?.id || 1;
        const userId = req.session.user?.id;
        const { name, company, email, phone, property_address, property_city, property_state, property_zip, property_type, property_sqft, value, stage, source, notes } = req.body;
        
        if (!name || !company) {
            return res.status(400).json({ success: false, error: 'Name and company are required' });
        }
        
        const result = await pool.query(`
            INSERT INTO leads (organization_id, name, company, email, phone, property_address, property_city, property_state, property_zip, property_type, property_sqft, value, stage, source, notes, assigned_to, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
            RETURNING *
        `, [orgId, name, company, email, phone, property_address, property_city, property_state || 'FL', property_zip, property_type, property_sqft, value, stage || 'New Lead', source, notes, userId]);
        
        console.log('[CRM] New lead created:', company);
        res.json({ success: true, lead: result.rows[0] });
    } catch (err) {
        console.error('Create lead error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Danimal Data address autocomplete
app.get('/api/danimal/address-search', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
    try {
        const { q } = req.query;
        if (!q || q.length < 3) return res.json({ results: [] });

        const searchTerm = q.trim();
        const result = await pool.query(
            "SELECT DISTINCT site_address, site_city, site_zip, parcel_id, property_use_desc, building_sf, year_built FROM danimal_properties WHERE UPPER(site_address) LIKE $1 ORDER BY site_address LIMIT 8",
            [searchTerm + '%']
        );

        res.json({
            results: result.rows.map(r => ({
                address: r.site_address,
                city: r.site_city,
                zip: r.site_zip,
                parcel_id: r.parcel_id,
                type: r.property_use_desc,
                sqft: r.building_sf ? parseFloat(r.building_sf) : null,
                year: r.year_built
            }))
        });
    } catch (err) {
        console.error('[Danimal Search] Error:', err);
        res.json({ results: [] });
    }
});

// Danimal Data property lookup (auto-populate from address)
app.get('/api/danimal/property-lookup', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
    try {
        const { address, city, zip } = req.query;
        if (!address || address.length < 5) return res.json({ found: false });

        const searchAddr = address.toUpperCase().trim();
        let result;

        // Try exact address match first
        result = await pool.query(
            "SELECT * FROM danimal_properties WHERE UPPER(site_address) = $1 LIMIT 5",
            [searchAddr]
        );

        // If no exact match, try LIKE search
        if (result.rows.length === 0) {
            result = await pool.query(
                "SELECT * FROM danimal_properties WHERE UPPER(site_address) LIKE $1 LIMIT 5",
                ['%' + searchAddr + '%']
            );
        }

        // Filter by city/zip if provided
        let matches = result.rows;
        if (city && matches.length > 1) {
            const filtered = matches.filter(m => m.site_city && m.site_city.toUpperCase() === city.toUpperCase());
            if (filtered.length > 0) matches = filtered;
        }
        if (zip && matches.length > 1) {
            const filtered = matches.filter(m => m.site_zip === zip);
            if (filtered.length > 0) matches = filtered;
        }

        if (matches.length === 0) return res.json({ found: false });

        // Return the best match with all useful fields
        const p = matches[0];
        res.json({
            found: true,
            count: matches.length,
            property: {
                parcel_id: p.parcel_id || p.strap,
                strap: p.strap,
                address: p.site_address,
                city: p.site_city,
                state: p.site_state || 'FL',
                zip: p.site_zip,
                county: p.county,
                lat: p.latitude,
                lng: p.longitude,
                property_type: p.property_use_desc,
                property_use_code: p.property_use_code,
                zoning: p.zoning,
                building_sf: p.building_sf ? parseFloat(p.building_sf) : null,
                lot_size_sf: p.land_area_sf ? parseFloat(p.land_area_sf) : null,
                lot_size_acres: p.land_area_acres ? parseFloat(p.land_area_acres) : null,
                year_built: p.year_built,
                num_buildings: p.num_buildings,
                num_units: p.num_units,
                just_value: p.just_value ? parseFloat(p.just_value) : null,
                assessed_value: p.assessed_value ? parseFloat(p.assessed_value) : null,
                taxable_value: p.taxable_value ? parseFloat(p.taxable_value) : null,
                land_value: p.land_value ? parseFloat(p.land_value) : null,
                building_value: p.building_value ? parseFloat(p.building_value) : null,
                owner_name: p.owner_name,
                owner_name_2: p.owner_name_2,
                owner_address: p.owner_address,
                owner_city: p.owner_city,
                owner_state: p.owner_state,
                owner_zip: p.owner_zip,
                last_sale_date: p.last_sale_date,
                last_sale_price: p.last_sale_price ? parseFloat(p.last_sale_price) : null,
                legal_description: p.legal_description,
                subdivision: p.subdivision
            },
            all_matches: matches.length > 1 ? matches.map(m => ({
                address: m.site_address,
                city: m.site_city,
                zip: m.site_zip,
                parcel_id: m.parcel_id
            })) : undefined
        });
    } catch (err) {
        console.error('[Danimal Lookup] Error:', err);
        res.status(500).json({ found: false, error: err.message });
    }
});

// Update lead stage (for drag-and-drop)
app.put('/api/leads/:id/stage', async (req, res) => {
    try {
        const { id } = req.params;
        const { stage } = req.body;
        const orgId = req.session.org?.id || 1;
        
        const validStages = ['New', 'Contacted', 'Qualified', 'Proposal', 'Closed Won', 'Closed Lost'];
        if (!validStages.includes(stage)) {
            return res.status(400).json({ success: false, error: 'Invalid stage' });
        }
        
        const result = await pool.query(
            'UPDATE leads SET stage = $1 WHERE id = $2 AND organization_id = $3 RETURNING *',
            [stage, id, orgId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Lead not found' });
        }
        
        // Marketing Suite: Auto-create draft when lead moves to Closed Won
        if (stage === 'Closed Won' && result.rows[0]) {
            try {
                const lead = result.rows[0];
                const webhookPayload = {
                    event: 'listing_won',
                    listing_id: parseInt(id),
                    tenant_id: orgId,
                    data: {
                        listing: {
                            property_name: lead.company || lead.name,
                            address: lead.property_address || '',
                            city: lead.property_city || '',
                            state: lead.property_state || 'FL',
                            listing_type: lead.property_type || 'for_sale',
                            broker: 'CRE Consultants',
                            photo_count: 1
                        },
                        actor_id: req.session?.user?.id || null
                    }
                };
                const http = require('http');
                const postData = JSON.stringify(webhookPayload);
                const webhookReq = http.request({
                    hostname: 'localhost',
                    port: process.env.PORT || 8080,
                    path: '/api/marketing/webhook/crm',
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
                });
                webhookReq.on('error', (e) => console.error('[Marketing] Webhook error:', e.message));
                webhookReq.write(postData);
                webhookReq.end();
                console.log('[Marketing] Webhook fired for lead ' + id + ' → Closed Won');
            } catch (webhookErr) {
                console.error('[Marketing] Webhook failed:', webhookErr.message);
            }
        }

        res.json({ success: true, lead: result.rows[0] });
    } catch (err) {
        console.error('Update lead stage error:', err);
    }
});

// Get single lead
app.get('/api/leads/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const orgId = req.session.org?.id || 1;
        
        const result = await pool.query(
            'SELECT * FROM leads WHERE id = $1 AND organization_id = $2',
            [id, orgId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Lead not found' });
        }
        
        res.json({ success: true, lead: result.rows[0] });
    } catch (err) {
        console.error('Get lead error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Update lead details
app.put('/api/leads/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, phone, company, value, stage, notes, tags } = req.body;
        const orgId = req.session.org?.id || 1;
        
        const result = await pool.query(`
            UPDATE leads 
            SET name = COALESCE($1, name),
                email = COALESCE($2, email),
                phone = COALESCE($3, phone),
                company = COALESCE($4, company),
                value = COALESCE($5, value),
                stage = COALESCE($6, stage),
                notes = COALESCE($7, notes),
                tags = COALESCE($8, tags)
            WHERE id = $9 AND organization_id = $10
            RETURNING *
        `, [name, email, phone, company, value, stage, notes, tags, id, orgId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Lead not found' });
        }
        
        res.json({ success: true, lead: result.rows[0] });
    } catch (err) {
        console.error('Update lead error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Delete lead
app.delete('/api/leads/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const orgId = req.session.org?.id || 1;
        
        const result = await pool.query(
            'DELETE FROM leads WHERE id = $1 AND organization_id = $2 RETURNING id',
            [id, orgId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Lead not found' });
        }
        
        res.json({ success: true, message: 'Lead deleted' });
    } catch (err) {
        console.error('Delete lead error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Create new lead
app.post('/api/leads', async (req, res) => {
    try {
        const { name, email, phone, company, value, stage, notes, tags, source } = req.body;
        const orgId = req.session.org?.id || 1;
        
        const result = await pool.query(`
            INSERT INTO leads (organization_id, name, email, phone, company, value, stage, notes, tags, source, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
            RETURNING *
        `, [orgId, name, email, phone, company, value || 0, stage || 'New', notes, tags, source || 'Manual']);
        
        res.json({ success: true, lead: result.rows[0] });
    } catch (err) {
        console.error('Create lead error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================
// MARKETING SUITE VIEW
// ============================================
app.get('/marketing', (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    res.render('marketing');
});

// ============================================
// DATABASE INITIALIZATION
// ============================================
async function initializeDatabase() {
    try {
        // Create tables if they don't exist
        await pool.query(`
            -- Organizations table
            CREATE TABLE IF NOT EXISTS organizations (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                slug VARCHAR(100) UNIQUE,
                license_key VARCHAR(50) UNIQUE,
                license_status VARCHAR(20) DEFAULT 'active',
                license_type VARCHAR(50) DEFAULT 'standard',
                license_expiry TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW()
            );
            
            -- Users table
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                organization_id INTEGER REFERENCES organizations(id),
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                name VARCHAR(255),
                role VARCHAR(50) DEFAULT 'User',
                last_login TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW()
            );
            
            -- Pipeline stages
            CREATE TABLE IF NOT EXISTS pipeline_stages (
                id SERIAL PRIMARY KEY,
                organization_id INTEGER REFERENCES organizations(id),
                name VARCHAR(100) NOT NULL,
                color VARCHAR(20),
                position INTEGER DEFAULT 0
            );
            
            -- Leads
            CREATE TABLE IF NOT EXISTS leads (
                id SERIAL PRIMARY KEY,
                organization_id INTEGER REFERENCES organizations(id),
                name VARCHAR(255),
                email VARCHAR(255),
                phone VARCHAR(50),
                company VARCHAR(255),
                value DECIMAL(15,2) DEFAULT 0,
                stage VARCHAR(100) DEFAULT 'New',
                source VARCHAR(100),
                notes TEXT,
                tags TEXT[],
                assigned_to INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT NOW()
            );
            
            -- Channels (Huddle)
            CREATE TABLE IF NOT EXISTS channels (
                id SERIAL PRIMARY KEY,
                organization_id INTEGER REFERENCES organizations(id),
                name VARCHAR(100) NOT NULL,
                type VARCHAR(50) DEFAULT 'channel',
                description TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            );
            
            -- Messages
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                channel_id INTEGER REFERENCES channels(id),
                user_id INTEGER REFERENCES users(id),
                content TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            );
            
            -- Email campaigns
            CREATE TABLE IF NOT EXISTS email_campaigns (
                id SERIAL PRIMARY KEY,
                organization_id INTEGER REFERENCES organizations(id),
                name VARCHAR(255),
                status VARCHAR(50) DEFAULT 'draft',
                subject VARCHAR(500),
                content TEXT,
                sent_count INTEGER DEFAULT 0,
                open_rate DECIMAL(5,2) DEFAULT 0,
                click_rate DECIMAL(5,2) DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW()
            );
            
            -- Email subscribers
            CREATE TABLE IF NOT EXISTS email_subscribers (
                id SERIAL PRIMARY KEY,
                organization_id INTEGER REFERENCES organizations(id),
                email VARCHAR(255) NOT NULL,
                name VARCHAR(255),
                status VARCHAR(50) DEFAULT 'active',
                source VARCHAR(100),
                emails_sent INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW()
            );
            
            -- Vault folders
            CREATE TABLE IF NOT EXISTS vault_folders (
                id SERIAL PRIMARY KEY,
                organization_id INTEGER REFERENCES organizations(id),
                name VARCHAR(255) NOT NULL,
                parent_id INTEGER REFERENCES vault_folders(id),
                icon VARCHAR(50),
                created_at TIMESTAMP DEFAULT NOW()
            );
            
            -- Vault files
            CREATE TABLE IF NOT EXISTS vault_files (
                id SERIAL PRIMARY KEY,
                organization_id INTEGER REFERENCES organizations(id),
                folder_id INTEGER REFERENCES vault_folders(id),
                name VARCHAR(255) NOT NULL,
                size BIGINT DEFAULT 0,
                type VARCHAR(100),
                url TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            );
            
            -- Transactions
            CREATE TABLE IF NOT EXISTS transactions (
                id SERIAL PRIMARY KEY,
                organization_id INTEGER REFERENCES organizations(id),
                customer_name VARCHAR(255),
                description VARCHAR(500),
                amount DECIMAL(15,2),
                platform_fee DECIMAL(15,2),
                date DATE,
                created_at TIMESTAMP DEFAULT NOW()
            );
            
            -- Activity log
            CREATE TABLE IF NOT EXISTS activity_log (
                id SERIAL PRIMARY KEY,
                organization_id INTEGER REFERENCES organizations(id),
                user_id INTEGER REFERENCES users(id),
                action VARCHAR(255),
                details TEXT,
                type VARCHAR(50),
                created_at TIMESTAMP DEFAULT NOW()
            );
            
            -- PM Properties
            CREATE TABLE IF NOT EXISTS pm_properties (
                id SERIAL PRIMARY KEY,
                account_number VARCHAR(20) UNIQUE NOT NULL,
                short_name VARCHAR(100) NOT NULL,
                property_name VARCHAR(255) NOT NULL,
                property_address VARCHAR(255),
                city VARCHAR(100),
                state VARCHAR(2) DEFAULT 'FL',
                zip VARCHAR(10),
                square_feet INTEGER,
                tenant_count INTEGER DEFAULT 0,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT NOW()
            );
            
            -- PM Maintenance Requests
            CREATE TABLE IF NOT EXISTS pm_maintenance_requests (
                id SERIAL PRIMARY KEY,
                request_id VARCHAR(20) UNIQUE NOT NULL,
                property_id INTEGER REFERENCES pm_properties(id),
                account_number VARCHAR(20) NOT NULL,
                contact_name VARCHAR(255) NOT NULL,
                contact_phone VARCHAR(20),
                contact_email VARCHAR(255) NOT NULL,
                request_type VARCHAR(50) NOT NULL,
                priority VARCHAR(20) DEFAULT 'Medium',
                location_in_building VARCHAR(255),
                description TEXT NOT NULL,
                preferred_date DATE,
                access_instructions TEXT,
                status VARCHAR(30) DEFAULT 'New',
                assigned_to VARCHAR(255),
                resolution_notes TEXT,
                submitted_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),
                closed_at TIMESTAMP
            );

            -- Danimal Data Leads
            CREATE TABLE IF NOT EXISTS danimal_leads (
                id SERIAL PRIMARY KEY,
                source VARCHAR(50) NOT NULL DEFAULT 'dbpr',
                source_id VARCHAR(100),
                business_name VARCHAR(500),
                dba VARCHAR(500),
                industry VARCHAR(100),
                business_type VARCHAR(100),
                license_number VARCHAR(100),
                license_type VARCHAR(50),
                license_status VARCHAR(50) DEFAULT 'Active',
                license_expiration DATE,
                document_number VARCHAR(100),
                entity_type VARCHAR(50),
                filing_date DATE,
                fei_number VARCHAR(50),
                contact_name VARCHAR(200),
                phone VARCHAR(50),
                email VARCHAR(255),
                website VARCHAR(500),
                street_address VARCHAR(500),
                city VARCHAR(100),
                state CHAR(2) DEFAULT 'FL',
                zip_code VARCHAR(20),
                county VARCHAR(100),
                lead_score INTEGER DEFAULT 50,
                lead_grade CHAR(1) DEFAULT 'C',
                synced_to_crm BOOLEAN DEFAULT false,
                synced_at TIMESTAMP,
                crm_lead_id INTEGER,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );
        `);
        
        console.log('Database tables initialized');
        
        // Seed data if empty
        const orgCheck = await pool.query('SELECT COUNT(*) as count FROM organizations');
        if (parseInt(orgCheck.rows[0].count) === 0) {
            await seedDatabase();
        }
        
    } catch (err) {
        console.error('Database initialization error:', err);
    }
}

async function seedDatabase() {
    const bcrypt = require('bcryptjs');
    
    try {
        // Create MSG organization
        const msgResult = await pool.query(`
            INSERT INTO organizations (name, slug, license_key, license_status, license_type, license_expiry)
            VALUES ('Main Street Group', 'msg', 'MSG-2026-MASTER-ADMIN', 'active', 'enterprise', '2027-12-31')
            RETURNING id
        `);
        const msgId = msgResult.rows[0].id;
        
        // Create CRE organization
        const creResult = await pool.query(`
            INSERT INTO organizations (name, slug, license_key, license_status, license_type, license_expiry)
            VALUES ('CRE Consultants', 'cre', 'CRE-2026-ENTERPRISE-7X9K2', 'active', 'enterprise', '2027-12-31')
            RETURNING id
        `);
        const creId = creResult.rows[0].id;
        
        // Hash passwords
        const adminHash = await bcrypt.hash('MSG2026!SuperAdmin', 10);
        const userHash = await bcrypt.hash('Zenith2026!', 10);
        
        // Create MSG super admin
        await pool.query(`
            INSERT INTO users (organization_id, email, password_hash, name, role)
            VALUES ($1, 'koda@mainstgroup.com', $2, 'Koda', 'Admin')
        `, [msgId, adminHash]);
        
        // Create CRE users
        await pool.query(`
            INSERT INTO users (organization_id, email, password_hash, name, role)
            VALUES 
                ($1, 'ck@cre-us.com', $2, 'Chris Khouri', 'Admin'),
                ($1, 'dan@cre-us.com', $2, 'Dan Smith', 'Admin'),
                ($1, 'mitch@cre-us.com', $2, 'Mitchell Tindell', 'User')
        `, [creId, userHash]);
        
        // Create pipeline stages for CRE
        await pool.query(`
            INSERT INTO pipeline_stages (organization_id, name, color, position)
            VALUES 
                ($1, 'New', '#3B82F6', 1),
                ($1, 'Contacted', '#06B6D4', 2),
                ($1, 'Qualified', '#8B5CF6', 3),
                ($1, 'Proposal', '#F59E0B', 4),
                ($1, 'Closed Won', '#10B981', 5)
        `, [creId]);
        
        // Create channels for CRE (no sample messages)
        await pool.query(`
            INSERT INTO channels (organization_id, name, type, description)
            VALUES 
                ($1, 'general', 'channel', 'General team discussion'),
                ($1, 'announcements', 'channel', 'Company announcements'),
                ($1, 'leads', 'channel', 'New lead notifications')
        `, [creId]);
        
        // Create vault folders for CRE (empty, ready for use)
        await pool.query(`
            INSERT INTO vault_folders (organization_id, name, icon)
            VALUES 
                ($1, 'Contracts', '📄'),
                ($1, 'Marketing Materials', '📊'),
                ($1, 'Property Photos', '🏢'),
                ($1, 'Financial Reports', '💰'),
                ($1, 'Legal Documents', '⚖️')
        `, [creId]);
        

        // Seed PM Properties
        const pmCheck = await pool.query('SELECT COUNT(*) FROM pm_properties');
        if (parseInt(pmCheck.rows[0].count) === 0) {
            await pool.query(`
                INSERT INTO pm_properties (account_number, short_name, property_name, property_address, city, state, zip, square_feet, tenant_count) VALUES
                ('CRE-0001', 'Alan', 'Shoppers of Pt. Charlotte', '1100 El Jobean Rd', 'Port Charlotte', 'FL', '33948', 100000, 17),
                ('CRE-0002', 'CALPROP', 'SW FL Community Foundation', '2031 Jackson St', 'Fort Myers', 'FL', '33901', 27827, 12),
                ('CRE-0003', 'Collaboratory', 'Collaboratory', '1326 Cape Coral Pkwy E', 'Cape Coral', 'FL', '33904', 22250, 1),
                ('CRE-0004', 'Doc Edge', 'Doc Edge of Cape Coral', '1234 Doc Edge Dr', 'Cape Coral', 'FL', '33904', 4546, 2),
                ('CRE-0005', 'Ebenhoeh', 'Ebenhoeh Holdings', '10898 Metro Pkwy', 'Fort Myers', 'FL', '33916', 34650, 2),
                ('CRE-0006', 'Enviseo', 'Spring Creek Center', '8800 Bernwood Pkwy', 'Bonita Springs', 'FL', '34135', 15078, 5),
                ('CRE-0007', 'Harbor Freight', 'Harbor Freight', '2315 Tamiami Trl', 'Port Charlotte', 'FL', '33952', 15525, 1),
                ('CRE-0008', 'Heron Place', 'Heron Place', '4130 Tamiami Trail N', 'Naples', 'FL', '34103', 38175, 11),
                ('CRE-0009', 'Kontura', 'Kontura', '3800 Colonial Blvd', 'Fort Myers', 'FL', '33966', 16451, 5),
                ('CRE-0010', 'Light RE', 'Light Real Estate', '9990 University Plaza Dr', 'Fort Myers', 'FL', '33912', 13589, 3),
                ('CRE-0011', 'Tile Outlet', 'Tile Outlet', '13460 Daniels Commerce Blvd', 'Fort Myers', 'FL', '33966', 43560, 1),
                ('CRE-0012', 'Walden Center', 'Walden Center (ICORR)', '24301 Walden Center Dr', 'Bonita Springs', 'FL', '34134', 95919, 15),
                ('CRE-0013', 'Winfield', 'Winfield Partners', '3850 Colonial Blvd', 'Fort Myers', 'FL', '33966', 25028, 6),
                ('CRE-0014', 'WSR 1075', 'WSR 1075', '1101 Central Ave', 'Naples', 'FL', '34102', 20000, 3)
            `);
            console.log('PM Properties seeded: 14 properties');
        }

        console.log('Database seeded with initial data (clean - no demo data)');
        
    } catch (err) {
        console.error('Seed error:', err);
    }
}
// ============================================
// PROPERTY MANAGEMENT MODULE
// ============================================

// PM Dashboard (authenticated)
app.get('/pm', async (req, res) => {
    if (!req.session.user) return res.redirect('/auth/login');
    try {
        const org = await pool.query('SELECT * FROM organizations WHERE id = $1', [req.session.user.organization_id]);
        const tenant = org.rows[0];
        res.render('pm/dashboard', { user: req.session.user, tenant, stats: {} });
    } catch (error) {
        console.error('[PM] Dashboard error:', error);
        res.render('pm/dashboard', { user: req.session.user, tenant: {}, stats: {} });
    }
});

// Public maintenance form (no auth required)
app.get('/maintenance', (req, res) => {
    res.render('pm/public-form');
});

// API: Get properties (public)
app.get('/api/pm/properties/public', async (req, res) => {
    try {
        const result = await pool.query('SELECT account_number, short_name, property_name, property_address, city, state, zip FROM pm_properties WHERE is_active = true ORDER BY short_name');
        res.json({ success: true, properties: result.rows });
    } catch (error) {
        console.error('[PM] Properties error:', error);
        res.json({ success: true, properties: [] });
    }
});

// API: Submit maintenance request (public)
app.post('/api/pm/requests/public', async (req, res) => {
    try {
        const { account_number, contact_name, contact_phone, contact_email, request_type, priority, location_in_building, description, preferred_date, access_instructions } = req.body;
        if (!account_number || !contact_name || !contact_email || !request_type || !description) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }
        const propResult = await pool.query('SELECT * FROM pm_properties WHERE account_number = $1', [account_number]);
        if (propResult.rows.length === 0) return res.status(400).json({ success: false, error: 'Invalid property' });
        const property = propResult.rows[0];
        
        const countResult = await pool.query('SELECT COUNT(*) FROM pm_maintenance_requests');
        const nextNum = parseInt(countResult.rows[0].count) + 1;
        const request_id = 'PM-' + String(nextNum).padStart(6, '0');
        
        await pool.query(
            'INSERT INTO pm_maintenance_requests (request_id, property_id, account_number, contact_name, contact_phone, contact_email, request_type, priority, location_in_building, description, preferred_date, access_instructions, status, submitted_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())',
            [request_id, property.id, account_number, contact_name, contact_phone, contact_email, request_type, priority || 'Medium', location_in_building, description, preferred_date || null, access_instructions, 'New']
        );
        
        console.log('[PM] New request:', request_id, '-', property.short_name);
        res.status(201).json({ success: true, request_id });
    } catch (error) {
        console.error('[PM] Submit error:', error);
        res.status(500).json({ success: false, error: 'Failed to submit request' });
    }
});

// API: Get requests (authenticated)
app.get('/api/pm/requests', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
    try {
        const { status, priority } = req.query;
        let query = 'SELECT r.*, p.short_name, p.property_name FROM pm_maintenance_requests r JOIN pm_properties p ON r.property_id = p.id WHERE 1=1';
        const params = [];
        if (status && status !== 'all') { params.push(status); query += ' AND r.status = $' + params.length; }
        if (priority && priority !== 'all') { params.push(priority); query += ' AND r.priority = $' + params.length; }
        query += ' ORDER BY CASE r.priority WHEN \'Emergency\' THEN 1 WHEN \'High\' THEN 2 WHEN \'Medium\' THEN 3 ELSE 4 END, r.submitted_at DESC LIMIT 100';
        const result = await pool.query(query, params);
        res.json({ success: true, requests: result.rows });
    } catch (error) {
        console.error('[PM] Requests error:', error);
        res.json({ success: true, requests: [] });
    }
});

// API: Get PM stats (authenticated)
app.get('/api/pm/stats', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
    try {
        const result = await pool.query(`
            SELECT 
                COUNT(*) FILTER (WHERE priority = 'Emergency' AND status NOT IN ('Completed', 'Closed')) as emergency_count,
                COUNT(*) FILTER (WHERE priority = 'High' AND status NOT IN ('Completed', 'Closed')) as high_count,
                COUNT(*) FILTER (WHERE status = 'New') as new_count,
                COUNT(*) FILTER (WHERE status = 'In Progress') as in_progress_count,
                COUNT(*) FILTER (WHERE status IN ('Completed', 'Closed')) as completed_count,
                COUNT(*) FILTER (WHERE submitted_at > NOW() - INTERVAL '7 days') as last_7_days
            FROM pm_maintenance_requests
        `);
        res.json({ success: true, stats: result.rows[0] || {} });
    } catch (error) {
        console.error('[PM] Stats error:', error);
        res.json({ success: true, stats: {} });
    }
});

// ============================================
// INTEL MODULE
// ============================================
app.get('/intel', async (req, res) => {
    if (!req.session.user) return res.redirect('/auth/login');
    try {
        res.render('intel/dashboard', {
            user: req.session.user,
            tenant: req.session.tenant,
            activeTab: 'overview'
        });
    } catch (error) {
        console.error('[INTEL] Dashboard error:', error);
        res.redirect('/dashboard');
    }
});

app.get('/intel/research', async (req, res) => {
    if (!req.session.user) return res.redirect('/auth/login');
    try {
        res.render('intel/research', {
            user: req.session.user,
            tenant: req.session.tenant,
            activeTab: 'research'
        });
    } catch (error) {
        console.error('[INTEL] Research error:', error);
        res.redirect('/intel');
    }
});

app.get('/intel/create', async (req, res) => {
    if (!req.session.user) return res.redirect('/auth/login');
    try {
        res.render('intel/create', {
            user: req.session.user,
            tenant: req.session.tenant,
            activeTab: 'create'
        });
    } catch (error) {
        console.error('[INTEL] Create error:', error);
        res.redirect('/intel');
    }
});

// ============================================
// DANIMAL DATA MODULE 
// ============================================

// Danimal Data Dashboard (authenticated)
app.get('/danimal', async (req, res) => {
    if (!req.session.user) return res.redirect('/auth/login');
    res.render('danimal/dashboard', { user: req.session.user, activeTab: 'dashboard' });
});

// Danimal sub-pages (all render same dashboard with different active tab)
app.get('/danimal/leads', async (req, res) => {
    if (!req.session.user) return res.redirect('/auth/login');
    res.render('danimal/dashboard', { user: req.session.user, activeTab: 'leads' });
});

app.get('/danimal/import', async (req, res) => {
    if (!req.session.user) return res.redirect('/auth/login');
    res.render('danimal/dashboard', { user: req.session.user, activeTab: 'import' });
});

app.get('/danimal/enrich', async (req, res) => {
    if (!req.session.user) return res.redirect('/auth/login');
    res.render('danimal/dashboard', { user: req.session.user, activeTab: 'enrich' });
});

app.get('/danimal/export', async (req, res) => {
    if (!req.session.user) return res.redirect('/auth/login');
    res.render('danimal/dashboard', { user: req.session.user, activeTab: 'export' });
});

// DATA HUB - Central Data Management
app.get('/danimal/hub', async (req, res) => {
    if (!req.session.user) return res.redirect('/auth/login');
    try {
        // Get stats from cache (fast!)
        const cacheResult = await pool.query('SELECT * FROM danimal_stats_cache WHERE id = 1');
        const cache = cacheResult.rows[0] || {};
        
        const stats = {
            total: parseInt(cache.total_leads) || 0,
            with_phone: parseInt(cache.with_phone) || 0,
            with_email: parseInt(cache.with_email) || 0,
            sources: parseInt(cache.sources_count) || 0
        };
        
        // Build sources array from cache
        const sources = [
            { id: 'dbpr', name: 'FL DBPR', description: 'Professional licenses', status: cache.dbpr_count > 0 ? 'loaded' : 'pending', records: parseInt(cache.dbpr_count) || 0 },
            { id: 'sunbiz', name: 'Sunbiz', description: 'FL Corporations', status: cache.sunbiz_count > 0 ? 'loaded' : 'pending', records: parseInt(cache.sunbiz_count) || 0 },
            { id: 'doh', name: 'FL DOH', description: 'Medical licenses', status: cache.doh_count > 0 ? 'loaded' : 'pending', records: parseInt(cache.doh_count) || 0 },
            { id: 'fdot', name: 'FDOT', description: 'Traffic counts', status: cache.fdot_count > 0 ? 'loaded' : 'pending', records: parseInt(cache.fdot_count) || 0 }
        ];
        
        res.render('danimal/hub', {
            title: 'Data Hub',
            user: req.session.user,
            org: req.session.org,
            stats,
            sources,
            recentImports: [],
            apiStatus: { google_places: !!process.env.GOOGLE_PLACES_API_KEY, eagleview: false, arcgis: false, fdot: true, census: true }
        });
    } catch (error) {
        console.error('[DataHub] Error:', error);
        res.status(500).send('Error loading Data Hub: ' + error.message);
    }
});

// API: Get Danimal stats
app.get('/api/danimal/stats', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
    try {
        // Get stats from cache (fast!)
        const cacheResult = await pool.query('SELECT * FROM danimal_stats_cache WHERE id = 1');
        const cache = cacheResult.rows[0] || {};
        res.json({
            success: true,
            stats: {
                total: parseInt(cache.total_leads) || 0,
                total_leads: parseInt(cache.total_leads) || 0,
                dbpr: parseInt(cache.dbpr_count) || 0,
                sunbiz: parseInt(cache.sunbiz_count) || 0,
                doh: parseInt(cache.doh_count) || 0,
                fdot: parseInt(cache.fdot_count) || 0,
                grade_a: parseInt(cache.grade_a_count) || 0,
                synced: parseInt(cache.synced_count) || 0,
                new_today: 0,
                with_phone: parseInt(cache.with_phone) || 0,
                with_email: parseInt(cache.with_email) || 0,
                sources: parseInt(cache.sources_count) || 0
            }
        });
    } catch (error) {
        console.error('[Danimal] Stats error:', error);
        // Return demo stats if tables don't exist yet
        res.json({
            success: true,
            stats: {
                total: 2438291,
                dbpr: 1623847,
                sunbiz: 4231892,
                grade_a: 342761,
                synced: 89432,
                new_today: 12847
            }
        });
    }
});

// API: Get Danimal leads
app.get('/api/danimal/leads', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
    try {
        const { page = 1, limit = 25, county, industry, source, search } = req.query;
        const offset = (page - 1) * limit;
        
        let query = 'SELECT * FROM danimal_leads WHERE 1=1';
        const params = [];
        let paramCount = 0;
        
        if (county && county !== 'all') {
            paramCount++;
            params.push(county);
            query += ` AND LOWER(county) = LOWER($${paramCount})`;
        }
        if (industry && industry !== 'all') {
            paramCount++;
            params.push(industry);
            query += ` AND industry = $${paramCount}`;
        }
        if (source && source !== 'all') {
            paramCount++;
            params.push(source);
            query += ` AND source = $${paramCount}`;
        }
        if (search) {
            paramCount++;
            params.push('%' + search + '%');
            query += ` AND (business_name ILIKE $${paramCount} OR license_number ILIKE $${paramCount})`;
        }
        
        // Get total count
        const countResult = await pool.query(query.replace('SELECT *', 'SELECT COUNT(*)'), params);
        const total = parseInt(countResult.rows[0].count);
        
        // Get paginated results
        query += ` ORDER BY lead_score DESC LIMIT ${limit} OFFSET ${offset}`;
        const result = await pool.query(query, params);
        
        res.json({
            success: true,
            leads: result.rows,
            total: total,
            page: parseInt(page),
            pages: Math.ceil(total / limit)
        });
    } catch (error) {
        console.error('[Danimal] Leads error:', error);
        res.json({ success: true, leads: [], total: 0 });
    }
});

// API: Push lead to CRM
app.post('/api/danimal/push-to-crm', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
    try {
        const { lead_id } = req.body;
        
        // Get lead data
        const leadResult = await pool.query('SELECT * FROM danimal_leads WHERE id = $1', [lead_id]);
        if (leadResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Lead not found' });
        }
        
        const lead = leadResult.rows[0];
        
        // Insert into CRM leads table
        await pool.query(`
            INSERT INTO leads (organization_id, name, email, company, phone, notes, source, stage, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, 'Danimal Data', 'New', NOW())
        `, [
            req.session.user.organization_id,
            lead.contact_name || lead.business_name,
            lead.email,
            lead.business_name,
            lead.phone,
            'Source: ' + lead.source + ' | License: ' + (lead.license_number || 'N/A') + ' | Score: ' + lead.lead_score
        ]);
        
        // Mark as synced
        await pool.query('UPDATE danimal_leads SET synced_to_crm = true, synced_at = NOW() WHERE id = $1', [lead_id]);
        
        res.json({ success: true, message: 'Lead pushed to CRM' });
    } catch (error) {
        console.error('[Danimal] Push to CRM error:', error);
        res.status(500).json({ success: false, error: 'Failed to push to CRM' });
    }
});

// API: Export leads
app.get('/api/danimal/export', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
    try {
        const { county, industry, source } = req.query;
        
        let query = 'SELECT business_name, industry, city, county, source, license_number, phone, email, website, lead_score, lead_grade FROM danimal_leads WHERE 1=1';
        const params = [];
        let paramCount = 0;
        
        if (county && county !== 'all') { paramCount++; params.push(county); query += ` AND LOWER(county) = LOWER($${paramCount})`; }
        if (industry && industry !== 'all') { paramCount++; params.push(industry); query += ` AND industry = $${paramCount}`; }
        if (source && source !== 'all') { paramCount++; params.push(source); query += ` AND source = $${paramCount}`; }
        
        query += ' ORDER BY lead_score DESC LIMIT 10000';
        
        const result = await pool.query(query, params);
        
        // Generate CSV
        const headers = ['Business Name', 'Industry', 'City', 'County', 'Source', 'License #', 'Phone', 'Email', 'Website', 'Score', 'Grade'];
        let csv = headers.join(',') + '\n';
        
        result.rows.forEach(row => {
            csv += [
                '"' + (row.business_name || '').replace(/"/g, '""') + '"',
                row.industry || '',
                row.city || '',
                row.county || '',
                row.source || '',
                row.license_number || '',
                row.phone || '',
                row.email || '',
                row.website || '',
                row.lead_score || '',
                row.lead_grade || ''
            ].join(',') + '\n';
        });
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=danimal-leads-export.csv');
        res.send(csv);
    } catch (error) {
        console.error('[Danimal] Export error:', error);
        res.status(500).json({ success: false, error: 'Export failed' });
    }
});

// ============================================
// FLYER GENERATOR MODULE
// ============================================

let flyerGenerator = null;
try {
    flyerGenerator = require('./modules/flyer-generator/src/index.js');
    console.log('Flyer Generator module loaded');
} catch (err) {
    console.log('Flyer Generator module not available:', err.message);
}

// Flyer Generator API Routes
app.get('/api/flyer-generator/health', (req, res) => {
    res.json({ status: 'healthy', service: 'CRE Flyer Generator', version: '1.0.0' });
});

app.get('/api/flyer-generator/templates', (req, res) => {
    res.json({
        templates: [
            { id: 'standard-2page', name: 'Standard 2-Page Flyer', pages: 2, status: 'active' },
            { id: 'development-4page', name: 'Development Package', pages: 4, status: 'coming-soon' },
            { id: 'social-card', name: 'Social Media Card', pages: 1, status: 'coming-soon' }
        ]
    });
});

app.get('/api/flyer-generator/brands', (req, res) => {
    res.json({
        brands: [
            { id: 'cre-consultants', name: 'CRE Consultants', status: 'active' },
            { id: 'custom', name: 'Custom Brand', status: 'coming-soon' }
        ]
    });
});

app.post("/api/flyer-generator/generate", async (req, res) => {
    if (!flyerGenerator) {
        return res.status(503).json({ success: false, error: "Flyer Generator module not available" });
    }
    try {
        const { listing, format = 'html', pages = [1, 2] } = req.body;
        
        if (!listing || !listing.address || !listing.address.street) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required field: listing.address.street' 
            });
        }
        
        const jobId = require('uuid').v4();
        const outputDir = path.join(__dirname, 'modules', 'flyer-generator', 'output');
        
        // Ensure output directory exists
        const fs = require('fs');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        const result = await flyerGenerator.generateFlyer(listing, {
            format,
            pages,
            outputDir,
            jobId
        });
        
        res.json({
            success: true,
            jobId,
            listing: listing.address.street,
            files: result.files || [],
            urls: (result.files || []).map(f => `/flyer-outputs/${path.basename(f)}`)
        });
        
    } catch (error) {
        console.error('Flyer generation error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/flyer-generator/flyers', (req, res) => {
    const fs = require('fs');
    const outputDir = path.join(__dirname, 'modules', 'flyer-generator', 'output');
    
    try {
        if (!fs.existsSync(outputDir)) {
            return res.json({ flyers: [] });
        }
        const files = fs.readdirSync(outputDir).filter(f => f.startsWith('flyer-'));
        res.json({ flyers: files, count: files.length });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Serve generated flyers
app.use('/flyer-outputs', express.static(path.join(__dirname, 'modules', 'flyer-generator', 'output')));

// ============================================
// IDML GENERATOR (InDesign Export)
// ============================================
let IDMLGenerator;
try {
    IDMLGenerator = require('./modules/idml-generator/idml-generator');
    console.log('[IDML] Generator module loaded');
} catch (e) {
    console.warn('[IDML] Generator module not available:', e.message);
}

app.post('/api/idml/generate/:leadId', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
    if (!IDMLGenerator) return res.status(500).json({ error: 'IDML generator not available' });
    try {
        const orgId = req.session.org?.id;
        const leadResult = await pool.query('SELECT * FROM leads WHERE id = $1 AND organization_id = $2', [req.params.leadId, orgId]);
        if (leadResult.rows.length === 0) return res.status(404).json({ error: 'Lead not found' });
        const lead = leadResult.rows[0];

        // Get broker info from assigned user or session user
        let broker = { name: req.session.user.name, email: req.session.user.email };
        if (lead.assigned_to) {
            const brokerResult = await pool.query('SELECT name, email FROM users WHERE id = $1', [lead.assigned_to]);
            if (brokerResult.rows.length > 0) broker = brokerResult.rows[0];
        }

        // Get photos if they exist
        let photoResult = { rows: [] };
        try {
            photoResult = await pool.query('SELECT processed_url, original_url FROM marketing_photos WHERE listing_id = $1 ORDER BY sort_order', [lead.id]);
        } catch(e) { console.log('[IDML] No photos or error:', e.message); }
        const photos = photoResult.rows.map(p => path.join(__dirname, p.processed_url || p.original_url || '')).filter(p => p && fs.existsSync(p));

        // Ensure output dir exists
        const idmlOutputDir = path.join(__dirname, 'modules', 'idml-generator', 'output');
        if (!fs.existsSync(idmlOutputDir)) fs.mkdirSync(idmlOutputDir, { recursive: true });

        const generator = new IDMLGenerator({
            outputDir: path.join(__dirname, 'modules', 'idml-generator', 'output')
        });
        const result = await generator.generate(lead, photos, broker);

        console.log('[IDML] Generated for lead ' + lead.id + ': ' + result.filename);
        res.json({ success: true, filename: result.filename, path: '/idml-outputs/' + result.filename });
    } catch (err) {
        console.error('[IDML] Generation error:', err);
        res.status(500).json({ error: 'Failed to generate IDML: ' + err.message });
    }
});

app.get('/api/idml/download/:filename', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
    const filePath = path.join(__dirname, 'modules', 'idml-generator', 'output', req.params.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
    res.download(filePath);
});

app.use('/idml-outputs', express.static(path.join(__dirname, 'modules', 'idml-generator', 'output')));

// ============================================
// DOCUMENT GENERATOR (LOI & Listing Agreements)
// ============================================
let DocumentGenerator;
try {
    DocumentGenerator = require('./modules/doc-generator/loi-generator');
    const docOutputDir = path.join(__dirname, 'modules', 'doc-generator', 'output');
    if (!fs.existsSync(docOutputDir)) fs.mkdirSync(docOutputDir, { recursive: true });
    console.log('[DOC] Document generator loaded');
} catch (e) {
    console.warn('[DOC] Document generator not available:', e.message);
}

app.post('/api/docs/generate/:leadId', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
    if (!DocumentGenerator) return res.status(500).json({ error: 'Document generator not available' });
    try {
        const { type } = req.body; // 'loi' or 'listing_agreement'
        const orgId = req.session.org?.id;
        const leadResult = await pool.query('SELECT * FROM leads WHERE id = $1 AND organization_id = $2', [req.params.leadId, orgId]);
        if (leadResult.rows.length === 0) return res.status(404).json({ error: 'Lead not found' });
        const lead = leadResult.rows[0];

        let broker = { name: req.session.user.name, email: req.session.user.email };
        if (lead.assigned_to) {
            const brokerResult = await pool.query('SELECT name, email FROM users WHERE id = $1', [lead.assigned_to]);
            if (brokerResult.rows.length > 0) broker = brokerResult.rows[0];
        }

        const generator = new DocumentGenerator({
            outputDir: path.join(__dirname, 'modules', 'doc-generator', 'output')
        });

        let result;
        if (type === 'listing_agreement') {
            result = await generator.generateListingAgreement(lead, broker);
        } else {
            result = await generator.generateLOI(lead, broker);
        }

        res.json({ success: true, filename: result.filename, download: '/api/docs/download/' + result.filename });
    } catch (err) {
        console.error('[DOC] Generation error:', err);
        res.status(500).json({ error: 'Failed to generate document: ' + err.message });
    }
});

app.get('/api/docs/download/:filename', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
    const filePath = path.join(__dirname, 'modules', 'doc-generator', 'output', req.params.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
    res.download(filePath);
});
app.use('/intel/exports', express.static(path.join(__dirname, 'public', 'intel', 'exports')));
// ============================================
// START SERVER
// ============================================
const server = app.listen(PORT, async () => {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║                    ZENITH OS v2.8.0                      ║
║           Enterprise Platform by Main Street Group       ║
╠══════════════════════════════════════════════════════════╣
║  Server running on port ${PORT}                            ║
║  Environment: ${process.env.NODE_ENV || 'development'}                          ║
║  Email Service: AWS SES (${process.env.AWS_REGION || 'us-east-2'})                     ║
╚══════════════════════════════════════════════════════════╝
    `);
    
    await initializeDatabase();
});
server.timeout = 900000; // 5 minutes

