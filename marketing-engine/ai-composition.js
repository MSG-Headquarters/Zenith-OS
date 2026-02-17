// ═══════════════════════════════════════════════════════════════════════════
// ZENITH OS — MARKETING SUITE — AI COMPOSITION ENGINE
// Claude API Integration: Batched photo classification + property overview
// Single API workflow per draft for maximum efficiency
// Main Street Group LLC © 2026
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// ── CONFIGURATION ───────────────────────────────────────────────────────
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-sonnet-4-5-20250929';
const MAX_TOKENS = 4096;

// ── PHOTO THUMBNAIL GENERATOR ───────────────────────────────────────────
// Resize photos to efficient thumbnails for API classification
// Full-res not needed for classification — saves tokens and latency

async function generateThumbnail(imagePath, maxDim = 512) {
  const metadata = await sharp(imagePath).metadata();
  const buffer = await sharp(imagePath)
    .resize(maxDim, maxDim, { fit: 'inside', withoutEnlargement: false })
    .jpeg({ quality: 80 })
    .toBuffer();

  return {
    base64: buffer.toString('base64'),
    mediaType: 'image/jpeg',
    originalWidth: metadata.width,
    originalHeight: metadata.height,
  };
}

// ── SYSTEM PROMPT ───────────────────────────────────────────────────────
// Defines Claude's role as a CRE marketing specialist

const SYSTEM_PROMPT = `You are a commercial real estate marketing specialist working within Zenith OS, a CRE technology platform. Your job is to analyze listing data and photos to produce professional marketing materials.

You will receive:
1. Structured CRM listing data (property details, pricing, location, broker info)
2. One or more listing photos to classify

You must return a JSON response with exactly this structure:
{
  "photo_classifications": [
    {
      "photo_index": 0,
      "classification": "exterior|interior|aerial|floor_plan|detail|warehouse|parking|landscape|location_map|signage",
      "confidence": 0.0-1.0,
      "description": "Brief description of what's in the photo",
      "recommended_zone": "hero_cover|secondary_exterior|interior_detail|aerial_full|floorplan|location_reference|detail_grid",
      "focal_point": { "x": 0.0-1.0, "y": 0.0-1.0 }
    }
  ],
  "property_overview": "2-3 paragraph professional property overview suitable for a marketing flyer. Write in third person, present tense. Highlight location advantages, property features, and market positioning. Do NOT include pricing — that's handled separately in the template. Use confident, professional CRE marketing language.",
  "tagline_suggestion": "A compelling 5-8 word tagline for the property header",
  "highlights_enhanced": ["Array of 6-8 polished property highlight bullet points"],
  "seo_keywords": ["Array of 5-10 relevant search keywords for digital distribution"]
}

Classification categories:
- exterior: Building exterior, street view, facade
- interior: Office space, lobby, common area, reception
- aerial: Drone/elevated view, bird's eye, satellite
- floor_plan: Architectural floor plan, layout diagram
- detail: Close-up of features, equipment, signage, amenities
- warehouse: Industrial interior, loading dock, storage
- parking: Parking lot, garage, loading area
- landscape: Undeveloped land, vacant site, terrain
- location_map: Satellite map with annotations, area map
- signage: Property signage, tenant signage, wayfinding

Recommended zones map to template slots:
- hero_cover: Primary exterior/aerial for cover page hero (best quality, most impressive angle)
- secondary_exterior: Supporting exterior shot for details page
- interior_detail: Interior shots for photo gallery pages
- aerial_full: Drone/aerial for dedicated aerial page
- floorplan: Floor plan for floorplan page
- location_reference: Map/location context for location page
- detail_grid: Equipment, amenities, signage for detail grid

CRITICAL: Return ONLY valid JSON. No markdown, no code fences, no preamble.`;

// ── BATCHED API CALL ────────────────────────────────────────────────────
// Single API call that handles both photo classification and text generation

async function composeDraft(listing, photoBuffers, apiKey) {
  const startTime = Date.now();

  console.log(`\n  🤖 AI Composition Engine (Claude API)`);
  console.log(`  ────────────────────────────────────────`);
  console.log(`  Model: ${CLAUDE_MODEL}`);
  console.log(`  Photos: ${photoBuffers.length}`);
  console.log(`  Property: ${listing.property_name}`);

  // Build the user message with structured listing data + photos
  const listingContext = buildListingContext(listing);

  // Build content array: text prompt + image thumbnails
  const content = [];

  // Add each photo as an image block
  for (let i = 0; i < photoBuffers.length; i++) {
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: photoBuffers[i].mediaType,
        data: photoBuffers[i].base64,
      },
    });
    content.push({
      type: 'text',
      text: `[Photo ${i + 1} of ${photoBuffers.length}] — Original: ${photoBuffers[i].originalWidth}×${photoBuffers[i].originalHeight}px`,
    });
  }

  // Add the listing data and instructions
  content.push({
    type: 'text',
    text: `\n\n--- CRM LISTING DATA ---\n${listingContext}\n\n--- INSTRUCTIONS ---\nAnalyze the ${photoBuffers.length} photos above and the listing data. Return a single JSON object with photo_classifications (for each photo), property_overview (2-3 paragraphs), tagline_suggestion, highlights_enhanced (6-8 bullets), and seo_keywords (5-10). Return ONLY valid JSON.`,
  });

  // Make the API call
  console.log(`  Calling Claude API...`);

  const requestBody = {
    model: CLAUDE_MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [
      { role: 'user', content },
    ],
  };

  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // Extract text response
  const textContent = data.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('');

  // Parse JSON response
  let result;
  try {
    // Strip any markdown fences if present
    const cleaned = textContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    result = JSON.parse(cleaned);
  } catch (parseErr) {
    console.error(`  ⚠ JSON parse error, attempting extraction...`);
    // Try to extract JSON from the response
    const jsonMatch = textContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      result = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error(`Failed to parse Claude API response as JSON: ${parseErr.message}`);
    }
  }

  // Log results
  const inputTokens = data.usage?.input_tokens || 0;
  const outputTokens = data.usage?.output_tokens || 0;

  console.log(`  ✓ Response received: ${elapsed}s`);
  console.log(`  ✓ Tokens: ${inputTokens} in / ${outputTokens} out`);
  console.log(`  ✓ Photos classified: ${result.photo_classifications?.length || 0}`);
  console.log(`  ✓ Overview: ${(result.property_overview || '').length} chars`);
  console.log(`  ✓ Tagline: "${result.tagline_suggestion || 'N/A'}"`);
  console.log(`  ✓ Highlights: ${result.highlights_enhanced?.length || 0} items`);
  console.log(`  ✓ Keywords: ${result.seo_keywords?.length || 0} terms`);
  console.log(`  ────────────────────────────────────────\n`);

  return {
    ...result,
    apiMetrics: {
      model: CLAUDE_MODEL,
      inputTokens,
      outputTokens,
      latencyMs: parseFloat(elapsed) * 1000,
    },
  };
}

// ── LISTING CONTEXT BUILDER ─────────────────────────────────────────────
// Formats CRM listing data into a clean context string for the API

function buildListingContext(listing) {
  const lines = [];

  lines.push(`Property Name: ${listing.property_name || 'N/A'}`);
  if (listing.tagline) lines.push(`Tagline: ${listing.tagline}`);
  lines.push(`Listing Type: ${listing.listing_type || 'N/A'}`);
  lines.push(`Address: ${listing.address || 'N/A'}`);
  lines.push(`City/State: ${listing.city || ''}, ${listing.state || 'FL'} ${listing.zip || ''}`);

  if (listing.price) lines.push(`Price: $${Number(listing.price).toLocaleString()}`);
  if (listing.price_psf) lines.push(`Price/SF: $${listing.price_psf}`);
  if (listing.lease_rate) lines.push(`Lease Rate: $${listing.lease_rate}/SF`);
  if (listing.lease_type) lines.push(`Lease Type: ${listing.lease_type}`);
  if (listing.cam) lines.push(`CAM: $${listing.cam}/SF`);
  if (listing.cap_rate) lines.push(`Cap Rate: ${listing.cap_rate}`);

  if (listing.building_sf) lines.push(`Building Size: ${Number(listing.building_sf).toLocaleString()}± SF`);
  if (listing.land_acres) lines.push(`Land Area: ${listing.land_acres}± Acres`);
  if (listing.zoning) lines.push(`Zoning: ${listing.zoning}`);
  if (listing.year_built) lines.push(`Year Built: ${listing.year_built}`);
  if (listing.parking) lines.push(`Parking: ${listing.parking}`);

  lines.push(`\nBroker: ${listing.broker || 'N/A'}`);
  if (listing.broker_title) lines.push(`Title: ${listing.broker_title}`);
  if (listing.broker2) lines.push(`Broker 2: ${listing.broker2} — ${listing.broker2_title || ''}`);

  if (listing.highlights && listing.highlights.length > 0) {
    lines.push(`\nExisting Highlights:`);
    listing.highlights.forEach(h => lines.push(`  • ${h}`));
  }

  if (listing.overview) {
    lines.push(`\nExisting Overview (enhance this):\n${listing.overview}`);
  }

  return lines.join('\n');
}

// ── OFFLINE FALLBACK ────────────────────────────────────────────────────
// When API key is not available, generates reasonable defaults
// This ensures the pipeline never breaks even without API access

function composeDraftOffline(listing, photoMeta) {
  console.log(`\n  🤖 AI Composition Engine (OFFLINE MODE)`);
  console.log(`  ────────────────────────────────────────`);
  console.log(`  No API key — using intelligent fallback`);

  // Classify photos from metadata heuristics
  const classifications = photoMeta.map((meta, i) => {
    let classification = 'exterior';
    let zone = 'secondary_exterior';
    const ratio = meta.originalWidth / meta.originalHeight;

    if (ratio > 1.8) {
      classification = 'aerial';
      zone = i === 0 ? 'hero_cover' : 'aerial_full';
    } else if (ratio > 1.4) {
      classification = 'exterior';
      zone = i === 0 ? 'hero_cover' : 'secondary_exterior';
    } else if (ratio < 0.8) {
      classification = 'interior';
      zone = 'interior_detail';
    } else if (meta.avgBrightness > 200) {
      classification = 'floor_plan';
      zone = 'floorplan';
    }

    return {
      photo_index: i,
      classification,
      confidence: 0.6,
      description: `Photo ${i + 1} — auto-classified from image properties`,
      recommended_zone: zone,
      focal_point: { x: 0.5, y: 0.45 },
    };
  });

  // Generate property overview from CRM data
  const overview = generateOverviewFromCRM(listing);
  const tagline = generateTagline(listing);
  const highlights = enhanceHighlights(listing.highlights || []);

  console.log(`  ✓ Photos classified: ${classifications.length} (heuristic)`);
  console.log(`  ✓ Overview: ${overview.length} chars (template-generated)`);
  console.log(`  ✓ Tagline: "${tagline}"`);
  console.log(`  ✓ Highlights: ${highlights.length} items`);
  console.log(`  ────────────────────────────────────────\n`);

  return {
    photo_classifications: classifications,
    property_overview: overview,
    tagline_suggestion: tagline,
    highlights_enhanced: highlights,
    seo_keywords: generateKeywords(listing),
    apiMetrics: { model: 'offline-fallback', inputTokens: 0, outputTokens: 0, latencyMs: 0 },
  };
}

// ── TEXT GENERATION HELPERS (Offline Fallback) ──────────────────────────

function generateOverviewFromCRM(listing) {
  const parts = [];

  // Opening
  const typeDesc = {
    for_sale: 'an exceptional acquisition opportunity',
    for_lease: 'a premier leasing opportunity',
    sale_or_lease: 'a versatile commercial opportunity available for sale or lease',
    investment: 'a compelling investment opportunity',
    land_sale: 'a prime development site',
    build_to_suit: 'a build-to-suit opportunity',
    retail_lease: 'a prime retail leasing opportunity',
    specialty: 'a unique commercial property',
  }[listing.listing_type] || 'a commercial property opportunity';

  parts.push(`${listing.property_name} presents ${typeDesc} at ${listing.address}.`);

  // Property specs
  const specs = [];
  if (listing.building_sf) specs.push(`${Number(listing.building_sf).toLocaleString()}± square feet of commercial space`);
  if (listing.land_acres) specs.push(`${listing.land_acres}± acres`);
  if (listing.zoning) specs.push(`${listing.zoning} zoning`);
  if (listing.year_built) specs.push(`built in ${listing.year_built}`);

  if (specs.length > 0) {
    parts.push(`The property features ${specs.join(', ')}.`);
  }

  // Location context
  if (listing.city) {
    parts.push(`\n\nStrategically located in ${listing.city}, ${listing.state || 'FL'}, the property benefits from excellent visibility and accessibility within one of the market's most active commercial corridors.`);
  }

  // Closing
  if (listing.highlights && listing.highlights.length > 0) {
    const topHighlights = listing.highlights.slice(0, 3).join(', ');
    parts.push(`Key features include ${topHighlights.toLowerCase()}.`);
  }

  return parts.join(' ');
}

function generateTagline(listing) {
  const typeWords = {
    for_sale: 'Acquisition Opportunity',
    for_lease: 'Leasing Opportunity',
    sale_or_lease: 'Commercial Opportunity',
    investment: 'Investment Opportunity',
    land_sale: 'Development Site',
    build_to_suit: 'Build-to-Suit',
    retail_lease: 'Retail Space',
    specialty: 'Unique Opportunity',
  };
  const typeWord = typeWords[listing.listing_type] || 'Commercial Property';

  if (listing.building_sf) {
    return `${Number(listing.building_sf).toLocaleString()}± SF ${typeWord} — ${listing.city || 'FL'}`;
  }
  if (listing.land_acres) {
    return `${listing.land_acres}± Acre ${typeWord} — ${listing.city || 'FL'}`;
  }
  return `Premier ${typeWord} — ${listing.city || 'FL'}`;
}

function enhanceHighlights(highlights) {
  if (highlights.length === 0) return ['Prime commercial location', 'Excellent visibility and access'];
  // Return existing highlights — in production, Claude API would polish these
  return highlights.slice(0, 8);
}

function generateKeywords(listing) {
  const keywords = [];
  if (listing.city) keywords.push(`${listing.city} commercial real estate`);
  if (listing.listing_type) keywords.push(listing.listing_type.replace(/_/g, ' '));
  if (listing.zoning) keywords.push(listing.zoning);
  if (listing.property_name) keywords.push(listing.property_name.toLowerCase());
  keywords.push('CRE', 'commercial property', listing.state || 'FL');
  return keywords.slice(0, 10);
}

// ── FULL COMPOSITION WORKFLOW ───────────────────────────────────────────
// Orchestrates the complete AI composition: photos + text in one pass

async function composeMarketingDraft(listing, photoPaths, options = {}) {
  const { apiKey = null, forceOffline = false } = options;
  const startTime = Date.now();

  console.log(`\n${'═'.repeat(55)}`);
  console.log(`  AI COMPOSITION WORKFLOW`);
  console.log(`  ${listing.property_name}`);
  console.log(`${'═'.repeat(55)}`);

  // Step 1: Generate thumbnails for API
  console.log(`\n  Step 1: Generating thumbnails for AI analysis...`);
  const thumbnails = [];
  for (let i = 0; i < photoPaths.length; i++) {
    const thumb = await generateThumbnail(photoPaths[i]);
    thumbnails.push(thumb);
    console.log(`    [${i + 1}] ${path.basename(photoPaths[i])}: ${thumb.originalWidth}×${thumb.originalHeight} → 512px thumb`);
  }

  // Step 2: Call Claude API (or offline fallback)
  let result;
  if (apiKey && !forceOffline) {
    try {
      console.log(`\n  Step 2: Calling Claude API (batched)...`);
      result = await composeDraft(listing, thumbnails, apiKey);
    } catch (err) {
      console.log(`  ⚠ API call failed: ${err.message}`);
      console.log(`  Falling back to offline mode...`);
      result = composeDraftOffline(listing, thumbnails);
    }
  } else {
    console.log(`\n  Step 2: Offline composition (no API key)...`);
    result = composeDraftOffline(listing, thumbnails);
  }

  // Step 3: Validate and enrich results
  console.log(`  Step 3: Validating composition results...`);

  // Ensure all required fields exist
  if (!result.photo_classifications) result.photo_classifications = [];
  if (!result.property_overview) result.property_overview = generateOverviewFromCRM(listing);
  if (!result.tagline_suggestion) result.tagline_suggestion = generateTagline(listing);
  if (!result.highlights_enhanced) result.highlights_enhanced = listing.highlights || [];
  if (!result.seo_keywords) result.seo_keywords = generateKeywords(listing);

  // Validate photo classifications match input count
  while (result.photo_classifications.length < photoPaths.length) {
    result.photo_classifications.push({
      photo_index: result.photo_classifications.length,
      classification: 'exterior',
      confidence: 0.3,
      description: 'Unclassified — default assignment',
      recommended_zone: 'detail_grid',
      focal_point: { x: 0.5, y: 0.5 },
    });
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n  ✅ Composition complete: ${elapsed}s total`);
  console.log(`${'═'.repeat(55)}\n`);

  return {
    ...result,
    compositionTime: parseFloat(elapsed),
  };
}

module.exports = {
  composeDraft,
  composeDraftOffline,
  composeMarketingDraft,
  generateThumbnail,
  buildListingContext,
  generateOverviewFromCRM,
  generateTagline,
  CLAUDE_MODEL,
  SYSTEM_PROMPT,
};
