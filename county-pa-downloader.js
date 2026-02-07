/**
 * DANIMAL DATA - Florida County Property Appraiser Downloader
 * 
 * Downloads property records from Florida County Property Appraisers
 * Some counties offer direct bulk downloads, others require scraping
 * 
 * USAGE:
 *   node county-pa-downloader.js
 * 
 * Main Street Group Technology Division
 * © 2026 All Rights Reserved
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// ============================================
// CONFIGURATION
// ============================================
const DOWNLOAD_FOLDER = path.join(__dirname, 'county-pa-downloads');

// ============================================
// FLORIDA COUNTY PROPERTY APPRAISER DATA SOURCES
// Counties with direct bulk download links
// ============================================
const COUNTY_DOWNLOADS = [
    // ══════════════════════════════════════════════
    // CHARLOTTE COUNTY - Direct Downloads
    // ══════════════════════════════════════════════
    { 
        county: 'Charlotte',
        url: 'https://www.ccappraiser.com/downloads/nalweb2025.zip',
        name: 'Charlotte NAL Web Data 2025',
        type: 'Property Records'
    },
    { 
        county: 'Charlotte',
        url: 'https://www.ccappraiser.com/downloads/sales.zip',
        name: 'Charlotte Sales Data',
        type: 'Sales Records'
    },
    { 
        county: 'Charlotte',
        url: 'https://www.ccappraiser.com/downloads/sale2008and%20prior.zip',
        name: 'Charlotte Sales 2008 and Prior',
        type: 'Historical Sales'
    },

    // ══════════════════════════════════════════════
    // COLLIER COUNTY - Direct Downloads
    // ══════════════════════════════════════════════
    {
        county: 'Collier',
        url: 'https://www.collierappraiser.com/Main_Data/downloadgdfile.asp?folderName=INT%20FILES%20(NEW)&file=intfiles_csv.zip',
        name: 'Collier INT Files CSV',
        type: 'Property Records'
    },
    {
        county: 'Collier',
        url: 'https://www.collierappraiser.com/Main_Data/downloadgdfile.asp?folderName=INT%20FILES%20(NEW)&file=int_naics12_csv.zip',
        name: 'Collier NAICS Business Codes',
        type: 'Business Records'
    },
    {
        county: 'Collier',
        url: 'https://www.collierappraiser.com/Main_Data/downloadgdfile.asp?folderName=GIS%20(Shape%20files)&file=parcel_polygon_shape_file.zip',
        name: 'Collier Parcel GIS Shapes',
        type: 'GIS Data'
    },

    // ══════════════════════════════════════════════
    // PALM BEACH COUNTY - Direct Downloads
    // ══════════════════════════════════════════════
    {
        county: 'Palm Beach',
        url: 'https://www.pbcgov.org/papa/downloads/parcels.zip',
        name: 'Palm Beach Parcels',
        type: 'Property Records'
    },

    // ══════════════════════════════════════════════
    // HILLSBOROUGH COUNTY - Direct Downloads
    // ══════════════════════════════════════════════
    {
        county: 'Hillsborough',
        url: 'https://gis.hcpafl.org/downloads/parcels.zip',
        name: 'Hillsborough Parcels',
        type: 'Property Records'
    },

    // ══════════════════════════════════════════════
    // ORANGE COUNTY - Direct Downloads
    // ══════════════════════════════════════════════
    {
        county: 'Orange',
        url: 'https://www.ocpafl.org/downloads/NAL_Export.zip',
        name: 'Orange NAL Export',
        type: 'Property Records'
    },

    // ══════════════════════════════════════════════
    // PINELLAS COUNTY - Direct Downloads
    // ══════════════════════════════════════════════
    {
        county: 'Pinellas',
        url: 'https://www.pcpao.org/downloads/nal.zip',
        name: 'Pinellas NAL Data',
        type: 'Property Records'
    },

    // ══════════════════════════════════════════════
    // DUVAL/JACKSONVILLE - Direct Downloads
    // ══════════════════════════════════════════════
    {
        county: 'Duval',
        url: 'https://www.coj.net/departments/property-appraiser/docs/downloads/parcels.zip',
        name: 'Duval Parcels',
        type: 'Property Records'
    },

    // ══════════════════════════════════════════════
    // BROWARD COUNTY - Direct Downloads
    // ══════════════════════════════════════════════
    {
        county: 'Broward',
        url: 'https://www.bcpa.net/downloads/nal.zip',
        name: 'Broward NAL Data',
        type: 'Property Records'
    },

    // ══════════════════════════════════════════════
    // MIAMI-DADE COUNTY - Direct Downloads
    // ══════════════════════════════════════════════
    {
        county: 'Miami-Dade',
        url: 'https://www.miamidade.gov/Apps/PA/PropertySearch/downloads/nal.zip',
        name: 'Miami-Dade NAL Data',
        type: 'Property Records'
    },

    // ══════════════════════════════════════════════
    // BREVARD COUNTY
    // ══════════════════════════════════════════════
    {
        county: 'Brevard',
        url: 'https://www.bcpao.us/downloads/NAL.zip',
        name: 'Brevard NAL Data',
        type: 'Property Records'
    },

    // ══════════════════════════════════════════════
    // VOLUSIA COUNTY
    // ══════════════════════════════════════════════
    {
        county: 'Volusia',
        url: 'https://vcpa.vcgov.org/downloads/nal.zip',
        name: 'Volusia NAL Data',
        type: 'Property Records'
    },

    // ══════════════════════════════════════════════
    // POLK COUNTY
    // ══════════════════════════════════════════════
    {
        county: 'Polk',
        url: 'https://www.polkpa.org/downloads/NAL.zip',
        name: 'Polk NAL Data',
        type: 'Property Records'
    },

    // ══════════════════════════════════════════════
    // SEMINOLE COUNTY
    // ══════════════════════════════════════════════
    {
        county: 'Seminole',
        url: 'https://www.scpafl.org/downloads/nal.zip',
        name: 'Seminole NAL Data',
        type: 'Property Records'
    },

    // ══════════════════════════════════════════════
    // SARASOTA COUNTY
    // ══════════════════════════════════════════════
    {
        county: 'Sarasota',
        url: 'https://www.sc-pa.com/downloads/nal.zip',
        name: 'Sarasota NAL Data',
        type: 'Property Records'
    },

    // ══════════════════════════════════════════════
    // MANATEE COUNTY
    // ══════════════════════════════════════════════
    {
        county: 'Manatee',
        url: 'https://www.manateepao.com/downloads/NAL.zip',
        name: 'Manatee NAL Data',
        type: 'Property Records'
    },

    // ══════════════════════════════════════════════
    // PASCO COUNTY
    // ══════════════════════════════════════════════
    {
        county: 'Pasco',
        url: 'https://www.pascopa.com/downloads/NAL.zip',
        name: 'Pasco NAL Data',
        type: 'Property Records'
    },

    // ══════════════════════════════════════════════
    // LAKE COUNTY
    // ══════════════════════════════════════════════
    {
        county: 'Lake',
        url: 'https://www.lakecopropappr.com/downloads/nal.zip',
        name: 'Lake NAL Data',
        type: 'Property Records'
    },

    // ══════════════════════════════════════════════
    // OSCEOLA COUNTY
    // ══════════════════════════════════════════════
    {
        county: 'Osceola',
        url: 'https://www.property-appraiser.org/downloads/NAL.zip',
        name: 'Osceola NAL Data',
        type: 'Property Records'
    },

    // ══════════════════════════════════════════════
    // ST. LUCIE COUNTY
    // ══════════════════════════════════════════════
    {
        county: 'St. Lucie',
        url: 'https://www.paslc.org/downloads/nal.zip',
        name: 'St. Lucie NAL Data',
        type: 'Property Records'
    },

    // ══════════════════════════════════════════════
    // MARTIN COUNTY
    // ══════════════════════════════════════════════
    {
        county: 'Martin',
        url: 'https://www.pa.martin.fl.us/downloads/nal.zip',
        name: 'Martin NAL Data',
        type: 'Property Records'
    },

    // ══════════════════════════════════════════════
    // INDIAN RIVER COUNTY
    // ══════════════════════════════════════════════
    {
        county: 'Indian River',
        url: 'https://www.ircpa.org/downloads/NAL.zip',
        name: 'Indian River NAL Data',
        type: 'Property Records'
    },
];

// Counties that require special handling (web forms, login, etc.)
const SPECIAL_COUNTIES = [
    {
        county: 'Lee',
        website: 'https://www.leepa.org',
        notes: 'Requires web form submission - use Parcel List Generator or Tax Roll page',
        taxRoll: 'https://www.leepa.org/Roll/TaxRoll.aspx',
        parcelGenerator: 'https://www.leepa.org/OnlineReports/ParcelListGenerator.aspx'
    },
    {
        county: 'Alachua',
        website: 'https://www.acpafl.org',
        notes: 'GIS data available, may require login'
    },
    {
        county: 'Escambia',
        website: 'https://www.escpa.org',
        notes: 'Check downloads section'
    },
    {
        county: 'Leon',
        website: 'https://www.leonpa.org',
        notes: 'Check GIS data section'
    },
];

// ============================================
// DOWNLOAD FUNCTION
// ============================================

function downloadFile(fileInfo) {
    return new Promise((resolve) => {
        // Extract clean filename - handle URLs with query parameters
        let urlFilename = fileInfo.url.split('/').pop();
        
        // If URL has query params like ?file=something.zip, extract the file param
        if (urlFilename.includes('?') || urlFilename.includes('&')) {
            const fileMatch = fileInfo.url.match(/file=([^&]+)/i);
            if (fileMatch) {
                urlFilename = decodeURIComponent(fileMatch[1]);
            } else {
                // Fallback: use the name field
                urlFilename = fileInfo.name.replace(/[^a-z0-9]/gi, '_') + '.zip';
            }
        }
        
        const filename = `${fileInfo.county.replace(/[^a-z0-9]/gi, '_')}_${urlFilename}`;
        const filePath = path.join(DOWNLOAD_FOLDER, filename);
        
        // Skip if already exists and has content
        if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            if (stats.size > 10000) { // More than 10KB
                console.log(`   ⏭ ${filename} (exists - ${(stats.size/1024/1024).toFixed(2)} MB)`);
                return resolve({ success: true, skipped: true, file: filename, size: stats.size });
            }
        }
        
        process.stdout.write(`   ⬇ ${fileInfo.county} - ${fileInfo.name}... `);
        
        const file = fs.createWriteStream(filePath);
        const protocol = fileInfo.url.startsWith('https') ? https : http;
        
        const request = protocol.get(fileInfo.url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Accept-Encoding': 'gzip, deflate, br',
            },
            timeout: 120000 // 2 minute timeout for large files
        }, (response) => {
            // Handle redirects
            if (response.statusCode === 301 || response.statusCode === 302) {
                file.close();
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                const newUrl = response.headers.location;
                console.log(`→ redirect`);
                fileInfo.url = newUrl.startsWith('http') ? newUrl : new URL(newUrl, fileInfo.url).href;
                return downloadFile(fileInfo).then(resolve);
            }
            
            if (response.statusCode === 404) {
                file.close();
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                console.log(`✗ Not Found (404)`);
                return resolve({ success: false, error: '404 Not Found', file: filename });
            }
            
            if (response.statusCode !== 200) {
                file.close();
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                console.log(`✗ HTTP ${response.statusCode}`);
                return resolve({ success: false, error: `HTTP ${response.statusCode}`, file: filename });
            }
            
            response.pipe(file);
            
            file.on('finish', () => {
                file.close();
                const stats = fs.statSync(filePath);
                const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
                console.log(`✓ ${sizeMB} MB`);
                resolve({ success: true, file: filename, size: stats.size });
            });
            
        });
        
        request.on('error', (err) => {
            file.close();
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            console.log(`✗ ${err.message}`);
            resolve({ success: false, error: err.message, file: filename });
        });
        
        request.on('timeout', () => {
            request.destroy();
            file.close();
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            console.log(`✗ Timeout`);
            resolve({ success: false, error: 'Timeout', file: filename });
        });
    });
}

// ============================================
// MAIN
// ============================================

async function main() {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║   DANIMAL DATA - County Property Appraiser Downloader    ║');
    console.log('║              Main Street Group Technology                ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log('');
    
    // Create download folder
    if (!fs.existsSync(DOWNLOAD_FOLDER)) {
        fs.mkdirSync(DOWNLOAD_FOLDER, { recursive: true });
    }
    
    console.log(`📁 Download folder: ${DOWNLOAD_FOLDER}`);
    console.log(`📋 Counties to download: ${COUNTY_DOWNLOADS.length}`);
    console.log('');
    
    const startTime = Date.now();
    const results = { success: 0, failed: 0, skipped: 0, totalSize: 0 };
    const failedCounties = [];
    
    // Group by county
    const byCounty = {};
    COUNTY_DOWNLOADS.forEach(f => {
        if (!byCounty[f.county]) byCounty[f.county] = [];
        byCounty[f.county].push(f);
    });
    
    for (const [county, files] of Object.entries(byCounty)) {
        console.log(`\n📍 ${county} County`);
        console.log('─'.repeat(50));
        
        for (const fileInfo of files) {
            const result = await downloadFile(fileInfo);
            
            if (result.success) {
                if (result.skipped) {
                    results.skipped++;
                    results.totalSize += result.size || 0;
                } else {
                    results.success++;
                    results.totalSize += result.size || 0;
                }
            } else {
                results.failed++;
                failedCounties.push({ county, name: fileInfo.name, error: result.error });
            }
            
            // Delay between downloads
            await new Promise(r => setTimeout(r, 1000));
        }
    }
    
    const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    
    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║                  DOWNLOAD COMPLETE                       ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log(`\n✓ Downloaded: ${results.success} files`);
    console.log(`⏭ Skipped: ${results.skipped} files (already existed)`);
    console.log(`✗ Failed: ${results.failed} files`);
    console.log(`📦 Total size: ${(results.totalSize/1024/1024).toFixed(1)} MB`);
    console.log(`⏱ Duration: ${duration} minutes`);
    
    // Show failed downloads
    if (failedCounties.length > 0) {
        console.log('\n⚠ Failed downloads:');
        failedCounties.forEach(f => console.log(`   - ${f.county}: ${f.name} (${f.error})`));
    }
    
    // Show special counties that need manual attention
    console.log('\n📋 Counties requiring manual download or Puppeteer:');
    SPECIAL_COUNTIES.forEach(c => {
        console.log(`   - ${c.county}: ${c.website}`);
        console.log(`     ${c.notes}`);
    });
    
    console.log(`\n📁 Files saved to: ${DOWNLOAD_FOLDER}`);
}

main().catch(err => {
    console.error('Download failed:', err);
    process.exit(1);
});
