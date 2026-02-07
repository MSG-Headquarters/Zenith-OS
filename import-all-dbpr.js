require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const DBPR_FOLDER = path.join(__dirname, 'dbpr-downloads');

// ═══════════════════════════════════════════════════════════════
//  FILE CONFIGS - All 67 DBPR CSV files
// ═══════════════════════════════════════════════════════════════
const FILE_CONFIGS = {
    // ── Alcoholic Beverages & Tobacco ──────────────────────────
    'bd4001lic.csv':  { type: 'standard', industry: 'Alcoholic Beverages', subtype: 'Distributor' },
    'bd4002lic.csv':  { type: 'standard', industry: 'Alcoholic Beverages', subtype: 'Manufacturer' },
    'bd4003lic.csv':  { type: 'standard', industry: 'Alcoholic Beverages', subtype: 'Vendor' },
    'bd4004lic.csv':  { type: 'standard', industry: 'Alcoholic Beverages', subtype: 'Broker' },
    'bd4005lic.csv':  { type: 'standard', industry: 'Alcoholic Beverages', subtype: 'Sales Agent' },
    'bd4006lic.csv':  { type: 'standard', industry: 'Alcoholic Beverages', subtype: 'Retail' },
    'bd4007lic.csv':  { type: 'standard', industry: 'Alcoholic Beverages', subtype: 'Special' },
    'bd4008lic.csv':  { type: 'standard', industry: 'Alcoholic Beverages', subtype: 'Brand Registration' },
    'bd400lic.csv':   { type: 'standard', industry: 'Alcoholic Beverages', subtype: 'All Licenses' },
    'bd4011lic.csv':  { type: 'standard', industry: 'Alcoholic Beverages', subtype: 'Caterer' },
    'bd4012lic.csv':  { type: 'standard', industry: 'Tobacco', subtype: 'Tobacco Permit' },
    'bd4013lic.csv':  { type: 'standard', industry: 'Tobacco', subtype: 'Tobacco Dealer' },
    'bd4014lic.csv':  { type: 'standard', industry: 'Tobacco', subtype: 'Tobacco Special' },
    'bdTOBlic.csv':   { type: 'standard', industry: 'Tobacco', subtype: 'All Tobacco' },

    // ── Building & Construction ────────────────────────────────
    'BuildingCodeLicensee.csv':   { type: 'standard', industry: 'Building Code' },
    'CONSTRUCTIONLICENSE_1.csv':  { type: 'standard', industry: 'Construction' },

    // ── Condominiums ───────────────────────────────────────────
    'condo_CE.csv':  { type: 'standard', industry: 'Condominiums', subtype: 'Central' },
    'Condo_CW.csv':  { type: 'standard', industry: 'Condominiums', subtype: 'Central West' },
    'Condo_MD.csv':  { type: 'standard', industry: 'Condominiums', subtype: 'Miami-Dade' },
    'Condo_NF.csv':  { type: 'standard', industry: 'Condominiums', subtype: 'North Florida' },
    'condo_PB.csv':  { type: 'standard', industry: 'Condominiums', subtype: 'Palm Beach' },

    // ── Cosmetology ────────────────────────────────────────────
    'COSMETOLOGYLICENSE_1.csv':  { type: 'standard', industry: 'Cosmetology' },

    // ── Elevator ───────────────────────────────────────────────
    'elv_prmt.csv':  { type: 'standard', industry: 'Elevator', subtype: 'Permits' },

    // ── Exams / Applications ───────────────────────────────────
    'examappl38cam.csv':  { type: 'standard', industry: 'Community Association Manager', subtype: 'Exam Applicants' },
    'examappr06cn.csv':   { type: 'standard', industry: 'Construction', subtype: 'Exam Approvals' },
    'examegbl02ai.csv':   { type: 'standard', industry: 'Asbestos/Lead', subtype: 'Exam' },

    // ── Farm Labor ─────────────────────────────────────────────
    'FarmLabor.csv':  { type: 'farm', industry: 'Farm Labor' },

    // ── Hotels & Restaurants (Food) ────────────────────────────
    'hrfood1.csv':  { type: 'standard', industry: 'Food Service', subtype: 'District 1' },
    'hrfood2.csv':  { type: 'standard', industry: 'Food Service', subtype: 'District 2' },
    'hrfood3.csv':  { type: 'standard', industry: 'Food Service', subtype: 'District 3' },
    'hrfood4.csv':  { type: 'standard', industry: 'Food Service', subtype: 'District 4' },
    'hrfood5.csv':  { type: 'standard', industry: 'Food Service', subtype: 'District 5' },
    'hrfood6.csv':  { type: 'standard', industry: 'Food Service', subtype: 'District 6' },
    'hrfood7.csv':  { type: 'standard', industry: 'Food Service', subtype: 'District 7' },

    // ── Hotels & Restaurants (Lodging) ─────────────────────────
    'hrlodge1.csv':  { type: 'standard', industry: 'Lodging', subtype: 'District 1' },
    'hrlodge2.csv':  { type: 'standard', industry: 'Lodging', subtype: 'District 2' },
    'hrlodge3.csv':  { type: 'standard', industry: 'Lodging', subtype: 'District 3' },
    'hrlodge4.csv':  { type: 'standard', industry: 'Lodging', subtype: 'District 4' },
    'hrlodge5.csv':  { type: 'standard', industry: 'Lodging', subtype: 'District 5' },
    'hrlodge6.csv':  { type: 'standard', industry: 'Lodging', subtype: 'District 6' },
    'hrlodge7.csv':  { type: 'standard', industry: 'Lodging', subtype: 'District 7' },
    'newlodg.csv':   { type: 'standard', industry: 'Lodging', subtype: 'New Lodging' },

    // ── Professional Licenses ──────────────────────────────────
    'lic02ai.csv':   { type: 'standard', industry: 'Asbestos/Lead Abatement' },
    'lic03bb.csv':   { type: 'standard', industry: 'Barbers & Cosmetology' },
    'lic04home.csv': { type: 'standard', industry: 'Home Inspection' },
    'lic07mold.csv': { type: 'standard', industry: 'Mold Remediation' },
    'lic08el.csv':   { type: 'standard', industry: 'Electrical' },
    'lic09insp.csv': { type: 'standard', industry: 'Inspectors' },
    'lic13la.csv':   { type: 'standard', industry: 'Landscape Architecture' },
    'lic23hp.csv':   { type: 'standard', industry: 'Harbor Pilots' },
    'lic26vt.csv':   { type: 'standard', industry: 'Veterinary' },
    'lic33ddc.csv':  { type: 'standard', industry: 'Drugs Devices Cosmetics' },
    'lic38cam.csv':  { type: 'standard', industry: 'Community Association Manager' },
    'lic48auc.csv':  { type: 'standard', industry: 'Auctioneers' },
    'lic53gl.csv':   { type: 'standard', industry: 'Geologists' },
    'lic59asb.csv':  { type: 'standard', industry: 'Asbestos' },
    'lic60ath.csv':  { type: 'standard', industry: 'Athletes/Boxing' },
    'lic63elc.csv':  { type: 'standard', industry: 'Electrical Contractors' },
    'lic64appr.csv': { type: 'standard', industry: 'Appraisers' },

    // ── Real Estate ────────────────────────────────────────────
    're_salesperson.csv':           { type: 'realestate', industry: 'Real Estate', subtype: 'Sales Associate' },
    'REALESTATE2501LICENSE_1.csv':  { type: 'realestate', industry: 'Real Estate', subtype: 'All Licenses' },
    'RealEstateCorpLicense.csv':    { type: 'realestate', industry: 'Real Estate', subtype: 'Corporate' },
    'RealEstateSchoolLicense.csv':  { type: 'realestate', industry: 'Real Estate', subtype: 'Schools' },

    // ── Other ──────────────────────────────────────────────────
    'company.csv':     { type: 'standard', industry: 'General Business', subtype: 'Companies' },
    'ysmailing.csv':   { type: 'standard', industry: 'General Business', subtype: 'Mailing List' },
};

// ═══════════════════════════════════════════════════════════════
//  PARSERS
// ═══════════════════════════════════════════════════════════════

function parseStandardRow(columns, config, filename) {
    const licNum = columns[12] || '';
    const industry = config.subtype ? `${config.industry} - ${config.subtype}` : config.industry;
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

function parseFarmRow(columns, config, filename) {
    const licNum = columns[12] || '';
    return {
        source: 'DBPR',
        source_id: licNum || `DBPR-FARM-${Date.now()}-${Math.random().toString(36).substr(2,6)}`,
        business_name: columns[2] || '',
        dba: columns[3] || '',
        industry: config.industry,
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

function parseRealEstateRow(columns, config, filename) {
    const licNum = columns[2] || '';
    const cityStateZip = columns[6] || '';
    const match = cityStateZip.match(/^(.+?)\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);
    const subtype = config.subtype ? ` - ${config.subtype}` : '';

    return {
        source: 'DBPR',
        source_id: licNum || `DBPR-RE-${Date.now()}-${Math.random().toString(36).substr(2,6)}`,
        business_name: columns[3] || '',
        dba: '',
        industry: `Real Estate${subtype}`,
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

// ═══════════════════════════════════════════════════════════════
//  IMPORT LOGIC
// ═══════════════════════════════════════════════════════════════

async function importFile(filename, config) {
    const filepath = path.join(DBPR_FOLDER, filename);

    if (!fs.existsSync(filepath)) {
        console.log(`   [SKIP] File not found: ${filename}`);
        return 0;
    }

    const stat = fs.statSync(filepath);
    if (stat.size === 0) {
        console.log(`   [SKIP] Empty file: ${filename}`);
        return 0;
    }

    const content = fs.readFileSync(filepath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());

    if (lines.length === 0) {
        console.log(`   [SKIP] No data in: ${filename}`);
        return 0;
    }

    // Detect if first line is a header (contains common header words)
    const firstLine = lines[0].toLowerCase();
    const hasHeader = firstLine.includes('licensee') || firstLine.includes('license_number') ||
                      firstLine.includes('name') || firstLine.includes('address') ||
                      firstLine.includes('county') || firstLine.includes('status');
    const startLine = hasHeader ? 1 : 0;

    const totalLines = lines.length - startLine;
    console.log(`   [${filename}] ${totalLines.toLocaleString()} lines${hasHeader ? ' (header detected)' : ''}...`);

    let imported = 0;
    let errors = 0;
    const batchSize = 500;
    let batch = [];

    for (let i = startLine; i < lines.length; i++) {
        const line = lines[i];
        const columns = parseCSVLine(line);

        let record;
        try {
            switch (config.type) {
                case 'farm':
                    record = parseFarmRow(columns, config, filename);
                    break;
                case 'realestate':
                    record = parseRealEstateRow(columns, config, filename);
                    break;
                default:
                    record = parseStandardRow(columns, config, filename);
            }

            // Skip if no useful data
            if (!record.business_name && !record.contact_name) continue;

            batch.push(record);

            if (batch.length >= batchSize) {
                const inserted = await insertBatch(batch);
                imported += inserted;
                batch = [];
                process.stdout.write(`\r   [${filename}] ${imported.toLocaleString()} imported...`);
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

    console.log(`\r   [${filename}] DONE: ${imported.toLocaleString()} records` + (errors > 0 ? ` (${errors} errors)` : '') + '                    ');
    return imported;
}

async function insertBatch(records) {
    if (records.length === 0) return 0;

    const columns = [
        'source', 'source_id', 'business_name', 'dba', 'industry', 'business_type',
        'license_number', 'license_type', 'license_status', 'license_expiration',
        'contact_name', 'street_address', 'city', 'state', 'zip_code', 'county'
    ];

    const placeholders = [];
    const values = [];
    let paramIndex = 1;

    for (const r of records) {
        const row = columns.map(() => `$${paramIndex++}`);
        placeholders.push(`(${row.join(', ')})`);
        columns.forEach(col => {
            values.push(r[col] || null);
        });
    }

    const query = `
        INSERT INTO danimal_leads (${columns.join(', ')})
        VALUES ${placeholders.join(', ')}
        ON CONFLICT (source, source_id) DO UPDATE SET
            business_name = EXCLUDED.business_name,
            industry = EXCLUDED.industry,
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

// ═══════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════

async function main() {
    console.log('');
    console.log('================================================================');
    console.log('  DBPR COMPLETE IMPORT - All 67 Files');
    console.log('  Danimal Data | Zenith OS');
    console.log('================================================================');
    console.log('');

    try {
        await pool.query('SELECT 1');
        console.log('  Database connected\n');
    } catch (err) {
        console.error('  Database connection failed:', err.message);
        process.exit(1);
    }

    const beforeResult = await pool.query('SELECT COUNT(*) FROM danimal_leads');
    const beforeCount = parseInt(beforeResult.rows[0].count);
    console.log(`  Records before import: ${beforeCount.toLocaleString()}\n`);

    // List available files
    const availableFiles = Object.keys(FILE_CONFIGS).filter(f => {
        const fp = path.join(DBPR_FOLDER, f);
        return fs.existsSync(fp) && fs.statSync(fp).size > 0;
    });
    const missingFiles = Object.keys(FILE_CONFIGS).filter(f => {
        const fp = path.join(DBPR_FOLDER, f);
        return !fs.existsSync(fp) || fs.statSync(fp).size === 0;
    });

    console.log(`  Files found: ${availableFiles.length} / ${Object.keys(FILE_CONFIGS).length}`);
    if (missingFiles.length > 0) {
        console.log(`  Missing/empty: ${missingFiles.join(', ')}`);
    }
    console.log('');

    let totalImported = 0;
    const startTime = Date.now();
    let fileCount = 0;

    for (const [filename, config] of Object.entries(FILE_CONFIGS)) {
        fileCount++;
        const count = await importFile(filename, config);
        totalImported += count;
    }

    const afterResult = await pool.query('SELECT COUNT(*) FROM danimal_leads');
    const afterCount = parseInt(afterResult.rows[0].count);
    const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

    // Summary by industry
    const industries = await pool.query(
        'SELECT industry, COUNT(*) as count FROM danimal_leads GROUP BY industry ORDER BY count DESC LIMIT 20'
    );

    console.log('');
    console.log('================================================================');
    console.log('  IMPORT COMPLETE');
    console.log('================================================================');
    console.log('');
    console.log(`  Records processed:  ${totalImported.toLocaleString()}`);
    console.log(`  Total in database:  ${afterCount.toLocaleString()}`);
    console.log(`  New records added:  ${(afterCount - beforeCount).toLocaleString()}`);
    console.log(`  Duration:           ${duration} minutes`);
    console.log('');
    console.log('  Top industries:');
    industries.rows.forEach(r => {
        console.log(`    ${r.industry.padEnd(40)} ${Number(r.count).toLocaleString()}`);
    });
    console.log('');
    console.log('  CHRIST IS KING');
    console.log('');

    await pool.end();
}

main().catch(err => {
    console.error('Fatal error:', err);
    pool.end();
    process.exit(1);
});
