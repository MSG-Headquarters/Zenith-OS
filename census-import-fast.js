/**
 * CENSUS DATA ? DANIMAL DATA HUB (FAST BATCH)
 * True batch INSERT with multi-row statements
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
    host: 'zenith-db.cnqawc0wy3sg.us-east-2.rds.amazonaws.com',
    port: 5432,
    database: 'zenith_db',
    user: 'zenith_admin',
    password: 'ZenithDB2026secure',
    ssl: { rejectUnauthorized: false },
    max: 10
});

async function importAllCensus(baseDir) {
    console.log('+------------------------------------------------------------+');
    console.log('¦     CENSUS DATA ? DANIMAL DATA HUB (FAST)                  ¦');
    console.log('+------------------------------------------------------------+\n');

    // Create tables
    console.log('[1/4] Creating tables...');
    
    await pool.query(`
        DROP TABLE IF EXISTS danimal_census CASCADE;
        DROP TABLE IF EXISTS danimal_economic CASCADE;
        
        CREATE TABLE danimal_census (
            id SERIAL PRIMARY KEY,
            geo_id VARCHAR(50) NOT NULL,
            geo_name VARCHAR(255),
            geo_type VARCHAR(50),
            table_id VARCHAR(50) NOT NULL,
            survey VARCHAR(20),
            year INTEGER,
            total_population INTEGER,
            metrics JSONB,
            created_at TIMESTAMP DEFAULT NOW()
        );

        CREATE TABLE danimal_economic (
            id SERIAL PRIMARY KEY,
            time_period VARCHAR(20) NOT NULL,
            geo_id VARCHAR(50) NOT NULL,
            geo_name VARCHAR(255),
            data_type_code VARCHAR(20),
            data_type_label VARCHAR(255),
            value_millions DECIMAL(15,2),
            year INTEGER,
            quarter INTEGER,
            created_at TIMESTAMP DEFAULT NOW()
        );
    `);
    console.log('      Tables ready.\n');

    // Find all data files
    const allFiles = [];
    function findFiles(dir) {
        for (const item of fs.readdirSync(dir)) {
            const full = path.join(dir, item);
            if (fs.statSync(full).isDirectory()) findFiles(full);
            else if (item.endsWith('-Data.csv')) allFiles.push(full);
        }
    }
    findFiles(baseDir);
    
    console.log(`[2/4] Found ${allFiles.length} data files\n`);
    console.log('[3/4] Importing...\n');

    let acsTotal = 0, econTotal = 0;

    for (const filePath of allFiles) {
        const fileName = path.basename(filePath);
        process.stdout.write(`      ${fileName.substring(0,40).padEnd(42)}`);
        
        if (fileName.startsWith('ACS')) {
            const cnt = await importACS(filePath);
            acsTotal += cnt;
            console.log(`? ${cnt} rows`);
        } else if (fileName.startsWith('EITSQTAX')) {
            const cnt = await importEcon(filePath);
            econTotal += cnt;
            console.log(`? ${cnt} rows`);
        } else {
            console.log('skipped');
        }
    }

    console.log('\n[4/4] Complete!\n');
    console.log('+------------------------------------------------------------+');
    console.log(`¦  ACS Demographics:    ${acsTotal.toString().padStart(8)} records                ¦`);
    console.log(`¦  Economic Indicators: ${econTotal.toString().padStart(8)} records                ¦`);
    console.log(`¦  Total:               ${(acsTotal + econTotal).toString().padStart(8)} records                ¦`);
    console.log('+------------------------------------------------------------+');

    await pool.end();
}

async function importACS(filePath) {
    const fileName = path.basename(filePath);
    const match = fileName.match(/ACS(DT|ST)(\d)Y(\d{4})\.([A-Z0-9]+)-Data\.csv/);
    if (!match) return 0;

    const survey = `ACS${match[2]}Y${match[3]}`;
    const year = parseInt(match[3]);
    const tableId = match[4];

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length < 3) return 0;

    const headers = parseCSV(lines[0]);
    const labels = parseCSV(lines[1]);

    const values = [];
    const placeholders = [];
    let idx = 1;

    for (let i = 2; i < lines.length; i++) {
        const row = parseCSV(lines[i]);
        if (row.length < 3) continue;

        const geoId = row[0];
        const geoName = row[1];
        let geoType = 'other';
        if (geoId.includes('0400000US')) geoType = 'state';
        else if (geoId.includes('0500000US')) geoType = 'county';
        else if (geoId.startsWith('310')) geoType = 'metro';

        const totalPop = parseInt(row[2]) || null;

        const metrics = {};
        headers.forEach((h, j) => {
            if (j > 1 && row[j] && row[j] !== '*****') {
                const v = parseFloat(row[j]);
                metrics[h] = { label: labels[j], value: isNaN(v) ? row[j] : v };
            }
        });

        values.push(geoId, geoName, geoType, tableId, survey, year, totalPop, JSON.stringify(metrics));
        placeholders.push(`($${idx},$${idx+1},$${idx+2},$${idx+3},$${idx+4},$${idx+5},$${idx+6},$${idx+7})`);
        idx += 8;
    }

    if (placeholders.length === 0) return 0;

    await pool.query(`
        INSERT INTO danimal_census (geo_id, geo_name, geo_type, table_id, survey, year, total_population, metrics)
        VALUES ${placeholders.join(',')}
    `, values);

    return placeholders.length;
}

async function importEcon(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length < 3) return 0;

    const values = [];
    const placeholders = [];
    let idx = 1;

    for (let i = 2; i < lines.length; i++) {
        const row = parseCSV(lines[i]);
        if (row.length < 10) continue;

        const timePeriod = row[0];
        const geoId = row[1];
        const geoName = row[2];
        const dataTypeCode = row[5];
        const dataTypeLabel = row[6];
        const val = parseFloat(row[9]) || null;

        const tm = timePeriod.match(/(\d{4})-Q(\d)/);
        const year = tm ? parseInt(tm[1]) : null;
        const quarter = tm ? parseInt(tm[2]) : null;

        values.push(timePeriod, geoId, geoName, dataTypeCode, dataTypeLabel, val, year, quarter);
        placeholders.push(`($${idx},$${idx+1},$${idx+2},$${idx+3},$${idx+4},$${idx+5},$${idx+6},$${idx+7})`);
        idx += 8;
    }

    if (placeholders.length === 0) return 0;

    // Split into chunks of 500 for large files
    const CHUNK = 500;
    let imported = 0;
    
    for (let c = 0; c < placeholders.length; c += CHUNK) {
        const chunkPH = placeholders.slice(c, c + CHUNK);
        const chunkVals = values.slice(c * 8, (c + CHUNK) * 8);
        
        // Renumber placeholders
        let newIdx = 1;
        const renumbered = chunkPH.map(ph => {
            const result = `($${newIdx},$${newIdx+1},$${newIdx+2},$${newIdx+3},$${newIdx+4},$${newIdx+5},$${newIdx+6},$${newIdx+7})`;
            newIdx += 8;
            return result;
        });

        await pool.query(`
            INSERT INTO danimal_economic (time_period, geo_id, geo_name, data_type_code, data_type_label, value_millions, year, quarter)
            VALUES ${renumbered.join(',')}
        `, chunkVals);
        
        imported += chunkPH.length;
    }

    return imported;
}

function parseCSV(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (const char of line) {
        if (char === '"') inQuotes = !inQuotes;
        else if (char === ',' && !inQuotes) { result.push(current); current = ''; }
        else current += char;
    }
    result.push(current);
    return result;
}

importAllCensus(process.argv[2] || process.env.USERPROFILE + '\\Downloads\\Census-Data').catch(e => { console.error(e); process.exit(1); });
