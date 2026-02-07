/**
 * DANIMAL DATA - Florida DBPR License Import
 * 
 * This script imports DBPR licensure data into your Zenith OS database.
 * Supports: Alcoholic Beverages, Veterinary, Drugs/Devices/Cosmetics, and more
 * 
 * USAGE:
 *   1. Place CSV files in the DATA_FOLDER
 *   2. Run: node import-dbpr-data.js
 * 
 * Main Street Group Technology Division
 * © 2026 All Rights Reserved
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { Pool } = require('pg');

// ============================================
// CONFIGURATION - UPDATE THIS PATH
// ============================================
const DATA_FOLDER = 'C:\\Users\\17242\\Downloads';

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://zenith_admin:ZenithDB2026secure@zenith-db.cnqawc0wy3sg.us-east-2.rds.amazonaws.com:5432/zenith_db',
    ssl: { rejectUnauthorized: false }
});

// ============================================
// FILE CONFIGURATIONS
// ============================================
const FILE_CONFIGS = {
    'bd4008lic.csv': {
        name: 'Alcoholic Beverage Brands',
        industry: 'Hospitality',
        category: 'Alcoholic Beverages',
        delimiter: ',',
        hasHeaders: true,
        mapping: {
            business_name: 'Owner Name',
            license_number: 'License Number',
            license_type: 'Series',
            license_status: 'Primary Status',
            license_expiration: 'Expiration Date',
            street_address: 'Mail Address 1',
            city: 'Mail City',
            state: 'Mail State',
            zip_code: 'Mail ZIP',
            county: 'Mail County',
            dba: 'DBA'
        }
    },
    'lic26vt.csv': {
        name: 'Veterinarians',
        industry: 'Healthcare',
        category: 'Veterinary',
        delimiter: ',',
        hasHeaders: false,
        // Positional mapping for files without headers
        columns: [
            'board', 'license_type', 'name', 'series', 'modifier',
            'address1', 'address2', 'address3', 'city', 'state', 'zip', 'county',
            'license_number', 'primary_status', 'secondary_status',
            'original_date', 'effective_date', 'expiration_date',
            'field19', 'field20', 'full_license', 'field22'
        ]
    },
    'lic33ddc.csv': {
        name: 'Drugs, Devices & Cosmetics',
        industry: 'Healthcare',
        category: 'Medical Facilities',
        delimiter: ',',
        hasHeaders: true,
        mapping: {
            business_name: 'Establishment/Person Name',
            license_number: 'License #',
            license_type: 'Permit Type Name',
            license_status: 'Permit Status',
            license_expiration: 'Expiration Date',
            street_address: 'Address Line 1',
            city: 'City',
            state: 'State',
            zip_code: 'Zip Code',
            county: 'County Code',
            dba: 'DBA Name'
        }
    }
};

// Status code mapping
const STATUS_MAP = {
    'C': 'Current/Active',
    'A': 'Active',
    'I': 'Inactive',
    'R': 'Revoked',
    'S': 'Suspended',
    'D': 'Delinquent',
    '20': 'Active',
    '21': 'Inactive'
};

// County code mapping
const COUNTY_MAP = {
    '1': 'Alachua', '2': 'Baker', '3': 'Bay', '4': 'Bradford', '5': 'Brevard',
    '6': 'Broward', '7': 'Calhoun', '8': 'Charlotte', '9': 'Citrus', '10': 'Clay',
    '11': 'Collier', '12': 'Columbia', '13': 'Miami-Dade', '14': 'DeSoto', '15': 'Dixie',
    '16': 'Duval', '17': 'Escambia', '18': 'Flagler', '19': 'Franklin', '20': 'Gadsden',
    '21': 'Gilchrist', '22': 'Glades', '23': 'Gulf', '24': 'Hamilton', '25': 'Hardee',
    '26': 'Hendry', '27': 'Hernando', '28': 'Highlands', '29': 'Hillsborough', '30': 'Holmes',
    '31': 'Indian River', '32': 'Jackson', '33': 'Jefferson', '34': 'Lafayette', '35': 'Lake',
    '36': 'Lee', '37': 'Leon', '38': 'Levy', '39': 'Liberty', '40': 'Madison',
    '41': 'Manatee', '42': 'Marion', '43': 'Martin', '44': 'Monroe', '45': 'Nassau',
    '46': 'Okaloosa', '47': 'Okeechobee', '48': 'Orange', '49': 'Osceola', '50': 'Palm Beach',
    '51': 'Pasco', '52': 'Pinellas', '53': 'Polk', '54': 'Putnam', '55': 'Santa Rosa',
    '56': 'Sarasota', '57': 'Seminole', '58': 'St. Johns', '59': 'St. Lucie', '60': 'Sumter',
    '61': 'Suwannee', '62': 'Taylor', '63': 'Union', '64': 'Volusia', '65': 'Wakulla',
    '66': 'Walton', '67': 'Washington', '23': 'Miami-Dade'
};

// ============================================
// CSV PARSER
// ============================================
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
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

// ============================================
// LEAD SCORING
// ============================================
function calculateLeadScore(record, config) {
    let score = 50;
    
    // Industry bonus
    if (config.industry === 'Healthcare') score += 15;
    else if (config.industry === 'Hospitality') score += 10;
    
    // Active status
    if (record.license_status && record.license_status.toLowerCase().includes('active')) {
        score += 15;
    }
    
    // Has address
    if (record.street_address && record.city) score += 5;
    
    // Florida location
    if (record.state === 'FL') score += 5;
    
    // Has business name
    if (record.business_name && record.business_name.length > 3) score += 5;
    
    return Math.min(100, Math.max(0, score));
}

function getLeadGrade(score) {
    if (score >= 90) return 'A';
    if (score >= 75) return 'B';
    if (score >= 60) return 'C';
    if (score >= 40) return 'D';
    return 'F';
}

// ============================================
// IMPORT SINGLE FILE
// ============================================
async function importFile(fileName, config) {
    const filePath = path.join(DATA_FOLDER, fileName);
    
    if (!fs.existsSync(filePath)) {
        console.log(`  ⚠ File not found: ${fileName}`);
        return 0;
    }
    
    console.log(`\n📁 Importing: ${config.name}`);
    console.log(`   File: ${fileName}`);
    
    const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let headers = null;
    let lineCount = 0;
    let insertedCount = 0;
    let batch = [];
    const BATCH_SIZE = 500;

    for await (const line of rl) {
        lineCount++;
        
        // Skip empty lines
        if (!line.trim()) continue;
        
        const values = parseCSVLine(line);
        
        // Handle headers
        if (lineCount === 1 && config.hasHeaders) {
            headers = values.map(h => h.replace(/"/g, '').trim());
            continue;
        }
        
        // Map to record
        let record = {};
        
        if (config.hasHeaders && headers) {
            // Use header-based mapping
            headers.forEach((header, index) => {
                record[header] = values[index] ? values[index].replace(/"/g, '').trim() : null;
            });
        } else if (config.columns) {
            // Use positional mapping
            config.columns.forEach((col, index) => {
                record[col] = values[index] ? values[index].replace(/"/g, '').trim() : null;
            });
        }
        
        // Transform to our schema
        let mapped = {
            source: 'dbpr',
            source_id: null,
            business_name: null,
            dba: null,
            industry: config.industry,
            business_type: config.category,
            license_number: null,
            license_type: config.name,
            license_status: null,
            license_expiration: null,
            contact_name: null,
            phone: null,
            email: null,
            website: null,
            street_address: null,
            city: null,
            state: 'FL',
            zip_code: null,
            county: null
        };
        
        // Apply mapping
        if (config.mapping) {
            for (const [field, sourceField] of Object.entries(config.mapping)) {
                if (record[sourceField]) {
                    mapped[field] = record[sourceField];
                }
            }
        } else {
            // Handle lic26vt.csv (no headers)
            mapped.business_name = record.name || null;
            mapped.contact_name = record.name || null;
            mapped.license_number = record.full_license || record.license_number || null;
            mapped.license_status = STATUS_MAP[record.primary_status] || record.primary_status || null;
            mapped.license_expiration = record.expiration_date || null;
            mapped.street_address = record.address1 || null;
            mapped.city = record.city || null;
            mapped.state = record.state || 'FL';
            mapped.zip_code = record.zip || null;
            mapped.county = COUNTY_MAP[record.county] || record.county || null;
        }
        
        // Resolve county code
        if (mapped.county && !isNaN(mapped.county)) {
            mapped.county = COUNTY_MAP[mapped.county] || mapped.county;
        }
        
        // Resolve status code
        if (mapped.license_status && STATUS_MAP[mapped.license_status]) {
            mapped.license_status = STATUS_MAP[mapped.license_status];
        }
        
        // Calculate score
        mapped.lead_score = calculateLeadScore(mapped, config);
        mapped.lead_grade = getLeadGrade(mapped.lead_score);
        
        batch.push(mapped);
        
        // Insert batch
        if (batch.length >= BATCH_SIZE) {
            insertedCount += await insertBatch(batch);
            batch = [];
            
            if (insertedCount % 10000 === 0) {
                console.log(`   Processed ${insertedCount.toLocaleString()} records...`);
            }
        }
    }
    
    // Insert remaining
    if (batch.length > 0) {
        insertedCount += await insertBatch(batch);
    }
    
    console.log(`   ✓ Imported ${insertedCount.toLocaleString()} records`);
    return insertedCount;
}

// ============================================
// BATCH INSERT
// ============================================
async function insertBatch(batch) {
    let inserted = 0;
    
    for (const record of batch) {
        try {
            await pool.query(`
                INSERT INTO danimal_leads (
                    source, source_id, business_name, dba, industry, business_type,
                    license_number, license_type, license_status, license_expiration,
                    contact_name, phone, email, website,
                    street_address, city, state, zip_code, county,
                    lead_score, lead_grade, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, NOW(), NOW())
                ON CONFLICT DO NOTHING
            `, [
                record.source, record.source_id, record.business_name, record.dba,
                record.industry, record.business_type, record.license_number,
                record.license_type, record.license_status, record.license_expiration,
                record.contact_name, record.phone, record.email, record.website,
                record.street_address, record.city, record.state, record.zip_code,
                record.county, record.lead_score, record.lead_grade
            ]);
            inserted++;
        } catch (err) {
            // Skip duplicates or errors
        }
    }
    
    return inserted;
}

// ============================================
// MAIN
// ============================================
async function main() {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║       DANIMAL DATA - Florida DBPR License Import         ║');
    console.log('║              Main Street Group Technology                ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    
    const startTime = Date.now();
    let totalImported = 0;
    
    // Process each configured file
    for (const [fileName, config] of Object.entries(FILE_CONFIGS)) {
        const count = await importFile(fileName, config);
        totalImported += count;
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    // Get final stats
    const stats = await pool.query(`
        SELECT 
            source,
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE lead_grade = 'A') as grade_a,
            COUNT(*) FILTER (WHERE lead_grade = 'B') as grade_b
        FROM danimal_leads
        GROUP BY source
        ORDER BY total DESC
    `);
    
    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║                    IMPORT COMPLETE                       ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log(`\n✓ Total records imported: ${totalImported.toLocaleString()}`);
    console.log(`✓ Duration: ${duration} seconds`);
    
    console.log('\n📊 Database Summary by Source:');
    for (const row of stats.rows) {
        console.log(`   ${row.source.toUpperCase()}: ${parseInt(row.total).toLocaleString()} records (${row.grade_a} A, ${row.grade_b} B)`);
    }
    
    await pool.end();
    console.log('\n✓ Done!');
}

main().catch(err => {
    console.error('Import failed:', err);
    process.exit(1);
});
