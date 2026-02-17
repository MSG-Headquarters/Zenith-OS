/**
 * INTEL MODULE - API Routes
 * Zenith OS v2.9.0
 *
 * Marketing Intelligence Engine for CRE
 * Handles: Projects, Canvas, Logos, Export, LinkedIn Share
 *
 * Main Street Group Technology Division
 * Christ is King
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

module.exports = function(pool) {

    // ============================================
    // MIDDLEWARE
    // ============================================
    router.use((req, res, next) => {
        if (!req.session || !req.session.user) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        next();
    });

    // ============================================
    // PROJECTS
    // ============================================

    // List projects
    router.get('/projects', async (req, res) => {
        try {
            const tenantId = req.session.org.id;
            const status = req.query.status || null;
            let query = `
                SELECT p.*, u.name as creator_name,
                    (SELECT COUNT(*) FROM intel_pages WHERE project_id = p.id) as page_count,
                    (SELECT COUNT(*) FROM intel_exports WHERE project_id = p.id) as export_count
                FROM intel_projects p
                LEFT JOIN users u ON p.created_by = u.id
                WHERE p.tenant_id = $1
            `;
            const params = [tenantId];

            if (status) {
                query += ` AND p.status = $2`;
                params.push(status);
            }
            query += ` ORDER BY p.updated_at DESC`;

            const result = await pool.query(query, params);
            res.json({ success: true, projects: result.rows });
        } catch (error) {
            console.error('[INTEL] List projects error:', error);
            res.status(500).json({ success: false, error: 'Failed to load projects' });
        }
    });

    // Create project
    router.post('/projects', async (req, res) => {
        try {
            const tenantId = req.session.org.id;
            const userId = req.session.user.id;
            const {
                title, property_address, property_city, property_state,
                property_zip, lat, lng, property_type, transaction_type,
                property_size, size_unit, price, price_unit, lead_id, notes
            } = req.body;

            const result = await pool.query(`
                INSERT INTO intel_projects 
                    (tenant_id, created_by, title, property_address, property_city,
                     property_state, property_zip, lat, lng, property_type,
                     transaction_type, property_size, size_unit, price, price_unit,
                     lead_id, notes, status)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'draft')
                RETURNING *
            `, [tenantId, userId, title || 'Untitled Project',
                property_address, property_city, property_state || 'FL',
                property_zip, lat, lng, property_type, transaction_type,
                property_size, size_unit || 'SF', price, price_unit || 'sf/yr',
                lead_id, notes]);

            // Auto-create the 3 default pages
            const project = result.rows[0];
            const pageTypes = ['aerial_hero', 'market_map', 'site_plan'];
            for (let i = 0; i < pageTypes.length; i++) {
                await pool.query(`
                    INSERT INTO intel_pages (project_id, page_type, page_number, status)
                    VALUES ($1, $2, $3, 'draft')
                `, [project.id, pageTypes[i], i + 1]);
            }

            res.json({ success: true, project });
        } catch (error) {
            console.error('[INTEL] Create project error:', error);
            res.status(500).json({ success: false, error: 'Failed to create project' });
        }
    });

    // Get single project with pages
    router.get('/projects/:id', async (req, res) => {
        try {
            const tenantId = req.session.org.id;
            const projectResult = await pool.query(
                `SELECT p.*, u.name as creator_name 
                 FROM intel_projects p 
                 LEFT JOIN users u ON p.created_by = u.id
                 WHERE p.id = $1 AND p.tenant_id = $2`,
                [req.params.id, tenantId]
            );

            if (projectResult.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Project not found' });
            }

            const pagesResult = await pool.query(
                `SELECT * FROM intel_pages WHERE project_id = $1 ORDER BY page_number`,
                [req.params.id]
            );

            const exportsResult = await pool.query(
                `SELECT * FROM intel_exports WHERE project_id = $1 ORDER BY created_at DESC`,
                [req.params.id]
            );

            res.json({
                success: true,
                project: projectResult.rows[0],
                pages: pagesResult.rows,
                exports: exportsResult.rows
            });
        } catch (error) {
            console.error('[INTEL] Get project error:', error);
            res.status(500).json({ success: false, error: 'Failed to load project' });
        }
    });

    // Update project
    router.put('/projects/:id', async (req, res) => {
        try {
            const tenantId = req.session.org.id;
            const fields = req.body;
            const allowed = ['title', 'property_address', 'property_city', 'property_state',
                'property_zip', 'lat', 'lng', 'property_type', 'transaction_type',
                'property_size', 'size_unit', 'price', 'price_unit', 'status', 'notes', 'broker_ids'];

            const setClauses = [];
            const values = [];
            let paramIdx = 1;

            for (const key of allowed) {
                if (fields[key] !== undefined) {
                    setClauses.push(`${key} = $${paramIdx}`);
                    values.push(fields[key]);
                    paramIdx++;
                }
            }

            if (setClauses.length === 0) {
                return res.status(400).json({ success: false, error: 'No valid fields to update' });
            }

            setClauses.push(`updated_at = NOW()`);
            values.push(req.params.id, tenantId);

            const result = await pool.query(
                `UPDATE intel_projects SET ${setClauses.join(', ')} 
                 WHERE id = $${paramIdx} AND tenant_id = $${paramIdx + 1} RETURNING *`,
                values
            );

            res.json({ success: true, project: result.rows[0] });
        } catch (error) {
            console.error('[INTEL] Update project error:', error);
            res.status(500).json({ success: false, error: 'Failed to update project' });
        }
    });

    // Delete project (soft)
    router.delete('/projects/:id', async (req, res) => {
        try {
            const tenantId = req.session.org.id;
            await pool.query(
                `UPDATE intel_projects SET status = 'archived', updated_at = NOW() 
                 WHERE id = $1 AND tenant_id = $2`,
                [req.params.id, tenantId]
            );
            res.json({ success: true });
        } catch (error) {
            console.error('[INTEL] Delete project error:', error);
            res.status(500).json({ success: false, error: 'Failed to delete project' });
        }
    });

    // ============================================
    // CANVAS / PAGES
    // ============================================

    // Get all pages for a project
    router.get('/projects/:projectId/pages', async (req, res) => {
        try {
            const result = await pool.query(
                'SELECT * FROM intel_pages WHERE project_id = $1 ORDER BY page_number',
                [req.params.projectId]
            );
            res.json({ success: true, pages: result.rows });
        } catch (error) {
            console.error('[INTEL] Get pages error:', error);
            res.status(500).json({ success: false, error: 'Failed to load pages' });
        }
    });

    // Get single page by project and page type
    router.get('/projects/:projectId/pages/:pageType', async (req, res) => {
        try {
            const result = await pool.query(
                'SELECT * FROM intel_pages WHERE project_id = $1 AND page_type = $2',
                [req.params.projectId, req.params.pageType]
            );
            if (result.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Page not found' });
            }
            res.json({ success: true, page: result.rows[0] });
        } catch (error) {
            console.error('[INTEL] Get page error:', error);
            res.status(500).json({ success: false, error: 'Failed to load page' });
        }
    });

    // Save page canvas by project and page type
    router.put('/projects/:projectId/pages/:pageType', async (req, res) => {
        try {
            const { canvas_data } = req.body;
            const result = await pool.query(
                `UPDATE intel_pages 
                 SET canvas_data = $1, updated_at = NOW(), status = 'in_progress'
                 WHERE project_id = $2 AND page_type = $3
                 RETURNING *`,
                [JSON.stringify(canvas_data), req.params.projectId, req.params.pageType]
            );
            if (result.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Page not found' });
            }
            res.json({ success: true, page: result.rows[0] });
        } catch (error) {
            console.error('[INTEL] Save page error:', error);
            res.status(500).json({ success: false, error: 'Failed to save page' });
        }
    });
    
    // Save canvas state
    router.put('/pages/:id/canvas', async (req, res) => {
        try {
            const { canvas_state } = req.body;
            const result = await pool.query(
                `UPDATE intel_pages SET canvas_state = $1, updated_at = NOW(), status = 'in_progress'
                 WHERE id = $2 RETURNING *`,
                [typeof canvas_state === 'string' ? canvas_state : JSON.stringify(canvas_state), req.params.id]
            );
            res.json({ success: true, page: result.rows[0] });
        } catch (error) {
            console.error('[INTEL] Save canvas error:', error);
            res.status(500).json({ success: false, error: 'Failed to save canvas' });
        }
    });

    // Load canvas state
    router.get('/pages/:id/canvas', async (req, res) => {
        try {
            const result = await pool.query(
                `SELECT * FROM intel_pages WHERE id = $1`, [req.params.id]
            );
            if (result.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Page not found' });
            }
            const page = result.rows[0];
            let canvasState = null;
            if (page.canvas_state) {
                try { canvasState = JSON.parse(page.canvas_state); } catch(e) { canvasState = page.canvas_state; }
            }
            res.json({ success: true, page, canvas_state: canvasState });
        } catch (error) {
            console.error('[INTEL] Load canvas error:', error);
            res.status(500).json({ success: false, error: 'Failed to load canvas' });
        }
    });

    // ============================================
    // LOGO CATALOG
    // ============================================

    // List logos with search
    router.get('/logos', async (req, res) => {
        try {
            const { q, category, limit } = req.query;
            let query = `SELECT * FROM intel_logos WHERE (tenant_id = $1 OR is_global = true)`;
            const params = [req.session.org.id];
            let idx = 2;

            if (q) {
                query += ` AND LOWER(business_name) LIKE $${idx}`;
                params.push(`%${q.toLowerCase()}%`);
                idx++;
            }
            if (category && category !== 'all') {
                query += ` AND category = $${idx}`;
                params.push(category);
                idx++;
            }

            query += ` ORDER BY usage_count DESC, business_name ASC`;
            if (limit) {
                query += ` LIMIT $${idx}`;
                params.push(parseInt(limit));
            }

            const result = await pool.query(query, params);
            res.json({ success: true, logos: result.rows });
        } catch (error) {
            console.error('[INTEL] List logos error:', error);
            res.status(500).json({ success: false, error: 'Failed to load logos' });
        }
    });

    // Add logo (base64 upload)
    router.post('/logos', async (req, res) => {
        try {
            const { business_name, category, logo_data, brand_color, width_px, height_px } = req.body;
            const result = await pool.query(`
                INSERT INTO intel_logos 
                    (business_name, category, logo_data, brand_color, width_px, height_px,
                     added_by, tenant_id, is_global)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false)
                RETURNING *
            `, [business_name, category || 'retail', logo_data, brand_color || '#333333',
                width_px || 200, height_px || 100, req.session.user.id, req.session.org.id]);

            res.json({ success: true, logo: result.rows[0] });
        } catch (error) {
            console.error('[INTEL] Add logo error:', error);
            res.status(500).json({ success: false, error: 'Failed to add logo' });
        }
    });

    // Increment logo usage
    router.post('/logos/:id/use', async (req, res) => {
        try {
            await pool.query(
                `UPDATE intel_logos SET usage_count = usage_count + 1 WHERE id = $1`,
                [req.params.id]
            );
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ success: false });
        }
    });

    // Delete logo
    router.delete('/logos/:id', async (req, res) => {
        try {
            await pool.query(
                `DELETE FROM intel_logos WHERE id = $1 AND (tenant_id = $2 OR added_by = $3)`,
                [req.params.id, req.session.org.id, req.session.user.id]
            );
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ success: false, error: 'Failed to delete logo' });
        }
    });

    // ============================================
    // EXPORT (HTML → PNG via Canvas toDataURL)
    // ============================================

    // Export page as image (client-side canvas export saves here)
    router.post('/pages/:id/export', async (req, res) => {
        try {
            const { image_data, format, resolution } = req.body;
            const pageId = req.params.id;

            // Get page's project ID
            const pageResult = await pool.query(
                `SELECT project_id FROM intel_pages WHERE id = $1`, [pageId]
            );
            if (pageResult.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Page not found' });
            }
            const projectId = pageResult.rows[0].project_id;

            // Save image data to file system
            const outputDir = path.join(__dirname, '..', 'public', 'intel', 'exports');
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            const ext = format || 'png';
            const filename = `intel-${projectId}-page${pageId}-${Date.now()}.${ext}`;
            const filePath = path.join(outputDir, filename);

            // Decode base64 image
            const base64Data = image_data.replace(/^data:image\/\w+;base64,/, '');
            fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));

            // Record export
            const exportResult = await pool.query(`
                INSERT INTO intel_exports (project_id, page_id, format, file_path, file_size, resolution, generated_by)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING *
            `, [projectId, pageId, ext, `/intel/exports/${filename}`,
                fs.statSync(filePath).size, resolution || 150, req.session.user.id]);

            res.json({
                success: true,
                export: exportResult.rows[0],
                url: `/intel/exports/${filename}`
            });
        } catch (error) {
            console.error('[INTEL] Export error:', error);
            res.status(500).json({ success: false, error: 'Failed to export' });
        }
    });

    // Export full project as combined package
    router.post('/projects/:id/export-all', async (req, res) => {
        try {
            const projectId = req.params.id;
            const pagesResult = await pool.query(
                `SELECT * FROM intel_pages WHERE project_id = $1 ORDER BY page_number`, [projectId]
            );

            const exports = [];
            for (const page of pagesResult.rows) {
                if (page.canvas_state) {
                    exports.push({
                        page_id: page.id,
                        page_type: page.page_type,
                        page_number: page.page_number,
                        has_canvas: true
                    });
                }
            }

            // Update project status
            await pool.query(
                `UPDATE intel_projects SET status = 'completed', updated_at = NOW() WHERE id = $1`,
                [projectId]
            );

            res.json({ success: true, pages: exports, message: 'Export each page individually via canvas export' });
        } catch (error) {
            console.error('[INTEL] Export all error:', error);
            res.status(500).json({ success: false, error: 'Failed to export' });
        }
    });

    // ============================================
    // LINKEDIN SHARE
    // ============================================

    // Share to LinkedIn (generates share URL with image)
    router.post('/exports/:id/linkedin', async (req, res) => {
        try {
            const exportResult = await pool.query(
                `SELECT e.*, p.title, p.property_address, p.property_city, p.property_state
                 FROM intel_exports e
                 JOIN intel_projects p ON e.project_id = p.id
                 WHERE e.id = $1`,
                [req.params.id]
            );

            if (exportResult.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Export not found' });
            }

            const exp = exportResult.rows[0];
            const shareText = req.body.text || `${exp.title} - ${exp.property_address}, ${exp.property_city}, ${exp.property_state}`;
            
            // LinkedIn share URL (opens LinkedIn's share dialog with pre-filled text)
            // For Phase 1, we use the share intent URL
            // Phase 2+ will use LinkedIn Marketing API for direct publishing
            const appUrl = process.env.APP_URL || 'https://zenith.umbrassi.com';
            const imageUrl = `${appUrl}${exp.file_path}`;
            const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(imageUrl)}&summary=${encodeURIComponent(shareText)}`;

            // Mark as shared
            await pool.query(
                `UPDATE intel_exports SET linkedin_shared = true, shared_at = NOW() WHERE id = $1`,
                [req.params.id]
            );

            res.json({
                success: true,
                linkedin_url: linkedinUrl,
                share_text: shareText,
                image_url: imageUrl
            });
        } catch (error) {
            console.error('[INTEL] LinkedIn share error:', error);
            res.status(500).json({ success: false, error: 'Failed to generate share link' });
        }
    });

    // List exports for a project
    router.get('/projects/:id/exports', async (req, res) => {
        try {
            const result = await pool.query(
                `SELECT * FROM intel_exports WHERE project_id = $1 ORDER BY created_at DESC`,
                [req.params.id]
            );
            res.json({ success: true, exports: result.rows });
        } catch (error) {
            res.status(500).json({ success: false, error: 'Failed to load exports' });
        }
    });

    // ============================================
    // TEMPLATES
    // ============================================

    router.get('/templates', async (req, res) => {
        try {
            const result = await pool.query(
                `SELECT * FROM intel_templates WHERE tenant_id IS NULL OR tenant_id = $1 ORDER BY is_default DESC, name`,
                [req.session.org.id]
            );
            res.json({ success: true, templates: result.rows });
        } catch (error) {
            res.status(500).json({ success: false, error: 'Failed to load templates' });
        }
    });

    // ============================================
    // STATS
    // ============================================

    router.get('/stats', async (req, res) => {
        try {
            const tenantId = req.session.org.id;
            const stats = await pool.query(`
                SELECT
                    (SELECT COUNT(*) FROM intel_projects WHERE tenant_id = $1 AND status != 'archived') as total_projects,
                    (SELECT COUNT(*) FROM intel_projects WHERE tenant_id = $1 AND status = 'draft') as draft_count,
                    (SELECT COUNT(*) FROM intel_projects WHERE tenant_id = $1 AND status = 'completed') as completed_count,
                    (SELECT COUNT(*) FROM intel_exports WHERE project_id IN (SELECT id FROM intel_projects WHERE tenant_id = $1)) as total_exports,
                    (SELECT COUNT(*) FROM intel_logos WHERE tenant_id = $1 OR is_global = true) as logo_count,
                    (SELECT COUNT(*) FROM intel_exports WHERE linkedin_shared = true AND project_id IN (SELECT id FROM intel_projects WHERE tenant_id = $1)) as linkedin_shares
            `, [tenantId]);

            res.json({ success: true, stats: stats.rows[0] });
        } catch (error) {
            res.status(500).json({ success: true, stats: {} });
        }
    });

    // ============================================
    // RESEARCH - Geographic Intelligence
    // ============================================
    
    router.post('/research', async (req, res) => {
        try {
            const { city, county } = req.body;
            if (!city && !county) {
                return res.status(400).json({ success: false, error: 'City or county required' });
            }
            
            const results = { query: { city, county }, danimalData: null, timestamp: new Date().toISOString() };
            
            // Query Danimal Data by city or county
            let query = 'SELECT industry, COUNT(*) as count FROM danimal_leads WHERE 1=1';
            const params = [];
            let idx = 1;
            
            if (city) {
                query += ' AND UPPER(city) LIKE UPPER($' + idx + ')';
                params.push('%' + city + '%');
                idx++;
            }
            if (county) {
                query += ' AND UPPER(county) = UPPER($' + idx + ')';
                params.push(county);
            }
            query += ' GROUP BY industry ORDER BY count DESC LIMIT 20';
            
            const industryResult = await pool.query(query, params);
            
            // Get total count
            let countQuery = 'SELECT COUNT(*) as total FROM danimal_leads WHERE 1=1';
            const countParams = [];
            idx = 1;
            if (city) {
                countQuery += ' AND UPPER(city) LIKE UPPER($' + idx + ')';
                countParams.push('%' + city + '%');
                idx++;
            }
            if (county) {
                countQuery += ' AND UPPER(county) = UPPER($' + idx + ')';
                countParams.push(county);
            }
            
            const countResult = await pool.query(countQuery, countParams);
            
            results.danimalData = {
                total: parseInt(countResult.rows[0].total),
                byIndustry: industryResult.rows
            };
            
            res.json({ success: true, results });
        } catch (error) {
            console.error('[INTEL] Research error:', error);
            res.status(500).json({ success: false, error: 'Research query failed' });
        }
    });
    
    router.get('/research/city/:city', async (req, res) => {
        try {
            const city = req.params.city;
            const result = await pool.query(
                'SELECT industry, COUNT(*) as count FROM danimal_leads WHERE UPPER(city) LIKE UPPER($1) GROUP BY industry ORDER BY count DESC LIMIT 30',
                ['%' + city + '%']
            );
            const total = await pool.query(
                'SELECT COUNT(*) as total FROM danimal_leads WHERE UPPER(city) LIKE UPPER($1)',
                ['%' + city + '%']
            );
            res.json({ success: true, city, total: parseInt(total.rows[0].total), industries: result.rows });
        } catch (error) {
            res.status(500).json({ success: false, error: 'Query failed' });
        }
    });
    
    router.get('/research/county/:county', async (req, res) => {
        try {
            const county = req.params.county;
            const result = await pool.query(
                'SELECT city, COUNT(*) as count FROM danimal_leads WHERE UPPER(county) = UPPER($1) GROUP BY city ORDER BY count DESC LIMIT 30',
                [county]
            );
            const total = await pool.query(
                'SELECT COUNT(*) as total FROM danimal_leads WHERE UPPER(county) = UPPER($1)',
                [county]
            );
            res.json({ success: true, county, total: parseInt(total.rows[0].total), cities: result.rows });
        } catch (error) {
            res.status(500).json({ success: false, error: 'Query failed' });
        }
    });


    // ============================================
    // PROPERTY ENRICHMENT API
    // ============================================
    
    const enrichmentService = require('../services/intel-enrichment');

    // Full property enrichment (combines all sources)
    router.post('/enrich', async (req, res) => {
        try {
            const { address } = req.body;
            if (!address) {
                return res.status(400).json({ success: false, error: 'Address required' });
            }
            
            console.log('[INTEL] Enriching property:', address);
            const enrichment = await enrichmentService.enrichProperty(address);
            
            res.json({ success: true, enrichment });
        } catch (error) {
            console.error('[INTEL] Enrichment error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Geocode address only
    router.get('/geocode', async (req, res) => {
        try {
            const { address } = req.query;
            if (!address) {
                return res.status(400).json({ success: false, error: 'Address required' });
            }
            
            const result = await enrichmentService.googleGeocode(address);
            res.json(result);
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Google Places search
    router.get('/places/search', async (req, res) => {
        try {
            const { query, lat, lng } = req.query;
            if (!query) {
                return res.status(400).json({ success: false, error: 'Query required' });
            }
            
            const location = lat && lng ? { lat: parseFloat(lat), lng: parseFloat(lng) } : null;
            const result = await enrichmentService.googlePlacesSearch(query, location);
            res.json(result);
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Google Place details
    router.get('/places/:placeId', async (req, res) => {
        try {
            const result = await enrichmentService.googlePlaceDetails(req.params.placeId);
            res.json(result);
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // EagleView aerial imagery
    router.get('/aerial', async (req, res) => {
        try {
            const { lat, lon, zoom, width, height, type } = req.query;
            if (!lat || !lon) {
                return res.status(400).json({ success: false, error: 'lat and lon required' });
            }
            
            const result = await enrichmentService.getEagleViewImagery(
                parseFloat(lat),
                parseFloat(lon),
                { zoom, width, height, type }
            );
            
            // Return as JSON with base64 image
            res.json(result);
        } catch (error) {
            console.error('[INTEL] Aerial error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // EagleView aerial image (direct image response)
    router.get('/aerial/image', async (req, res) => {
        try {
            const { lat, lon, zoom, width, height, type } = req.query;
            if (!lat || !lon) {
                return res.status(400).json({ success: false, error: 'lat and lon required' });
            }
            
            const result = await enrichmentService.getEagleViewImagery(
                parseFloat(lat),
                parseFloat(lon),
                { zoom, width, height, type }
            );
            
            // Return as actual image
            const buffer = Buffer.from(result.image, 'base64');
            res.set('Content-Type', 'image/jpeg');
            res.send(buffer);
        } catch (error) {
            console.error('[INTEL] Aerial image error:', error);
            res.status(500).send('Failed to get aerial image');
        }
    });

    // EagleView property data
    router.get('/property-data', async (req, res) => {
        try {
            const { address } = req.query;
            if (!address) {
                return res.status(400).json({ success: false, error: 'Address required' });
            }
            
            const result = await enrichmentService.getEagleViewPropertyData(address);
            res.json(result);
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // ============================================
    // CRM -> INTEL INTEGRATION
    // ============================================
    
    // Create INTEL project from CRM lead (Closed Won)
    router.post('/create-from-lead', async (req, res) => {
        try {
            const { lead_id } = req.body;
            const userId = req.session.user.id;
            const orgId = req.session.org?.id;
            
            if (!lead_id) {
                return res.status(400).json({ success: false, error: 'Lead ID required' });
            }
            
            // Get lead details
            const leadResult = await pool.query(
                `SELECT * FROM leads WHERE id = $1 AND organization_id = $2`,
                [lead_id, orgId]
            );
            
            if (leadResult.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Lead not found' });
            }
            
            const lead = leadResult.rows[0];
            
            // Check if flyer already exists
            if (lead.intel_project_id) {
                return res.json({ success: true, project_id: lead.intel_project_id, existing: true });
            }
            
            // Build property address
            const propertyAddress = lead.property_address || lead.company || lead.name;
            const fullAddress = [
                lead.property_address,
                lead.property_city,
                lead.property_state,
                lead.property_zip
            ].filter(Boolean).join(', ') || propertyAddress;
            
            // Create INTEL project
            const projectResult = await pool.query(`
                INSERT INTO intel_projects (
                    tenant_id, organization_id, created_by, user_id, title, 
                    property_address, property_city, property_state, property_zip,
                    property_type, lead_id, status, canvas_data, notes, created_at
                ) VALUES ($1, $1, $2, $2, $3, $4, $5, $6, $7, $8, $9, 'draft', $10, $11, NOW())
                RETURNING id
            `, [
                orgId,
                userId,
                `${lead.company || lead.name} - Marketing Flyer`,
                lead.property_address || '',
                lead.property_city || '',
                lead.property_state || 'FL',
                lead.property_zip || '',
                lead.property_type || 'Commercial',
                lead_id,
                JSON.stringify({ objects: [], background: '#ffffff' }),
                `Auto-generated from CRM lead #${lead.id}`
            ]);
            
            const projectId = projectResult.rows[0].id;
            
            // Link project back to lead
            await pool.query(`
                UPDATE leads 
                SET intel_project_id = $1, flyer_created_at = NOW()
                WHERE id = $2
            `, [projectId, lead_id]);
            
            // Try to enrich with Google Places if we have an address
            let enrichment = null;
            if (fullAddress && fullAddress.length > 5) {
                try {
                    const enrichmentService = require('../services/intel-enrichment');
                    enrichment = await enrichmentService.enrichProperty(fullAddress);
                    
                    // Update project with enrichment data
                    if (enrichment.location) {
                        await pool.query(`
                            UPDATE intel_projects 
                            SET lat = $1, lng = $2, enrichment_data = $3
                            WHERE id = $4
                        `, [
                            enrichment.location.lat,
                            enrichment.location.lng,
                            JSON.stringify(enrichment),
                            projectId
                        ]);
                        
                        // Also update lead with coordinates
                        await pool.query(`
                            UPDATE leads 
                            SET property_lat = $1, property_lng = $2
                            WHERE id = $3
                        `, [enrichment.location.lat, enrichment.location.lng, lead_id]);
                    }
                } catch (enrichError) {
                    console.error('[INTEL] Enrichment error (non-fatal):', enrichError.message);
                }
            }
            
            console.log(`[INTEL] Created project ${projectId} from lead ${lead_id}`);
            
            res.json({ 
                success: true, 
                project_id: projectId,
                lead_id: lead_id,
                enriched: !!enrichment?.location
            });
            
        } catch (error) {
            console.error('[INTEL] Create from lead error:', error);
            res.status(500).json({ success: false, error: 'Failed to create project' });
        }
    });

    // ============================================
    // BROKER ? MARKETING CHAT
    // ============================================
    
    // Get comments for a project
    router.get('/projects/:id/comments', async (req, res) => {
        try {
            const projectId = req.params.id;
            const result = await pool.query(`
                SELECT c.*,
                       u.name as user_name
                FROM intel_comments c
                LEFT JOIN users u ON c.user_id = u.id
                WHERE c.project_id = $1
                ORDER BY c.created_at ASC
            `, [projectId]);
            
            res.json({ success: true, comments: result.rows });
        } catch (error) {
            console.error('[INTEL] Get comments error:', error);
            res.status(500).json({ success: false, error: 'Failed to load comments' });
        }
    });
    
    // Add comment to a project
    router.post('/projects/:id/comments', async (req, res) => {
        try {
            const projectId = req.params.id;
            const userId = req.session.user.id;
            const { message } = req.body;
            
            if (!message || !message.trim()) {
                return res.status(400).json({ success: false, error: 'Message required' });
            }
            
            // Determine if user is broker or marketing based on role
            const userRole = req.session.user.role || '';
            const isBroker = ['broker', 'agent', 'admin'].includes(userRole.toLowerCase());
            const isMarketing = ['marketing', 'designer'].includes(userRole.toLowerCase());
            
            const result = await pool.query(`
                INSERT INTO intel_comments (project_id, user_id, message, is_from_broker, is_from_marketing)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *
            `, [projectId, userId, message.trim(), isBroker || !isMarketing, isMarketing]);
            
            res.json({ success: true, comment: result.rows[0] });
        } catch (error) {
            console.error('[INTEL] Add comment error:', error);
            res.status(500).json({ success: false, error: 'Failed to add comment' });
        }
    });
    
    // Mark comments as read
    router.put('/projects/:id/comments/read', async (req, res) => {
        try {
            const projectId = req.params.id;
            const userId = req.session.user.id;
            
            await pool.query(`
                UPDATE intel_comments 
                SET read_at = NOW() 
                WHERE project_id = $1 AND user_id != $2 AND read_at IS NULL
            `, [projectId, userId]);
            
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ success: false, error: 'Failed to mark as read' });
        }
    });

    // Health check
    router.get('/health', (req, res) => {
        res.json({ status: 'healthy', module: 'INTEL', version: '2.0.0' });
    });
    return router;
};
