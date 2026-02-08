/**
 * COUNTY PROPERTY APPRAISER → DANIMAL DATA IMPORT
 * 
 * Supports: Lee, Collier, Charlotte, Sarasota counties
 * 
 * Download sources:
 * - Lee County: https://www.leepa.org/Data/DataDownloads.aspx
 * - Collier County: https://www.collierappraiser.com/main/DataSales
 * - Charlotte County: https://www.ccappraiser.com/downloads.asp
 * - Sarasota County: https://www.sc-pa.com/dataservices/
 * 
 * Run: node county-pa-import.js <county> <path-to-csv>
 * Example: node county-pa-import.js lee "C:\Users\17242\Downloads\lee_owners.csv"
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

// County-specific field mappings
const COUNTY_MAPPINGS = {
    lee: {
        parcel_id: ['strap', 'parcel_id', 'folio', 'account'],
        owner_name: ['own1', 'owner1', 'owner_name', 'owner'],
        owner_name2: ['own2', 'owner2'],
        mailing_address: ['madd1', 'mail_addr1', 'mailing_address_1'],
        mailing_address2: ['madd2', 'mail_addr2', 'mailing_address_2'],
        mailing_city: ['mcity', 'mail_city', 'mailing_city'],
        mailing_state: ['mstate', 'mail_state', 'mailing_state'],
        mailing_zip: ['mzip', 'mail_zip', 'mailing_zip'],
        site_address: ['saddr', 'site_addr', 'physical_address', 'prop_addr'],
        site_city: ['scity', 'site_city'],
        land_use: ['dession_cd', 'use_code', 'land_use_code'],
        just_value: ['jv', 'just_value', 'total_just_value']
    },
    collier: {
        parcel_id: ['folio', 'parcel_no', 'parcel_id'],
        owner_name: ['owner_name', 'owner1', 'name1'],
        mailing_address: ['mail_add1', 'mailing_street'],
        mailing_city: ['mail_city'],
        mailing_state: ['mail_state'],
        mailing_zip: ['mail_zip'],
        site_address: ['site_add', 'property_address'],
        land_use: ['use_code', 'dor_code']
    },
    charlotte: {
        parcel_id: ['account', 'parcel_id', 'acct'],
        owner_name: ['owner_name', 'owner1'],
        mailing_address: ['mail_address', 'mailing_add1'],
        mailing_city: ['mail_city'],
        mailing_state: ['mail_state'],
        mailing_zip: ['mail_zip'],
        site_address: ['site_address', 'physical_add']
    },
    sarasota: {
        parcel_id: ['account_no', 'parcel', 'acct_no'],
        owner_name: ['owner1_name', 'owner_name'],
        mailing_address: ['mail_addr1', 'mailing_address'],
        mailing_city: ['mail_city'],
        mailing_state: ['mail_state'],
        mailing_zip: ['mail_zip'],
        site_address: ['situs_addr', 'site_address']
    }
};

async function importCountyPA(county, filePath) {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║     COUNTY PROPERTY APPRAISER → DANIMAL DATA IMPORT        ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('');

    if (!county || !filePath) {
        console.error('Usage: node county-pa-import.js <county> <path-to-csv>');
        console.error('Counties: lee, collier, charlotte, sarasota');
        process.exit(1);
    }

    county = county.toLowerCase();
    const source = `${county}_county`;

    if (!COUNTY_MAPPINGS[county]) {
        console.error('Unknown county:', county);
        console.error('Supported: lee, collier, charlotte, sarasota');
        process.exit(1);
    }

    if (!fs.existsSync(filePath)) {
        console.error('File not found:', filePath);
        process.exit(1);
    }

    console.log(`[1/4] County: ${county.charAt(0).toUpperCase() + county.slice(1)}`);
    console.log(`      File: ${path.basename(filePath)}`);

    // Test PostgreSQL connection
    console.log('[2/4] Testing PostgreSQL connection...');
    try {
        const testResult = await pool.query(`SELECT COUNT(*) as cnt FROM danimal_leads WHERE source = $1`, [source]);
        console.log('      Connected. Existing records:', testResult.rows[0].cnt);
    } catch (err) {
        console.error('      PostgreSQL connection failed:', err.message);
        process.exit(1);
    }

    console.log('[3/4] Starting import...');

    const mapping = COUNTY_MAPPINGS[county];
    const startTime = Date.now();
    let imported = 0;
    let errors = 0;
    let headers = null;
    let isFirstLine = true;
    let batch = [];

    await new Promise((resolve, reject) => {
        const rl = readline.createInterface({
            input: fs.createReadStream(filePath, { encoding: 'utf8' }),
            crlfDelay: Infinity
        });

        rl.on('line', async (line) => {
            if (!line.trim()) return;

            if (isFirstLine) {
                headers = parseCSVLine(line).map(h => h.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''));
                isFirstLine = false;
                console.log('      Headers found:', headers.length);
                return;
            }

            const values = parseCSVLine(line);
            const record = {};
            headers.forEach((h, i) => {
                record[h] = values[i]?.trim() || null;
            });

            batch.push(record);

            if (batch.length >= BATCH_SIZE) {
                rl.pause();
                const result = await insertBatch(batch, source, mapping);
                imported += result.success;
                errors += result.failed;
                batch = [];

                if (imported % 5000 < BATCH_SIZE) {
                    process.stdout.write(`\r      Progress: ${imported.toLocaleString()} imported, ${errors} errors`);
                }

                rl.resume();
            }
        });

        rl.on('close', async () => {
            if (batch.length > 0) {
                const result = await insertBatch(batch, source, mapping);
                imported += result.success;
                errors += result.failed;
            }
            process.stdout.write('\n');
            resolve();
        });

        rl.on('error', reject);
    });

    const elapsed = (Date.now() - startTime) / 1000;

    console.log('[4/4] Import complete!');
    console.log('');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log(`║  County:   ${county.toUpperCase().padEnd(10)}                                  ║`);
    console.log(`║  Imported: ${imported.toLocaleString().padStart(10)} records                       ║`);
    console.log(`║  Errors:   ${errors.toLocaleString().padStart(10)} records                       ║`);
    console.log(`║  Time:     ${Math.round(elapsed).toLocaleString().padStart(10)} seconds                       ║`);
    console.log('╚════════════════════════════════════════════════════════════╝');

    await pool.end();
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

function findField(record, fieldNames) {
    for (const name of fieldNames) {
        if (record[name] !== undefined && record[name] !== null && record[name] !== '') {
            return record[name];
        }
    }
    return null;
}

async function insertBatch(records, source, mapping) {
    let success = 0;
    let failed = 0;

    for (const record of records) {
        try {
            const parcelId = findField(record, mapping.parcel_id);
            if (!parcelId) {
                failed++;
                continue;
            }

            let ownerName = findField(record, mapping.owner_name);
            const ownerName2 = mapping.owner_name2 ? findField(record, mapping.owner_name2) : null;
            if (ownerName2) {
                ownerName = ownerName + ' / ' + ownerName2;
            }

            let mailingAddress = findField(record, mapping.mailing_address);
            if (mapping.mailing_address2) {
                const addr2 = findField(record, mapping.mailing_address2);
                if (addr2) mailingAddress += ' ' + addr2;
            }

            await pool.query(`
                INSERT INTO danimal_leads (
                    source, source_id, business_name, contact_name,
                    street_address, city, state, zip_code,
                    industry, business_type, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
                ON CONFLICT DO NOTHING
            `, [
                source,
                parcelId,
                ownerName,
                ownerName,
                mailingAddress?.substring(0, 500),
                findField(record, mapping.mailing_city),
                findField(record, mapping.mailing_state) || 'FL',
                (findField(record, mapping.mailing_zip) || '')?.substring(0, 10),
                'Property Owner',
                findField(record, mapping.land_use) || 'Real Estate'
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
const county = process.argv[2];
const filePath = process.argv[3];
importCountyPA(county, filePath).catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
