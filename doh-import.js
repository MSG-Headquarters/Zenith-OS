/**
 * DOH MEDICAL LICENSES → DANIMAL DATA IMPORT
 * 
 * Downloads available from: https://data-download.mqa.flhealthsource.gov/
 * Files: licenseepractitionerdump.zip (237MB) + healthcarefacilities.zip (77MB)
 * 
 * Run: node doh-import.js <path-to-extracted-folder>
 * Example: node doh-import.js "C:\Users\17242\Downloads\DOH-Data"
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { Pool } = require('pg');
require('dotenv').config();

// Configuration
const BATCH_SIZE = 500;

// PostgreSQL connection
const pool = new Pool({
    host: process.env.DB_HOST || 'zenith-db.cnqawc0wy3sg.us-east-2.rds.amazonaws.com',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'zenith_db',
    user: process.env.DB_USER || 'zenith_admin',
    password: process.env.DB_PASSWORD || 'ZenithDB2026secure',
    ssl: { rejectUnauthorized: false }
});

// License type mapping
const LICENSE_TYPES = {
    'MD': 'Physician (MD)',
    'DO': 'Physician (DO)',
    'RN': 'Registered Nurse',
    'LPN': 'Licensed Practical Nurse',
    'ARNP': 'Advanced Practice Nurse',
    'PA': 'Physician Assistant',
    'DDS': 'Dentist',
    'DMD': 'Dentist',
    'RPH': 'Pharmacist',
    'PT': 'Physical Therapist',
    'OT': 'Occupational Therapist',
    'DC': 'Chiropractor',
    'DPM': 'Podiatrist',
    'OD': 'Optometrist',
    'PSY': 'Psychologist',
    'LCSW': 'Clinical Social Worker',
    'LMHC': 'Mental Health Counselor',
    'LMFT': 'Marriage & Family Therapist'
};

async function importDOH(dataDir) {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║     FL DOH MEDICAL LICENSES → DANIMAL DATA IMPORT          ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('');

    if (!dataDir) {
        console.error('Usage: node doh-import.js <path-to-data-folder>');
        console.error('Download data from: https://data-download.mqa.flhealthsource.gov/');
        process.exit(1);
    }

    // Find data files
    const files = fs.readdirSync(dataDir).filter(f => 
        f.endsWith('.txt') || f.endsWith('.csv')
    );

    if (files.length === 0) {
        console.error('No .txt or .csv files found in:', dataDir);
        process.exit(1);
    }

    console.log('[1/4] Found files:', files.join(', '));

    // Test PostgreSQL connection
    console.log('[2/4] Testing PostgreSQL connection...');
    try {
        const testResult = await pool.query("SELECT COUNT(*) as cnt FROM danimal_leads WHERE source = 'doh'");
        console.log('      Connected. Existing DOH records:', testResult.rows[0].cnt);
    } catch (err) {
        console.error('      PostgreSQL connection failed:', err.message);
        process.exit(1);
    }

    console.log('[3/4] Starting import...');

    let totalImported = 0;
    let totalErrors = 0;
    const startTime = Date.now();

    for (const file of files) {
        const filePath = path.join(dataDir, file);
        console.log(`\n      Processing: ${file}`);

        const result = await processFile(filePath);
        totalImported += result.imported;
        totalErrors += result.errors;

        console.log(`      → Imported: ${result.imported.toLocaleString()}, Errors: ${result.errors}`);
    }

    const elapsed = (Date.now() - startTime) / 1000;

    console.log('\n[4/4] Import complete!');
    console.log('');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log(`║  Total Imported: ${totalImported.toLocaleString().padStart(10)} records                     ║`);
    console.log(`║  Total Errors:   ${totalErrors.toLocaleString().padStart(10)} records                     ║`);
    console.log(`║  Time:           ${Math.round(elapsed).toLocaleString().padStart(10)} seconds                     ║`);
    console.log('╚════════════════════════════════════════════════════════════╝');

    await pool.end();
}

async function processFile(filePath) {
    return new Promise((resolve, reject) => {
        let imported = 0;
        let errors = 0;
        let headers = null;
        let isFirstLine = true;
        let batch = [];

        const rl = readline.createInterface({
            input: fs.createReadStream(filePath, { encoding: 'utf8' }),
            crlfDelay: Infinity
        });

        rl.on('line', async (line) => {
            // Skip empty lines
            if (!line.trim()) return;

            // Parse header
            if (isFirstLine) {
                // Handle tab or comma delimited
                headers = line.includes('\t') 
                    ? line.split('\t').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'))
                    : parseCSVLine(line).map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
                isFirstLine = false;
                return;
            }

            // Parse data line
            const values = line.includes('\t') 
                ? line.split('\t') 
                : parseCSVLine(line);

            const record = {};
            headers.forEach((h, i) => {
                record[h] = values[i]?.trim() || null;
            });

            batch.push(record);

            // Process batch
            if (batch.length >= BATCH_SIZE) {
                rl.pause();
                const result = await insertBatch(batch);
                imported += result.success;
                errors += result.failed;
                batch = [];

                // Progress update
                if (imported % 10000 < BATCH_SIZE) {
                    process.stdout.write(`\r      Progress: ${imported.toLocaleString()} imported, ${errors} errors`);
                }

                rl.resume();
            }
        });

        rl.on('close', async () => {
            // Process remaining
            if (batch.length > 0) {
                const result = await insertBatch(batch);
                imported += result.success;
                errors += result.failed;
            }
            process.stdout.write('\n');
            resolve({ imported, errors });
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
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current);
    return result;
}

async function insertBatch(records) {
    let success = 0;
    let failed = 0;

    for (const record of records) {
        try {
            // Map DOH fields to danimal_leads
            const licenseType = record.profession_name || record.license_type || record.board_name || '';
            const licenseCode = record.profession_code || record.license_prefix || '';
            
            // Build full name
            let contactName = null;
            if (record.first_name || record.last_name) {
                contactName = [record.first_name, record.middle_name, record.last_name]
                    .filter(Boolean)
                    .join(' ')
                    .trim();
            } else if (record.licensee_name || record.name) {
                contactName = record.licensee_name || record.name;
            }

            // Build address
            let streetAddress = record.street_address || record.address_line_1 || record.mailing_address_1;
            if (record.address_line_2 || record.mailing_address_2) {
                streetAddress += ' ' + (record.address_line_2 || record.mailing_address_2);
            }

            await pool.query(`
                INSERT INTO danimal_leads (
                    source, source_id, business_name, contact_name,
                    phone, email, street_address, city, state, zip_code,
                    industry, business_type, license_number, license_status,
                    license_expiration, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
                ON CONFLICT DO NOTHING
            `, [
                'doh',
                record.license_number || record.license_no || record.me_number,
                record.business_name || record.facility_name || record.employer_name || contactName,
                contactName,
                record.phone || record.telephone || null,
                record.email || record.email_address || null,
                streetAddress?.substring(0, 500),
                record.city || record.mailing_city,
                record.state || record.mailing_state || 'FL',
                (record.zip_code || record.zip || record.mailing_zip || '')?.substring(0, 10),
                LICENSE_TYPES[licenseCode] || licenseType || 'Healthcare',
                licenseType?.substring(0, 100),
                record.license_number || record.license_no,
                record.license_status || record.status || 'Active',
                record.expiration_date || record.license_expiration || null
            ]);
            success++;
        } catch (e) {
            failed++;
            if (failed <= 3) {
                console.error('\n      Error:', e.message);
            }
        }
    }

    return { success, failed };
}

// Run
const dataDir = process.argv[2];
importDOH(dataDir).catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
