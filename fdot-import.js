/**
 * FDOT TRAFFIC DATA ? DANIMAL DATA IMPORT
 * Annual Average Daily Traffic (AADT) counts
 */

const fs = require('fs');
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

async function importFDOT(filePath) {
    console.log('+------------------------------------------------------------+');
    console.log('¦     FDOT TRAFFIC DATA IMPORT                               ¦');
    console.log('+------------------------------------------------------------+\n');

    if (!fs.existsSync(filePath)) {
        console.error('File not found:', filePath);
        process.exit(1);
    }

    console.log(`[1/3] File: ${filePath.split('\\').pop()}`);

    console.log('[2/3] Connecting to PostgreSQL...');
    const testResult = await pool.query("SELECT COUNT(*) as cnt FROM danimal_leads WHERE source = 'fdot'");
    console.log('      Existing FDOT records:', testResult.rows[0].cnt);

    console.log('[3/3] Starting import...\n');

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
            headers = line.split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
            console.log('      Columns:', headers.join(', '));
            continue;
        }

        rowNum++;
        const values = parseCSVLine(line);
        const record = { _row: rowNum };
        headers.forEach((h, i) => record[h] = values[i]?.trim() || null);

        batch.push(record);

        if (batch.length >= BATCH_SIZE) {
            const result = await insertBatch(batch);
            imported += result.success;
            errors += result.failed;
            batch = [];

            process.stdout.write(`\r      Imported: ${imported.toLocaleString()} | Errors: ${errors}`);
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
    console.log('+------------------------------------------------------------+');

    await pool.end();
}

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') inQuotes = !inQuotes;
        else if (char === ',' && !inQuotes) { result.push(current); current = ''; }
        else current += char;
    }
    result.push(current);
    return result;
}

async function insertBatch(records) {
    if (records.length === 0) return { success: 0, failed: 0 };

    const values = [];
    const placeholders = [];
    let paramIndex = 1;

    for (const r of records) {
        // Build descriptive name: "ROADWAY: FROM to TO (AADT vehicles/day)"
        const roadway = r.roadway || r.cosite || '';
        const descFrom = r.desc_frm || r.desc_from || '';
        const descTo = r.desc_to || '';
        const aadt = r.aadt || '0';
        const county = r.county || r.countydot || '';
        
        const businessName = `${roadway}: ${descFrom} to ${descTo}`.substring(0, 500);
        const sourceId = `FDOT-${r.cosite || r._row}-${r.year_ || '2024'}`;

        values.push(
            'fdot',
            sourceId,
            businessName,
            `AADT: ${parseInt(aadt).toLocaleString()} vehicles/day`,  // contact_name field stores traffic count
            null,  // phone
            null,  // email
            `${descFrom} to ${descTo}`.substring(0, 500),  // street_address
            county,  // city = county
            'FL',
            null,  // zip
            'Transportation',
            `Traffic Count - District ${r.district || ''}`,
            r.cosite || null,  // license_number = cosite ID
            'Active'
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

const filePath = process.argv[2] || process.env.HOME + '\\Downloads\\Annual_Average_Daily_Traffic_(SECTADT).csv';
importFDOT(filePath).catch(err => { console.error('Fatal:', err); process.exit(1); });
