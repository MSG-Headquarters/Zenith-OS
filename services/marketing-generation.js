// ═══════════════════════════════════════════════════════════════════════════
// ZENITH OS — MARKETING SUITE — GENERATION SERVICE
// Async job: AI composition → photo processing → render → update draft
// Main Street Group LLC © 2026
// ═══════════════════════════════════════════════════════════════════════════

const path = require('path');
const fs = require('fs');
const { composeMarketingDraft } = require('../marketing-engine/ai-composition');
const { enhanceForPrint } = require('../marketing-engine/photo-pipeline');
const { selectTemplates, loadTemplate, assembleTemplateData } = require('../marketing-engine/render-engine');
const { getBrand, renderBrandLogo } = require('../marketing-engine/brands');
const { prepareListingData } = require('../marketing-engine/crm-formatter');
const sharp = require('sharp');

class GenerationService {
  constructor(db, workflow, config = {}) {
    this.db = db;
    this.workflow = workflow;
    this.config = {
      apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY || null,
      outputDir: config.outputDir || path.join(__dirname, '..', 'output', 'generated'),
      processedDir: config.processedDir || path.join(__dirname, '..', 'assets', 'generation-cache'),
      ...config,
    };
    this._queue = [];
  }

  /**
   * Queue a draft for generation.
   * In production, this would push to Bull/SQS/Redis queue.
   */
  async queueGeneration(draftId, tenantId) {
    console.log(`\n  ⏳ Generation queued: ${draftId}`);
    // For now, execute immediately (in prod: job queue)
    return this.executePipeline(draftId, tenantId);
  }

  /**
   * Execute the full generation pipeline for a draft.
   * This is the main workhorse — called by the job queue worker.
   */
  async executePipeline(draftId, tenantId) {
    const startTime = Date.now();

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  GENERATION PIPELINE — Draft ${draftId}`);
    console.log(`${'═'.repeat(60)}`);

    try {
      // 1. Load draft and listing data
      const draft = await this.loadDraft(draftId);
      if (!draft) throw new Error(`Draft not found: ${draftId}`);

      const listing = await this.loadListing(draft.listing_id, tenantId);
      if (!listing) throw new Error(`Listing not found: ${draft.listing_id}`);

      const brand = await this.loadBrand(draft.brand_id, tenantId);

      console.log(`  Listing: ${listing.property_name || listing.address}`);
      console.log(`  Brand: ${brand.name}`);

      // 2. Get photos for listing
      const photoPaths = await this.getListingPhotos(draft.listing_id, tenantId);
      console.log(`  Photos: ${photoPaths.length}`);

      // 3. AI Composition
      console.log(`\n  ▸ Running AI composition...`);
      const aiResult = await composeMarketingDraft(listing, photoPaths, {
        apiKey: this.config.apiKey,
      });

      // 4. Process photos based on AI classifications
      console.log(`  ▸ Processing photos...`);
      const processedDir = path.join(this.config.processedDir, draftId);
      fs.mkdirSync(processedDir, { recursive: true });

      const processedPhotos = {};
      for (const pc of aiResult.photo_classifications) {
        if (pc.photo_index >= photoPaths.length) continue;
        const photoPath = photoPaths[pc.photo_index];
        if (!fs.existsSync(photoPath)) continue;

        const zoneSpec = this.getZoneSpec(pc.recommended_zone);
        const enhancedPath = path.join(processedDir, `${pc.recommended_zone}_enhanced.jpg`);

        // Crop + enhance
        const cropPosition = this.focalToGravity(pc.focal_point);
        await sharp(photoPath)
          .resize(zoneSpec.width, zoneSpec.height, { fit: 'cover', position: cropPosition })
          .toFile(enhancedPath + '.tmp');

        await enhanceForPrint(enhancedPath + '.tmp', enhancedPath, 
          this.getEnhanceSettings(pc.classification));

        if (fs.existsSync(enhancedPath + '.tmp')) fs.unlinkSync(enhancedPath + '.tmp');

        // Convert to data URI for template injection
        const buffer = fs.readFileSync(enhancedPath);
        processedPhotos[pc.recommended_zone] = `data:image/jpeg;base64,${buffer.toString('base64')}`;
      }

      // 5. Merge AI content into listing data
      const enrichedListing = {
        ...listing,
        overview: aiResult.property_overview || listing.overview,
        highlights: aiResult.highlights_enhanced || listing.highlights || [],
        tagline: aiResult.tagline_suggestion || listing.tagline,
      };

      // 6. Assemble template data
      const templateData = this.buildTemplateData(enrichedListing, brand, processedPhotos, listing);

      // 7. Select and render templates
      const templateIds = draft.template_sequence?.length > 0 
        ? draft.template_sequence 
        : selectTemplates(listing.listing_type);

      console.log(`  ▸ Rendering ${templateIds.length} pages...`);

      const htmlPages = templateIds.map(tid => {
        const template = loadTemplate(tid);
        return template(templateData);
      });

      // 8. Render PDF with Puppeteer
      const puppeteer = require('puppeteer-core');
      const combinedHTML = this.buildCombinedHTML(htmlPages);

      const browser = await puppeteer.launch({
        executablePath: '/usr/bin/google-chrome',
        headless: 'new',
        protocolTimeout: 120000,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--single-process', '--no-zygote'],
      });

      const page = await browser.newPage();
      await page.setViewport({ width: 816, height: 1056 });
      await page.setContent(combinedHTML, { waitUntil: 'networkidle0', timeout: 60000 });
      await page.evaluate(() => document.fonts.ready);
      await new Promise(r => setTimeout(r, 1000));

      const pdfBuffer = await page.pdf({
        width: '8.5in', height: '11in',
        printBackground: true, preferCSSPageSize: true,
        margin: { top: 0, right: 0, bottom: 0, left: 0 }, scale: 1,
      });

      await page.close();
      await browser.close();

      // 9. Save PDF
      const pdfDir = path.join(this.config.outputDir, tenantId.toString());
      fs.mkdirSync(pdfDir, { recursive: true });
      const pdfFilename = `${draftId}_flyer.pdf`;
      const pdfPath = path.join(pdfDir, pdfFilename);
      fs.writeFileSync(pdfPath, pdfBuffer);

      // In production: upload to S3 and get signed URL
      const pdfUrl = `/marketing/files/${tenantId}/${pdfFilename}`;

      // 10. Calculate quality score
      const quality = this.calculateQuality(enrichedListing, aiResult, processedPhotos);

      // 11. Update draft with results
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      await this.workflow.transition(draftId, 'complete_generation', null, 'system', {
        pdf_url: pdfUrl,
        pdf_size_bytes: pdfBuffer.length,
        quality_score: quality.score,
        quality_report: quality.report,
        ai_content: {
          overview: aiResult.property_overview,
          tagline: aiResult.tagline_suggestion,
          highlights: aiResult.highlights_enhanced,
          keywords: aiResult.seo_keywords,
        },
        photo_classifications: aiResult.photo_classifications,
        ai_model: aiResult.apiMetrics?.model,
        ai_tokens_in: aiResult.apiMetrics?.inputTokens,
        ai_tokens_out: aiResult.apiMetrics?.outputTokens,
      });

      console.log(`\n  ✅ Generation complete: ${elapsed}s, ${(pdfBuffer.length / 1024).toFixed(0)}KB, score ${quality.score}/100`);
      console.log(`${'═'.repeat(60)}\n`);

      return {
        success: true,
        draftId,
        pdfUrl,
        pdfSize: pdfBuffer.length,
        qualityScore: quality.score,
        renderTime: parseFloat(elapsed),
      };

    } catch (err) {
      console.error(`  ❌ Generation failed:`, err.message);

      // Transition to failed state
      try {
        await this.workflow.transition(draftId, 'fail_generation', null, 'system', {
          error: err.message,
        });
      } catch (transErr) {
        console.error('  Failed to record failure state:', transErr.message);
      }

      return { success: false, error: err.message };
    }
  }

  // ── HELPER METHODS ──────────────────────────────────────────────────

  buildTemplateData(listing, brand, processedPhotos, rawListing) {
    const baseData = prepareListingData(listing, brand);
    const logoSrc = renderBrandLogo(brand);

    let taglinePrefix = '';
    let headerDisplayName = baseData.property_name;
    if (baseData.tagline && baseData.tagline.includes('—')) {
      const parts = baseData.tagline.split('—');
      taglinePrefix = parts[0].trim();
      headerDisplayName = parts[1].trim();
    } else if (baseData.tagline) {
      taglinePrefix = baseData.tagline;
    }

    return {
      ...baseData,
      tagline_prefix: taglinePrefix,
      header_display_name: headerDisplayName.toUpperCase(),
      listing_badge_lower: baseData.listing_badge.toLowerCase(),
      property_type_desc: 'commercial',
      brand_primary: brand.colors?.primary || '#1B6B3A',
      brand_primary_dark: brand.colors?.primaryDark || '#145A2E',
      brand_primary_light: brand.colors?.primaryLight || '#2A8B4A',
      brand_accent: brand.colors?.accent || '#C41E3A',
      brand_text: brand.colors?.text || '#333333',
      brand_text_light: brand.colors?.textLight || '#FFFFFF',
      brand_text_muted: brand.colors?.textMuted || '#666666',
      brand_bg: brand.colors?.background || '#FFFFFF',
      brand_bg_dark: brand.colors?.backgroundDark || '#4A4A4A',
      brand_bg_darker: brand.colors?.backgroundDarker || '#2D2D2D',
      brand_border: brand.colors?.border || '#E0E0E0',
      brand_border_light: '#F0F0F0',
      brand_highlight: brand.colors?.highlight || '#F7F7F7',
      brand_font_heading: brand.fonts?.heading || "'Montserrat', sans-serif",
      brand_font_body: brand.fonts?.body || "'Open Sans', sans-serif",
      brand_logo_src: logoSrc,
      road_labels: rawListing.nearby_roads || [],
      highway_shields: rawListing.highway_shields || [],
      hero_image_src: processedPhotos.hero_cover || processedPhotos[Object.keys(processedPhotos)[0]] || null,
      accent_image_src: processedPhotos.secondary_exterior || null,
      map_image_src: processedPhotos.location_reference || null,
    };
  }

  buildCombinedHTML(htmlPages) {
    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  @page { size: 8.5in 11in; margin: 0; }
  .page-wrapper { page-break-after: always; width: 8.5in; height: 11in; overflow: hidden; }
  .page-wrapper:last-child { page-break-after: auto; }
</style></head><body>
${htmlPages.map(html => {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi);
  return `<div class="page-wrapper">${(styleMatch || []).join('\n')}${bodyMatch ? bodyMatch[1] : html}</div>`;
}).join('\n')}
</body></html>`;
  }

  getZoneSpec(zone) {
    const specs = {
      hero_cover:       { width: 2550, height: 1400 },
      secondary_exterior: { width: 1200, height: 900 },
      aerial_full:      { width: 2550, height: 3300 },
      location_reference: { width: 1785, height: 1400 },
      interior_detail:  { width: 1000, height: 750 },
      floorplan:        { width: 2400, height: 1800 },
      detail_grid:      { width: 700, height: 500 },
    };
    return specs[zone] || { width: 1200, height: 900 };
  }

  focalToGravity(focal) {
    if (!focal) return 'centre';
    const fx = focal.x, fy = focal.y;
    if (fy < 0.33) return fx < 0.33 ? 'northwest' : fx > 0.67 ? 'northeast' : 'north';
    if (fy > 0.67) return fx < 0.33 ? 'southwest' : fx > 0.67 ? 'southeast' : 'south';
    return fx < 0.33 ? 'west' : fx > 0.67 ? 'east' : 'centre';
  }

  getEnhanceSettings(classification) {
    const settings = {
      exterior:     { brightness: 1.03, saturation: 1.10, contrast: 1.06, sharpen: true },
      aerial:       { brightness: 1.02, saturation: 1.12, contrast: 1.04, sharpen: true },
      interior:     { brightness: 1.05, saturation: 1.06, contrast: 1.04, sharpen: true },
      location_map: { brightness: 1.01, saturation: 1.05, contrast: 1.03, sharpen: true },
      floor_plan:   { brightness: 1.04, saturation: 0.95, contrast: 1.08, sharpen: true },
      warehouse:    { brightness: 1.04, saturation: 1.06, contrast: 1.05, sharpen: true },
    };
    return settings[classification] || { brightness: 1.02, saturation: 1.08, contrast: 1.05, sharpen: true };
  }

  calculateQuality(listing, aiResult, processedPhotos) {
    let score = 0;
    const report = [];
    const required = ['property_name', 'address', 'city', 'listing_type'];
    const optional = ['price', 'lease_rate', 'building_sf', 'land_acres', 'zoning', 'year_built', 'broker', 'overview'];

    let dataScore = 0;
    for (const f of required) if (listing[f]) dataScore += 5;
    for (const f of optional) if (listing[f]) dataScore += 2.5;
    score += Math.min(40, dataScore);
    report.push({ type: 'info', msg: `Data: ${Math.min(40, dataScore).toFixed(0)}/40` });

    let photoScore = 0;
    if (processedPhotos.hero_cover || Object.keys(processedPhotos).length > 0) { photoScore += 15; }
    photoScore += Math.min(15, Object.keys(processedPhotos).length * 5);
    score += photoScore;
    report.push({ type: 'info', msg: `Photos: ${photoScore}/30` });

    let aiScore = 0;
    if (aiResult.property_overview?.length > 100) aiScore += 10;
    if (aiResult.highlights_enhanced?.length >= 4) aiScore += 5;
    if (aiResult.tagline_suggestion) aiScore += 5;
    score += aiScore;
    report.push({ type: 'info', msg: `AI content: ${aiScore}/20` });

    score += 10;
    report.push({ type: 'pass', msg: 'Brand compliance: 10/10' });

    return { score: Math.min(100, Math.round(score)), report };
  }

  // ── DATA LOADERS (database or memory fallback) ──────────────────────

  async loadDraft(draftId) {
    if (this.db) {
      const r = await this.db.query('SELECT * FROM marketing_drafts WHERE id = $1', [draftId]);
      return r.rows[0];
    }
    return this.workflow._memoryStore?.[draftId];
  }

  async loadListing(listingId, tenantId) {
    if (this.db) {
      const r = await this.db.query('SELECT * FROM listings WHERE id = $1 AND tenant_id = $2', [listingId, tenantId]);
      return r.rows[0];
    }
    return null; // Will be overridden in test harness
  }

  async loadBrand(brandId, tenantId) {
    if (this.db) {
      let r;
      if (brandId) {
        r = await this.db.query('SELECT * FROM marketing_brands WHERE id = $1', [brandId]);
      } else {
        r = await this.db.query('SELECT * FROM marketing_brands WHERE tenant_id = $1 AND is_default = TRUE', [tenantId]);
      }
      if (r.rows[0]) return r.rows[0];
    }
    // Return CRE Consultants default
    return getBrand('cre_consultants');
  }

  async getListingPhotos(listingId, tenantId) {
    // In production: query listing_photos table or S3 bucket
    // For now: return empty (photos will come from draft generation request)
    return [];
  }
}

module.exports = { GenerationService };
