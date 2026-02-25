/**
 * ═══════════════════════════════════════════════════════════════
 * HAWK — IRS Migration Data + SBA Loan Data Ingestion (FIXED v2)
 * ═══════════════════════════════════════════════════════════════
 * Run: node hawk-ingest-irs-sba.js
 * Christ is King
 * ═══════════════════════════════════════════════════════════════
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const readline = require('readline');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// SWFL FIPS codes — UNPADDED (as they appear in the IRS CSV)
const SWFL_COUNTY_FIPS = {
    '71': 'Lee', '15': 'Charlotte', '21': 'Collier',
    '115': 'Sarasota', '81': 'Manatee', '57': 'Hillsborough',
    '103': 'Pinellas', '99': 'Palm Beach', '11': 'Broward',
    '86': 'Miami-Dade', '95': 'Orange', '31': 'Duval'
};

const FL_FIPS = '12';

const STATE_FIPS = {
    '1':'Alabama','2':'Alaska','4':'Arizona','5':'Arkansas','6':'California',
    '8':'Colorado','9':'Connecticut','10':'Delaware','11':'District of Columbia',
    '12':'Florida','13':'Georgia','15':'Hawaii','16':'Idaho','17':'Illinois',
    '18':'Indiana','19':'Iowa','20':'Kansas','21':'Kentucky','22':'Louisiana',
    '23':'Maine','24':'Maryland','25':'Massachusetts','26':'Michigan','27':'Minnesota',
    '28':'Mississippi','29':'Missouri','30':'Montana','31':'Nebraska','32':'Nevada',
    '33':'New Hampshire','34':'New Jersey','35':'New Mexico','36':'New York',
    '37':'North Carolina','38':'North Dakota','39':'Ohio','40':'Oklahoma','41':'Oregon',
    '42':'Pennsylvania','44':'Rhode Island','45':'South Carolina','46':'South Dakota',
    '47':'Tennessee','48':'Texas','49':'Utah','50':'Vermont','51':'Virginia',
    '53':'Washington','54':'West Virginia','55':'Wisconsin','56':'Wyoming'
};

// ═══════════════════════════════════════════════════════════════
// IRS MIGRATION PARSER
// ═══════════════════════════════════════════════════════════════
// INFLOW CSV:  y2_statefips,y2_countyfips,y1_statefips,y1_countyfips,y1_state,y1_countyname,n1,n2,agi
// OUTFLOW CSV: y1_statefips,y1_countyfips,y2_statefips,y2_countyfips,y2_state,y2_countyname,n1,n2,agi

async function parseIRSMigration(filePath, direction) {
    console.log(`\n🦅 Parsing IRS ${direction}: ${path.basename(filePath)}`);
    if (!fs.existsSync(filePath)) { console.log('  ❌ Not found'); return 0; }

    const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
    let isHeader = true, inserted = 0, skipped = 0, batch = [];

    for await (const line of rl) {
        if (isHeader) { isHeader = false; continue; }
        const v = line.replace(/\r/g, '').split(',');
        if (v.length < 9) { skipped++; continue; }

        // Columns 0-1 = "local" side, 2-3 = "remote" side
        // For INFLOW: local=destination(FL), remote=origin
        // For OUTFLOW: local=origin(FL), remote=destination
        const localState = v[0].trim();
        const localCounty = v[1].trim();
        const remoteState = v[2].trim();
        const remoteCounty = v[3].trim();
        const remoteStateAbbr = v[4].trim();
        const remoteCountyName = v[5].trim();
        const n1 = parseInt(v[6]) || 0;
        const n2 = parseInt(v[7]) || 0;
        const agiThousands = parseInt(v[8]) || 0;

        // Must be FL + SWFL county
        if (localState !== FL_FIPS || !SWFL_COUNTY_FIPS[localCounty]) { skipped++; continue; }
        // Skip bad data
        if (n1 <= 0 || n1 === -1) { skipped++; continue; }
        // Skip summary/aggregate rows
        if (remoteCountyName.includes('Total Migration') || remoteCountyName.includes('Non-migrants')) { skipped++; continue; }
        // Skip same-county
        if (localState === remoteState && localCounty === remoteCounty) { skipped++; continue; }

        const swflCounty = SWFL_COUNTY_FIPS[localCounty];
        const agiActual = agiThousands * 1000;
        const avgAgi = n1 > 0 ? Math.round(agiActual / n1) : 0;
        const remoteStateFull = STATE_FIPS[remoteState] || remoteStateAbbr || remoteState;

        const originStateName = direction === 'inflow' ? remoteStateFull : 'Florida';
        const originCountyName = direction === 'inflow' ? remoteCountyName : swflCounty;
        const destStateName = direction === 'inflow' ? 'Florida' : remoteStateFull;
        const destCountyName = direction === 'inflow' ? swflCounty : remoteCountyName;

        batch.push([
            2022,
            direction === 'inflow' ? remoteState : FL_FIPS,
            originStateName,
            direction === 'inflow' ? remoteCounty : localCounty,
            originCountyName,
            direction === 'inflow' ? FL_FIPS : remoteState,
            destStateName,
            direction === 'inflow' ? localCounty : remoteCounty,
            destCountyName,
            n1, n2, agiActual, avgAgi, direction
        ]);

        if (batch.length >= 200) { inserted += await insertMigBatch(batch); batch = []; }
    }
    if (batch.length > 0) inserted += await insertMigBatch(batch);
    console.log(`  ✅ ${inserted.toLocaleString()} records inserted, ${skipped.toLocaleString()} skipped`);
    return inserted;
}

async function insertMigBatch(batch) {
    let c = 0;
    for (const r of batch) {
        try {
            await pool.query(`INSERT INTO hawk_migration_data 
                (tax_year,origin_state_fips,origin_state_name,origin_county_fips,origin_county_name,
                 dest_state_fips,dest_state_name,dest_county_fips,dest_county_name,
                 returns,exemptions,agi,avg_agi_per_return,direction) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, r);
            c++;
        } catch(e) {}
    }
    return c;
}

// ═══════════════════════════════════════════════════════════════
// SBA LOAN PARSER
// ═══════════════════════════════════════════════════════════════

function parseCSVLine(line) {
    const vals = []; let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
        else if (c === ',' && !inQ) { vals.push(cur.trim()); cur = ''; }
        else if (c !== '\r') cur += c;
    }
    vals.push(cur.trim());
    return vals;
}

function findCol(headers, candidates) {
    for (const c of candidates) { const i = headers.indexOf(c); if (i !== -1) return i; }
    return -1;
}

async function parseSBALoans(filePath) {
    console.log(`\n🦅 Parsing SBA: ${path.basename(filePath)}`);
    if (!fs.existsSync(filePath)) { console.log('  ❌ Not found'); return 0; }

    const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
    let headers = null, inserted = 0, skipped = 0, batch = [];
    let iState, iCity, iZip, iName, iAmt, iDate, iNaics, iNaicsD, iLender, iJobs, iProgram;

    const zipCounty = {
        '339':'Lee','338':'Lee','340':'Charlotte','341':'Collier',
        '342':'Sarasota','346':'Sarasota','347':'Manatee',
        '336':'Hillsborough','335':'Hillsborough','334':'Pinellas',
        '330':'Palm Beach','331':'Palm Beach','332':'Broward','333':'Miami-Dade'
    };

    for await (const line of rl) {
        if (!headers) {
            headers = parseCSVLine(line).map(h => h.toLowerCase());
            iState = findCol(headers, ['borrstate','borrowerstate','borr_state','projectstate']);
            iCity = findCol(headers, ['borrcity','borrowercity','borr_city','projectcity']);
            iZip = findCol(headers, ['borrzip','borrowerzip','borr_zip','projectzip']);
            iName = findCol(headers, ['borrowname','borrowername','borr_name']);
            iAmt = findCol(headers, ['grossapproval','approvalamt','currentapprovalamount','sbaguaranteedapproval']);
            iDate = findCol(headers, ['approvaldate','appv_date','approvalfiscalyear']);
            iNaics = findCol(headers, ['naicscode','naics','naics_code']);
            iNaicsD = findCol(headers, ['naicsdescription','naics_description']);
            iLender = findCol(headers, ['bankname','lendername','servicing_lender_name']);
            iJobs = findCol(headers, ['jobssupported','jobsretained','jobscreated']);
            iProgram = findCol(headers, ['program']);

            console.log(`  Cols: ${headers.length} | State:[${iState}] City:[${iCity}] Zip:[${iZip}] Amt:[${iAmt}] Name:[${iName}]`);
            if (iState === -1) { console.log('  ❌ Cannot find state column!'); return 0; }
            continue;
        }

        const v = parseCSVLine(line);
        const state = (v[iState] || '').toUpperCase().trim();
        if (state !== 'FL') { skipped++; continue; }

        const zip = (iZip >= 0 ? v[iZip] || '' : '').substring(0, 5);
        const county = zipCounty[zip.substring(0, 3)] || '';
        const amtStr = iAmt >= 0 ? (v[iAmt] || '0') : '0';
        const amount = parseFloat(amtStr.replace(/[,$"]/g, '')) || 0;

        let dateVal = iDate >= 0 ? (v[iDate] || '') : '';
        if (dateVal && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateVal)) {
            const p = dateVal.split('/');
            dateVal = `${p[2]}-${p[0].padStart(2,'0')}-${p[1].padStart(2,'0')}`;
        } else if (dateVal && /^\d{4}$/.test(dateVal)) {
            dateVal = `${dateVal}-01-01`;
        }
        if (!dateVal || dateVal.length < 8) dateVal = null;

        batch.push([
            iProgram >= 0 ? (v[iProgram] || '7(a)') : '7(a)',
            (iName >= 0 ? v[iName] || '' : '').substring(0, 255),
            (iCity >= 0 ? v[iCity] || '' : '').substring(0, 100),
            'FL', zip, county,
            iNaics >= 0 ? (v[iNaics] || '') : '',
            (iNaicsD >= 0 ? v[iNaicsD] || '' : '').substring(0, 255),
            amount, dateVal,
            (iLender >= 0 ? v[iLender] || '' : '').substring(0, 255),
            iJobs >= 0 ? (parseInt(v[iJobs]) || 0) : 0,
        ]);

        if (batch.length >= 500) {
            inserted += await insertSBABatch(batch); batch = [];
            if (inserted % 2000 === 0) process.stdout.write(`  ${inserted.toLocaleString()} FL loans...\r`);
        }
    }
    if (batch.length > 0) inserted += await insertSBABatch(batch);
    console.log(`  ✅ ${inserted.toLocaleString()} FL records, ${skipped.toLocaleString()} non-FL skipped`);
    return inserted;
}

async function insertSBABatch(batch) {
    let c = 0;
    for (const r of batch) {
        try {
            await pool.query(`INSERT INTO hawk_sba_loans 
                (program,borrower_name,borrower_city,borrower_state,borrower_zip,county,
                 naics_code,naics_description,approval_amount,approval_date,lender_name,jobs_supported)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, r);
            c++;
        } catch(e) {}
    }
    return c;
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

async function main() {
    console.log('\n🦅 HAWK — Data Ingestion Pipeline v2');
    console.log('═══════════════════════════════════════════');

    const dataDir = path.join(__dirname, 'data', 'hawk');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    let total = 0;

    // ── IRS ──
    const inflowPath = path.join(dataDir, 'countyinflow2122.csv');
    const outflowPath = path.join(dataDir, 'countyoutflow2122.csv');

    if (fs.existsSync(inflowPath) || fs.existsSync(outflowPath)) {
        await pool.query(`DELETE FROM hawk_migration_data WHERE tax_year = 2022`);
        if (fs.existsSync(inflowPath)) total += await parseIRSMigration(inflowPath, 'inflow');
        if (fs.existsSync(outflowPath)) total += await parseIRSMigration(outflowPath, 'outflow');

        console.log('\n  📊 SWFL Migration Summary (2021→2022):');
        console.log('  ─────────────────────────────────────────');
        for (const county of ['Lee', 'Collier', 'Charlotte']) {
            const inf = await pool.query(`SELECT SUM(returns) r,SUM(exemptions) p,SUM(agi) a FROM hawk_migration_data WHERE tax_year=2022 AND direction='inflow' AND dest_county_name=$1`, [county]);
            const out = await pool.query(`SELECT SUM(returns) r,SUM(exemptions) p,SUM(agi) a FROM hawk_migration_data WHERE tax_year=2022 AND direction='outflow' AND origin_county_name=$1`, [county]);
            const iR=parseInt(inf.rows[0]?.r)||0, iP=parseInt(inf.rows[0]?.p)||0, iA=parseInt(inf.rows[0]?.a)||0;
            const oR=parseInt(out.rows[0]?.r)||0, oP=parseInt(out.rows[0]?.p)||0;
            const avgIn = iR>0 ? Math.round(iA/iR) : 0;
            console.log(`\n  🏢 ${county} County:`);
            console.log(`     IN:  ${iR.toLocaleString()} households | ${iP.toLocaleString()} people | Avg AGI: $${avgIn.toLocaleString()}`);
            console.log(`     OUT: ${oR.toLocaleString()} households | ${oP.toLocaleString()} people`);
            console.log(`     NET: ${(iR-oR)>0?'+':''}${(iR-oR).toLocaleString()} households | ${(iP-oP)>0?'+':''}${(iP-oP).toLocaleString()} people`);
        }

        console.log('\n  📊 Top 10 Origins → Lee County:');
        const top = await pool.query(`SELECT origin_state_name s, SUM(returns) r, ROUND(SUM(agi)::numeric/NULLIF(SUM(returns),0)) avg FROM hawk_migration_data WHERE tax_year=2022 AND direction='inflow' AND dest_county_name='Lee' AND origin_state_name!='Florida' GROUP BY origin_state_name ORDER BY SUM(returns) DESC LIMIT 10`);
        for (const r of top.rows) console.log(`     ${r.s}: ${parseInt(r.r).toLocaleString()} households | Avg AGI: $${parseInt(r.avg).toLocaleString()}`);
    }

    // ── SBA ──
    const sbaFiles = fs.existsSync(dataDir) ? fs.readdirSync(dataDir).filter(f => f.endsWith('.csv') && (f.includes('sba') || f.includes('7a') || f.includes('504') || f.includes('foia'))) : [];
    if (sbaFiles.length > 0) {
        for (const f of sbaFiles) total += await parseSBALoans(path.join(dataDir, f));
        console.log('\n  📊 SBA SWFL Summary:');
        const s = await pool.query(`SELECT county,COUNT(*) c,SUM(approval_amount) t,ROUND(AVG(approval_amount)) a FROM hawk_sba_loans WHERE county IN ('Lee','Collier','Charlotte') GROUP BY county ORDER BY county`);
        for (const r of s.rows) console.log(`     ${r.county}: ${parseInt(r.c).toLocaleString()} loans | $${parseInt(r.t).toLocaleString()} total | Avg: $${parseInt(r.a).toLocaleString()}`);
    }

    const mc = await pool.query(`SELECT COUNT(*) FROM hawk_migration_data`);
    const sc = await pool.query(`SELECT COUNT(*) FROM hawk_sba_loans`);
    console.log('\n═══════════════════════════════════════════');
    console.log('🦅 HAWK Ingestion Complete!');
    console.log(`   Migration: ${parseInt(mc.rows[0].count).toLocaleString()} | SBA: ${parseInt(sc.rows[0].count).toLocaleString()} | New: ${total.toLocaleString()}`);
    console.log('\n   Christ is King 👑');
    console.log('═══════════════════════════════════════════');
    await pool.end();
}

main().catch(e => { console.error(e); pool.end(); });
