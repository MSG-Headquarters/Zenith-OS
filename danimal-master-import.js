/**
 * DANIMAL DATA - Master Import Script
 * 
 * Imports data from multiple sources into danimal_leads table:
 * - DBPR (Florida professional licenses)
 * - Sunbiz (Florida corporations)
 * - DOH (Florida health licenses)
 * 
 * USAGE:
 *   node danimal-master-import.js [source]
 *   
 *   source: dbpr | sunbiz | doh | all
 * 
 * Main Street Group Technology Division
 * © 2026 All Rights Reserved
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { Pool } = require('pg');

// ============================================
// CONFIGURATION
// ============================================
const DBPR_FOLDER = path.join(__dirname, 'dbpr-downloads');
const SUNBIZ_FOLDER = path.join(__dirname, 'sunbiz-data');
const DOH_FOLDER = path.join(__dirname, 'doh-downloads');

// Database connection (uses environment variables or defaults)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://zenith_admin:ZenithDB2026secure@zenith-db.cnqawc0wy3sg.us-east-2.rds.amazonaws.com:5432/zenith_db',
    ssl: { rejectUnauthorized: false }
});

// Batch size for inserts
const BATCH_SIZE = 1000;

// ============================================
// UTILITY FUNCTIONS
// ============================================

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

function cleanString(str) {
    if (!str) return null;
    return str.replace(/"/g, '').trim() || null;
}

function extractPhone(str) {
    if (!str) return null;
    const digits = str.replace(/\D/g, '');
    if (digits.length >= 10) {
        return digits.slice(0, 10);
    }
    return null;
}

function extractEmail(str) {
    if (!str) return null;
    const match = str.match(/[\w.-]+@[\w.-]+\.\w+/);
    return match ? match[0].toLowerCase() : null;
}

function determineIndustry(licenseType, businessType) {
    const type = (licenseType || businessType || '').toLowerCase();
    
    if (type.includes('real estate') || type.includes('broker') || type.includes('salesperson')) return 'Real Estate';
    if (type.includes('construct') || type.includes('contractor') || type.includes('building')) return 'Construction';
    if (type.includes('restaurant') || type.includes('food')) return 'Food Service';
    if (type.includes('hotel') || type.includes('lodging') || type.includes('motel')) return 'Hospitality';
    if (type.includes('cosmetol') || type.includes('barber') || type.includes('salon')) return 'Personal Services';
    if (type.includes('alcohol') || type.includes('liquor') || type.includes('beverage')) return 'Alcoholic Beverages';
    if (type.includes('medical') || type.includes('health') || type.includes('nurse') || type.includes('doctor')) return 'Healthcare';
    if (type.includes('engineer') || type.includes('architect')) return 'Professional Services';
    if (type.includes('electric')) return 'Electrical';
    if (type.includes('plumb')) return 'Plumbing';
    if (type.includes('hvac') || type.includes('air condition')) return 'HVAC';
    if (type.includes('insurance')) return 'Insurance';
    if (type.includes('account') || type.includes('cpa')) return 'Financial Services';
    
    return 'Other';
}

function calculateLeadScore(record) {
    let score = 50; // Base score
    
    // Has email: +15
    if (record.email) score += 15;
    
    // Has phone: +10
    if (record.phone) score += 10;
    
    // Has website: +10
    if (record.website) score += 10;
    
    // Active license: +10
    if (record.license_status === 'Active' || record.license_status === 'Current') score += 10;
    
    // Has full address: +5
    if (record.street_address && record.city && record.zip_code) score += 5;
    
    return Math.min(score, 100);
}

function getLeadGrade(score) {
    if (score >= 90) return 'A';
    if (score >= 75) return 'B';
    if (score >= 50) return 'C';
    if (score >= 25) return 'D';
    return 'F';
}

// ============================================
// DBPR IMPORT
// ============================================

async function importDBPR() {
    console.log('\n📂 IMPORTING DBPR DATA');
    console.log('═'.repeat(50));
    
    if (!fs.existsSync(DBPR_FOLDER)) {
        console.log('❌ DBPR folder not found:', DBPR_FOLDER);
        console.log('   Run dbpr-complete-downloader.js first');
        return { imported: 0, errors: 0 };
    }
    
    const files = fs.readdirSync(DBPR_FOLDER).filter(f => f.endsWith('.csv'));
    console.log(`📋 Found ${files.length} CSV files\n`);
    
    let totalImported = 0;
    let totalErrors = 0;
    
    for (const file of files) {
        const filePath = path.join(DBPR_FOLDER, file);
        const stats = fs.statSync(filePath);
        
        // Skip small files (likely errors or empty)
        if (stats.size < 1000) {
            console.log(`   ⏭ Skipping ${file} (too small)`);
            continue;
        }
        
        process.stdout.write(`   📄 ${file}... `);
        
        try {
            const result = await importDBPRFile(filePath);
            console.log(`✓ ${result.imported} records`);
            totalImported += result.imported;
            totalErrors += result.errors;
        } catch (err) {
            console.log(`✗ Error: ${err.message}`);
            totalErrors++;
        }
    }
    
    console.log(`\n✓ DBPR Import Complete: ${totalImported.toLocaleString()} records`);
    return { imported: totalImported, errors: totalErrors };
}

async function importDBPRFile(filePath) {
    const filename = path.basename(filePath);
    let imported = 0;
    let errors = 0;
    let batch = [];
    let headers = null;
    
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });
    
    for await (const line of rl) {
        if (!headers) {
            headers = parseCSVLine(line).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, '_'));
            continue;
        }
        
        const values = parseCSVLine(line);
        if (values.length < 3) continue;
        
        const record = {};
        headers.forEach((h, i) => {
            record[h] = cleanString(values[i]);
        });
        
        // Map DBPR fields to our schema
        const lead = {
            source: 'dbpr',
            source_id: record.license_number || record.licensee_id || record.lic_nbr || `DBPR-${filename}-${imported}`,
            business_name: record.business_name || record.dba || record.licensee_name || record.name || record.entity_name,
            dba: record.dba || record.doing_business_as,
            industry: determineIndustry(record.license_type || record.profession || filename, record.business_type),
            business_type: record.license_type || record.profession || record.type,
            license_number: record.license_number || record.lic_nbr || record.license_no,
            license_type: record.license_type || record.profession || record.lic_type,
            license_status: record.status || record.license_status || 'Active',
            license_expiration: record.expiration_date || record.exp_date || record.expires,
            contact_name: record.contact_name || record.primary_name || record.owner_name,
            phone: extractPhone(record.phone || record.telephone || record.phone_number || record.bus_phone),
            email: extractEmail(record.email || record.email_address || record.e_mail),
            street_address: record.address || record.street_address || record.address1 || record.location_address,
            city: record.city || record.location_city,
            state: record.state || 'FL',
            zip_code: record.zip || record.zip_code || record.postal_code,
            county: record.county || record.location_county,
        };
        
        // Skip if no business name
        if (!lead.business_name) continue;
        
        // Calculate score and grade
        lead.lead_score = calculateLeadScore(lead);
        lead.lead_grade = getLeadGrade(lead.lead_score);
        
        batch.push(lead);
        
        if (batch.length >= BATCH_SIZE) {
            const result = await insertBatch(batch);
            imported += result.inserted;
            errors += result.errors;
            batch = [];
        }
    }
    
    // Insert remaining records
    if (batch.length > 0) {
        const result = await insertBatch(batch);
        imported += result.inserted;
        errors += result.errors;
    }
    
    return { imported, errors };
}

// ============================================
// SUNBIZ IMPORT
// ============================================

async function importSunbiz() {
    console.log('\n📂 IMPORTING SUNBIZ DATA');
    console.log('═'.repeat(50));
    
    if (!fs.existsSync(SUNBIZ_FOLDER)) {
        console.log('❌ Sunbiz folder not found:', SUNBIZ_FOLDER);
        console.log('   Please extract Sunbiz zip files to:', SUNBIZ_FOLDER);
        return { imported: 0, errors: 0 };
    }
    
    const files = fs.readdirSync(SUNBIZ_FOLDER);
    console.log(`📋 Found ${files.length} files in folder\n`);
    
    let totalImported = 0;
    let totalErrors = 0;
    
    // Import main corporation data (cordata0-9.txt)
    const cordataFiles = files.filter(f => f.toLowerCase().startsWith('cordata') && f.endsWith('.txt'));
    if (cordataFiles.length > 0) {
        console.log(`\n📁 Corporation Data (${cordataFiles.length} files)`);
        console.log('─'.repeat(50));
        for (const file of cordataFiles.sort()) {
            process.stdout.write(`   📄 ${file}... `);
            try {
                const result = await importSunbizCorpFile(path.join(SUNBIZ_FOLDER, file));
                console.log(`✓ ${result.imported.toLocaleString()} records`);
                totalImported += result.imported;
                totalErrors += result.errors;
            } catch (err) {
                console.log(`✗ Error: ${err.message}`);
                totalErrors++;
            }
        }
    }
    
    // Import non-profit corporation data (npcordata0-9.txt)
    const npcordataFiles = files.filter(f => f.toLowerCase().startsWith('npcordata') && f.endsWith('.txt'));
    if (npcordataFiles.length > 0) {
        console.log(`\n📁 Non-Profit Corporations (${npcordataFiles.length} files)`);
        console.log('─'.repeat(50));
        for (const file of npcordataFiles.sort()) {
            process.stdout.write(`   📄 ${file}... `);
            try {
                const result = await importSunbizCorpFile(path.join(SUNBIZ_FOLDER, file));
                console.log(`✓ ${result.imported.toLocaleString()} records`);
                totalImported += result.imported;
                totalErrors += result.errors;
            } catch (err) {
                console.log(`✗ Error: ${err.message}`);
                totalErrors++;
            }
        }
    }
    
    // Import fictitious names (FICFILE.TXT)
    const ficFile = files.find(f => f.toLowerCase().includes('ficfile'));
    if (ficFile) {
        console.log(`\n📁 Fictitious Names (DBAs)`);
        console.log('─'.repeat(50));
        process.stdout.write(`   📄 ${ficFile}... `);
        try {
            const result = await importSunbizFicFile(path.join(SUNBIZ_FOLDER, ficFile));
            console.log(`✓ ${result.imported.toLocaleString()} records`);
            totalImported += result.imported;
            totalErrors += result.errors;
        } catch (err) {
            console.log(`✗ Error: ${err.message}`);
        }
    }
    
    console.log(`\n✓ Sunbiz Import Complete: ${totalImported.toLocaleString()} records`);
    return { imported: totalImported, errors: totalErrors };
}

async function importSunbizCorpFile(filePath) {
    let imported = 0;
    let errors = 0;
    let batch = [];
    
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });
    
    // Sunbiz CORDATA fixed-width format (based on actual file analysis):
    // Position 0-12:    Document Number (e.g., L14000136940)
    // Position 12-212:  Business Name (200 chars)
    // Position 212-213: Status flag (A=Active, I=Inactive)
    // Position 213-215: State of Formation
    // Position 215-217: Entity Type (AL=LLC, CP=Corp, etc.)
    // Position 217-230: Blank/Reserved
    // Position 230-310: Principal Address Street
    // Position 310-350: Principal Address City  
    // Position 350-352: Principal Address State
    // Position 352-362: Principal Address Zip
    // Position 362-442: Mailing Address Street
    // Position 442-482: Mailing Address City
    // Position 482-484: Mailing Address State
    // Position 484-494: Mailing Address Zip
    // Position ~500+:   Filing dates, registered agent, etc.
    
    for await (const line of rl) {
        if (line.length < 100) continue;
        
        try {
            const record = {
                document_number: line.substring(0, 12).trim(),
                business_name: line.substring(12, 212).trim(),
                status_flag: line.substring(212, 213).trim(),
                state_of_formation: line.substring(213, 215).trim(),
                entity_type_code: line.substring(215, 217).trim(),
                principal_street: line.substring(230, 310).trim(),
                principal_city: line.substring(310, 350).trim(),
                principal_state: line.substring(350, 352).trim(),
                principal_zip: line.substring(352, 362).trim(),
                mailing_street: line.substring(362, 442).trim(),
                mailing_city: line.substring(442, 482).trim(),
                mailing_state: line.substring(482, 484).trim(),
                mailing_zip: line.substring(484, 494).trim(),
            };
            
            if (!record.business_name || record.business_name.length < 2) continue;
            
            // Determine entity type
            let entityType = 'Corporation';
            if (record.entity_type_code === 'AL') entityType = 'LLC';
            else if (record.entity_type_code === 'CP') entityType = 'Corporation';
            else if (record.entity_type_code === 'LP') entityType = 'Limited Partnership';
            else if (record.entity_type_code === 'GP') entityType = 'General Partnership';
            
            // Determine status
            let status = 'Active';
            if (record.status_flag === 'I') status = 'Inactive';
            else if (record.status_flag === 'A') status = 'Active';
            
            // Use principal address, fall back to mailing
            const street = record.principal_street || record.mailing_street;
            const city = record.principal_city || record.mailing_city;
            const state = record.principal_state || record.mailing_state || 'FL';
            const zip = record.principal_zip || record.mailing_zip;
            
            const lead = {
                source: 'sunbiz',
                source_id: record.document_number,
                business_name: record.business_name,
                industry: entityType,
                business_type: entityType,
                document_number: record.document_number,
                entity_type: entityType,
                license_status: status,
                street_address: street,
                city: city,
                state: state,
                zip_code: zip.substring(0, 10), // Limit zip length
            };
            
            lead.lead_score = calculateLeadScore(lead);
            lead.lead_grade = getLeadGrade(lead.lead_score);
            
            batch.push(lead);
            
            if (batch.length >= BATCH_SIZE) {
                const result = await insertBatch(batch);
                imported += result.inserted;
                errors += result.errors;
                batch = [];
            }
        } catch (err) {
            errors++;
        }
    }
    
    if (batch.length > 0) {
        const result = await insertBatch(batch);
        imported += result.inserted;
        errors += result.errors;
    }
    
    return { imported, errors };
}

async function importSunbizFicFile(filePath) {
    // Similar to corp file but for fictitious names (DBAs)
    let imported = 0;
    let errors = 0;
    let batch = [];
    
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });
    
    for await (const line of rl) {
        if (line.length < 20) continue;
        
        const parts = line.includes('|') ? line.split('|') : [line];
        
        const lead = {
            source: 'sunbiz',
            source_id: `FIC-${imported}`,
            business_name: cleanString(parts[1] || parts[0]),
            dba: cleanString(parts[1] || parts[0]),
            industry: 'Fictitious Name',
            business_type: 'DBA',
            entity_type: 'Fictitious Name',
            license_status: 'Active',
            state: 'FL',
        };
        
        if (!lead.business_name) continue;
        
        lead.lead_score = calculateLeadScore(lead);
        lead.lead_grade = getLeadGrade(lead.lead_score);
        
        batch.push(lead);
        
        if (batch.length >= BATCH_SIZE) {
            const result = await insertBatch(batch);
            imported += result.inserted;
            errors += result.errors;
            batch = [];
        }
    }
    
    if (batch.length > 0) {
        const result = await insertBatch(batch);
        imported += result.inserted;
        errors += result.errors;
    }
    
    return { imported, errors };
}

// ============================================
// DATABASE INSERT
// ============================================

async function insertBatch(leads) {
    if (leads.length === 0) return { inserted: 0, errors: 0 };
    
    const columns = [
        'source', 'source_id', 'business_name', 'dba', 'industry', 'business_type',
        'license_number', 'license_type', 'license_status', 'license_expiration',
        'document_number', 'entity_type', 'filing_date',
        'contact_name', 'phone', 'email', 'website',
        'street_address', 'city', 'state', 'zip_code', 'county',
        'lead_score', 'lead_grade'
    ];
    
    const values = [];
    const placeholders = [];
    let paramIndex = 1;
    
    for (const lead of leads) {
        const rowPlaceholders = columns.map(() => `$${paramIndex++}`);
        placeholders.push(`(${rowPlaceholders.join(', ')})`);
        
        columns.forEach(col => {
            values.push(lead[col] || null);
        });
    }
    
    const query = `
        INSERT INTO danimal_leads (${columns.join(', ')})
        VALUES ${placeholders.join(', ')}
        ON CONFLICT (source, source_id) DO UPDATE SET
            business_name = EXCLUDED.business_name,
            updated_at = NOW()
    `;
    
    try {
        await pool.query(query, values);
        return { inserted: leads.length, errors: 0 };
    } catch (err) {
        // If batch fails, try individual inserts
        let inserted = 0;
        let errors = 0;
        
        for (const lead of leads) {
            try {
                const singleQuery = `
                    INSERT INTO danimal_leads (${columns.join(', ')})
                    VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})
                    ON CONFLICT (source, source_id) DO NOTHING
                `;
                await pool.query(singleQuery, columns.map(col => lead[col] || null));
                inserted++;
            } catch (e) {
                errors++;
            }
        }
        
        return { inserted, errors };
    }
}

// ============================================
// ADD UNIQUE CONSTRAINT (if not exists)
// ============================================

async function ensureConstraints() {
    try {
        await pool.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'danimal_leads_source_source_id_key'
                ) THEN
                    ALTER TABLE danimal_leads ADD CONSTRAINT danimal_leads_source_source_id_key UNIQUE (source, source_id);
                END IF;
            END $$;
        `);
    } catch (err) {
        // Constraint might already exist
    }
}

// ============================================
// MAIN
// ============================================

async function main() {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║        DANIMAL DATA - Master Import Script               ║');
    console.log('║              Main Street Group Technology                ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    
    const source = process.argv[2] || 'all';
    
    console.log(`\n📊 Import source: ${source.toUpperCase()}`);
    console.log(`📁 DBPR folder: ${DBPR_FOLDER}`);
    console.log(`📁 Sunbiz folder: ${SUNBIZ_FOLDER}`);
    
    // Test database connection
    try {
        const result = await pool.query('SELECT NOW()');
        console.log(`✓ Database connected: ${result.rows[0].now}`);
    } catch (err) {
        console.error('❌ Database connection failed:', err.message);
        process.exit(1);
    }
    
    // Ensure constraints exist
    await ensureConstraints();
    
    const startTime = Date.now();
    let totalRecords = 0;
    
    if (source === 'all' || source === 'dbpr') {
        const result = await importDBPR();
        totalRecords += result.imported;
    }
    
    if (source === 'all' || source === 'sunbiz') {
        const result = await importSunbiz();
        totalRecords += result.imported;
    }
    
    const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    
    // Get final count
    const countResult = await pool.query('SELECT COUNT(*) FROM danimal_leads');
    const totalInDB = parseInt(countResult.rows[0].count);
    
    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║                  IMPORT COMPLETE                         ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log(`\n✓ Records imported this session: ${totalRecords.toLocaleString()}`);
    console.log(`✓ Total records in database: ${totalInDB.toLocaleString()}`);
    console.log(`⏱ Duration: ${duration} minutes`);
    
    await pool.end();
}

main().catch(err => {
    console.error('Import failed:', err);
    process.exit(1);
});
