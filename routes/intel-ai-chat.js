/**
 * ═══════════════════════════════════════════════════════════════════════════
 * INTEL AI RESEARCH ASSISTANT — ROUTES (v3 — Phase 2: Market Intelligence)
 * Zenith OS
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Features:
 *   - Anthropic Claude API with web_search tool
 *   - Adam-style market narrative generation
 *   - INTEL Market Benchmarks enrichment (6,698+ data points)
 *   - Top Transactions enrichment (275+ deals)
 *   - IQR outlier detection for CMA/BOV validation
 *   - Danimal Data enrichment (1.5M+ FL licensees)
 *   - Census API enrichment (demographics)
 *   - FDOT traffic data enrichment
 *   - County Property Appraiser enrichment
 *   - The Adam Project (persistent learning from uploads)
 *   - File upload parsing (Excel, PDF, CSV)
 *   - Excel export for structured report data
 * 
 * Main Street Group Technology Division
 * Christ is King
 * ═══════════════════════════════════════════════════════════════════════════
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

// Multer config for file uploads
const upload = multer({
    dest: path.join(__dirname, '..', 'uploads'),
    limits: { fileSize: 25 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['.pdf', '.xlsx', '.xls', '.csv', '.doc', '.docx', '.txt', '.png', '.jpg', '.jpeg'];
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, allowed.includes(ext));
    }
});

// Optional packages (graceful fallback)
let ExcelJS, pdfParse;
try { ExcelJS = require('exceljs'); } catch (e) { ExcelJS = null; }
try { pdfParse = require('pdf-parse'); } catch (e) { pdfParse = null; }


// ═══════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════════

const INTEL_AI_SYSTEM_PROMPT = `You are INTEL Research AI, the intelligence engine powering Zenith OS for CRE Consultants — a commercial real estate brokerage in Southwest Florida.

## ROLE
You are a senior CRE research analyst producing institutional-quality reports and analysis. Your work matches the caliber of TCG, CBRE, JLL, and Cushman & Wakefield research departments. You write with authority, precision, and market fluency.

## REPORT TYPES
- **CMA (Comparative Market Analysis)**: Comp selection, adjustment grid, reconciled value range. Flag outliers using IQR statistical analysis when available.
- **SWOT Analysis**: Strengths/Weaknesses/Opportunities/Threats for a property or market position.
- **CIM (Confidential Information Memorandum)**: Investment-grade property overview, financials, tenant summary, market context.
- **BOV (Broker Opinion of Value)**: Valuation methodology, comp analysis, income approach, reconciled opinion. Apply IQR bounds when available.
- **OM (Offering Memorandum)**: Marketing document with property highlights, financials, area demographics, and investment thesis.
- **Market Report / Newsletter**: Quarterly/periodic market intelligence covering vacancy, absorption, rents, cap rates, construction pipeline, and notable transactions.

## DATA INTEGRITY
- When citing data from injected sources (Danimal Data, Census, FDOT, Market Benchmarks, Adam Project), present it as authoritative and factual.
- When supplementing with web search, clearly distinguish between verified local data and web-sourced estimates.
- If you lack data for a specific metric, use [VERIFY: description] tags so the broker knows to confirm.
- Only use [VERIFY] tags for data requiring proprietary access or physical inspection.

## DATA SOURCES
You have access to enriched data injected into your context from:
- **INTEL Market Benchmarks**: 6,698+ SWFL market data points — vacancy rates, absorption, asking rents, cap rates, construction pipeline, lease activity by size bracket, submarket drill-downs for Lee, Collier, and Charlotte counties across Industrial, Office, Retail, Land, and Multifamily sectors (Q4 2024–Q3 2025)
- **Top Transactions**: 275+ notable CRE deals with sale prices, cap rates, buyer/seller, square footage
- **The Adam Project**: Proprietary CRE data uploaded by the team (comps, rent rolls, operating statements, market data)
- **Danimal Data**: 1.5M+ Florida DBPR professional licensees
- **Census API**: Population, median household income, home values, employment statistics
- **FDOT Traffic Counts**: Annual Average Daily Traffic (AADT) for Florida road segments
- **County Property Appraiser**: Property sales, assessments, ownership records
- **Web Search**: Real-time access to current market data, news, and property information

## INTEL MARKET BENCHMARKS — NARRATIVE STYLE
Write market narratives like Adam Kerner, Director of Market Research & Data Analytics at CRE Consultants:
- **Lead with the headline**: Start each section with the most impactful finding
- **Contextualize every metric**: Never just state a number — compare QoQ, YoY, vs regional averages
- **Tell the story**: Connect data points to market dynamics (rising rents + low vacancy + pipeline = landlord's market)
- **Precise CRE language**: "absorption", "basis points", "tightening", "compression", "deliveries", "pipeline", "flight to quality"
- **Submarket granularity**: Always break down to submarket level when data is available
- **Lease activity analysis**: Interpret size brackets (heavy <2,500 SF = small business demand, heavy >25,000 SF = institutional/logistics)

## MARKET REPORT STRUCTURE
When generating Market Reports:
1. **Executive Summary** — 3-4 sentences capturing the market narrative
2. **Key Metrics Dashboard** — Table with vacancy, absorption, rent, cap rate, construction pipeline
3. **Sector Deep Dives** — One section per property type with submarket breakdowns
4. **Notable Transactions** — Top deals with analysis of market signals
5. **Lease Activity Analysis** — By size bracket with demand trend interpretation
6. **Year-over-Year Comparisons** — Trend lines and directional commentary
7. **Outlook** — Forward-looking commentary based on pipeline, absorption trends, macro

## IQR OUTLIER DETECTION
When statistical analysis data is present:
- Reference acceptable ranges when discussing comp validity
- Flag subject property metrics outside IQR bounds
- In CMA/BOV: "After removing N statistical outliers (outside IQR range X%-Y%), the adjusted median is Z%"
- This ensures defensible valuations for institutional scrutiny

## DATA CITATION
- Cite "INTEL Market Benchmarks" for injected benchmark data
- Cite "Danimal Data" for licensee statistics
- Cite "Census ACS" for demographics
- Cite "FDOT" for traffic counts
- When web search conflicts with benchmarks, note both with explanation

## FORMATTING STANDARDS
- Structure reports professionally matching institutional CRE standards
- Use clear section headers with **bold** formatting
- Present financial data in organized tables using markdown
- Lead with executive summary/key findings
- Include relevant data points with sources cited

## MARKET CONTEXT
- Southwest Florida market area: Lee, Charlotte, Collier, Sarasota, and Manatee counties
- CRE Consultants is a full-service commercial real estate brokerage based in Fort Myers, FL
- Key team: Dan Smith (Principal Broker), Mitchell Tindell (Senior Associate), Chris Khouri (Managing Director), Jonathan Agee (Director of Marketing), Adam Kerner (Director of Market Research & Data Analytics)`;


// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Census API Query
// ═══════════════════════════════════════════════════════════════════════════

function queryCensus(state, county) {
    return new Promise((resolve) => {
        const CENSUS_API_KEY = process.env.CENSUS_API_KEY;
        if (!CENSUS_API_KEY) { resolve(null); return; }
        const countyFips = {
            'lee': '071', 'charlotte': '015', 'collier': '021',
            'sarasota': '115', 'manatee': '081', 'hillsborough': '057',
            'pinellas': '103', 'palm beach': '099', 'broward': '011',
            'miami-dade': '086', 'orange': '095', 'duval': '031'
        };
        const fips = countyFips[(county || '').toLowerCase()];
        if (!fips) { resolve(null); return; }
        const url = `https://api.census.gov/data/2022/acs/acs5?get=B01003_001E,B19013_001E,B25077_001E,B23025_004E,B01002_001E,B25001_001E&for=county:${fips}&in=state:12&key=${CENSUS_API_KEY}`;
        https.get(url, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed && parsed.length > 1) {
                        const v = parsed[1];
                        resolve({ population: parseInt(v[0])||0, medianHouseholdIncome: parseInt(v[1])||0, medianHomeValue: parseInt(v[2])||0, employedPopulation: parseInt(v[3])||0, medianAge: parseFloat(v[4])||0, totalHousingUnits: parseInt(v[5])||0 });
                    } else resolve(null);
                } catch (e) { resolve(null); }
            });
        }).on('error', () => resolve(null));
    });
}


// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Extract Location from User Message
// ═══════════════════════════════════════════════════════════════════════════

function extractLocation(message) {
    const msgLower = message.toLowerCase();
    const cityCountyMap = {
        'fort myers': 'lee', 'cape coral': 'lee', 'lehigh acres': 'lee',
        'bonita springs': 'lee', 'estero': 'lee', 'sanibel': 'lee',
        'naples': 'collier', 'marco island': 'collier', 'immokalee': 'collier',
        'ave maria': 'collier', 'golden gate': 'collier',
        'punta gorda': 'charlotte', 'port charlotte': 'charlotte', 'englewood': 'charlotte', 'murdock': 'charlotte',
        'sarasota': 'sarasota', 'venice': 'sarasota', 'north port': 'sarasota',
        'bradenton': 'manatee', 'palmetto': 'manatee',
        'tampa': 'hillsborough', 'orlando': 'orange',
        'miami': 'miami-dade', 'jacksonville': 'duval'
    };
    let foundCity = null, foundCounty = null;
    for (const [city, county] of Object.entries(cityCountyMap)) {
        if (msgLower.includes(city)) { foundCity = city; foundCounty = county; break; }
    }
    if (!foundCounty) {
        for (const county of ['lee','charlotte','collier','sarasota','manatee','hillsborough','pinellas','palm beach','broward','miami-dade','orange','duval']) {
            if (msgLower.includes(county + ' county') || msgLower.includes(county)) { foundCounty = county; break; }
        }
    }
    return { city: foundCity, county: foundCounty };
}


// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Detect Sector, County, Quarter from User Message (NEW — Phase 2)
// ═══════════════════════════════════════════════════════════════════════════

function detectSectorAndQuarter(message) {
    const msg = message.toLowerCase();
    
    // Sector detection
    const sectorMap = {
        'industrial': ['industrial', 'warehouse', 'distribution', 'flex space', 'manufacturing', 'logistics'],
        'office': ['office', 'office space', 'class a office', 'class b office', 'medical office', 'co-working'],
        'retail': ['retail', 'shopping center', 'strip mall', 'restaurant', 'storefront', 'plaza', 'outparcel'],
        'land': ['land', 'vacant land', 'development site', 'acreage', 'lot', 'entitled land', 'raw land'],
        'multifamily': ['multifamily', 'multi-family', 'apartment', 'apartments', 'residential rental', 'duplex', 'triplex', 'fourplex']
    };
    
    let detectedSector = null;
    for (const [sector, keywords] of Object.entries(sectorMap)) {
        for (const kw of keywords) {
            if (msg.includes(kw)) { detectedSector = sector; break; }
        }
        if (detectedSector) break;
    }
    
    // County detection (SWFL focus)
    const countyKeywords = {
        'lee': ['lee county', 'fort myers', 'cape coral', 'lehigh', 'bonita springs', 'estero', 'sanibel'],
        'collier': ['collier county', 'naples', 'marco island', 'immokalee', 'ave maria', 'golden gate'],
        'charlotte': ['charlotte county', 'punta gorda', 'port charlotte', 'englewood', 'murdock']
    };
    
    let detectedCounty = null;
    for (const [county, keywords] of Object.entries(countyKeywords)) {
        for (const kw of keywords) {
            if (msg.includes(kw)) { detectedCounty = county; break; }
        }
        if (detectedCounty) break;
    }
    
    // Quarter detection
    let detectedQuarter = null;
    let detectedYear = null;
    
    const quarterPatterns = [
        /q([1-4])\s*(?:20)?(\d{2})/i,
        /q([1-4])\s*'(\d{2})/i,
        /(first|second|third|fourth)\s+quarter\s*(?:of\s*)?(?:20)?(\d{2})/i
    ];
    
    const quarterWordMap = { 'first': '1', 'second': '2', 'third': '3', 'fourth': '4' };
    
    for (const pattern of quarterPatterns) {
        const match = msg.match(pattern);
        if (match) {
            const qNum = quarterWordMap[match[1].toLowerCase()] || match[1];
            detectedQuarter = `Q${qNum}`;
            detectedYear = match[2].length === 2 ? `20${match[2]}` : match[2];
            break;
        }
    }
    
    // Default to most recent quarter for "latest", "current", etc.
    if (!detectedQuarter && (msg.includes('latest') || msg.includes('current') || msg.includes('most recent') || msg.includes('today'))) {
        detectedQuarter = 'Q3';
        detectedYear = '2025';
    }
    
    return { sector: detectedSector, county: detectedCounty, quarter: detectedQuarter, year: detectedYear };
}


// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Query INTEL Market Benchmarks (NEW — Phase 2)
// ═══════════════════════════════════════════════════════════════════════════

async function queryMarketBenchmarks(pool, { sector, county, quarter, year }) {
    if (!pool) return [];
    
    try {
        let conditions = [];
        let params = [];
        let paramIdx = 1;
        
        if (sector) {
            conditions.push(`LOWER(sector) = LOWER($${paramIdx})`);
            params.push(sector);
            paramIdx++;
        }
        if (county) {
            conditions.push(`LOWER(county) = LOWER($${paramIdx})`);
            params.push(county);
            paramIdx++;
        }
        if (quarter && year) {
            conditions.push(`quarter = $${paramIdx}`);
            params.push(`${quarter} ${year}`);
            paramIdx++;
        }
        
        if (conditions.length === 0) {
            conditions.push(`LOWER(county) = 'swfl'`);
        }
        
        const query = `
            SELECT 
                county, sector, submarket, quarter,
                vacancy_rate, asking_rent_avg, asking_rent_range_low, asking_rent_range_high,
                cap_rate_avg, cap_rate_range_low, cap_rate_range_high,
                absorption_sf, net_absorption_sf,
                inventory_sf, total_buildings,
                construction_pipeline_sf, under_construction_sf,
                avg_price_per_sf, median_sale_price,
                lease_activity_total_sf, lease_activity_under_2500,
                lease_activity_2500_5000, lease_activity_5000_10000,
                lease_activity_10000_25000, lease_activity_over_25000,
                yoy_rent_change, yoy_vacancy_change, yoy_absorption_change,
                market_trend, notes
            FROM intel_market_benchmarks
            WHERE ${conditions.join(' AND ')}
            ORDER BY county, sector, submarket
        `;
        
        const result = await pool.query(query, params);
        return result.rows;
    } catch (err) {
        console.error('[INTEL AI] Market benchmarks query error:', err.message);
        return [];
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Query Top Transactions (NEW — Phase 2)
// ═══════════════════════════════════════════════════════════════════════════

async function queryTopTransactions(pool, { sector, county, quarter, year }) {
    if (!pool) return [];
    
    try {
        let conditions = [];
        let params = [];
        let paramIdx = 1;
        
        if (sector) {
            conditions.push(`LOWER(sector) = LOWER($${paramIdx})`);
            params.push(sector);
            paramIdx++;
        }
        if (county) {
            conditions.push(`LOWER(county) = LOWER($${paramIdx})`);
            params.push(county);
            paramIdx++;
        }
        if (quarter && year) {
            conditions.push(`quarter = $${paramIdx}`);
            params.push(`${quarter} ${year}`);
            paramIdx++;
        }
        
        if (conditions.length === 0) {
            conditions.push('1=1');
        }
        
        const query = `
            SELECT 
                property_name, property_address, county, sector, quarter,
                transaction_type, sale_price, price_per_sf,
                square_footage, cap_rate, buyer, seller,
                transaction_date, notes
            FROM intel_top_transactions
            WHERE ${conditions.join(' AND ')}
            ORDER BY sale_price DESC NULLS LAST
            LIMIT 25
        `;
        
        const result = await pool.query(query, params);
        return result.rows;
    } catch (err) {
        console.error('[INTEL AI] Top transactions query error:', err.message);
        return [];
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// HELPER: IQR Outlier Detection (NEW — Phase 2)
// ═══════════════════════════════════════════════════════════════════════════

function iqrOutlierFilter(values, multiplier = 1.5) {
    if (!values || values.length < 4) {
        return { clean: values || [], outliers: [], q1: null, q3: null, iqr: null, lowerBound: null, upperBound: null, median: null };
    }
    
    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;
    
    const q1 = sorted[Math.floor(n * 0.25)];
    const q3 = sorted[Math.floor(n * 0.75)];
    const median = sorted[Math.floor(n * 0.5)];
    const iqr = q3 - q1;
    
    const lowerBound = q1 - (multiplier * iqr);
    const upperBound = q3 + (multiplier * iqr);
    
    const clean = [], outliers = [];
    for (const val of values) {
        if (val < lowerBound || val > upperBound) outliers.push(val);
        else clean.push(val);
    }
    
    return { clean, outliers, q1, q3, iqr, lowerBound, upperBound, median };
}


function applyIQRToBenchmarks(benchmarks) {
    if (!benchmarks || benchmarks.length === 0) return '';
    
    const capRates = benchmarks.map(b => parseFloat(b.cap_rate_avg)).filter(v => !isNaN(v) && v > 0);
    const priceSF = benchmarks.map(b => parseFloat(b.avg_price_per_sf)).filter(v => !isNaN(v) && v > 0);
    const askingRents = benchmarks.map(b => parseFloat(b.asking_rent_avg)).filter(v => !isNaN(v) && v > 0);
    const vacancyRates = benchmarks.map(b => parseFloat(b.vacancy_rate)).filter(v => !isNaN(v));
    
    let analysis = '\n\n[STATISTICAL ANALYSIS — IQR Outlier Detection]\n';
    
    if (capRates.length >= 4) {
        const cr = iqrOutlierFilter(capRates);
        analysis += `Cap Rates: Median ${cr.median.toFixed(2)}%, IQR ${cr.q1.toFixed(2)}%-${cr.q3.toFixed(2)}%, Acceptable: ${cr.lowerBound.toFixed(2)}%-${cr.upperBound.toFixed(2)}%`;
        if (cr.outliers.length > 0) analysis += ` | ⚠️ ${cr.outliers.length} outlier(s): ${cr.outliers.map(v => v.toFixed(2) + '%').join(', ')}`;
        analysis += '\n';
    }
    
    if (priceSF.length >= 4) {
        const ps = iqrOutlierFilter(priceSF);
        analysis += `Price/SF: Median $${ps.median.toFixed(2)}, IQR $${ps.q1.toFixed(2)}-$${ps.q3.toFixed(2)}, Acceptable: $${ps.lowerBound.toFixed(2)}-$${ps.upperBound.toFixed(2)}`;
        if (ps.outliers.length > 0) analysis += ` | ⚠️ ${ps.outliers.length} outlier(s): ${ps.outliers.map(v => '$' + v.toFixed(2)).join(', ')}`;
        analysis += '\n';
    }
    
    if (askingRents.length >= 4) {
        const ar = iqrOutlierFilter(askingRents);
        analysis += `Asking Rents: Median $${ar.median.toFixed(2)}/SF, IQR $${ar.q1.toFixed(2)}-$${ar.q3.toFixed(2)}, Acceptable: $${ar.lowerBound.toFixed(2)}-$${ar.upperBound.toFixed(2)}`;
        if (ar.outliers.length > 0) analysis += ` | ⚠️ ${ar.outliers.length} outlier(s): ${ar.outliers.map(v => '$' + v.toFixed(2)).join(', ')}`;
        analysis += '\n';
    }
    
    if (vacancyRates.length >= 4) {
        const vr = iqrOutlierFilter(vacancyRates);
        analysis += `Vacancy: Median ${vr.median.toFixed(1)}%, IQR ${vr.q1.toFixed(1)}%-${vr.q3.toFixed(1)}%\n`;
    }
    
    analysis += 'Use these ranges to validate comp data and flag properties outside normal market parameters.\n';
    return analysis;
}


// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Format Benchmark Context for System Prompt (NEW — Phase 2)
// ═══════════════════════════════════════════════════════════════════════════

function formatBenchmarkContext(benchmarks, transactions, detection) {
    if (benchmarks.length === 0 && transactions.length === 0) return '';
    
    let context = '';
    
    // ── Market Benchmarks ──
    if (benchmarks.length > 0) {
        const quarterLabel = detection.quarter && detection.year 
            ? `${detection.quarter} ${detection.year}` 
            : benchmarks[0]?.quarter || 'Latest';
        const countyLabel = detection.county 
            ? detection.county.charAt(0).toUpperCase() + detection.county.slice(1) + ' County'
            : 'SWFL Region';
        const sectorLabel = detection.sector
            ? detection.sector.charAt(0).toUpperCase() + detection.sector.slice(1)
            : 'All Sectors';
        
        context += `\n\n[LIVE DATA — INTEL Market Benchmarks: ${countyLabel} | ${sectorLabel} | ${quarterLabel}]\n`;
        context += `Records: ${benchmarks.length} submarket data points\n\n`;
        
        // Group by sector
        const bySector = {};
        for (const b of benchmarks) {
            const key = b.sector || 'Unknown';
            if (!bySector[key]) bySector[key] = [];
            bySector[key].push(b);
        }
        
        for (const [sector, rows] of Object.entries(bySector)) {
            context += `── ${sector.toUpperCase()} ──\n`;
            
            const countyRows = rows.filter(r => !r.submarket || r.submarket === 'County Average' || r.submarket === 'Regional');
            const subRows = rows.filter(r => r.submarket && r.submarket !== 'County Average' && r.submarket !== 'Regional');
            
            for (const r of countyRows) {
                context += `  ${r.county} County Overview (${r.quarter}):\n`;
                if (r.vacancy_rate !== null) {
                    context += `    Vacancy Rate: ${parseFloat(r.vacancy_rate).toFixed(1)}%`;
                    if (r.yoy_vacancy_change !== null) context += ` (YoY: ${parseFloat(r.yoy_vacancy_change) > 0 ? '+' : ''}${parseFloat(r.yoy_vacancy_change).toFixed(1)} bps)`;
                    context += '\n';
                }
                if (r.asking_rent_avg !== null) {
                    context += `    Avg Asking Rent: $${parseFloat(r.asking_rent_avg).toFixed(2)}/SF`;
                    if (r.asking_rent_range_low !== null && r.asking_rent_range_high !== null) context += ` (Range: $${parseFloat(r.asking_rent_range_low).toFixed(2)}-$${parseFloat(r.asking_rent_range_high).toFixed(2)})`;
                    if (r.yoy_rent_change !== null) context += ` | YoY: ${parseFloat(r.yoy_rent_change) > 0 ? '+' : ''}${parseFloat(r.yoy_rent_change).toFixed(1)}%`;
                    context += '\n';
                }
                if (r.cap_rate_avg !== null) {
                    context += `    Avg Cap Rate: ${parseFloat(r.cap_rate_avg).toFixed(2)}%`;
                    if (r.cap_rate_range_low !== null && r.cap_rate_range_high !== null) context += ` (Range: ${parseFloat(r.cap_rate_range_low).toFixed(2)}%-${parseFloat(r.cap_rate_range_high).toFixed(2)}%)`;
                    context += '\n';
                }
                if (r.absorption_sf !== null) {
                    context += `    Net Absorption: ${parseInt(r.absorption_sf).toLocaleString()} SF`;
                    if (r.yoy_absorption_change !== null) context += ` (YoY: ${parseFloat(r.yoy_absorption_change) > 0 ? '+' : ''}${parseFloat(r.yoy_absorption_change).toFixed(1)}%)`;
                    context += '\n';
                }
                if (r.inventory_sf !== null) context += `    Total Inventory: ${parseInt(r.inventory_sf).toLocaleString()} SF (${r.total_buildings || '?'} buildings)\n`;
                if (r.construction_pipeline_sf !== null) context += `    Construction Pipeline: ${parseInt(r.construction_pipeline_sf).toLocaleString()} SF\n`;
                if (r.avg_price_per_sf !== null) context += `    Avg Sale Price/SF: $${parseFloat(r.avg_price_per_sf).toFixed(2)}\n`;
                
                if (r.lease_activity_total_sf !== null) {
                    context += `    Lease Activity: ${parseInt(r.lease_activity_total_sf).toLocaleString()} SF total\n`;
                    if (r.lease_activity_under_2500) context += `      <2,500 SF: ${parseInt(r.lease_activity_under_2500).toLocaleString()} SF\n`;
                    if (r.lease_activity_2500_5000) context += `      2,500-5,000 SF: ${parseInt(r.lease_activity_2500_5000).toLocaleString()} SF\n`;
                    if (r.lease_activity_5000_10000) context += `      5,000-10,000 SF: ${parseInt(r.lease_activity_5000_10000).toLocaleString()} SF\n`;
                    if (r.lease_activity_10000_25000) context += `      10,000-25,000 SF: ${parseInt(r.lease_activity_10000_25000).toLocaleString()} SF\n`;
                    if (r.lease_activity_over_25000) context += `      >25,000 SF: ${parseInt(r.lease_activity_over_25000).toLocaleString()} SF\n`;
                }
                
                if (r.market_trend) context += `    Market Trend: ${r.market_trend}\n`;
                if (r.notes) context += `    Notes: ${r.notes}\n`;
            }
            
            if (subRows.length > 0) {
                context += `\n  Submarket Breakdown:\n`;
                for (const r of subRows) {
                    context += `    ${r.submarket}: `;
                    const parts = [];
                    if (r.vacancy_rate !== null) parts.push(`Vacancy ${parseFloat(r.vacancy_rate).toFixed(1)}%`);
                    if (r.asking_rent_avg !== null) parts.push(`Rent $${parseFloat(r.asking_rent_avg).toFixed(2)}/SF`);
                    if (r.cap_rate_avg !== null) parts.push(`Cap ${parseFloat(r.cap_rate_avg).toFixed(2)}%`);
                    if (r.absorption_sf !== null) parts.push(`Absorption ${parseInt(r.absorption_sf).toLocaleString()} SF`);
                    if (r.inventory_sf !== null) parts.push(`Inventory ${parseInt(r.inventory_sf).toLocaleString()} SF`);
                    context += parts.join(' | ') + '\n';
                }
            }
            
            context += '\n';
        }
    }
    
    // ── Top Transactions ──
    if (transactions.length > 0) {
        const quarterLabel = detection.quarter && detection.year 
            ? `${detection.quarter} ${detection.year}` : 'Recent';
        
        context += `[LIVE DATA — Top Transactions: ${quarterLabel}]\n`;
        context += `Notable deals: ${transactions.length}\n\n`;
        
        for (const t of transactions) {
            context += `  • ${t.property_name || t.property_address}`;
            if (t.county) context += ` (${t.county} County)`;
            context += '\n';
            const details = [];
            if (t.transaction_type) details.push(t.transaction_type);
            if (t.sale_price) details.push(`$${parseInt(t.sale_price).toLocaleString()}`);
            if (t.price_per_sf) details.push(`$${parseFloat(t.price_per_sf).toFixed(2)}/SF`);
            if (t.square_footage) details.push(`${parseInt(t.square_footage).toLocaleString()} SF`);
            if (t.cap_rate) details.push(`${parseFloat(t.cap_rate).toFixed(2)}% cap`);
            if (details.length > 0) context += `    ${details.join(' | ')}\n`;
            if (t.buyer || t.seller) {
                context += `    `;
                if (t.buyer) context += `Buyer: ${t.buyer}`;
                if (t.buyer && t.seller) context += ' | ';
                if (t.seller) context += `Seller: ${t.seller}`;
                context += '\n';
            }
            if (t.notes) context += `    ${t.notes}\n`;
        }
        context += '\n';
    }
    
    return context;
}


// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Parse Uploaded Files
// ═══════════════════════════════════════════════════════════════════════════

async function parseFile(filePath, originalName) {
    const ext = path.extname(originalName).toLowerCase();
    
    try {
        if ((ext === '.xlsx' || ext === '.xls') && ExcelJS) {
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.readFile(filePath);
            let content = '';
            workbook.eachSheet((sheet) => {
                content += `\n--- Sheet: ${sheet.name} ---\n`;
                sheet.eachRow({ includeEmpty: false }, (row, rowNum) => {
                    if (rowNum <= 100) {
                        const vals = row.values.slice(1).map(v => (v && typeof v === 'object' && v.result !== undefined) ? v.result : (v || '')).join(' | ');
                        content += vals + '\n';
                    }
                });
            });
            return content.substring(0, 50000);
        }
        
        if (ext === '.pdf' && pdfParse) {
            const buffer = fs.readFileSync(filePath);
            const data = await pdfParse(buffer);
            return (data.text || '').substring(0, 50000);
        }
        
        if (ext === '.csv' || ext === '.txt') {
            return fs.readFileSync(filePath, 'utf-8').substring(0, 50000);
        }
        
        return `[File uploaded: ${originalName} — content extraction not available for this format]`;
    } catch (err) {
        console.error(`[INTEL AI] File parse error (${originalName}):`, err.message);
        return `[File uploaded: ${originalName} — error parsing: ${err.message}]`;
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Store to Adam Project
// ═══════════════════════════════════════════════════════════════════════════

async function storeToAdamProject(pool, orgId, userId, userName, fileName, parsedContent) {
    if (!pool) return 0;
    
    try {
        const result = await pool.query(
            `INSERT INTO adam_project_data (org_id, uploaded_by, uploaded_by_name, source_file, source_type, record_type, notes, raw_data, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
             RETURNING id`,
            [orgId, userId, userName, fileName, path.extname(fileName).replace('.',''), 'uploaded_file', `Auto-stored from INTEL AI upload`, JSON.stringify({ content_preview: parsedContent.substring(0, 5000) })]
        );
        return result.rows.length;
    } catch (err) {
        console.error('[INTEL AI] Adam Project store error:', err.message);
        return 0;
    }
}


function buildFileContext(parsedFiles) {
    let ctx = '\n\n[UPLOADED FILES]\n';
    for (const f of parsedFiles) {
        ctx += `\n--- ${f.name} ---\n`;
        ctx += f.parsed.substring(0, 15000) + '\n';
    }
    return ctx;
}


// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Excel Export
// ═══════════════════════════════════════════════════════════════════════════

async function generateExcel(exportData) {
    if (!ExcelJS) return null;
    
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Report Data');
    
    if (exportData.headers && exportData.rows) {
        sheet.addRow(exportData.headers);
        for (const row of exportData.rows) {
            sheet.addRow(row);
        }
        
        // Style header row
        const headerRow = sheet.getRow(1);
        headerRow.font = { bold: true };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a2332' } };
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    }
    
    const buffer = await workbook.xlsx.writeBuffer();
    return buffer;
}


// ═══════════════════════════════════════════════════════════════════════════
// MAIN ROUTE REGISTRATION
// ═══════════════════════════════════════════════════════════════════════════

function registerIntelAIRoutes(app, pool) {

    // ── POST /api/intel/ai/chat — AI Research Assistant ──
    app.post('/api/intel/ai/chat', upload.array('files', 10), async (req, res) => {
        if (!req.session || !req.session.user) {
            return res.status(401).json({ success: false, error: 'Not authenticated' });
        }

        try {
            const { messages, reportType, reportCadence } = req.body;
            const parsedMessages = typeof messages === 'string' ? JSON.parse(messages) : messages;

            if (!parsedMessages || !Array.isArray(parsedMessages) || parsedMessages.length === 0) {
                return res.status(400).json({ success: false, error: 'Messages required' });
            }

            const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
            if (!ANTHROPIC_API_KEY) {
                console.error('[INTEL AI] ANTHROPIC_API_KEY not configured');
                return res.status(500).json({ success: false, error: 'AI service not configured. Please set ANTHROPIC_API_KEY.' });
            }

            // ── PARSE UPLOADED FILES ──
            const parsedFiles = [];
            let adamProjectStored = 0;
            
            if (req.files && req.files.length > 0) {
                for (const file of req.files) {
                    console.log(`[INTEL AI] Parsing file: ${file.originalname} (${(file.size/1024).toFixed(1)}KB)`);
                    const parsed = await parseFile(file.path, file.originalname);
                    parsedFiles.push({ name: file.originalname, parsed });
                    
                    if (pool) {
                        const stored = await storeToAdamProject(pool, req.session.org?.id, req.session.user.id, req.session.user.name, file.originalname, parsed);
                        adamProjectStored += stored;
                    }
                    
                    try { fs.unlinkSync(file.path); } catch (e) {}
                }
            }

            // ── BUILD CONTEXT ──
            let contextAdditions = '';

            if (reportType) {
                const reportNames = { cma:'Comparative Market Analysis (CMA)', swot:'SWOT Analysis', cim:'Confidential Information Memorandum (CIM)', bov:'Broker Opinion of Value (BOV)', om:'Offering Memorandum (OM)', market_report:'Market Report / Newsletter' };
                contextAdditions += `\n\nReport type selected: ${reportNames[reportType] || reportType}. Generate this report type.`;
                if (reportType === 'market_report' && reportCadence) {
                    contextAdditions += ` Cadence: ${reportCadence}.`;
                }
            }

            if (parsedFiles.length > 0) {
                contextAdditions += buildFileContext(parsedFiles);
                if (adamProjectStored > 0) {
                    contextAdditions += `\n\n[${adamProjectStored} records from uploaded files stored in The Adam Project for future reference.]`;
                }
            }

            // ══════════════════════════════════════════════════════════
            // DATA ENRICHMENT
            // ══════════════════════════════════════════════════════════
            const lastUserMsg = parsedMessages[parsedMessages.length - 1]?.content || '';
            let dataContext = '';
            const location = extractLocation(lastUserMsg);
            const enrichmentSources = [];

            // ── Adam Project Data ──
            if (pool && (location.city || location.county)) {
                try {
                    const adamQuery = location.city
                        ? `SELECT record_type, property_address, property_city, property_type, square_footage, sale_price, cap_rate, price_per_sf, noi, occupancy_rate, asking_rent, tenant_name, sale_date, source_file FROM adam_project_data WHERE UPPER(property_city) LIKE UPPER($1) ORDER BY created_at DESC LIMIT 20`
                        : `SELECT record_type, property_address, property_city, property_type, square_footage, sale_price, cap_rate, price_per_sf, noi, occupancy_rate, asking_rent, tenant_name, sale_date, source_file FROM adam_project_data WHERE UPPER(property_county) LIKE UPPER($1) ORDER BY created_at DESC LIMIT 20`;
                    
                    const adamResult = await pool.query(adamQuery, ['%' + (location.city || location.county) + '%']);
                    
                    if (adamResult.rows.length > 0) {
                        dataContext += `\n\n[LIVE DATA — The Adam Project: Proprietary CRE Data for ${location.city || location.county}]\nRecords: ${adamResult.rows.length}\n`;
                        adamResult.rows.forEach(r => {
                            const parts = [r.property_address, r.property_type, r.square_footage ? r.square_footage + ' SF' : null, r.sale_price ? '$' + Number(r.sale_price).toLocaleString() : null, r.cap_rate ? r.cap_rate + '% cap' : null, r.tenant_name].filter(Boolean);
                            dataContext += `  - ${parts.join(' | ')} (source: ${r.source_file})\n`;
                        });
                        enrichmentSources.push('Adam Project');
                    }
                } catch (err) { console.error('[INTEL AI] Adam Project error:', err.message); }
            }

            // ── Danimal Data ──
            if (pool && (location.city || location.county)) {
                try {
                    const danimalQuery = location.city
                        ? `SELECT industry, COUNT(*) as count FROM danimal_leads WHERE UPPER(city) LIKE UPPER($1) GROUP BY industry ORDER BY count DESC LIMIT 15`
                        : `SELECT industry, COUNT(*) as count FROM danimal_leads WHERE UPPER(county) = UPPER($1) GROUP BY industry ORDER BY count DESC LIMIT 15`;
                    const countQuery = location.city
                        ? `SELECT COUNT(*) as total FROM danimal_leads WHERE UPPER(city) LIKE UPPER($1)`
                        : `SELECT COUNT(*) as total FROM danimal_leads WHERE UPPER(county) = UPPER($1)`;
                    
                    const param = location.city ? '%' + location.city + '%' : location.county;
                    const danimalResult = await pool.query(danimalQuery, [param]);
                    const countResult = await pool.query(countQuery, [param]);
                    
                    if (danimalResult.rows.length > 0) {
                        const total = parseInt(countResult.rows[0].total);
                        dataContext += `\n\n[LIVE DATA — Danimal Data: Professional Licensees in ${location.city || location.county}]\nTotal: ${total.toLocaleString()}\n`;
                        danimalResult.rows.forEach(row => { dataContext += `  - ${row.industry}: ${parseInt(row.count).toLocaleString()}\n`; });
                        enrichmentSources.push('Danimal Data');
                    }
                } catch (err) { console.error('[INTEL AI] Danimal error:', err.message); }
            }

            // ── Census Data ──
            if (location.county) {
                try {
                    const census = await queryCensus('12', location.county);
                    if (census) {
                        dataContext += `\n\n[LIVE DATA — Census ACS: ${location.county.charAt(0).toUpperCase() + location.county.slice(1)} County Demographics]\n`;
                        dataContext += `  Population: ${census.population.toLocaleString()}\n`;
                        dataContext += `  Median HH Income: $${census.medianHouseholdIncome.toLocaleString()}\n`;
                        dataContext += `  Median Home Value: $${census.medianHomeValue.toLocaleString()}\n`;
                        dataContext += `  Employed Population: ${census.employedPopulation.toLocaleString()}\n`;
                        dataContext += `  Median Age: ${census.medianAge}\n`;
                        dataContext += `  Total Housing Units: ${census.totalHousingUnits.toLocaleString()}\n`;
                        enrichmentSources.push('Census ACS');
                    }
                } catch (err) { console.error('[INTEL AI] Census error:', err.message); }
            }

            // ── FDOT Traffic Data ──
            if (pool && (location.city || location.county)) {
                try {
                    const fdotCheck = await pool.query(`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'fdot_traffic_data')`);
                    if (fdotCheck.rows[0].exists) {
                        const fdotQuery = location.city
                            ? `SELECT road_name, aadt, year, county FROM fdot_traffic_data WHERE UPPER(city) LIKE UPPER($1) ORDER BY aadt DESC LIMIT 10`
                            : `SELECT road_name, aadt, year, county FROM fdot_traffic_data WHERE UPPER(county) LIKE UPPER($1) ORDER BY aadt DESC LIMIT 10`;
                        const fdotResult = await pool.query(fdotQuery, ['%' + (location.city || location.county) + '%']);
                        if (fdotResult.rows.length > 0) {
                            dataContext += `\n\n[LIVE DATA — FDOT Traffic Counts: ${location.city || location.county}]\n`;
                            fdotResult.rows.forEach(r => { dataContext += `  - ${r.road_name}: ${parseInt(r.aadt).toLocaleString()} AADT (${r.year})\n`; });
                            enrichmentSources.push('FDOT Traffic');
                        }
                    }
                } catch (err) { console.error('[INTEL AI] FDOT error:', err.message); }
            }

            // ── Property Appraiser Data ──
            if (pool && (location.city || location.county)) {
                try {
                    const paCheck = await pool.query(`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'properties')`);
                    if (paCheck.rows[0].exists) {
                        const salesQuery = location.city
                            ? `SELECT property_address, sale_price, sale_date FROM properties WHERE UPPER(city) LIKE UPPER($1) AND sale_price > 100000 ORDER BY sale_date DESC LIMIT 10`
                            : `SELECT property_address, sale_price, sale_date FROM properties WHERE UPPER(county) LIKE UPPER($1) AND sale_price > 100000 ORDER BY sale_date DESC LIMIT 10`;
                        const salesResult = await pool.query(salesQuery, ['%' + (location.city || location.county) + '%']);
                        if (salesResult.rows.length > 0) {
                            dataContext += `\n\n[LIVE DATA — Property Appraiser: Recent Sales in ${location.city || location.county}]\n`;
                            salesResult.rows.forEach(s => {
                                dataContext += `  - ${s.property_address}: $${Number(s.sale_price).toLocaleString()} (${s.sale_date ? new Date(s.sale_date).toLocaleDateString() : 'N/A'})\n`;
                            });
                            enrichmentSources.push('Property Records');
                        }
                    }
                } catch (err) { console.error('[INTEL AI] PA error:', err.message); }
            }

            // ══════════════════════════════════════════════════════════
            // INTEL MARKET BENCHMARKS ENRICHMENT (Phase 2 — NEW)
            // ══════════════════════════════════════════════════════════
            const detection = detectSectorAndQuarter(lastUserMsg);
            const isMarketReport = reportType === 'market_report';
            
            if (pool && (detection.sector || detection.county || detection.quarter || isMarketReport)) {
                const queries = [];
                
                if (isMarketReport && detection.county && !detection.sector) {
                    // Pull all 5 sectors for comprehensive market report
                    for (const sector of ['industrial', 'office', 'retail', 'land', 'multifamily']) {
                        queries.push({ ...detection, sector });
                    }
                } else {
                    queries.push(detection);
                }
                
                let allBenchmarks = [];
                let allTransactions = [];
                
                for (const q of queries) {
                    const benchmarks = await queryMarketBenchmarks(pool, q);
                    const txns = await queryTopTransactions(pool, q);
                    allBenchmarks = allBenchmarks.concat(benchmarks);
                    allTransactions = allTransactions.concat(txns);
                }
                
                // Deduplicate transactions
                const txnSeen = new Set();
                allTransactions = allTransactions.filter(t => {
                    const key = (t.property_name || '') + (t.sale_price || '');
                    if (txnSeen.has(key)) return false;
                    txnSeen.add(key);
                    return true;
                });
                
                if (allBenchmarks.length > 0 || allTransactions.length > 0) {
                    dataContext += formatBenchmarkContext(allBenchmarks, allTransactions, detection);
                    enrichmentSources.push('INTEL Market Benchmarks');
                    
                    if (allTransactions.length > 0) {
                        enrichmentSources.push('Top Transactions');
                    }
                    
                    // Apply IQR for CMA/BOV
                    if (reportType === 'cma' || reportType === 'bov') {
                        const iqrAnalysis = applyIQRToBenchmarks(allBenchmarks);
                        if (iqrAnalysis) {
                            dataContext += iqrAnalysis;
                            enrichmentSources.push('IQR Outlier Analysis');
                        }
                    }
                    
                    console.log(`[INTEL AI] Market enrichment: ${allBenchmarks.length} benchmarks, ${allTransactions.length} transactions${detection.sector ? ', sector: ' + detection.sector : ''}${detection.county ? ', county: ' + detection.county : ''}${detection.quarter ? ', quarter: ' + detection.quarter + ' ' + (detection.year || '') : ''}`);
                }
            }

            if (enrichmentSources.length > 0) {
                dataContext += `\n\n[Data sources queried: ${enrichmentSources.join(', ')}]`;
            }

            // ══════════════════════════════════════════════════════════
            // BUILD API REQUEST
            // ══════════════════════════════════════════════════════════
            const systemPrompt = INTEL_AI_SYSTEM_PROMPT + contextAdditions + dataContext;
            const trimmedMessages = parsedMessages.slice(-20);

            const apiBody = {
                model: 'claude-sonnet-4-20250514',
                max_tokens: 8192,
                system: systemPrompt,
                messages: trimmedMessages,
                tools: [{ type: 'web_search_20250305', name: 'web_search' }]
            };

            console.log(`[INTEL AI] Chat from ${req.session.user.name} | Report: ${reportType || 'none'} | Files: ${parsedFiles.length} (${adamProjectStored} stored) | Enrichment: ${enrichmentSources.join(',') || 'none'} | Location: ${location.city || location.county || 'unknown'}`);

            const fetch = globalThis.fetch || (await import('node-fetch')).default;
            const apiResponse = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
                body: JSON.stringify(apiBody)
            });

            if (!apiResponse.ok) {
                const errText = await apiResponse.text();
                console.error(`[INTEL AI] API error ${apiResponse.status}:`, errText);
                return res.status(500).json({ success: false, error: `AI service error (${apiResponse.status}). Please try again.` });
            }

            const apiData = await apiResponse.json();
            const responseText = apiData.content?.filter(b => b.type === 'text').map(b => b.text).filter(Boolean).join('\n') || 'Error generating response.';

            let hasExportData = false;
            const exportMatch = responseText.match(/<!--EXPORT_DATA_START-->([\s\S]*?)<!--EXPORT_DATA_END-->/);
            if (exportMatch) hasExportData = true;

            const tokensIn = apiData.usage?.input_tokens || '?';
            const tokensOut = apiData.usage?.output_tokens || '?';
            const searchUsed = apiData.content?.some(b => b.type === 'tool_use' || b.type === 'web_search_tool_result');

            console.log(`[INTEL AI] Response | Tokens: ${tokensIn}/${tokensOut} | Search: ${searchUsed ? 'yes' : 'no'} | Export: ${hasExportData}`);

            return res.json({
                success: true,
                response: responseText,
                enrichment: enrichmentSources,
                hasExportData,
                usage: { input_tokens: tokensIn, output_tokens: tokensOut }
            });

        } catch (error) {
            console.error('[INTEL AI] Chat error:', error);
            return res.status(500).json({ success: false, error: 'An error occurred. Please try again.' });
        }
    });

    // ── POST /api/intel/ai/export — Export report data to Excel ──
    app.post('/api/intel/ai/export', async (req, res) => {
        if (!req.session || !req.session.user) {
            return res.status(401).json({ success: false, error: 'Not authenticated' });
        }

        try {
            const { exportData } = req.body;
            if (!exportData || !ExcelJS) {
                return res.status(400).json({ success: false, error: 'Export not available' });
            }

            const buffer = await generateExcel(exportData);
            if (!buffer) {
                return res.status(500).json({ success: false, error: 'Failed to generate export' });
            }

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="INTEL_Report_${Date.now()}.xlsx"`);
            return res.send(Buffer.from(buffer));
        } catch (error) {
            console.error('[INTEL AI] Export error:', error);
            return res.status(500).json({ success: false, error: 'Export failed' });
        }
    });

    console.log('[INTEL AI] Research Assistant v3 (Phase 2: Market Intelligence) routes registered');
}

module.exports = { registerIntelAIRoutes };
