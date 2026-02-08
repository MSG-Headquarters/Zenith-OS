/**
 * CENSUS DATA ? DANIMAL DATA HUB (BATCH IMPORT)
 * Handles: ACS Demographics + Economic Indicators (EITSQTAX)
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

const BATCH_SIZE = 100;

async function importAllCensus(baseDir) {
    console.log('+------------------------------------------------------------+');
    console.log('¦     CENSUS DATA ? DANIMAL DATA HUB (BATCH)                 ¦');
    console.log('+------------------------------------------------------------+\n');

    // Create tables
    console.log('[1/4] Creating tables...');
    
    // Demographics table (ACS data)
    await pool.query(`
        CREATE TABLE IF NOT EXISTS danimal_census (
            id SERIAL PRIMARY KEY,
            geo_id VARCHAR(50) NOT NULL,
            geo_name VARCHAR(255),
            geo_type VARCHAR(50),
            state_fips VARCHAR(2),
            county_fips VARCHAR(3),
            table_id VARCHAR(50) NOT NULL,
            survey VARCHAR(20),
            year INTEGER,
            total_population INTEGER,
            male_population INTEGER,
            female_population INTEGER,
            metrics JSONB,
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(geo_id, table_id, survey, year)
        );
        CREATE INDEX IF NOT EXISTS idx_danimal_census_geo ON danimal_census(geo_id);
        CREATE INDEX IF NOT EXISTS idx_danimal_census_geo_type ON danimal_census(geo_type);
    `);

    // Economic indicators table
    await pool.query(`
        CREATE TABLE IF NOT EXISTS danimal_economic (
            id SERIAL PRIMARY KEY,
            time_period VARCHAR(20) NOT NULL,
            geo_id VARCHAR(50) NOT NULL,
            geo_name VARCHAR(255),
            category_code VARCHAR(50),
            category_label VARCHAR(255),
            data_type_code VARCHAR(20),
            data_type_label VARCHAR(255),
            seasonally_adj BOOLEAN DEFAULT FALSE,
            value_millions DECIMAL(15,2),
            year INTEGER,
            quarter INTEGER,
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(time_period, geo_id, category_code, data_type_code)
        );
        CREATE INDEX IF NOT EXISTS idx_danimal_econ_geo ON danimal_economic(geo_id);
        CREATE INDEX IF NOT EXISTS idx_danimal_econ_year ON danimal_economic(year);
        CREATE INDEX IF NOT EXISTS idx_danimal_econ_type ON danimal_economic(data_type_code);
    `);
    
    console.log('      Tables ready.\n');

    // Find all data files recursively
    const allFiles = findDataFiles(baseDir);
    console.log(`[2/4] Found ${allFiles.length} data files\n`);

    let acsImported = 0;
    let econImported = 0;

    console.log('[3/4] Importing data...\n');

    for (const filePath of allFiles) {
        const fileName = path.basename(filePath);
        
        if (fileName.startsWith('ACS')) {
            const count = await importACSFile(filePath);
            acsImported += count;
            process.stdout.write(`\r      ACS: ${acsImported} | Economic: ${econImported}    `);
        } else if (fileName.startsWith('EITSQTAX')) {
            const count = await importEconomicFile(filePath);
            econImported += count;
            process.stdout.write(`\r      ACS: ${acsImported} | Economic: ${econImported}    `);
        }
    }

    console.log('\n\n[4/4] Import complete!\n');

    // Get final counts
    const acsCount = await pool.query('SELECT COUNT(*) as cnt FROM danimal_census');
    const econCount = await pool.query('SELECT COUNT(*) as cnt FROM danimal_economic');
    
    console.log('+------------------------------------------------------------+');
    console.log(`¦  ACS Demographics:    ${acsCount.rows[0].cnt.toString().padStart(8)} records                ¦`);
    console.log(`¦  Economic Indicators: ${econCount.rows[0].cnt.toString().padStart(8)} records                ¦`);
    console.log(`¦  ---------------------------------------------             ¦`);
    console.log(`¦  Total Census Data:   ${(parseInt(acsCount.rows[0].cnt) + parseInt(econCount.rows[0].cnt)).toString().padStart(8)} records                ¦`);
    console.log('+------------------------------------------------------------+');

    await pool.end();
}

function findDataFiles(dir) {
    let results = [];
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
            results = results.concat(findDataFiles(fullPath));
        } else if (item.endsWith('-Data.csv')) {
            results.push(fullPath);
        }
    }
    return results;
}

async function importACSFile(filePath) {
    const fileName = path.basename(filePath);
    const match = fileName.match(/ACS(DT|ST)(\d)Y(\d{4})\.([A-Z0-9]+)-Data\.csv/);
    if (!match) return 0;

    const yearSpan = match[2];
    const year = parseInt(match[3]);
    const tableId = match[4];
    const survey = `ACS${yearSpan}Y${year}`;

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length < 3) return 0;

    const headers = parseCSVLine(lines[0]);
    const headerNames = parseCSVLine(lines[1]);
    
    let imported = 0;
    let batch = [];

    for (let i = 2; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length < 3) continue;

        const geoId = values[0];
        const geoName = values[1];
        
        let geoType = 'unknown', stateFips = null, countyFips = null;
        if (geoId.startsWith('0400000US')) { geoType = 'state'; stateFips = geoId.replace('0400000US', ''); }
        else if (geoId.startsWith('0500000US')) { geoType = 'county'; const f = geoId.replace('0500000US', ''); stateFips = f.substring(0,2); countyFips = f.substring(2); }
        else if (geoId.startsWith('310')) { geoType = 'metro'; }

        const metrics = {};
        headers.forEach((h, idx) => {
            if (idx > 1 && values[idx] && values[idx] !== '*****') {
                const numVal = parseFloat(values[idx]);
                metrics[h] = { label: headerNames[idx] || h, value: isNaN(numVal) ? values[idx] : numVal };
            }
        });

        let totalPop = null, malePop = null, femalePop = null;
        if ((tableId === 'B01001' || tableId === 'B01003') && values[2]) {
            totalPop = parseInt(values[2]) || null;
            if (tableId === 'B01001' && values.length > 52) {
                malePop = parseInt(values[4]) || null;
                femalePop = parseInt(values[52]) || null;
            }
        }

        batch.push([geoId, geoName, geoType, stateFips, countyFips, tableId, survey, year, totalPop, malePop, femalePop, JSON.stringify(metrics)]);

        if (batch.length >= BATCH_SIZE) {
            imported += await insertACSBatch(batch);
            batch = [];
        }
    }

    if (batch.length > 0) {
        imported += await insertACSBatch(batch);
    }

    return imported;
}

async function insertACSBatch(batch) {
    let success = 0;
    for (const row of batch) {
        try {
            await pool.query(`
                INSERT INTO danimal_census (geo_id, geo_name, geo_type, state_fips, county_fips, table_id, survey, year, total_population, male_population, female_population, metrics)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
                ON CONFLICT (geo_id, table_id, survey, year) DO UPDATE SET metrics = EXCLUDED.metrics
            `, row);
            success++;
        } catch (e) {}
    }
    return success;
}

async function importEconomicFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length < 3) return 0;

    let imported = 0;
    let batch = [];

    for (let i = 2; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length < 10) continue;

        const timePeriod = values[0];  // "1994-Q1"
        const geoId = values[1];
        const geoName = values[2];
        const categoryCode = values[3];
        const categoryLabel = values[4];
        const dataTypeCode = values[5];
        const dataTypeLabel = values[6];
        const seasonallyAdj = values[7]?.toLowerCase() === 'yes';
        const valueMil = parseFloat(values[9]) || null;

        // Parse year/quarter
        const timeMatch = timePeriod.match(/(\d{4})-Q(\d)/);
        const year = timeMatch ? parseInt(timeMatch[1]) : null;
        const quarter = timeMatch ? parseInt(timeMatch[2]) : null;

        batch.push([timePeriod, geoId, geoName, categoryCode, categoryLabel, dataTypeCode, dataTypeLabel, seasonallyAdj, valueMil, year, quarter]);

        if (batch.length >= BATCH_SIZE) {
            imported += await insertEconBatch(batch);
            batch = [];
        }
    }

    if (batch.length > 0) {
        imported += await insertEconBatch(batch);
    }

    return imported;
}

async function insertEconBatch(batch) {
    let success = 0;
    for (const row of batch) {
        try {
            await pool.query(`
                INSERT INTO danimal_economic (time_period, geo_id, geo_name, category_code, category_label, data_type_code, data_type_label, seasonally_adj, value_millions, year, quarter)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                ON CONFLICT (time_period, geo_id, category_code, data_type_code) DO UPDATE SET value_millions = EXCLUDED.value_millions
            `, row);
            success++;
        } catch (e) {}
    }
    return success;
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

const baseDir = process.argv[2] || process.env.USERPROFILE + '\\Downloads\\Census-Data';
importAllCensus(baseDir).catch(err => { console.error('Fatal:', err); process.exit(1); });
