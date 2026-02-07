/**
 * Import Headerless DBPR Files - FIXED
 * Matches actual danimal_leads table columns
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 
        'postgres://zenith_admin:ZenithDB2026secure@zenith-db.cnqawc0wy3sg.us-east-2.rds.amazonaws.com:5432/zenith_db',
    ssl: { rejectUnauthorized: false }
});

const DBPR_FOLDER = path.join(__dirname, 'dbpr-downloads');

// File configurations
const FILE_CONFIGS = {
    'BuildingCodeLicensee.csv': { type: 'standard', industry: 'Building Code' },
    'CONSTRUCTIONLICENSE_1.csv': { type: 'standard', industry: 'Construction' },
    'COSMETOLOGYLICENSE_1.csv': { type: 'standard', industry: 'Cosmetology' },
    'lic38cam.csv': { type: 'standard', industry: 'Community Association Manager' },
    'FarmLabor.csv': { type: 'farm', industry: 'Farm Labor' },
    're_salesperson.csv': { type: 'realestate', industry: 'Real Estate' }
};

// Parse standard DBPR format (no headers)
function parseStandardRow(columns, industry, filename) {
    const licNum = columns[12] || '';
    return {
        source: 'DBPR',
        source_id: licNum || `DBPR-${filename}-${Date.now()}-${Math.random().toString(36).substr(2,6)}`,
        business_name: columns[2] || '',
        dba: columns[3] || '',
        industry: industry,
        business_type: columns[1] || '',
        license_number: licNum,
        license_type: columns[1] || '',
        license_status: columns[14] === 'A' ? 'Active' : (columns[14] === 'I' ? 'Inactive' : columns[14] || ''),
        license_expiration: parseDate(columns[17]),
        contact_name: columns[2] || '',
        street_address: columns[5] || '',
        city: columns[8] || '',
        state: columns[9] || 'FL',
        zip_code: columns[10] || '',
        county: columns[11] || ''
    };
}

// Parse Farm Labor format
function parseFarmRow(columns, industry, filename) {
    const licNum = columns[12] || '';
    return {
        source: 'DBPR',
        source_id: licNum || `DBPR-FARM-${Date.now()}-${Math.random().toString(36).substr(2,6)}`,
        business_name: columns[2] || '',
        dba: columns[3] || '',
        industry: industry,
        business_type: columns[1] || 'Farm Labor',
        license_number: licNum,
        license_type: columns[1] || 'Farm Labor',
        license_status: columns[13] === '20 Current' ? 'Active' : 'Inactive',
        license_expiration: parseDate(columns[17]),
        contact_name: columns[2] || '',
        street_address: columns[5] || '',
        city: columns[8] || '',
        state: columns[9] || 'FL',
        zip_code: columns[10] || '',
        county: columns[11] || ''
    };
}

// Parse Real Estate format
function parseRealEstateRow(columns, industry, filename) {
    const licNum = columns[2] || '';
    const cityStateZip = columns[6] || '';
    const match = cityStateZip.match(/^(.+?)\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);
    
    return {
        source: 'DBPR',
        source_id: licNum || `DBPR-RE-${Date.now()}-${Math.random().toString(36).substr(2,6)}`,
        business_name: columns[3] || '',
        dba: '',
        industry: industry,
        business_type: columns[1] || columns[0] || '',
        license_number: licNum,
        license_type: columns[1] || columns[0] || '',
        license_status: 'Active',
        license_expiration: parseDate(columns[7]),
        contact_name: columns[3] || '',
        street_address: [columns[4], columns[5]].filter(Boolean).join(' ').trim(),
        city: match ? match[1].trim() : '',
        state: match ? match[2] : 'FL',
        zip_code: match ? match[3] : '',
        county: columns[10] || ''
    };
}

function parseDate(dateStr) {
    if (!dateStr) return null;
    const match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) {
        return `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
    }
    return null;
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

async function importFile(filename, config) {
    const filepath = path.join(DBPR_FOLDER, filename);
    
    if (!fs.existsSync(filepath)) {
        console.log(`   ⚠ File not found: ${filename}`);
        return 0;
    }
    
    const content = fs.readFileSync(filepath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    
    console.log(`   📄 ${filename}... (${lines.length.toLocaleString()} lines)`);
    
    let imported = 0;
    let errors = 0;
    const batchSize = 500;
    let batch = [];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const columns = parseCSVLine(line);
        
        let record;
        try {
            switch (config.type) {
                case 'standard':
                    record = parseStandardRow(columns, config.industry, filename);
                    break;
                case 'farm':
                    record = parseFarmRow(columns, config.industry, filename);
                    break;
                case 'realestate':
                    record = parseRealEstateRow(columns, config.industry, filename);
                    break;
                default:
                    record = parseStandardRow(columns, config.industry, filename);
            }
            
            // Skip if no name
            if (!record.business_name && !record.contact_name) {
                continue;
            }
            
            batch.push(record);
            
            if (batch.length >= batchSize) {
                const inserted = await insertBatch(batch);
                imported += inserted;
                batch = [];
                process.stdout.write(`\r   📄 ${filename}... ${imported.toLocaleString()} imported`);
            }
        } catch (err) {
            errors++;
        }
    }
    
    // Insert remaining
    if (batch.length > 0) {
        const inserted = await insertBatch(batch);
        imported += inserted;
    }
    
    console.log(`\r   📄 ${filename}... ✓ ${imported.toLocaleString()} records                    `);
    return imported;
}

async function insertBatch(records) {
    if (records.length === 0) return 0;
    
    const columns = [
        'source', 'source_id', 'business_name', 'dba', 'industry', 'business_type',
        'license_number', 'license_type', 'license_status', 'license_expiration',
        'contact_name', 'street_address', 'city', 'state', 'zip_code', 'county'
    ];
    
    const values = [];
    const placeholders = [];
    let idx = 1;
    
    for (const r of records) {
        const rowPlaceholders = columns.map(() => `$${idx++}`);
        placeholders.push(`(${rowPlaceholders.join(', ')})`);
        
        columns.forEach(col => {
            values.push(r[col] || null);
        });
    }
    
    const query = `
        INSERT INTO danimal_leads (${columns.join(', ')})
        VALUES ${placeholders.join(', ')}
        ON CONFLICT (source, source_id) DO UPDATE SET
            business_name = EXCLUDED.business_name,
            license_status = EXCLUDED.license_status,
            license_expiration = EXCLUDED.license_expiration,
            updated_at = NOW()
    `;
    
    try {
        const result = await pool.query(query, values);
        return result.rowCount;
    } catch (err) {
        // If batch fails, try one by one
        let inserted = 0;
        for (const r of records) {
            try {
                const singleQuery = `
                    INSERT INTO danimal_leads (${columns.join(', ')})
                    VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})
                    ON CONFLICT (source, source_id) DO NOTHING
                `;
                await pool.query(singleQuery, columns.map(col => r[col] || null));
                inserted++;
            } catch (e) {
                // Skip problematic record
            }
        }
        return inserted;
    }
}

async function main() {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║     DBPR Headerless File Import - FIXED                  ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');
    
    try {
        await pool.query('SELECT 1');
        console.log('✓ Database connected\n');
    } catch (err) {
        console.error('❌ Database connection failed:', err.message);
        process.exit(1);
    }
    
    const beforeResult = await pool.query('SELECT COUNT(*) FROM danimal_leads');
    const beforeCount = parseInt(beforeResult.rows[0].count);
    console.log(`📊 Records before import: ${beforeCount.toLocaleString()}\n`);
    
    let totalImported = 0;
    const startTime = Date.now();
    
    for (const [filename, config] of Object.entries(FILE_CONFIGS)) {
        const count = await importFile(filename, config);
        totalImported += count;
    }
    
    const afterResult = await pool.query('SELECT COUNT(*) FROM danimal_leads');
    const afterCount = parseInt(afterResult.rows[0].count);
    
    const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    
    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║                  IMPORT COMPLETE                         ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');
    console.log(`✓ Records processed: ${totalImported.toLocaleString()}`);
    console.log(`✓ Total in database: ${afterCount.toLocaleString()}`);
    console.log(`✓ New records added: ${(afterCount - beforeCount).toLocaleString()}`);
    console.log(`⏱ Duration: ${duration} minutes`);
    
    await pool.end();
}

main().catch(console.error);
