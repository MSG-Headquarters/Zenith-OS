/**
 * DANIMAL DATA - API Routes
 * 
 * Provides API endpoints for:
 * - Lead searching and filtering
 * - Data imports (DBPR, Sunbiz)
 * - Google Places enrichment
 * - Export functionality
 * 
 * Main Street Group Technology Division
 * © 2026 All Rights Reserved
 */

const express = require('express');
const router = express.Router();
const https = require('https');
const { Pool } = require('pg');

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Google Places API Key (set in .env)
const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY || '';

// ═══════════════════════════════════════════════════════════════════════════
// MIDDLEWARE - Check authentication
// ═══════════════════════════════════════════════════════════════════════════
const requireAuth = (req, res, next) => {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/danimal/stats - Get dashboard statistics
// ═══════════════════════════════════════════════════════════════════════════
router.get('/stats', requireAuth, async (req, res) => {
    try {
        const stats = await pool.query(`
            SELECT 
                COUNT(*) as total_leads,
                COUNT(CASE WHEN phone IS NOT NULL THEN 1 END) as with_phone,
                COUNT(CASE WHEN email IS NOT NULL THEN 1 END) as with_email,
                COUNT(CASE WHEN website IS NOT NULL THEN 1 END) as with_website,
                COUNT(CASE WHEN enriched_at IS NOT NULL THEN 1 END) as enriched,
                COUNT(CASE WHEN license_status = 'Active' THEN 1 END) as active_licenses,
                COUNT(DISTINCT industry) as industries,
                COUNT(DISTINCT source) as sources
            FROM danimal_leads
        `);
        
        const byIndustry = await pool.query(`
            SELECT industry, COUNT(*) as count 
            FROM danimal_leads 
            WHERE industry IS NOT NULL
            GROUP BY industry 
            ORDER BY count DESC 
            LIMIT 10
        `);
        
        const bySource = await pool.query(`
            SELECT source, COUNT(*) as count 
            FROM danimal_leads 
            GROUP BY source 
            ORDER BY count DESC
        `);
        
        const recentEnrichments = await pool.query(`
            SELECT COUNT(*) as count,
                   COUNT(CASE WHEN phone IS NOT NULL OR website IS NOT NULL THEN 1 END) as successful
            FROM danimal_leads
            WHERE enriched_at > NOW() - INTERVAL '24 hours'
        `);
        
        res.json({
            success: true,
            stats: stats.rows[0],
            byIndustry: byIndustry.rows,
            bySource: bySource.rows,
            enrichmentStats: recentEnrichments.rows[0]
        });
    } catch (err) {
        console.error('Stats error:', err);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/danimal/leads - Search and filter leads
// ═══════════════════════════════════════════════════════════════════════════
router.get('/leads', requireAuth, async (req, res) => {
    try {
        const {
            search,
            industry,
            source,
            status,
            hasPhone,
            hasEmail,
            hasWebsite,
            notEnriched,
            city,
            county,
            zipCode,
            minScore,
            page = 1,
            limit = 50
        } = req.query;
        
        let whereClause = ['1=1'];
        let params = [];
        let paramIndex = 1;
        
        if (search) {
            whereClause.push(`(business_name ILIKE $${paramIndex} OR dba ILIKE $${paramIndex})`);
            params.push(`%${search}%`);
            paramIndex++;
        }
        
        if (industry) {
            whereClause.push(`industry = $${paramIndex}`);
            params.push(industry);
            paramIndex++;
        }
        
        if (source) {
            whereClause.push(`source = $${paramIndex}`);
            params.push(source);
            paramIndex++;
        }
        
        if (status) {
            whereClause.push(`license_status = $${paramIndex}`);
            params.push(status);
            paramIndex++;
        }
        
        if (hasPhone === 'true') whereClause.push('phone IS NOT NULL');
        if (hasPhone === 'false') whereClause.push('phone IS NULL');
        if (hasEmail === 'true') whereClause.push('email IS NOT NULL');
        if (hasWebsite === 'true') whereClause.push('website IS NOT NULL');
        if (notEnriched === 'true') whereClause.push('enriched_at IS NULL');
        
        if (city) {
            whereClause.push(`city ILIKE $${paramIndex}`);
            params.push(`%${city}%`);
            paramIndex++;
        }
        
        if (county) {
            whereClause.push(`county ILIKE $${paramIndex}`);
            params.push(`%${county}%`);
            paramIndex++;
        }
        
        if (zipCode) {
            whereClause.push(`zip_code LIKE $${paramIndex}`);
            params.push(`${zipCode}%`);
            paramIndex++;
        }
        
        if (minScore) {
            whereClause.push(`lead_score >= $${paramIndex}`);
            params.push(parseInt(minScore));
            paramIndex++;
        }
        
        const offset = (parseInt(page) - 1) * parseInt(limit);
        
        // Get total count
        const countQuery = `SELECT COUNT(*) FROM danimal_leads WHERE ${whereClause.join(' AND ')}`;
        const countResult = await pool.query(countQuery, params);
        const total = parseInt(countResult.rows[0].count);
        
        // Get leads
        const query = `
            SELECT id, business_name, dba, industry, business_type, license_number,
                   license_status, contact_name, phone, email, website,
                   street_address, city, state, zip_code, county,
                   lead_score, lead_grade, source, enriched_at, created_at
            FROM danimal_leads 
            WHERE ${whereClause.join(' AND ')}
            ORDER BY lead_score DESC, business_name
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;
        params.push(parseInt(limit), offset);
        
        const result = await pool.query(query, params);
        
        res.json({
            success: true,
            leads: result.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (err) {
        console.error('Leads search error:', err);
        res.status(500).json({ error: 'Failed to search leads' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/danimal/industries - Get list of industries
// ═══════════════════════════════════════════════════════════════════════════
router.get('/industries', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT DISTINCT industry, COUNT(*) as count
            FROM danimal_leads
            WHERE industry IS NOT NULL
            GROUP BY industry
            ORDER BY count DESC
        `);
        res.json({ success: true, industries: result.rows });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch industries' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/danimal/enrich - Enrich selected leads with Google Places
// ═══════════════════════════════════════════════════════════════════════════
router.post('/enrich', requireAuth, async (req, res) => {
    try {
        const { leadIds, filters, limit = 50 } = req.body;
        
        if (!GOOGLE_API_KEY) {
            return res.status(400).json({ 
                error: 'Google Places API key not configured',
                message: 'Please add GOOGLE_PLACES_API_KEY to your .env file'
            });
        }
        
        let leads = [];
        
        // If specific IDs provided, use those
        if (leadIds && leadIds.length > 0) {
            const result = await pool.query(`
                SELECT id, business_name, street_address, city, state, zip_code
                FROM danimal_leads
                WHERE id = ANY($1)
                AND enriched_at IS NULL
            `, [leadIds]);
            leads = result.rows;
        } 
        // Otherwise use filters
        else if (filters) {
            let whereClause = ['enriched_at IS NULL', 'business_name IS NOT NULL', 'city IS NOT NULL'];
            let params = [];
            let paramIndex = 1;
            
            if (filters.industry) {
                whereClause.push(`industry = $${paramIndex}`);
                params.push(filters.industry);
                paramIndex++;
            }
            
            if (filters.city) {
                whereClause.push(`city ILIKE $${paramIndex}`);
                params.push(`%${filters.city}%`);
                paramIndex++;
            }
            
            if (filters.source) {
                whereClause.push(`source = $${paramIndex}`);
                params.push(filters.source);
                paramIndex++;
            }
            
            // Prioritize consumer-facing businesses
            const query = `
                SELECT id, business_name, street_address, city, state, zip_code, industry
                FROM danimal_leads
                WHERE ${whereClause.join(' AND ')}
                ORDER BY 
                    CASE 
                        WHEN industry IN ('Food Service', 'Hospitality', 'Personal Services') THEN 1
                        WHEN industry IN ('Real Estate', 'Healthcare', 'Retail') THEN 2
                        ELSE 3
                    END,
                    lead_score DESC
                LIMIT $${paramIndex}
            `;
            params.push(parseInt(limit));
            
            const result = await pool.query(query, params);
            leads = result.rows;
        }
        
        if (leads.length === 0) {
            return res.json({ 
                success: true, 
                message: 'No leads to enrich',
                enriched: 0,
                notFound: 0
            });
        }
        
        // Start enrichment (async - return immediately)
        const jobId = Date.now().toString();
        
        // Store job status
        enrichmentJobs[jobId] = {
            status: 'running',
            total: leads.length,
            processed: 0,
            enriched: 0,
            notFound: 0,
            startTime: new Date()
        };
        
        // Run enrichment in background
        enrichLeadsBackground(jobId, leads);
        
        res.json({
            success: true,
            message: `Enrichment started for ${leads.length} leads`,
            jobId,
            leadsToProcess: leads.length
        });
        
    } catch (err) {
        console.error('Enrich error:', err);
        res.status(500).json({ error: 'Failed to start enrichment' });
    }
});

// Store enrichment job status
const enrichmentJobs = {};

// Background enrichment function
async function enrichLeadsBackground(jobId, leads) {
    const job = enrichmentJobs[jobId];
    
    for (const lead of leads) {
        try {
            // Search Google Places
            const place = await searchGooglePlace(
                lead.business_name,
                lead.street_address,
                lead.city,
                lead.state || 'FL',
                lead.zip_code
            );
            
            if (place && place.place_id) {
                const details = await getGooglePlaceDetails(place.place_id);
                
                if (details && (details.formatted_phone_number || details.website)) {
                    // Update lead with enrichment data
                    await pool.query(`
                        UPDATE danimal_leads 
                        SET phone = COALESCE(phone, $1),
                            website = COALESCE(website, $2),
                            enriched_at = NOW(),
                            updated_at = NOW()
                        WHERE id = $3
                    `, [
                        details.formatted_phone_number || null,
                        details.website || null,
                        lead.id
                    ]);
                    job.enriched++;
                } else {
                    await pool.query('UPDATE danimal_leads SET enriched_at = NOW() WHERE id = $1', [lead.id]);
                    job.notFound++;
                }
            } else {
                await pool.query('UPDATE danimal_leads SET enriched_at = NOW() WHERE id = $1', [lead.id]);
                job.notFound++;
            }
            
            job.processed++;
            
            // Rate limiting
            await new Promise(r => setTimeout(r, 200));
            
        } catch (err) {
            console.error('Enrichment error for lead', lead.id, err);
            job.notFound++;
            job.processed++;
        }
    }
    
    job.status = 'completed';
    job.endTime = new Date();
}

// Google Places API helpers
function searchGooglePlace(name, address, city, state, zip) {
    return new Promise((resolve) => {
        const searchParts = [name, address, city, state, zip].filter(Boolean);
        const query = encodeURIComponent(searchParts.join(' '));
        const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${query}&inputtype=textquery&fields=place_id,name&key=${GOOGLE_API_KEY}`;
        
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    if (result.status === 'OK' && result.candidates?.length > 0) {
                        resolve(result.candidates[0]);
                    } else {
                        resolve(null);
                    }
                } catch (e) { resolve(null); }
            });
        }).on('error', () => resolve(null));
    });
}

function getGooglePlaceDetails(placeId) {
    return new Promise((resolve) => {
        const fields = 'formatted_phone_number,website,rating,business_status';
        const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&key=${GOOGLE_API_KEY}`;
        
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    resolve(result.status === 'OK' ? result.result : null);
                } catch (e) { resolve(null); }
            });
        }).on('error', () => resolve(null));
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/danimal/enrich/status/:jobId - Get enrichment job status
// ═══════════════════════════════════════════════════════════════════════════
router.get('/enrich/status/:jobId', requireAuth, (req, res) => {
    const job = enrichmentJobs[req.params.jobId];
    if (!job) {
        return res.status(404).json({ error: 'Job not found' });
    }
    res.json({ success: true, job });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/danimal/export - Export leads to CSV
// ═══════════════════════════════════════════════════════════════════════════
router.post('/export', requireAuth, async (req, res) => {
    try {
        const { filters, leadIds } = req.body;
        
        let query, params;
        
        if (leadIds && leadIds.length > 0) {
            query = `SELECT * FROM danimal_leads WHERE id = ANY($1) ORDER BY business_name`;
            params = [leadIds];
        } else {
            let whereClause = ['1=1'];
            params = [];
            let paramIndex = 1;
            
            if (filters?.industry) {
                whereClause.push(`industry = $${paramIndex++}`);
                params.push(filters.industry);
            }
            if (filters?.city) {
                whereClause.push(`city ILIKE $${paramIndex++}`);
                params.push(`%${filters.city}%`);
            }
            if (filters?.hasPhone === true) {
                whereClause.push('phone IS NOT NULL');
            }
            if (filters?.hasEmail === true) {
                whereClause.push('email IS NOT NULL');
            }
            
            query = `SELECT * FROM danimal_leads WHERE ${whereClause.join(' AND ')} ORDER BY business_name LIMIT 10000`;
        }
        
        const result = await pool.query(query, params);
        
        // Generate CSV
        if (result.rows.length === 0) {
            return res.json({ success: false, message: 'No leads found' });
        }
        
        const headers = Object.keys(result.rows[0]);
        let csv = headers.join(',') + '\n';
        
        result.rows.forEach(row => {
            const values = headers.map(h => {
                const val = row[h];
                if (val === null || val === undefined) return '';
                const str = String(val).replace(/"/g, '""');
                return `"${str}"`;
            });
            csv += values.join(',') + '\n';
        });
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=danimal_export_${Date.now()}.csv`);
        res.send(csv);
        
    } catch (err) {
        console.error('Export error:', err);
        res.status(500).json({ error: 'Failed to export leads' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/danimal/api-usage - Get Google API usage stats
// ═══════════════════════════════════════════════════════════════════════════
router.get('/api-usage', requireAuth, async (req, res) => {
    try {
        // Count enrichments in last 24 hours
        const today = await pool.query(`
            SELECT COUNT(*) as count
            FROM danimal_leads
            WHERE enriched_at > NOW() - INTERVAL '24 hours'
        `);
        
        // Count total enriched
        const total = await pool.query(`
            SELECT COUNT(*) as count
            FROM danimal_leads
            WHERE enriched_at IS NOT NULL
        `);
        
        res.json({
            success: true,
            apiConfigured: !!GOOGLE_API_KEY,
            usage: {
                today: parseInt(today.rows[0].count),
                dailyLimit: 1000, // Free tier
                remaining: Math.max(0, 1000 - parseInt(today.rows[0].count)),
                totalEnriched: parseInt(total.rows[0].count)
            }
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to get API usage' });
    }
});


// ---------------------------------------------------------------------------
// DATA HUB PAGE - Central data management interface
// ---------------------------------------------------------------------------
router.get('/hub', async (req, res) => {
    try {
        // Get overall stats
        const statsResult = await pool.query(`
            SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN phone IS NOT NULL AND phone != '' THEN 1 END) as with_phone,
                COUNT(CASE WHEN email IS NOT NULL AND email != '' THEN 1 END) as with_email,
                COUNT(DISTINCT source) as sources
            FROM danimal_leads
        `);

        // Get source counts
        const sourceCounts = await pool.query(`
            SELECT source, COUNT(*) as count, MAX(created_at) as last_updated
            FROM danimal_leads
            GROUP BY source
            ORDER BY count DESC
        `);

        const sourceMap = {};
        sourceCounts.rows.forEach(row => {
            sourceMap[row.source.toLowerCase()] = {
                records: parseInt(row.count),
                last_updated: row.last_updated ? new Date(row.last_updated).toLocaleDateString() : null
            };
        });

        // Define all sources
        const sources = [
            { id: 'dbpr', name: 'FL DBPR', description: 'Professional licenses', icon: 'award', icon_class: 'dbpr', status: sourceMap['dbpr'] ? 'loaded' : 'pending', records: sourceMap['dbpr']?.records || 0, last_updated: sourceMap['dbpr']?.last_updated || 'Never' },
            { id: 'sunbiz', name: 'Sunbiz', description: 'Florida corporations & LLCs', icon: 'building', icon_class: 'sunbiz', status: sourceMap['sunbiz'] ? 'loaded' : 'pending', records: sourceMap['sunbiz']?.records || 0, last_updated: sourceMap['sunbiz']?.last_updated || 'Never' },
            { id: 'doh', name: 'FL DOH', description: 'Medical licenses', icon: 'heart-pulse', icon_class: 'doh', status: sourceMap['doh'] ? 'loaded' : 'pending', records: sourceMap['doh']?.records || 0, last_updated: sourceMap['doh']?.last_updated || 'Never' },
            { id: 'fdot', name: 'FDOT Traffic', description: 'Traffic count data', icon: 'signpost-2', icon_class: 'fdot', status: sourceMap['fdot'] ? 'loaded' : 'pending', records: sourceMap['fdot']?.records || 0, last_updated: sourceMap['fdot']?.last_updated || 'Never' },
            { id: 'lee_county', name: 'Lee County PA', description: 'Property records', icon: 'house', icon_class: 'county', status: sourceMap['lee_county'] ? 'loaded' : 'pending', records: sourceMap['lee_county']?.records || 0, last_updated: sourceMap['lee_county']?.last_updated || 'Never' },
            { id: 'collier_county', name: 'Collier County PA', description: 'Property records', icon: 'house', icon_class: 'county', status: sourceMap['collier_county'] ? 'loaded' : 'pending', records: sourceMap['collier_county']?.records || 0, last_updated: sourceMap['collier_county']?.last_updated || 'Never' },
            { id: 'charlotte_county', name: 'Charlotte County PA', description: 'Property records', icon: 'house', icon_class: 'county', status: sourceMap['charlotte_county'] ? 'loaded' : 'pending', records: sourceMap['charlotte_county']?.records || 0, last_updated: sourceMap['charlotte_county']?.last_updated || 'Never' },
            { id: 'sarasota_county', name: 'Sarasota County PA', description: 'Property records', icon: 'house', icon_class: 'county', status: sourceMap['sarasota_county'] ? 'loaded' : 'pending', records: sourceMap['sarasota_county']?.records || 0, last_updated: sourceMap['sarasota_county']?.last_updated || 'Never' }
        ];

        // Recent imports
        let recentImports = [];
        try {
            const importsResult = await pool.query(`
                SELECT * FROM import_jobs ORDER BY created_at DESC LIMIT 10
            `);
            recentImports = importsResult.rows.map(row => ({
                source: row.source,
                records: row.records_imported || 0,
                status: row.status,
                date: row.created_at ? new Date(row.created_at).toLocaleDateString() : '-'
            }));
        } catch (e) { /* table may not exist */ }

        // API status
        const apiStatus = {
            google_places: !!process.env.GOOGLE_PLACES_API_KEY,
            eagleview: !!process.env.EAGLEVIEW_API_KEY,
            arcgis: !!process.env.ARCGIS_API_KEY,
            fdot: true,
            census: true
        };

        res.render('danimal/hub', {
            title: 'Data Hub',
            currentModule: 'danimal',
            user: req.session.user,
            org: req.session.org,
            permissions: req.permissions,
            sidebarModules: res.locals.sidebarModules,
            stats: statsResult.rows[0],
            sources,
            recentImports,
            apiStatus
        });
    } catch (error) {
        console.error('[DataHub] Page error:', error);
        res.status(500).render('errors/500', { message: 'Failed to load Data Hub' });
    }
});

// ---------------------------------------------------------------------------
// INTEL API - Demographics query for property enrichment
// ---------------------------------------------------------------------------
router.get('/api/demographics/:geoId', async (req, res) => {
    try {
        const { geoId } = req.params;
        
        const result = await pool.query(`
            SELECT * FROM danimal_census 
            WHERE geo_id = $1 OR geo_name ILIKE $2
            ORDER BY year DESC
        `, [geoId, `%${geoId}%`]);

        res.json({ success: true, demographics: result.rows });
    } catch (error) {
        console.error('[INTEL] Demographics error:', error);
        res.status(500).json({ success: false, error: 'Failed to load demographics' });
    }
});

// ---------------------------------------------------------------------------
// INTEL API - Traffic counts near location
// ---------------------------------------------------------------------------
router.get('/api/traffic/:county', async (req, res) => {
    try {
        const { county } = req.params;
        const { road } = req.query;

        let query = `
            SELECT * FROM danimal_leads 
            WHERE source = 'fdot' AND city ILIKE $1
        `;
        const params = [`%${county}%`];

        if (road) {
            query += ` AND (business_name ILIKE $2 OR street_address ILIKE $2)`;
            params.push(`%${road}%`);
        }

        query += ` ORDER BY contact_name DESC LIMIT 50`; // contact_name stores AADT

        const result = await pool.query(query, params);
        res.json({ success: true, traffic: result.rows });
    } catch (error) {
        console.error('[INTEL] Traffic error:', error);
        res.status(500).json({ success: false, error: 'Failed to load traffic data' });
    }
});

// ---------------------------------------------------------------------------
// INTEL API - Economic indicators
// ---------------------------------------------------------------------------
router.get('/api/economic/:geoId', async (req, res) => {
    try {
        const { geoId } = req.params;
        const { type, yearFrom, yearTo } = req.query;

        let query = `
            SELECT * FROM danimal_economic 
            WHERE geo_id = $1
        `;
        const params = [geoId];
        let paramCount = 1;

        if (type) {
            paramCount++;
            query += ` AND data_type_code = ${paramCount}`;
            params.push(type);
        }

        if (yearFrom) {
            paramCount++;
            query += ` AND year >= ${paramCount}`;
            params.push(parseInt(yearFrom));
        }

        if (yearTo) {
            paramCount++;
            query += ` AND year <= ${paramCount}`;
            params.push(parseInt(yearTo));
        }

        query += ` ORDER BY year DESC, quarter DESC`;

        const result = await pool.query(query, params);
        res.json({ success: true, economic: result.rows });
    } catch (error) {
        console.error('[INTEL] Economic error:', error);
        res.status(500).json({ success: false, error: 'Failed to load economic data' });
    }
});

// Traffic counts near a lat/lng location
router.get('/traffic/nearby', async (req, res) => {
    try {
        const { lat, lng, radius } = req.query;
        
        if (!lat || !lng) {
            return res.status(400).json({ success: false, error: 'lat and lng required' });
        }
        
        const radiusMiles = parseFloat(radius) || 2;
        const latFloat = parseFloat(lat);
        const lngFloat = parseFloat(lng);
        
        // Approximate degrees per mile at this latitude
        const latDegPerMile = 1 / 69;
        const lngDegPerMile = 1 / (69 * Math.cos(latFloat * Math.PI / 180));
        
        const latMin = latFloat - (radiusMiles * latDegPerMile);
        const latMax = latFloat + (radiusMiles * latDegPerMile);
        const lngMin = lngFloat - (radiusMiles * lngDegPerMile);
        const lngMax = lngFloat + (radiusMiles * lngDegPerMile);
        
        const result = await pool.query(`
            SELECT road_name, from_road, to_road, aadt, year, lat, lng,
                   SQRT(POW((lat - $1) * 69, 2) + POW((lng - $2) * 69 * COS($1 * PI() / 180), 2)) as distance_miles
            FROM fdot_traffic 
            WHERE lat BETWEEN $3 AND $4 
              AND lng BETWEEN $5 AND $6
              AND aadt IS NOT NULL
            ORDER BY distance_miles ASC
            LIMIT 20
        `, [latFloat, lngFloat, latMin, latMax, lngMin, lngMax]);
        
        res.json({ success: true, results: result.rows });
    } catch (error) {
        console.error('[Danimal] Traffic nearby error:', error);
        res.status(500).json({ success: false, error: 'Failed to load nearby traffic' });
    }
});

module.exports = router;
