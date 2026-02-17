/**
 * INTEL AI RESEARCH ASSISTANT — API ROUTE (v3)
 * Zenith OS — The Adam Project Edition
 *
 * Features:
 * - File upload & parsing (Excel, PDF, CSV)
 * - "Adam Project" persistent knowledge base
 * - Excel CMA export generation
 * - Anthropic API with web_search tool
 * - Danimal Data, Census, FDOT, Property Appraiser enrichment
 *
 * Main Street Group Technology Division
 * Christ is King
 */

const https = require('https');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const ExcelJS = require('exceljs');

// Multer config
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '..', 'uploads');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ts = Date.now();
        const safe = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        cb(null, `${ts}-${safe}`);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
    fileFilter: (req, file, cb) => {
        const allowed = ['.pdf','.xlsx','.xls','.csv','.doc','.docx','.txt','.png','.jpg','.jpeg'];
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, allowed.includes(ext));
    }
});

// ── File Parsers ──
async function parseExcel(filePath) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const results = [];
    workbook.eachSheet((sheet) => {
        const headers = [];
        let headerRow = null;
        sheet.eachRow((row, rowNum) => {
            if (rowNum === 1) {
                headerRow = rowNum;
                row.eachCell((cell, colNum) => {
                    headers[colNum] = String(cell.value || '').trim();
                });
            } else {
                const obj = {};
                row.eachCell((cell, colNum) => {
                    const key = headers[colNum] || `col_${colNum}`;
                    obj[key] = cell.value;
                });
                if (Object.keys(obj).length > 0) results.push(obj);
            }
        });
    });
    return { type: 'spreadsheet', rows: results, rowCount: results.length, headers: results[0] ? Object.keys(results[0]) : [] };
}

async function parsePDF(filePath) {
    const pdfParse = require('pdf-parse');
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    return { type: 'pdf', text: data.text, pages: data.numpages, chars: data.text.length };
}

async function parseCSV(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length === 0) return { type: 'csv', rows: [], rowCount: 0, headers: [] };
    
    // Simple CSV parse (handles basic cases)
    const parseRow = (line) => {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (const ch of line) {
            if (ch === '"') { inQuotes = !inQuotes; }
            else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
            else { current += ch; }
        }
        result.push(current.trim());
        return result;
    };
    
    const headers = parseRow(lines[0]);
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const values = parseRow(lines[i]);
        const obj = {};
        headers.forEach((h, idx) => { if (h) obj[h] = values[idx] || ''; });
        if (Object.keys(obj).length > 0) rows.push(obj);
    }
    return { type: 'csv', rows, rowCount: rows.length, headers };
}

async function parseTxt(filePath) {
    const text = fs.readFileSync(filePath, 'utf-8');
    return { type: 'text', text, chars: text.length };
}

async function parseFile(filePath, originalName) {
    const ext = path.extname(originalName).toLowerCase();
    try {
        if (['.xlsx', '.xls'].includes(ext)) return await parseExcel(filePath);
        if (ext === '.pdf') return await parsePDF(filePath);
        if (ext === '.csv') return await parseCSV(filePath);
        if (['.txt', '.doc', '.docx'].includes(ext)) return await parseTxt(filePath);
        return { type: 'unsupported', message: `Cannot parse ${ext} files yet` };
    } catch (err) {
        console.error(`[INTEL AI] Parse error for ${originalName}:`, err.message);
        return { type: 'error', message: err.message };
    }
}

// ── Adam Project: Store parsed data ──
async function storeToAdamProject(pool, orgId, userId, userName, fileName, parsedData) {
    if (!parsedData || parsedData.type === 'error' || parsedData.type === 'unsupported') return 0;
    
    let stored = 0;
    
    if (parsedData.rows && parsedData.rows.length > 0) {
        // Spreadsheet or CSV — try to extract structured records
        for (const row of parsedData.rows.slice(0, 500)) { // Cap at 500 rows per file
            const raw = JSON.stringify(row);
            
            // Smart field mapping — look for common CRE column names
            const findField = (keys, row) => {
                for (const k of keys) {
                    for (const col of Object.keys(row)) {
                        if (col.toLowerCase().includes(k.toLowerCase())) return row[col];
                    }
                }
                return null;
            };
            
            const address = findField(['address', 'location', 'property', 'site'], row);
            const city = findField(['city', 'market'], row);
            const county = findField(['county', 'submarket'], row);
            const propType = findField(['type', 'property type', 'asset', 'class'], row);
            const sf = findField(['sf', 'square feet', 'sqft', 'size', 'gla', 'area'], row);
            const price = findField(['price', 'sale price', 'sold', 'amount', 'value'], row);
            const capRate = findField(['cap', 'cap rate'], row);
            const ppsf = findField(['price/sf', 'price per sf', '$/sf', 'ppsf'], row);
            const noi = findField(['noi', 'net operating'], row);
            const occ = findField(['occupancy', 'occ', 'leased'], row);
            const rent = findField(['rent', 'asking', 'lease rate'], row);
            const tenant = findField(['tenant', 'lessee', 'occupant'], row);
            
            try {
                await pool.query(`
                    INSERT INTO adam_project_data 
                    (org_id, uploaded_by, uploaded_by_name, source_file, source_type, record_type,
                     property_address, property_city, property_county, property_type,
                     square_footage, sale_price, cap_rate, price_per_sf, noi, 
                     occupancy_rate, asking_rent, tenant_name, raw_data)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
                `, [
                    orgId, userId, userName, fileName, 'upload', propType ? 'comp' : 'data',
                    address ? String(address).substring(0, 500) : null,
                    city ? String(city).substring(0, 255) : null,
                    county ? String(county).substring(0, 255) : null,
                    propType ? String(propType).substring(0, 255) : null,
                    sf ? parseFloat(String(sf).replace(/[^0-9.]/g, '')) || null : null,
                    price ? parseFloat(String(price).replace(/[^0-9.]/g, '')) || null : null,
                    capRate ? parseFloat(String(capRate).replace(/[^0-9.%]/g, '')) || null : null,
                    ppsf ? parseFloat(String(ppsf).replace(/[^0-9.]/g, '')) || null : null,
                    noi ? parseFloat(String(noi).replace(/[^0-9.]/g, '')) || null : null,
                    occ ? parseFloat(String(occ).replace(/[^0-9.%]/g, '')) || null : null,
                    rent ? parseFloat(String(rent).replace(/[^0-9.]/g, '')) || null : null,
                    tenant ? String(tenant).substring(0, 500) : null,
                    raw
                ]);
                stored++;
            } catch (dbErr) {
                // Skip individual row errors
            }
        }
    }
    
    return stored;
}

// ── Build file context for Claude ──
function buildFileContext(parsedFiles) {
    let context = '';
    for (const pf of parsedFiles) {
        context += `\n\n[UPLOADED FILE — ${pf.name}]\n`;
        if (pf.parsed.type === 'spreadsheet' || pf.parsed.type === 'csv') {
            context += `Type: ${pf.parsed.type} | Rows: ${pf.parsed.rowCount} | Columns: ${pf.parsed.headers.join(', ')}\n`;
            // Include first 30 rows as context
            const sample = pf.parsed.rows.slice(0, 30);
            if (sample.length > 0) {
                context += `Data:\n`;
                // Header row
                const cols = pf.parsed.headers.slice(0, 15); // cap columns
                context += '| ' + cols.join(' | ') + ' |\n';
                context += '| ' + cols.map(() => '---').join(' | ') + ' |\n';
                sample.forEach(row => {
                    context += '| ' + cols.map(c => {
                        let v = row[c];
                        if (v === null || v === undefined) return '';
                        if (typeof v === 'object' && v.result !== undefined) v = v.result;
                        return String(v).substring(0, 40);
                    }).join(' | ') + ' |\n';
                });
                if (pf.parsed.rowCount > 30) {
                    context += `... and ${pf.parsed.rowCount - 30} more rows\n`;
                }
            }
        } else if (pf.parsed.type === 'pdf' || pf.parsed.type === 'text') {
            context += `Type: ${pf.parsed.type} | Pages: ${pf.parsed.pages || 'N/A'} | Characters: ${pf.parsed.chars}\n`;
            // Include up to 8000 chars of text
            const txt = pf.parsed.text || '';
            context += txt.substring(0, 8000);
            if (txt.length > 8000) context += `\n... (truncated, ${txt.length - 8000} more characters)`;
        } else {
            context += `Type: ${pf.parsed.type} | ${pf.parsed.message || ''}\n`;
        }
    }
    return context;
}


// ── System Prompt ──
const INTEL_AI_SYSTEM_PROMPT = `You are INTEL Research AI, the intelligence engine powering Zenith OS for CRE Consultants — a commercial real estate brokerage in Southwest Florida.

You are helping Adam Kerner (Director of Market Research & Data Analytics) and the CRE Consultants brokerage team generate professional CRE reports and analysis.

## YOUR CAPABILITIES

You generate the following report types:

### CMA — Comparative Market Analysis
- Analyze comparable property sales, active listings, and market trends
- Include price per SF, cap rates, days on market, absorption rates
- Compare subject property against 3-5 relevant comps within defined radius
- Provide market positioning and pricing recommendations
- USE WEB SEARCH to find actual comparable sales data from CoStar, CREXi, LoopNet, and public records

### SWOT — SWOT Analysis
- Strengths: Property attributes, location advantages, tenant quality, physical condition
- Weaknesses: Deferred maintenance, vacancy, lease rollover risk, access issues
- Opportunities: Value-add potential, market trends, zoning changes, development pipeline
- Threats: Competition, economic indicators, regulatory changes, environmental risks

### CIM — Confidential Information Memorandum
- Executive Summary with investment highlights
- Property Overview (location, size, year built, construction, parking, zoning)
- Financial Analysis (rent roll, operating expenses, NOI, cap rate, cash-on-cash)
- Tenant Profiles with lease terms and credit quality
- Area Overview with demographics, economics, and growth drivers
- Market Outlook and comparable transactions

### BOV — Broker Opinion of Value
- Income Approach (NOI / cap rate with market cap rate support)
- Sales Comparison Approach (comparable sales analysis)
- Cost Approach (when applicable)
- Reconciled value range with confidence assessment
- Market conditions affecting value

### OM — Offering Memorandum
- Property Highlights and Investment Summary
- Financial Overview (income, expenses, NOI, returns)
- Tenant Information and Lease Abstract
- Area Demographics and Economic Overview
- Traffic Counts and Accessibility
- Site Plan, Aerial Views, and Location Map references

### Market Report — Newsletter Market Intelligence
- Available in cadences: Daily, Weekly, Monthly, Quarterly, Semi-Annual, Annual
- Format as a professional newsletter suitable for distribution to clients and investors

## FILE ANALYSIS
When files are uploaded (Excel, PDF, CSV), you receive the parsed contents in your context. 
- For spreadsheets: Analyze all columns, identify property data, comps, rent rolls, and financial data
- For PDFs: Extract key information from offering memorandums, appraisals, environmental reports, lease abstracts
- Incorporate file data directly into your analysis — these are primary data sources
- When you identify structured property data (comps, sales, rents), note that it has been stored in "The Adam Project" database for future reference

## EXCEL EXPORT
When you generate a CMA, BOV, or any report with tabular data, include a structured JSON block at the end of your response wrapped in <!--EXPORT_DATA_START--> and <!--EXPORT_DATA_END--> tags. Format:
{"title":"Report Title","sheets":[{"name":"Sheet Name","headers":["Col1","Col2"],"rows":[["val1","val2"]]}]}
This enables the Excel export button for the user. Include multiple sheets when appropriate (e.g., "Comparable Sales", "Financial Summary", "Market Overview").

## IMPORTANT INSTRUCTIONS FOR WEB SEARCH
You have access to the web_search tool. USE IT AGGRESSIVELY for:
- Finding actual comparable sales and transaction data
- Current cap rates and market pricing for specific property types and locations
- Recent news about developments, tenants, and market activity in Southwest Florida
- Verifying property details (size, year built, ownership, tenant roster)
- Current interest rates and capital markets conditions
- Traffic counts from FDOT when not provided in data context
- Demographic data when not provided in data context

When you search and find real data, present it WITH the source. Only use [VERIFY] tags for data requiring proprietary access or physical inspection.

## DATA SOURCES
You have access to enriched data injected into your context from:
- **The Adam Project**: Proprietary CRE data uploaded by the team (comps, rent rolls, operating statements, market data)
- **Danimal Data**: 1.5M+ Florida DBPR professional licensees
- **Census API**: Population, median household income, home values, employment statistics
- **FDOT Traffic Counts**: Annual Average Daily Traffic (AADT) for Florida road segments
- **County Property Appraiser**: Property sales, assessments, ownership records
- **Web Search**: Real-time access to current market data, news, and property information

## FORMATTING STANDARDS
- Structure reports professionally matching institutional CRE standards (TCG, CBRE, JLL quality)
- Use clear section headers with **bold** formatting
- Present financial data in organized tables using markdown
- Lead with executive summary/key findings
- Include relevant data points with sources cited

## MARKET CONTEXT
- Southwest Florida market area: Lee, Charlotte, Collier, Sarasota, and Manatee counties
- CRE Consultants is a full-service commercial real estate brokerage based in Fort Myers, FL
- Key team: Dan Smith (Principal Broker), Mitchell Tindell (Senior Associate), Chris Khouri (Managing Director), Jonathan Agee (Director of Marketing), Adam Kerner (Director of Market Research & Data Analytics)`;


// ── Helper: Census API Query ──
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

// ── Helper: Extract Location ──
function extractLocation(message) {
    const msgLower = message.toLowerCase();
    const cityCountyMap = {
        'fort myers': 'lee', 'cape coral': 'lee', 'lehigh acres': 'lee',
        'bonita springs': 'lee', 'estero': 'lee', 'sanibel': 'lee',
        'naples': 'collier', 'marco island': 'collier', 'immokalee': 'collier',
        'punta gorda': 'charlotte', 'port charlotte': 'charlotte',
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


// ── Excel Export Generator ──
async function generateExcel(exportData) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Zenith OS — INTEL Research';
    workbook.created = new Date();
    
    for (const sheet of exportData.sheets) {
        const ws = workbook.addWorksheet(sheet.name);
        
        // Title row
        ws.mergeCells(1, 1, 1, sheet.headers.length);
        const titleCell = ws.getCell('A1');
        titleCell.value = exportData.title || 'INTEL Research Report';
        titleCell.font = { size: 14, bold: true, color: { argb: 'FF1B7A4A' } };
        titleCell.alignment = { horizontal: 'left' };
        
        // Subtitle
        ws.mergeCells(2, 1, 2, sheet.headers.length);
        const subCell = ws.getCell('A2');
        subCell.value = `Generated by INTEL Research AI — CRE Consultants — ${new Date().toLocaleDateString()}`;
        subCell.font = { size: 9, italic: true, color: { argb: 'FF666666' } };
        
        // Headers at row 4
        const headerRow = ws.getRow(4);
        sheet.headers.forEach((h, i) => {
            const cell = headerRow.getCell(i + 1);
            cell.value = h;
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B7A4A' } };
            cell.border = { bottom: { style: 'thin', color: { argb: 'FF1B7A4A' } } };
            cell.alignment = { horizontal: 'center', wrapText: true };
        });
        
        // Data rows
        sheet.rows.forEach((row, rowIdx) => {
            const dataRow = ws.getRow(5 + rowIdx);
            row.forEach((val, colIdx) => {
                const cell = dataRow.getCell(colIdx + 1);
                // Try to parse numbers
                const num = parseFloat(String(val).replace(/[$,%]/g, ''));
                if (!isNaN(num) && String(val).match(/^[\$\d,.\-%]+$/)) {
                    cell.value = num;
                    if (String(val).includes('$')) cell.numFmt = '$#,##0';
                    else if (String(val).includes('%')) cell.numFmt = '0.00%';
                    else cell.numFmt = '#,##0';
                } else {
                    cell.value = val;
                }
                // Alternate row shading
                if (rowIdx % 2 === 0) {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
                }
                cell.font = { size: 10 };
                cell.alignment = { wrapText: true };
            });
        });
        
        // Auto-width columns
        sheet.headers.forEach((h, i) => {
            const col = ws.getColumn(i + 1);
            let maxLen = h.length;
            sheet.rows.forEach(row => {
                const val = String(row[i] || '');
                if (val.length > maxLen) maxLen = val.length;
            });
            col.width = Math.min(Math.max(maxLen + 4, 12), 40);
        });
        
        // Footer
        const footerRow = ws.getRow(5 + sheet.rows.length + 1);
        ws.mergeCells(footerRow.number, 1, footerRow.number, sheet.headers.length);
        const footerCell = footerRow.getCell(1);
        footerCell.value = 'CRE Consultants — Fort Myers, FL | Data sourced from The Adam Project, Danimal Data, public records, and web research';
        footerCell.font = { size: 8, italic: true, color: { argb: 'FF999999' } };
    }
    
    const buffer = await workbook.xlsx.writeBuffer();
    return buffer;
}


// ══════════════════════════════════════════════
// MAIN ROUTE REGISTRATION
// ══════════════════════════════════════════════
function registerIntelAIRoutes(app, pool) {

    // POST /api/intel/ai/chat — AI Research with file upload support
    app.post('/api/intel/ai/chat', upload.array('files', 10), async (req, res) => {
        if (!req.session || !req.session.user) {
            return res.status(401).json({ success: false, error: 'Not authenticated' });
        }

        try {
            // Parse body — may come as FormData or JSON
            let messages, reportType, reportCadence, fileNames;
            
            if (req.is('multipart/form-data')) {
                messages = JSON.parse(req.body.messages || '[]');
                reportType = req.body.reportType || null;
                reportCadence = req.body.reportCadence || null;
                fileNames = req.body.fileNames ? JSON.parse(req.body.fileNames) : [];
            } else {
                ({ messages, reportType, reportCadence } = req.body);
                fileNames = req.body.files || [];
            }

            if (!messages || !Array.isArray(messages) || messages.length === 0) {
                return res.status(400).json({ success: false, error: 'Messages required' });
            }

            const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
            if (!ANTHROPIC_API_KEY) {
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
                    
                    // Store to Adam Project
                    if (pool) {
                        const stored = await storeToAdamProject(
                            pool,
                            req.session.org?.id,
                            req.session.user.id,
                            req.session.user.name,
                            file.originalname,
                            parsed
                        );
                        adamProjectStored += stored;
                    }
                    
                    // Clean up temp file
                    try { fs.unlinkSync(file.path); } catch (e) {}
                }
            }

            // ── BUILD CONTEXT ──
            let contextAdditions = '';

            // Report type
            if (reportType) {
                const reportNames = { cma:'Comparative Market Analysis (CMA)', swot:'SWOT Analysis', cim:'Confidential Information Memorandum (CIM)', bov:'Broker Opinion of Value (BOV)', om:'Offering Memorandum (OM)', market_report:'Market Report / Newsletter' };
                contextAdditions += `\n\nReport type selected: ${reportNames[reportType] || reportType}. Generate this report type.`;
                if (reportType === 'market_report' && reportCadence) {
                    contextAdditions += ` Cadence: ${reportCadence}.`;
                }
            }

            // File context
            if (parsedFiles.length > 0) {
                contextAdditions += buildFileContext(parsedFiles);
                if (adamProjectStored > 0) {
                    contextAdditions += `\n\n[${adamProjectStored} records from uploaded files have been stored in The Adam Project database for future reference.]`;
                }
            }

            // ── DATA ENRICHMENT ──
            const lastUserMsg = messages[messages.length - 1]?.content || '';
            let dataContext = '';
            const location = extractLocation(lastUserMsg);
            const enrichmentSources = [];

            // Adam Project data
            if (pool && (location.city || location.county)) {
                try {
                    const adamQuery = location.city
                        ? `SELECT record_type, property_address, property_city, property_type, square_footage, sale_price, cap_rate, price_per_sf, noi, occupancy_rate, asking_rent, tenant_name, sale_date, source_file 
                           FROM adam_project_data WHERE UPPER(property_city) LIKE UPPER($1) ORDER BY created_at DESC LIMIT 20`
                        : `SELECT record_type, property_address, property_city, property_type, square_footage, sale_price, cap_rate, price_per_sf, noi, occupancy_rate, asking_rent, tenant_name, sale_date, source_file 
                           FROM adam_project_data WHERE UPPER(property_county) LIKE UPPER($1) ORDER BY created_at DESC LIMIT 20`;
                    
                    const adamResult = await pool.query(adamQuery, ['%' + (location.city || location.county) + '%']);
                    
                    if (adamResult.rows.length > 0) {
                        dataContext += `\n\n[LIVE DATA — The Adam Project: Proprietary CRE Data for ${location.city || location.county}]\n`;
                        dataContext += `Records: ${adamResult.rows.length}\n`;
                        adamResult.rows.forEach(r => {
                            const parts = [r.property_address, r.property_type, r.square_footage ? r.square_footage + ' SF' : null, r.sale_price ? '$' + Number(r.sale_price).toLocaleString() : null, r.cap_rate ? r.cap_rate + '% cap' : null, r.tenant_name].filter(Boolean);
                            dataContext += `  - ${parts.join(' | ')} (source: ${r.source_file})\n`;
                        });
                        enrichmentSources.push('Adam Project');
                    }
                } catch (err) {
                    console.error('[INTEL AI] Adam Project query error:', err.message);
                }
            }

            // Danimal Data
            if (pool && location.city) {
                try {
                    const danimalResult = await pool.query(`SELECT industry, COUNT(*) as count FROM danimal_leads WHERE UPPER(city) LIKE UPPER($1) GROUP BY industry ORDER BY count DESC LIMIT 15`, ['%' + location.city + '%']);
                    const countResult = await pool.query(`SELECT COUNT(*) as total FROM danimal_leads WHERE UPPER(city) LIKE UPPER($1)`, ['%' + location.city + '%']);
                    if (danimalResult.rows.length > 0) {
                        const total = parseInt(countResult.rows[0].total);
                        dataContext += `\n\n[LIVE DATA — Danimal Data: Professional Licensees in ${location.city}]\nTotal: ${total.toLocaleString()}\n`;
                        danimalResult.rows.forEach(row => { dataContext += `  - ${row.industry}: ${parseInt(row.count).toLocaleString()}\n`; });
                        enrichmentSources.push('Danimal Data');
                    }
                } catch (err) { console.error('[INTEL AI] Danimal error:', err.message); }
            } else if (pool && location.county) {
                try {
                    const danimalResult = await pool.query(`SELECT industry, COUNT(*) as count FROM danimal_leads WHERE UPPER(county) = UPPER($1) GROUP BY industry ORDER BY count DESC LIMIT 15`, [location.county]);
                    const countResult = await pool.query(`SELECT COUNT(*) as total FROM danimal_leads WHERE UPPER(county) = UPPER($1)`, [location.county]);
                    if (danimalResult.rows.length > 0) {
                        const total = parseInt(countResult.rows[0].total);
                        dataContext += `\n\n[LIVE DATA — Danimal Data: Professional Licensees in ${location.county} County]\nTotal: ${total.toLocaleString()}\n`;
                        danimalResult.rows.forEach(row => { dataContext += `  - ${row.industry}: ${parseInt(row.count).toLocaleString()}\n`; });
                        enrichmentSources.push('Danimal Data');
                    }
                } catch (err) { console.error('[INTEL AI] Danimal error:', err.message); }
            }

            // Census
            if (location.county) {
                try {
                    const census = await queryCensus('12', location.county);
                    if (census) {
                        dataContext += `\n\n[LIVE DATA — Census ACS 5-Year: ${location.county} County, FL]\n`;
                        dataContext += `Population: ${census.population.toLocaleString()}\nMedian HH Income: $${census.medianHouseholdIncome.toLocaleString()}\nMedian Home Value: $${census.medianHomeValue.toLocaleString()}\nEmployed: ${census.employedPopulation.toLocaleString()}\nMedian Age: ${census.medianAge}\nHousing Units: ${census.totalHousingUnits.toLocaleString()}\n`;
                        enrichmentSources.push('Census API');
                    }
                } catch (err) { console.error('[INTEL AI] Census error:', err.message); }
            }

            // FDOT
            if (pool && (location.city || location.county)) {
                try {
                    const fdotCheck = await pool.query(`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'fdot_traffic') as exists`);
                    if (fdotCheck.rows[0].exists) {
                        const fdotResult = await pool.query(`SELECT road_name, aadt, county, year FROM fdot_traffic WHERE UPPER(county) = UPPER($1) ORDER BY aadt DESC LIMIT 10`, [location.county || location.city]);
                        if (fdotResult.rows.length > 0) {
                            dataContext += `\n\n[LIVE DATA — FDOT Traffic: ${location.county || location.city}]\n`;
                            fdotResult.rows.forEach(row => { dataContext += `  - ${row.road_name}: ${parseInt(row.aadt).toLocaleString()} AADT (${row.year})\n`; });
                            enrichmentSources.push('FDOT Traffic');
                        }
                    }
                } catch (err) { console.error('[INTEL AI] FDOT error:', err.message); }
            }

            // Property Appraiser
            if (pool && location.county) {
                try {
                    const paCheck = await pool.query(`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'properties') as exists`);
                    if (paCheck.rows[0].exists) {
                        const salesResult = await pool.query(`SELECT COUNT(*) as total_sales, AVG(sale_price) as avg_price, MIN(sale_price) as min_price, MAX(sale_price) as max_price FROM property_sales WHERE sale_price > 10000 AND sale_date >= NOW() - INTERVAL '24 months'`);
                        if (salesResult.rows.length > 0 && parseInt(salesResult.rows[0].total_sales) > 0) {
                            const s = salesResult.rows[0];
                            dataContext += `\n\n[LIVE DATA — Property Appraiser: Recent Sales (24mo)]\nTransactions: ${parseInt(s.total_sales).toLocaleString()}\nAvg Price: $${Math.round(parseFloat(s.avg_price)).toLocaleString()}\nRange: $${Math.round(parseFloat(s.min_price)).toLocaleString()} - $${Math.round(parseFloat(s.max_price)).toLocaleString()}\n`;
                            enrichmentSources.push('Property Records');
                        }
                    }
                } catch (err) { console.error('[INTEL AI] PA error:', err.message); }
            }

            if (enrichmentSources.length > 0) {
                dataContext += `\n\n[Data sources queried: ${enrichmentSources.join(', ')}]`;
            }

            // ── BUILD API REQUEST ──
            const systemPrompt = INTEL_AI_SYSTEM_PROMPT + contextAdditions + dataContext;
            const trimmedMessages = messages.slice(-20);

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

            // Check for export data
            let hasExportData = false;
            const exportMatch = responseText.match(/<!--EXPORT_DATA_START-->([\s\S]*?)<!--EXPORT_DATA_END-->/);
            if (exportMatch) hasExportData = true;

            const tokensIn = apiData.usage?.input_tokens || '?';
            const tokensOut = apiData.usage?.output_tokens || '?';
            const searchUsed = apiData.content?.some(b => b.type === 'tool_use' || b.type === 'web_search_tool_result');

            console.log(`[INTEL AI] Response | Tokens: ${tokensIn}/${tokensOut} | Search: ${searchUsed ? 'yes' : 'no'} | Export: ${hasExportData} | Adam Project: +${adamProjectStored}`);

            return res.json({
                success: true,
                response: responseText.replace(/<!--EXPORT_DATA_START-->[\s\S]*?<!--EXPORT_DATA_END-->/, '').trim(),
                enrichment: enrichmentSources,
                searchUsed: searchUsed === true,
                hasExportData,
                adamProjectStored,
                filesProcessed: parsedFiles.map(f => ({ name: f.name, type: f.parsed.type, rows: f.parsed.rowCount || 0 }))
            });

        } catch (error) {
            console.error('[INTEL AI] Chat error:', error);
            return res.status(500).json({ success: false, error: 'An error occurred. Please try again.' });
        }
    });


    // ── Parse markdown tables from AI response ──
    function parseMarkdownTables(text) {
        const tables = [];
        const lines = text.split('\n');
        let currentTable = null;
        let currentSection = 'Report Data';
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Track section headers
            if (line.startsWith('## ') || line.startsWith('### ') || line.startsWith('**') && line.endsWith('**')) {
                currentSection = line.replace(/^#+\s*/, '').replace(/\*\*/g, '').trim();
            }
            
            // Detect markdown table row
            if (line.startsWith('|') && line.endsWith('|')) {
                const cells = line.split('|').slice(1, -1).map(c => c.trim());
                
                // Skip separator rows (|---|---|)
                if (cells.every(c => /^[-:]+$/.test(c))) continue;
                
                if (!currentTable) {
                    currentTable = { name: currentSection.substring(0, 31), headers: cells, rows: [] };
                } else {
                    currentTable.rows.push(cells);
                }
            } else {
                if (currentTable && currentTable.rows.length > 0) {
                    tables.push(currentTable);
                }
                currentTable = null;
            }
        }
        if (currentTable && currentTable.rows.length > 0) tables.push(currentTable);
        
        // If no tables found, extract key-value pairs from bullet points
        if (tables.length === 0) {
            const kvPairs = [];
            for (const line of lines) {
                const match = line.match(/^[\-•]\s*\*?\*?(.+?)\*?\*?\s*[:：]\s*(.+)$/);
                if (match) kvPairs.push([match[1].trim(), match[2].trim()]);
            }
            if (kvPairs.length > 0) {
                tables.push({ name: 'Report Summary', headers: ['Metric', 'Value'], rows: kvPairs });
            }
        }
        
        return tables;
    }

    // POST /api/intel/ai/export — Generate Excel from AI response
    app.post('/api/intel/ai/export', async (req, res) => {
        if (!req.session || !req.session.user) return res.status(401).json({ success: false, error: 'Not authenticated' });
        
        try {
            const { exportData, format } = req.body;
            if (!exportData) return res.status(400).json({ success: false, error: 'No data to export' });
            
            const responseText = typeof exportData === 'string' ? exportData : JSON.stringify(exportData);
            const tables = parseMarkdownTables(responseText);
            
            if (format === 'docx') {
                // ── Word Export ──
                const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
                        AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType } = require('docx');
                
                const children = [];
                const lines = responseText.split('\n');
                
                // Title
                children.push(new Paragraph({
                    children: [new TextRun({ text: 'INTEL Research Report', bold: true, size: 32, font: 'Arial', color: '1B7A4A' })],
                    spacing: { after: 100 }
                }));
                children.push(new Paragraph({
                    children: [new TextRun({ text: `CRE Consultants — Generated ${new Date().toLocaleDateString()}`, italics: true, size: 18, font: 'Arial', color: '666666' })],
                    spacing: { after: 300 }
                }));
                
                // Parse content line by line
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) { children.push(new Paragraph({ spacing: { after: 80 } })); continue; }
                    
                    // Skip export tags
                    if (trimmed.includes('EXPORT_DATA')) continue;
                    
                    // Headers
                    if (trimmed.startsWith('### ')) {
                        children.push(new Paragraph({
                            children: [new TextRun({ text: trimmed.replace(/^###\s*/, '').replace(/\*\*/g, ''), bold: true, size: 24, font: 'Arial', color: '1B7A4A' })],
                            spacing: { before: 200, after: 100 }
                        }));
                    } else if (trimmed.startsWith('## ')) {
                        children.push(new Paragraph({
                            children: [new TextRun({ text: trimmed.replace(/^##\s*/, '').replace(/\*\*/g, ''), bold: true, size: 28, font: 'Arial', color: '1B7A4A' })],
                            spacing: { before: 240, after: 120 }
                        }));
                    } else if (trimmed.startsWith('---')) {
                        children.push(new Paragraph({
                            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC', space: 1 } },
                            spacing: { before: 100, after: 100 }
                        }));
                    } else if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
                        // Skip — tables handled separately below
                    } else if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
                        const text = trimmed.replace(/^[-•]\s*/, '').replace(/\*\*/g, '');
                        children.push(new Paragraph({
                            children: [new TextRun({ text: '•  ' + text, size: 20, font: 'Arial' })],
                            indent: { left: 360 }, spacing: { after: 60 }
                        }));
                    } else {
                        // Regular paragraph — handle bold markers
                        const parts = trimmed.split(/\*\*(.*?)\*\*/g);
                        const runs = [];
                        parts.forEach((part, idx) => {
                            if (!part) return;
                            runs.push(new TextRun({ text: part, bold: idx % 2 === 1, size: 20, font: 'Arial' }));
                        });
                        if (runs.length > 0) {
                            children.push(new Paragraph({ children: runs, spacing: { after: 80 } }));
                        }
                    }
                }
                
                // Add parsed tables as Word tables
                for (const t of tables) {
                    const border = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
                    const borders = { top: border, bottom: border, left: border, right: border };
                    const colCount = t.headers.length;
                    const colWidth = Math.floor(9360 / colCount);
                    
                    children.push(new Paragraph({ spacing: { before: 200 } }));
                    
                    const headerRow = new TableRow({
                        children: t.headers.map(h => new TableCell({
                            borders, width: { size: colWidth, type: WidthType.DXA },
                            shading: { fill: '1B7A4A', type: ShadingType.CLEAR },
                            margins: { top: 60, bottom: 60, left: 80, right: 80 },
                            children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: 'FFFFFF', size: 18, font: 'Arial' })], alignment: AlignmentType.CENTER })]
                        }))
                    });
                    
                    const dataRows = t.rows.map((row, rIdx) => new TableRow({
                        children: row.map((cell, cIdx) => new TableCell({
                            borders, width: { size: colWidth, type: WidthType.DXA },
                            shading: rIdx % 2 === 0 ? { fill: 'F5F5F5', type: ShadingType.CLEAR } : undefined,
                            margins: { top: 40, bottom: 40, left: 80, right: 80 },
                            children: [new Paragraph({ children: [new TextRun({ text: cell || '', size: 18, font: 'Arial' })] })]
                        }))
                    }));
                    
                    children.push(new Table({
                        width: { size: 9360, type: WidthType.DXA },
                        columnWidths: Array(colCount).fill(colWidth),
                        rows: [headerRow, ...dataRows]
                    }));
                }
                
                // Footer
                children.push(new Paragraph({ spacing: { before: 400 } }));
                children.push(new Paragraph({
                    children: [new TextRun({ text: 'CRE Consultants — Fort Myers, FL | Powered by Zenith OS INTEL Research', italics: true, size: 16, font: 'Arial', color: '999999' })]
                }));
                
                const doc = new Document({
                    sections: [{
                        properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
                        children
                    }]
                });
                
                const buffer = await Packer.toBuffer(doc);
                const filename = 'INTEL_Report_' + new Date().toISOString().split('T')[0] + '.docx';
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
                res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
                res.send(Buffer.from(buffer));
                console.log(`[INTEL AI] Word export: ${filename} by ${req.session.user.name}`);
                
            } else {
                // ── Excel Export ──
                if (tables.length === 0) {
                    return res.status(400).json({ success: false, error: 'No tabular data found in the response to export.' });
                }
                
                const buffer = await generateExcel({ title: 'INTEL Research Report', sheets: tables });
                const filename = 'INTEL_Report_' + new Date().toISOString().split('T')[0] + '.xlsx';
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
                res.send(Buffer.from(buffer));
                console.log(`[INTEL AI] Excel export: ${filename} by ${req.session.user.name}`);
            }
        } catch (err) {
            console.error('[INTEL AI] Export error:', err);
            res.status(500).json({ success: false, error: 'Failed to generate export file' });
        }
    });


    // GET /api/intel/ai/adam-project/stats — Adam Project stats
    app.get('/api/intel/ai/adam-project/stats', async (req, res) => {
        if (!req.session || !req.session.user) return res.status(401).json({ success: false, error: 'Not authenticated' });
        try {
            const result = await pool.query(`
                SELECT COUNT(*) as total_records,
                       COUNT(DISTINCT source_file) as total_files,
                       COUNT(DISTINCT property_city) as cities,
                       COUNT(DISTINCT uploaded_by_name) as contributors,
                       MAX(created_at) as last_upload
                FROM adam_project_data WHERE org_id = $1
            `, [req.session.org?.id]);
            res.json({ success: true, stats: result.rows[0] });
        } catch (err) {
            res.json({ success: true, stats: { total_records: 0, total_files: 0 } });
        }
    });


    console.log('[INTEL AI] Research Assistant v3 routes registered (files + Adam Project + Excel export)');
}

module.exports = { registerIntelAIRoutes };