/**
 * DOH MEDICAL LICENSES ? DANIMAL DATA IMPORT (FIXED)
 * Uses composite source_id to avoid duplicates
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { Pool } = require('pg');

const BATCH_SIZE = 500;

const pool = new Pool({
    host: 'zenith-db.cnqawc0wy3sg.us-east-2.rds.amazonaws.com',
    port: 5432,
    database: 'zenith_db',
    user: 'zenith_admin',
    password: 'ZenithDB2026secure',
    ssl: { rejectUnauthorized: false },
    max: 10
});

async function importDOH(dataDir) {
    console.log('+------------------------------------------------------------+');
    console.log('¦     FL DOH MEDICAL LICENSES - FIXED IMPORT                 ¦');
    console.log('+------------------------------------------------------------+\n');

    const filePath = path.join(dataDir, 'PROF_ALL.txt');
    if (!fs.existsSync(filePath)) {
        console.error('File not found:', filePath);
        process.exit(1);
    }

    console.log(`[1/4] File: PROF_ALL.txt (${(fs.statSync(filePath).size / 1024 / 1024).toFixed(0)} MB)`);

    console.log('[2/4] Connecting to PostgreSQL...');
    const testResult = await pool.query("SELECT COUNT(*) as cnt FROM danimal_leads WHERE source = 'doh'");
    console.log('      Existing DOH records:', testResult.rows[0].cnt);

    // Clear old DOH records to reimport cleanly
    console.log('[3/4] Clearing old DOH records for clean import...');
    await pool.query("DELETE FROM danimal_leads WHERE source = 'doh'");
    console.log('      Cleared.');

    console.log('[4/4] Starting batch import...\n');

    const startTime = Date.now();
    let imported = 0, errors = 0, rowNum = 0;
    let headers = null;
    let batch = [];

    const rl = readline.createInterface({
        input: fs.createReadStream(filePath, { encoding: 'utf8' }),
        crlfDelay: Infinity
    });

    for await (const line of rl) {
        if (!line.trim()) continue;

        if (!headers) {
            headers = line.split('|').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
            console.log('      Columns:', headers.length);
            continue;
        }

        rowNum++;
        const values = line.split('|');
        const record = { _row: rowNum };
        headers.forEach((h, i) => record[h] = values[i]?.trim() || null);

        batch.push(record);

        if (batch.length >= BATCH_SIZE) {
            const result = await insertBatch(batch);
            imported += result.success;
            errors += result.failed;
            batch = [];

            const elapsed = (Date.now() - startTime) / 1000;
            const rate = Math.round(imported / elapsed);
            process.stdout.write(`\r      Imported: ${imported.toLocaleString()} | Errors: ${errors} | Rate: ${rate}/sec    `);
        }
    }

    if (batch.length > 0) {
        const result = await insertBatch(batch);
        imported += result.success;
        errors += result.failed;
    }

    const elapsed = (Date.now() - startTime) / 1000;
    console.log('\n\n+------------------------------------------------------------+');
    console.log(`¦  Imported: ${imported.toLocaleString().padStart(12)} records                       ¦`);
    console.log(`¦  Errors:   ${errors.toLocaleString().padStart(12)} records                       ¦`);
    console.log(`¦  Time:     ${Math.round(elapsed).toLocaleString().padStart(12)} seconds                       ¦`);
    console.log(`¦  Rate:     ${Math.round(imported/elapsed).toLocaleString().padStart(12)} records/sec                   ¦`);
    console.log('+------------------------------------------------------------+');

    await pool.end();
}

async function insertBatch(records) {
    if (records.length === 0) return { success: 0, failed: 0 };

    const values = [];
    const placeholders = [];
    let paramIndex = 1;

    for (const r of records) {
        // Create unique source_id using row number + license + profession
        const licNum = r.license_number || r.license_no || r.license_nbr || '';
        const profCode = r.profession_code || r.prof_code || r.board_code || '';
        const sourceId = `DOH-${r._row}-${licNum}-${profCode}`.substring(0, 100);

        const contactName = [r.first_name, r.middle_name, r.last_name].filter(Boolean).join(' ').trim() || 
                           r.licensee_name || r.full_name || null;
        
        let addr = r.address_1 || r.street_address || r.address_line_1 || r.mailing_address_1 || '';
        if (r.address_2 || r.address_line_2) addr += ' ' + (r.address_2 || r.address_line_2);

        values.push(
            'doh',
            sourceId,
            contactName,  // business_name = person name for medical
            contactName,
            r.phone || r.telephone || r.phone_number || null,
            r.email || r.email_address || null,
            addr?.substring(0, 500) || null,
            r.city || r.mail_city || null,
            r.state || r.mail_state || 'FL',
            (r.zip || r.zip_code || r.zipcode || r.mail_zip || '')?.toString().substring(0, 10) || null,
            r.profession_name || r.profession || r.license_type || 'Healthcare',
            r.board_name || r.board || profCode || null,
            licNum || null,
            r.status || r.license_status || 'Active'
        );

        const idx = (paramIndex - 1) * 14;
        placeholders.push(`($${idx+1},$${idx+2},$${idx+3},$${idx+4},$${idx+5},$${idx+6},$${idx+7},$${idx+8},$${idx+9},$${idx+10},$${idx+11},$${idx+12},$${idx+13},$${idx+14},NOW())`);
        paramIndex++;
    }

    try {
        await pool.query(`
            INSERT INTO danimal_leads (
                source, source_id, business_name, contact_name,
                phone, email, street_address, city, state, zip_code,
                industry, business_type, license_number, license_status, created_at
            ) VALUES ${placeholders.join(',')}
            ON CONFLICT (source, source_id) DO NOTHING
        `, values);
        return { success: records.length, failed: 0 };
    } catch (e) {
        console.error('\nBatch error:', e.message.substring(0, 100));
        return { success: 0, failed: records.length };
    }
}

const dataDir = process.argv[2];
if (!dataDir) {
    console.error('Usage: node doh-import-fixed.js <path-to-folder>');
    process.exit(1);
}
importDOH(dataDir).catch(err => { console.error('Fatal:', err); process.exit(1); });
