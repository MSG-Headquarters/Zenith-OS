/**
 * DANIMAL DATA - Google Places API Enrichment
 * 
 * Enriches leads with phone numbers, websites, and emails
 * using Google Places API
 * 
 * SETUP:
 *   1. Get a Google Places API key from Google Cloud Console
 *   2. Enable "Places API" and "Places API (New)" in your project
 *   3. Set your API key below or as environment variable GOOGLE_PLACES_API_KEY
 * 
 * USAGE:
 *   node google-places-enrichment.js [limit]
 *   
 *   limit: Number of leads to enrich (default: 100)
 * 
 * Main Street Group Technology Division
 * © 2026 All Rights Reserved
 */

const https = require('https');
const { Pool } = require('pg');

// ============================================
// CONFIGURATION
// ============================================

// Set your Google Places API key here or use environment variable
const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY || 'AIzaSyD4QQIX_CakJd_mNUMWzzM8tknQ2abv6ZI';

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://zenith_admin:ZenithDB2026secure@zenith-db.cnqawc0wy3sg.us-east-2.rds.amazonaws.com:5432/zenith_db',
    ssl: { rejectUnauthorized: false }
});

// Rate limiting - Google allows 1000 requests per day on free tier
const DELAY_BETWEEN_REQUESTS = 200; // milliseconds
const BATCH_SIZE = 50;

// ============================================
// GOOGLE PLACES API FUNCTIONS
// ============================================

async function searchPlace(businessName, city, state) {
    return new Promise((resolve) => {
        const query = encodeURIComponent(`${businessName} ${city} ${state}`);
        const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${query}&inputtype=textquery&fields=place_id,name,formatted_address&key=${GOOGLE_API_KEY}`;
        
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    if (result.status === 'OK' && result.candidates && result.candidates.length > 0) {
                        resolve(result.candidates[0]);
                    } else {
                        resolve(null);
                    }
                } catch (e) {
                    resolve(null);
                }
            });
        }).on('error', () => resolve(null));
    });
}

async function getPlaceDetails(placeId) {
    return new Promise((resolve) => {
        const fields = 'name,formatted_phone_number,international_phone_number,website,url,rating,user_ratings_total,business_status,types';
        const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&key=${GOOGLE_API_KEY}`;
        
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    if (result.status === 'OK' && result.result) {
                        resolve(result.result);
                    } else {
                        resolve(null);
                    }
                } catch (e) {
                    resolve(null);
                }
            });
        }).on('error', () => resolve(null));
    });
}

// ============================================
// DATABASE FUNCTIONS
// ============================================

async function getLeadsToEnrich(limit) {
    // Get leads that don't have phone/website and haven't been enriched
    const query = `
        SELECT id, business_name, city, state, phone, website, email
        FROM danimal_leads
        WHERE (phone IS NULL OR website IS NULL)
        AND business_name IS NOT NULL
        AND city IS NOT NULL
        AND enriched_at IS NULL
        ORDER BY lead_score DESC
        LIMIT $1
    `;
    
    const result = await pool.query(query, [limit]);
    return result.rows;
}

async function updateLeadWithEnrichment(id, data) {
    const updates = [];
    const values = [];
    let paramIndex = 1;
    
    if (data.phone) {
        updates.push(`phone = $${paramIndex++}`);
        values.push(data.phone);
    }
    
    if (data.website) {
        updates.push(`website = $${paramIndex++}`);
        values.push(data.website);
    }
    
    if (data.rating) {
        // Store in a metadata field or lead_score adjustment
        // For now, boost lead score if highly rated
        if (data.rating >= 4.0) {
            updates.push(`lead_score = LEAST(lead_score + 10, 100)`);
        }
    }
    
    // Mark as enriched
    updates.push(`enriched_at = NOW()`);
    updates.push(`updated_at = NOW()`);
    
    if (updates.length === 0) return false;
    
    values.push(id);
    const query = `UPDATE danimal_leads SET ${updates.join(', ')} WHERE id = $${paramIndex}`;
    
    try {
        await pool.query(query, values);
        return true;
    } catch (err) {
        return false;
    }
}

async function markLeadAsEnriched(id) {
    // Mark as attempted even if no data found
    await pool.query('UPDATE danimal_leads SET enriched_at = NOW() WHERE id = $1', [id]);
}

// ============================================
// ENSURE ENRICHED_AT COLUMN EXISTS
// ============================================

async function ensureEnrichedColumn() {
    try {
        await pool.query(`
            ALTER TABLE danimal_leads 
            ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMP
        `);
    } catch (err) {
        // Column might already exist
    }
}

// ============================================
// MAIN ENRICHMENT FUNCTION
// ============================================

async function enrichLeads(limit) {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║    DANIMAL DATA - Google Places API Enrichment          ║');
    console.log('║              Main Street Group Technology                ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log('');
    
    // Check API key
    if (GOOGLE_API_KEY === 'YOUR_API_KEY_HERE') {
        console.log('❌ ERROR: Please set your Google Places API key!');
        console.log('');
        console.log('   Option 1: Edit this file and replace YOUR_API_KEY_HERE');
        console.log('   Option 2: Set environment variable GOOGLE_PLACES_API_KEY');
        console.log('');
        console.log('   To get an API key:');
        console.log('   1. Go to https://console.cloud.google.com/');
        console.log('   2. Create a project or select existing');
        console.log('   3. Enable "Places API" in APIs & Services');
        console.log('   4. Create credentials > API Key');
        console.log('');
        return;
    }
    
    // Test database connection
    try {
        await pool.query('SELECT 1');
        console.log('✓ Database connected');
    } catch (err) {
        console.log('❌ Database connection failed:', err.message);
        return;
    }
    
    // Ensure enriched_at column exists
    await ensureEnrichedColumn();
    
    // Get leads to enrich
    console.log(`\n📊 Fetching up to ${limit} leads to enrich...`);
    const leads = await getLeadsToEnrich(limit);
    console.log(`   Found ${leads.length} leads needing enrichment\n`);
    
    if (leads.length === 0) {
        console.log('✓ All leads already enriched or have contact info!');
        return;
    }
    
    const startTime = Date.now();
    let enriched = 0;
    let notFound = 0;
    let errors = 0;
    
    console.log('📍 Enriching leads with Google Places data...\n');
    
    for (let i = 0; i < leads.length; i++) {
        const lead = leads[i];
        const progress = `[${i + 1}/${leads.length}]`;
        
        process.stdout.write(`   ${progress} ${lead.business_name.substring(0, 40).padEnd(40)}... `);
        
        try {
            // Search for the place
            const place = await searchPlace(lead.business_name, lead.city, lead.state || 'FL');
            
            if (place && place.place_id) {
                // Get detailed info
                const details = await getPlaceDetails(place.place_id);
                
                if (details) {
                    const enrichmentData = {
                        phone: details.formatted_phone_number || details.international_phone_number,
                        website: details.website,
                        rating: details.rating,
                    };
                    
                    if (enrichmentData.phone || enrichmentData.website) {
                        await updateLeadWithEnrichment(lead.id, enrichmentData);
                        console.log(`✓ ${enrichmentData.phone || ''} ${enrichmentData.website ? '🌐' : ''}`);
                        enriched++;
                    } else {
                        await markLeadAsEnriched(lead.id);
                        console.log('○ No contact info');
                        notFound++;
                    }
                } else {
                    await markLeadAsEnriched(lead.id);
                    console.log('○ No details');
                    notFound++;
                }
            } else {
                await markLeadAsEnriched(lead.id);
                console.log('○ Not found');
                notFound++;
            }
        } catch (err) {
            console.log(`✗ Error`);
            errors++;
        }
        
        // Rate limiting delay
        await new Promise(r => setTimeout(r, DELAY_BETWEEN_REQUESTS));
    }
    
    const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    
    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║                ENRICHMENT COMPLETE                       ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log(`\n✓ Enriched: ${enriched} leads (added phone/website)`);
    console.log(`○ Not found: ${notFound} leads`);
    console.log(`✗ Errors: ${errors}`);
    console.log(`⏱ Duration: ${duration} minutes`);
    
    // Show sample of enriched data
    const sampleQuery = `
        SELECT business_name, phone, website, lead_score 
        FROM danimal_leads 
        WHERE enriched_at IS NOT NULL AND (phone IS NOT NULL OR website IS NOT NULL)
        ORDER BY enriched_at DESC
        LIMIT 5
    `;
    const sample = await pool.query(sampleQuery);
    
    if (sample.rows.length > 0) {
        console.log('\n📋 Sample enriched leads:');
        sample.rows.forEach(r => {
            console.log(`   ${r.business_name.substring(0, 30).padEnd(30)} | ${(r.phone || '').padEnd(14)} | ${r.website || ''}`);
        });
    }
    
    await pool.end();
}

// ============================================
// MAIN
// ============================================

const limit = parseInt(process.argv[2]) || 100;
enrichLeads(limit).catch(err => {
    console.error('Enrichment failed:', err);
    process.exit(1);
});
