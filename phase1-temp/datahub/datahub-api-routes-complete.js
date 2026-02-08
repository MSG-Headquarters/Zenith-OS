// ============================================
// DANIMAL DATA HUB - Import API Routes (Complete)
// Add these to routes/danimal-api.js
// ============================================

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../uploads/danimal');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const ext = path.extname(file.originalname);
        cb(null, `import-${timestamp}${ext}`);
    }
});

const upload = multer({ 
    storage,
    limits: { fileSize: 500 * 1024 * 1024 }, // 500MB limit
    fileFilter: (req, file, cb) => {
        const allowed = ['.csv', '.json', '.zip', '.txt'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Allowed: CSV, JSON, ZIP, TXT'));
        }
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /hub - Data Hub Page
// ═══════════════════════════════════════════════════════════════════════════
router.get('/hub', requireAuth, async (req, res) => {
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
            {
                id: 'dbpr', name: 'FL DBPR', description: 'Professional licenses',
                icon: 'award', icon_class: 'dbpr',
                status: sourceMap['dbpr'] ? 'loaded' : 'pending',
                records: sourceMap['dbpr']?.records || 0,
                last_updated: sourceMap['dbpr']?.last_updated || 'Never'
            },
            {
                id: 'sunbiz', name: 'Sunbiz', description: 'Florida corporations & LLCs',
                icon: 'building', icon_class: 'sunbiz',
                status: sourceMap['sunbiz'] ? 'loaded' : 'pending',
                records: sourceMap['sunbiz']?.records || 0,
                last_updated: sourceMap['sunbiz']?.last_updated || 'Never'
            },
            {
                id: 'doh', name: 'FL DOH', description: 'Medical licenses',
                icon: 'heart-pulse', icon_class: 'doh',
                status: sourceMap['doh'] ? 'loaded' : 'pending',
                records: sourceMap['doh']?.records || 0,
                last_updated: sourceMap['doh']?.last_updated || 'Never'
            },
            {
                id: 'lee_county', name: 'Lee County PA', description: 'Property records',
                icon: 'house', icon_class: 'county',
                status: sourceMap['lee_county'] ? 'loaded' : 'pending',
                records: sourceMap['lee_county']?.records || 0,
                last_updated: sourceMap['lee_county']?.last_updated || 'Never'
            },
            {
                id: 'collier_county', name: 'Collier County PA', description: 'Property records',
                icon: 'house', icon_class: 'county',
                status: sourceMap['collier_county'] ? 'loaded' : 'pending',
                records: sourceMap['collier_county']?.records || 0,
                last_updated: sourceMap['collier_county']?.last_updated || 'Never'
            },
            {
                id: 'charlotte_county', name: 'Charlotte County PA', description: 'Property records',
                icon: 'house', icon_class: 'county',
                status: sourceMap['charlotte_county'] ? 'loaded' : 'pending',
                records: sourceMap['charlotte_county']?.records || 0,
                last_updated: sourceMap['charlotte_county']?.last_updated || 'Never'
            },
            {
                id: 'sarasota_county', name: 'Sarasota County PA', description: 'Property records',
                icon: 'house', icon_class: 'county',
                status: sourceMap['sarasota_county'] ? 'loaded' : 'pending',
                records: sourceMap['sarasota_county']?.records || 0,
                last_updated: sourceMap['sarasota_county']?.last_updated || 'Never'
            },
            {
                id: 'fdot', name: 'FDOT Traffic', description: 'Traffic count data',
                icon: 'signpost-2', icon_class: 'fdot',
                status: sourceMap['fdot'] ? 'loaded' : 'pending',
                records: sourceMap['fdot']?.records || 0,
                last_updated: sourceMap['fdot']?.last_updated || 'Never'
            }
        ];

        // Recent imports (create table if not exists)
        let recentImports = [];
        try {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS import_jobs (
                    id SERIAL PRIMARY KEY,
                    source VARCHAR(50),
                    filename VARCHAR(255),
                    status VARCHAR(20) DEFAULT 'queued',
                    records_total INTEGER DEFAULT 0,
                    records_imported INTEGER DEFAULT 0,
                    records_failed INTEGER DEFAULT 0,
                    started_by INTEGER,
                    notes TEXT,
                    error_message TEXT,
                    started_at TIMESTAMP,
                    completed_at TIMESTAMP,
                    created_at TIMESTAMP DEFAULT NOW()
                )
            `);
            
            const importsResult = await pool.query(`
                SELECT ij.*, u.name as user_name
                FROM import_jobs ij
                LEFT JOIN users u ON ij.started_by = u.id
                ORDER BY ij.created_at DESC
                LIMIT 10
            `);
            
            recentImports = importsResult.rows.map(row => ({
                source: row.source,
                records: row.records_imported || 0,
                status: row.status,
                date: row.created_at ? new Date(row.created_at).toLocaleDateString() : '-'
            }));
        } catch (e) {
            console.log('[DataHub] Import jobs table note:', e.message);
        }

        // API status (check if keys are configured)
        const apiStatus = {
            google_places: !!process.env.GOOGLE_PLACES_API_KEY,
            eagleview: !!process.env.EAGLEVIEW_API_KEY,
            arcgis: !!process.env.ARCGIS_API_KEY,
            fdot: true, // Public data
            census: true // Public API
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

// ═══════════════════════════════════════════════════════════════════════════
// POST /import - Upload and start import
// ═══════════════════════════════════════════════════════════════════════════
router.post('/import', requireAuth, upload.single('file'), async (req, res) => {
    try {
        const { source, county, notes } = req.body;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
        }

        if (!source) {
            return res.status(400).json({ success: false, error: 'Source type is required' });
        }

        // Determine final source name
        let sourceName = source;
        if (source === 'county_pa' && county) {
            sourceName = `${county}_county`;
        }

        // Create import job record
        const jobResult = await pool.query(`
            INSERT INTO import_jobs (source, filename, status, started_by, notes, created_at)
            VALUES ($1, $2, 'queued', $3, $4, NOW())
            RETURNING id
        `, [sourceName, file.filename, req.session.user.id, notes]);

        const jobId = jobResult.rows[0].id;

        // Start import in background
        setImmediate(() => {
            processImportFile(jobId, file.path, sourceName, pool)
                .catch(err => console.error('[Import] Background error:', err));
        });

        res.json({ 
            success: true, 
            message: 'Import started',
            job_id: jobId,
            filename: file.filename
        });
    } catch (error) {
        console.error('[Import] Error:', error);
        res.status(500).json({ success: false, error: 'Import failed: ' + error.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /import/upload - Quick upload from drop zone
// ═══════════════════════════════════════════════════════════════════════════
router.post('/import/upload', requireAuth, upload.single('file'), async (req, res) => {
    try {
        const file = req.file;
        if (!file) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
        }

        // Try to detect source from filename
        const filename = file.originalname.toLowerCase();
        let source = 'custom';
        
        if (filename.includes('dbpr')) source = 'dbpr';
        else if (filename.includes('sunbiz') || filename.includes('corp')) source = 'sunbiz';
        else if (filename.includes('doh') || filename.includes('medical')) source = 'doh';
        else if (filename.includes('lee')) source = 'lee_county';
        else if (filename.includes('collier')) source = 'collier_county';
        else if (filename.includes('charlotte')) source = 'charlotte_county';
        else if (filename.includes('sarasota')) source = 'sarasota_county';
        else if (filename.includes('fdot') || filename.includes('traffic')) source = 'fdot';

        // Create import job
        const jobResult = await pool.query(`
            INSERT INTO import_jobs (source, filename, status, started_by, notes, created_at)
            VALUES ($1, $2, 'queued', $3, $4, NOW())
            RETURNING id
        `, [source, file.filename, req.session.user.id, `Quick upload: ${file.originalname}`]);

        const jobId = jobResult.rows[0].id;

        // Process in background
        setImmediate(() => {
            processImportFile(jobId, file.path, source, pool)
                .catch(err => console.error('[Import] Background error:', err));
        });

        res.json({ success: true, job_id: jobId, detected_source: source });
    } catch (error) {
        console.error('[Import] Upload error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /import/status/:id - Get import job status
// ═══════════════════════════════════════════════════════════════════════════
router.get('/import/status/:id', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT * FROM import_jobs WHERE id = $1
        `, [req.params.id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Job not found' });
        }

        const job = result.rows[0];
        const progress = job.records_total > 0 
            ? Math.round((job.records_imported / job.records_total) * 100) 
            : 0;

        res.json({ 
            success: true, 
            job: {
                ...job,
                progress
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// Background Import Processor
// ═══════════════════════════════════════════════════════════════════════════
async function processImportFile(jobId, filePath, source, pool) {
    console.log(`[Import] Starting job ${jobId} for source: ${source}`);
    
    try {
        // Update job status
        await pool.query(`
            UPDATE import_jobs SET status = 'running', started_at = NOW() WHERE id = $1
        `, [jobId]);

        const ext = path.extname(filePath).toLowerCase();
        let totalRecords = 0;
        let importedRecords = 0;
        let failedRecords = 0;

        if (ext === '.csv' || ext === '.txt') {
            // Count lines first
            const lineCount = await countFileLines(filePath);
            totalRecords = lineCount - 1; // Minus header

            await pool.query(`
                UPDATE import_jobs SET records_total = $1 WHERE id = $2
            `, [totalRecords, jobId]);

            // Process CSV
            const result = await processCSVImport(filePath, source, pool, async (progress) => {
                // Update progress every 1000 records
                if (progress.imported % 1000 === 0) {
                    await pool.query(`
                        UPDATE import_jobs SET records_imported = $1, records_failed = $2 WHERE id = $3
                    `, [progress.imported, progress.failed, jobId]);
                }
            });

            importedRecords = result.imported;
            failedRecords = result.failed;
        } else if (ext === '.json') {
            const result = await processJSONImport(filePath, source, pool);
            importedRecords = result.imported;
            failedRecords = result.failed;
            totalRecords = result.total;
        }

        // Mark complete
        await pool.query(`
            UPDATE import_jobs 
            SET status = 'complete', 
                records_total = $1,
                records_imported = $2, 
                records_failed = $3,
                completed_at = NOW()
            WHERE id = $4
        `, [totalRecords, importedRecords, failedRecords, jobId]);

        console.log(`[Import] Job ${jobId} complete: ${importedRecords} imported, ${failedRecords} failed`);
    } catch (error) {
        console.error(`[Import] Job ${jobId} failed:`, error);
        await pool.query(`
            UPDATE import_jobs SET status = 'failed', error_message = $1, completed_at = NOW() WHERE id = $2
        `, [error.message, jobId]);
    }
}

async function countFileLines(filePath) {
    return new Promise((resolve, reject) => {
        let count = 0;
        const rl = readline.createInterface({
            input: fs.createReadStream(filePath),
            crlfDelay: Infinity
        });
        rl.on('line', () => count++);
        rl.on('close', () => resolve(count));
        rl.on('error', reject);
    });
}

async function processCSVImport(filePath, source, pool, onProgress) {
    return new Promise((resolve, reject) => {
        let imported = 0;
        let failed = 0;
        let headers = null;
        let isFirstLine = true;

        const rl = readline.createInterface({
            input: fs.createReadStream(filePath),
            crlfDelay: Infinity
        });

        const batch = [];
        const BATCH_SIZE = 100;

        rl.on('line', async (line) => {
            if (isFirstLine) {
                headers = parseCSVLine(line);
                isFirstLine = false;
                return;
            }

            const values = parseCSVLine(line);
            const record = {};
            headers.forEach((h, i) => {
                record[h.toLowerCase().replace(/\s+/g, '_')] = values[i] || null;
            });

            batch.push(record);

            if (batch.length >= BATCH_SIZE) {
                rl.pause();
                try {
                    const result = await insertBatch(batch, source, pool);
                    imported += result.success;
                    failed += result.failed;
                    if (onProgress) onProgress({ imported, failed });
                } catch (e) {
                    failed += batch.length;
                }
                batch.length = 0;
                rl.resume();
            }
        });

        rl.on('close', async () => {
            // Process remaining batch
            if (batch.length > 0) {
                try {
                    const result = await insertBatch(batch, source, pool);
                    imported += result.success;
                    failed += result.failed;
                } catch (e) {
                    failed += batch.length;
                }
            }
            resolve({ imported, failed, total: imported + failed });
        });

        rl.on('error', reject);
    });
}

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result;
}

async function insertBatch(records, source, pool) {
    let success = 0;
    let failed = 0;

    for (const record of records) {
        try {
            // Map fields based on source
            const mapped = mapRecordToSchema(record, source);
            
            await pool.query(`
                INSERT INTO danimal_leads (
                    source, source_id, business_name, contact_name, 
                    phone, email, street_address, city, state, zip_code,
                    industry, business_type, license_number, license_status,
                    created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
                ON CONFLICT DO NOTHING
            `, [
                source,
                mapped.source_id,
                mapped.business_name,
                mapped.contact_name,
                mapped.phone,
                mapped.email,
                mapped.street_address,
                mapped.city,
                mapped.state || 'FL',
                mapped.zip_code,
                mapped.industry,
                mapped.business_type,
                mapped.license_number,
                mapped.license_status || 'Active'
            ]);
            success++;
        } catch (e) {
            failed++;
        }
    }

    return { success, failed };
}

function mapRecordToSchema(record, source) {
    // Generic field mapping - handles various CSV formats
    const mapped = {
        source_id: record.id || record.license_number || record.doc_number || record.parcel_id || null,
        business_name: record.business_name || record.name || record.company_name || record.corp_name || record.dba || null,
        contact_name: record.contact_name || record.owner_name || record.licensee_name || record.agent_name || null,
        phone: record.phone || record.telephone || record.phone_number || null,
        email: record.email || record.email_address || null,
        street_address: record.street_address || record.address || record.address_line_1 || record.mailing_address || null,
        city: record.city || record.mailing_city || null,
        state: record.state || record.mailing_state || 'FL',
        zip_code: record.zip_code || record.zip || record.postal_code || record.mailing_zip || null,
        industry: record.industry || record.license_type || record.profession || record.business_type || null,
        business_type: record.business_type || record.entity_type || record.license_category || null,
        license_number: record.license_number || record.license_no || record.permit_number || null,
        license_status: record.license_status || record.status || 'Active'
    };

    // Source-specific mappings
    if (source === 'doh') {
        mapped.industry = 'Healthcare';
        mapped.license_number = record.license_number || record.me_number;
    } else if (source.includes('county')) {
        mapped.industry = 'Property Owner';
        mapped.source_id = record.parcel_id || record.folio || record.account_number;
    } else if (source === 'fdot') {
        mapped.industry = 'Transportation';
        mapped.source_id = record.count_id || record.station_id;
    }

    return mapped;
}

async function processJSONImport(filePath, source, pool) {
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    const records = Array.isArray(data) ? data : [data];

    let imported = 0;
    let failed = 0;

    for (const record of records) {
        try {
            const mapped = mapRecordToSchema(record, source);
            await pool.query(`
                INSERT INTO danimal_leads (
                    source, source_id, business_name, contact_name, 
                    phone, email, street_address, city, state, zip_code,
                    industry, business_type, license_number, license_status,
                    created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
                ON CONFLICT DO NOTHING
            `, [
                source, mapped.source_id, mapped.business_name, mapped.contact_name,
                mapped.phone, mapped.email, mapped.street_address, mapped.city,
                mapped.state, mapped.zip_code, mapped.industry, mapped.business_type,
                mapped.license_number, mapped.license_status
            ]);
            imported++;
        } catch (e) {
            failed++;
        }
    }

    return { imported, failed, total: records.length };
}

// Export for use in routes
module.exports = { upload, processImportFile };
