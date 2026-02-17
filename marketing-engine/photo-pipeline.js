// ═══════════════════════════════════════════════════════════════════════════
// ZENITH OS — MARKETING SUITE — PHOTO PROCESSING PIPELINE
// Sharp.js: Classify → Smart Crop → Enhance → Zone Assignment
// Main Street Group LLC © 2026
// ═══════════════════════════════════════════════════════════════════════════

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

// ── ZONE ASPECT RATIOS ─────────────────────────────────────────────────
// Each template zone expects a specific aspect ratio for its photo slot
const ZONE_SPECS = {
  hero_cover:      { width: 2550, height: 1400, ratio: '16:9', label: 'Cover Hero' },
  hero_wide:       { width: 2550, height: 1000, ratio: '21:9', label: 'Wide Banner' },
  mosaic_large:    { width: 1200, height: 900,  ratio: '4:3',  label: 'Mosaic Large' },
  mosaic_small:    { width: 800,  height: 600,  ratio: '4:3',  label: 'Mosaic Small' },
  detail_square:   { width: 800,  height: 800,  ratio: '1:1',  label: 'Detail Square' },
  sidebar_photo:   { width: 600,  height: 900,  ratio: '2:3',  label: 'Sidebar Portrait' },
  floorplan:       { width: 2400, height: 1800, ratio: '4:3',  label: 'Floor Plan' },
  aerial_full:     { width: 2550, height: 3300, ratio: '8.5:11', label: 'Aerial Full Page' },
  location_map:    { width: 1785, height: 3300, ratio: '70%',  label: 'Location Map (70% width)' },
  grid_cell:       { width: 700,  height: 500,  ratio: '7:5',  label: 'Grid Cell' },
  labeled_photo:   { width: 1000, height: 700,  ratio: '10:7', label: 'Labeled Photo' },
};

// ── PHOTO CLASSIFICATION ────────────────────────────────────────────────
// In production, this will use Claude Vision API to classify photos.
// For the POC, we analyze image characteristics with Sharp metadata.

const PHOTO_CATEGORIES = [
  'exterior',     // Building exterior, street view
  'interior',     // Office space, lobby, common area
  'aerial',       // Drone/satellite view
  'floor_plan',   // Architectural floor plan
  'detail',       // Close-up features, equipment, signage
  'warehouse',    // Warehouse/industrial interior
  'parking',      // Parking lots, loading docks
  'landscape',    // Land, undeveloped site, trees
];

/**
 * Classify a photo based on its characteristics.
 * POC version uses image analysis heuristics.
 * Production version will use Claude Vision API batch call.
 */
async function classifyPhoto(imagePath, hints = {}) {
  const metadata = await sharp(imagePath).metadata();
  const stats = await sharp(imagePath).stats();

  const aspectRatio = metadata.width / metadata.height;
  const avgBrightness = stats.channels.reduce((sum, ch) => sum + ch.mean, 0) / stats.channels.length;
  const saturation = stats.channels.length >= 3
    ? Math.abs(stats.channels[0].mean - stats.channels[1].mean) + Math.abs(stats.channels[1].mean - stats.channels[2].mean)
    : 0;

  // Hint-based classification (from filename or CRM metadata)
  if (hints.type) return hints.type;
  if (hints.filename) {
    const fn = hints.filename.toLowerCase();
    if (fn.includes('aerial') || fn.includes('drone') || fn.includes('satellite')) return 'aerial';
    if (fn.includes('floor') || fn.includes('plan') || fn.includes('layout')) return 'floor_plan';
    if (fn.includes('exterior') || fn.includes('front') || fn.includes('building')) return 'exterior';
    if (fn.includes('interior') || fn.includes('office') || fn.includes('lobby')) return 'interior';
    if (fn.includes('warehouse') || fn.includes('dock') || fn.includes('loading')) return 'warehouse';
    if (fn.includes('parking') || fn.includes('lot')) return 'parking';
    if (fn.includes('detail') || fn.includes('sign') || fn.includes('equipment')) return 'detail';
    if (fn.includes('land') || fn.includes('site') || fn.includes('vacant')) return 'landscape';
  }

  // Heuristic classification from image properties
  if (aspectRatio > 2.0) return 'aerial';        // Very wide = likely panoramic/aerial
  if (avgBrightness > 200 && saturation < 40) return 'floor_plan'; // High brightness, low sat = diagram
  if (aspectRatio > 1.5) return 'exterior';       // Standard landscape = exterior
  if (aspectRatio < 0.8) return 'interior';       // Portrait orientation = interior
  return 'exterior';                               // Default
}

// ── SMART CROP ──────────────────────────────────────────────────────────
// Crops to target zone dimensions with focal-point awareness

/**
 * Smart crop an image to fit a target zone.
 * Uses Sharp's attention-based cropping for focal point detection.
 */
async function smartCrop(inputPath, zoneSpec, outputPath) {
  const { width, height } = zoneSpec;

  await sharp(inputPath)
    .resize(width, height, {
      fit: 'cover',
      position: sharp.strategy.attention,  // Focal-point detection
    })
    .toFile(outputPath);

  return outputPath;
}

/**
 * Crop with explicit focal point (for when we know the subject position).
 */
async function focalCrop(inputPath, zoneSpec, focalX, focalY, outputPath) {
  const metadata = await sharp(inputPath).metadata();
  const { width: tw, height: th } = zoneSpec;

  // Calculate crop region centered on focal point
  const scale = Math.max(tw / metadata.width, th / metadata.height);
  const scaledW = Math.round(metadata.width * scale);
  const scaledH = Math.round(metadata.height * scale);

  // Focal point in scaled coordinates
  const fx = Math.round(focalX * scaledW);
  const fy = Math.round(focalY * scaledH);

  // Crop region
  const left = Math.max(0, Math.min(scaledW - tw, fx - Math.round(tw / 2)));
  const top = Math.max(0, Math.min(scaledH - th, fy - Math.round(th / 2)));

  await sharp(inputPath)
    .resize(scaledW, scaledH)
    .extract({ left, top, width: tw, height: th })
    .toFile(outputPath);

  return outputPath;
}

// ── PHOTO ENHANCEMENT ───────────────────────────────────────────────────
// Normalizes brightness, contrast, and saturation for print consistency

/**
 * Enhance a photo for print quality.
 * Normalizes exposure, boosts contrast slightly, and ensures CMYK-safe colors.
 */
async function enhanceForPrint(inputPath, outputPath, options = {}) {
  const {
    brightness = 1.02,    // Slight brightness boost for print
    saturation = 1.08,    // Slight saturation boost (screens are brighter than print)
    contrast = 1.05,      // Slight contrast boost
    sharpen = true,       // Apply print sharpening
  } = options;

  let pipeline = sharp(inputPath);

  // Normalize brightness and contrast
  pipeline = pipeline.modulate({
    brightness,
    saturation,
  });

  // Slight contrast curve
  if (contrast !== 1.0) {
    pipeline = pipeline.linear(contrast, -(128 * (contrast - 1)));
  }

  // Print sharpening — subtle unsharp mask for 300 DPI
  if (sharpen) {
    pipeline = pipeline.sharpen({
      sigma: 0.8,
      m1: 0.5,  // flat areas
      m2: 1.5,  // jagged areas
    });
  }

  // Ensure sRGB color space (consistent print output)
  pipeline = pipeline.toColorspace('srgb');

  // Output as high-quality JPEG (print-ready)
  await pipeline
    .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
    .toFile(outputPath);

  return outputPath;
}

// ── RESOLUTION VALIDATOR ────────────────────────────────────────────────

async function validateResolution(imagePath, targetDPI = 300) {
  const metadata = await sharp(imagePath).metadata();
  // For print at 300 DPI, minimum dimensions depend on the print size
  // 8.5" wide at 300 DPI = 2550px minimum width for full-bleed
  const minWidth = 1200;  // Minimum acceptable for any zone
  const minHeight = 800;

  return {
    width: metadata.width,
    height: metadata.height,
    format: metadata.format,
    passes: metadata.width >= minWidth && metadata.height >= minHeight,
    effectiveDPI: Math.round(metadata.width / 8.5),  // Approximate for letter-width
    recommendation: metadata.width < minWidth
      ? `Image is ${metadata.width}px wide — recommend at least ${minWidth}px for print quality`
      : 'Resolution adequate for print',
  };
}

// ── ZONE ASSIGNMENT ENGINE ──────────────────────────────────────────────
// Maps classified photos to template zones

const ZONE_PRIORITY = {
  cover_standard: [
    { zone: 'hero_photo', accepts: ['exterior', 'aerial', 'landscape'], spec: ZONE_SPECS.hero_cover },
  ],
  details_offering: [
    // No primary image zones — this page is data-driven
  ],
  location_map: [
    // Map zone uses generated/static map image, not uploaded photos
  ],
  photos_mosaic: [
    { zone: 'photo_large_1', accepts: ['exterior', 'aerial'], spec: ZONE_SPECS.mosaic_large },
    { zone: 'photo_large_2', accepts: ['interior', 'warehouse'], spec: ZONE_SPECS.mosaic_large },
    { zone: 'photo_large_3', accepts: ['interior', 'exterior', 'warehouse'], spec: ZONE_SPECS.mosaic_large },
    { zone: 'photo_small_1', accepts: ['detail', 'interior', 'parking'], spec: ZONE_SPECS.mosaic_small },
    { zone: 'photo_small_2', accepts: ['detail', 'interior', 'parking'], spec: ZONE_SPECS.mosaic_small },
  ],
  floorplan: [
    { zone: 'floorplan_image', accepts: ['floor_plan'], spec: ZONE_SPECS.floorplan },
  ],
  aerial: [
    { zone: 'aerial_photo', accepts: ['aerial', 'landscape'], spec: ZONE_SPECS.aerial_full },
  ],
};

/**
 * Assign classified photos to template zones.
 * Returns a map of { zoneId: processedImagePath }
 */
function assignPhotosToZones(classifiedPhotos, templateId) {
  const assignments = {};
  const zoneDefs = ZONE_PRIORITY[templateId] || [];
  const availablePhotos = [...classifiedPhotos]; // Clone for consumption

  for (const zoneDef of zoneDefs) {
    // Find the best matching photo for this zone
    const matchIndex = availablePhotos.findIndex(p =>
      zoneDef.accepts.includes(p.classification)
    );

    if (matchIndex >= 0) {
      assignments[zoneDef.zone] = {
        photo: availablePhotos[matchIndex],
        spec: zoneDef.spec,
      };
      availablePhotos.splice(matchIndex, 1); // Remove consumed photo
    }
  }

  return assignments;
}

// ── FULL PHOTO PROCESSING PIPELINE ──────────────────────────────────────

/**
 * Process all photos for a listing through the full pipeline:
 * 1. Classify each photo
 * 2. Assign to template zones
 * 3. Smart crop to zone dimensions
 * 4. Enhance for print
 * 5. Return processed paths ready for template injection
 */
async function processListingPhotos(photoPaths, templateIds, outputDir, options = {}) {
  const startTime = Date.now();
  const { hints = {} } = options;

  console.log(`\n  📸 Photo Processing Pipeline`);
  console.log(`  ─────────────────────────────`);
  console.log(`  Input: ${photoPaths.length} photos`);
  console.log(`  Templates: ${templateIds.join(', ')}`);

  fs.mkdirSync(outputDir, { recursive: true });

  // Step 1: Classify all photos
  console.log(`\n  Step 1: Classifying photos...`);
  const classified = [];
  for (let i = 0; i < photoPaths.length; i++) {
    const classification = await classifyPhoto(photoPaths[i], {
      filename: path.basename(photoPaths[i]),
      ...hints[i],
    });
    classified.push({
      index: i,
      path: photoPaths[i],
      classification,
      filename: path.basename(photoPaths[i]),
    });
    console.log(`    [${i + 1}] ${path.basename(photoPaths[i])} → ${classification}`);
  }

  // Step 2: Validate resolutions
  console.log(`\n  Step 2: Validating resolutions...`);
  for (const photo of classified) {
    const validation = await validateResolution(photo.path);
    photo.validation = validation;
    const status = validation.passes ? '✓' : '⚠';
    console.log(`    ${status} ${photo.filename}: ${validation.width}×${validation.height} (${validation.effectiveDPI} DPI eff.)`);
  }

  // Step 3: Assign photos to zones across all templates
  console.log(`\n  Step 3: Assigning to template zones...`);
  const allAssignments = {};
  for (const templateId of templateIds) {
    const assignments = assignPhotosToZones(classified, templateId);
    allAssignments[templateId] = assignments;
    const zoneCount = Object.keys(assignments).length;
    if (zoneCount > 0) {
      console.log(`    ${templateId}: ${zoneCount} zone(s) filled`);
      for (const [zone, data] of Object.entries(assignments)) {
        console.log(`      → ${zone}: ${data.photo.filename} (${data.photo.classification})`);
      }
    }
  }

  // Step 4: Process each assigned photo (crop + enhance)
  console.log(`\n  Step 4: Processing (crop + enhance)...`);
  const processedPaths = {};

  for (const [templateId, assignments] of Object.entries(allAssignments)) {
    processedPaths[templateId] = {};

    for (const [zoneId, data] of Object.entries(assignments)) {
      const outName = `${templateId}_${zoneId}_processed.jpg`;
      const croppedPath = path.join(outputDir, `${templateId}_${zoneId}_cropped.jpg`);
      const enhancedPath = path.join(outputDir, outName);

      // Smart crop to zone dimensions
      await smartCrop(data.photo.path, data.spec, croppedPath);

      // Enhance for print
      await enhanceForPrint(croppedPath, enhancedPath);

      const finalMeta = await sharp(enhancedPath).metadata();
      processedPaths[templateId][zoneId] = enhancedPath;

      console.log(`    ✓ ${outName}: ${finalMeta.width}×${finalMeta.height}`);

      // Clean up intermediate crop file
      if (fs.existsSync(croppedPath) && croppedPath !== enhancedPath) {
        fs.unlinkSync(croppedPath);
      }
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n  ✅ Photo pipeline complete: ${elapsed}s`);
  console.log(`  ─────────────────────────────\n`);

  return {
    classified,
    assignments: allAssignments,
    processedPaths,
    elapsed: parseFloat(elapsed),
  };
}

// ── SAMPLE PHOTO GENERATOR (POC only) ───────────────────────────────────
// Generates realistic placeholder images for testing the pipeline

async function generateSamplePhotos(outputDir, count = 6) {
  fs.mkdirSync(outputDir, { recursive: true });
  const photos = [];

  const configs = [
    { name: 'exterior_building.jpg', w: 3200, h: 2400, type: 'exterior',
      bg: { r: 140, g: 160, b: 180 }, accent: { r: 80, g: 100, b: 60 } },
    { name: 'aerial_drone.jpg', w: 4000, h: 2250, type: 'aerial',
      bg: { r: 60, g: 90, b: 50 }, accent: { r: 120, g: 140, b: 130 } },
    { name: 'interior_office.jpg', w: 2800, h: 2100, type: 'interior',
      bg: { r: 200, g: 195, b: 185 }, accent: { r: 160, g: 140, b: 120 } },
    { name: 'warehouse_interior.jpg', w: 3000, h: 2000, type: 'warehouse',
      bg: { r: 150, g: 150, b: 145 }, accent: { r: 100, g: 95, b: 90 } },
    { name: 'floor_plan.jpg', w: 2400, h: 1800, type: 'floor_plan',
      bg: { r: 245, g: 245, b: 240 }, accent: { r: 50, g: 50, b: 50 } },
    { name: 'detail_signage.jpg', w: 1600, h: 1200, type: 'detail',
      bg: { r: 100, g: 120, b: 100 }, accent: { r: 200, g: 200, b: 190 } },
    { name: 'parking_lot.jpg', w: 2600, h: 1800, type: 'parking',
      bg: { r: 130, g: 130, b: 130 }, accent: { r: 80, g: 85, b: 70 } },
    { name: 'landscape_site.jpg', w: 3600, h: 2400, type: 'landscape',
      bg: { r: 70, g: 110, b: 55 }, accent: { r: 140, g: 180, b: 220 } },
  ];

  const toGenerate = configs.slice(0, Math.min(count, configs.length));

  for (const cfg of toGenerate) {
    const filePath = path.join(outputDir, cfg.name);

    // Create a realistic-looking gradient image with subtle texture
    const svgContent = `<svg width="${cfg.w}" height="${cfg.h}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="rgb(${cfg.bg.r},${cfg.bg.g},${cfg.bg.b})"/>
          <stop offset="50%" stop-color="rgb(${cfg.bg.r + 20},${cfg.bg.g + 15},${cfg.bg.b + 10})"/>
          <stop offset="100%" stop-color="rgb(${cfg.bg.r - 15},${cfg.bg.g - 10},${cfg.bg.b - 5})"/>
        </linearGradient>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgb(${cfg.accent.r + 60},${cfg.accent.g + 80},${cfg.accent.b + 100})" stop-opacity="0.3"/>
          <stop offset="60%" stop-color="rgb(${cfg.accent.r},${cfg.accent.g},${cfg.accent.b})" stop-opacity="0.1"/>
          <stop offset="100%" stop-color="rgb(${cfg.accent.r - 20},${cfg.accent.g - 20},${cfg.accent.b - 10})" stop-opacity="0.2"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#bg)"/>
      <rect width="100%" height="100%" fill="url(#sky)"/>
      ${cfg.type === 'exterior' ? `
        <rect x="15%" y="25%" width="70%" height="55%" fill="rgba(${cfg.bg.r - 30},${cfg.bg.g - 25},${cfg.bg.b - 20},0.6)" rx="4"/>
        <rect x="18%" y="30%" width="15%" height="20%" fill="rgba(180,200,220,0.3)" rx="2"/>
        <rect x="36%" y="30%" width="15%" height="20%" fill="rgba(180,200,220,0.3)" rx="2"/>
        <rect x="54%" y="30%" width="15%" height="20%" fill="rgba(180,200,220,0.3)" rx="2"/>
        <rect x="72%" y="30%" width="10%" height="45%" fill="rgba(160,170,160,0.3)" rx="2"/>
        <rect x="0" y="80%" width="100%" height="20%" fill="rgba(90,100,80,0.4)"/>
      ` : ''}
      ${cfg.type === 'aerial' ? `
        <rect x="30%" y="20%" width="40%" height="60%" fill="rgba(100,110,90,0.5)" rx="2" stroke="rgba(200,50,50,0.6)" stroke-width="3"/>
        <line x1="0" y1="45%" x2="100%" y2="45%" stroke="rgba(180,180,160,0.3)" stroke-width="4"/>
        <line x1="50%" y1="0" x2="55%" y2="100%" stroke="rgba(180,180,160,0.25)" stroke-width="3"/>
      ` : ''}
      ${cfg.type === 'interior' ? `
        <rect x="5%" y="60%" width="90%" height="2%" fill="rgba(140,120,100,0.3)"/>
        <rect x="20%" y="20%" width="25%" height="35%" fill="rgba(${cfg.bg.r - 20},${cfg.bg.g - 15},${cfg.bg.b - 10},0.4)" rx="2"/>
        <rect x="55%" y="15%" width="30%" height="40%" fill="rgba(${cfg.bg.r - 15},${cfg.bg.g - 10},${cfg.bg.b - 5},0.3)" rx="2"/>
      ` : ''}
      ${cfg.type === 'warehouse' ? `
        <line x1="10%" y1="20%" x2="10%" y2="90%" stroke="rgba(80,80,75,0.3)" stroke-width="8"/>
        <line x1="30%" y1="15%" x2="30%" y2="90%" stroke="rgba(80,80,75,0.3)" stroke-width="8"/>
        <line x1="50%" y1="15%" x2="50%" y2="90%" stroke="rgba(80,80,75,0.3)" stroke-width="8"/>
        <line x1="70%" y1="20%" x2="70%" y2="90%" stroke="rgba(80,80,75,0.3)" stroke-width="8"/>
        <line x1="90%" y1="20%" x2="90%" y2="90%" stroke="rgba(80,80,75,0.3)" stroke-width="8"/>
        <rect x="0" y="88%" width="100%" height="12%" fill="rgba(110,110,105,0.4)"/>
      ` : ''}
      ${cfg.type === 'floor_plan' ? `
        <rect x="10%" y="10%" width="80%" height="80%" fill="none" stroke="rgb(50,50,50)" stroke-width="3"/>
        <line x1="10%" y1="50%" x2="90%" y2="50%" stroke="rgb(50,50,50)" stroke-width="2"/>
        <line x1="45%" y1="10%" x2="45%" y2="90%" stroke="rgb(50,50,50)" stroke-width="2"/>
        <rect x="12%" y="12%" width="31%" height="36%" fill="none" stroke="rgb(100,100,100)" stroke-width="1" stroke-dasharray="5,3"/>
        <rect x="47%" y="12%" width="41%" height="36%" fill="none" stroke="rgb(100,100,100)" stroke-width="1" stroke-dasharray="5,3"/>
        <text x="27%" y="32%" font-family="Arial" font-size="${Math.round(cfg.w * 0.015)}" fill="rgb(80,80,80)" text-anchor="middle">OFFICE</text>
        <text x="67%" y="32%" font-family="Arial" font-size="${Math.round(cfg.w * 0.015)}" fill="rgb(80,80,80)" text-anchor="middle">WAREHOUSE</text>
        <text x="27%" y="72%" font-family="Arial" font-size="${Math.round(cfg.w * 0.012)}" fill="rgb(100,100,100)" text-anchor="middle">RECEPTION</text>
        <text x="67%" y="72%" font-family="Arial" font-size="${Math.round(cfg.w * 0.012)}" fill="rgb(100,100,100)" text-anchor="middle">STORAGE</text>
      ` : ''}
      ${cfg.type === 'landscape' ? `
        <rect x="0" y="65%" width="100%" height="35%" fill="rgba(60,90,40,0.5)"/>
        <ellipse cx="25%" cy="55%" rx="12%" ry="20%" fill="rgba(40,80,30,0.4)"/>
        <ellipse cx="75%" cy="50%" rx="15%" ry="25%" fill="rgba(45,85,35,0.35)"/>
      ` : ''}
      <text x="50%" y="95%" font-family="Arial" font-size="${Math.round(cfg.w * 0.012)}" fill="rgba(255,255,255,0.3)" text-anchor="middle" font-weight="bold">ZENITH OS · SAMPLE · ${cfg.type.toUpperCase()}</text>
    </svg>`;

    await sharp(Buffer.from(svgContent))
      .jpeg({ quality: 92 })
      .toFile(filePath);

    photos.push({ path: filePath, type: cfg.type, name: cfg.name });
  }

  return photos;
}

module.exports = {
  classifyPhoto,
  smartCrop,
  focalCrop,
  enhanceForPrint,
  validateResolution,
  assignPhotosToZones,
  processListingPhotos,
  generateSamplePhotos,
  ZONE_SPECS,
  ZONE_PRIORITY,
  PHOTO_CATEGORIES,
};
