// ═══════════════════════════════════════════════════════════════════════════
// ZENITH OS — MARKETING SUITE — CRM DATA FORMATTER
// Transforms raw CRM listing data into print-ready formatted values
// Main Street Group LLC © 2026
// ═══════════════════════════════════════════════════════════════════════════

function formatCurrency(value, decimals = 0) {
  if (!value && value !== 0) return '';
  return '$' + Number(value).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatCurrencyPSF(value) {
  if (!value && value !== 0) return '';
  return '$' + Number(value).toFixed(2) + '/SF';
}

function formatSF(value) {
  if (!value) return '';
  return Number(value).toLocaleString('en-US') + '± SF';
}

function formatAcres(value) {
  if (!value) return '';
  return value + '± Acres';
}

function formatNumber(value) {
  if (!value && value !== 0) return '';
  return Number(value).toLocaleString('en-US');
}

function getListingBadge(listingType) {
  const badges = {
    for_sale: 'FOR SALE',
    for_lease: 'FOR LEASE',
    sale_or_lease: 'FOR SALE OR LEASE',
    investment: 'FOR SALE',
    nnn_leaseback: 'INVESTMENT OPPORTUNITY',
    land_sale: 'FOR SALE',
    build_to_suit: 'FOR LEASE / BUILD TO SUIT',
    retail_lease: 'FOR LEASE',
    furnished_lease: 'FOR LEASE (FURNISHED)',
    specialty: 'FOR SALE',
  };
  return badges[listingType] || 'FOR SALE';
}

function derivePricing(listing) {
  const derived = {};
  
  if (listing.price && listing.building_sf) {
    derived.price_psf = (listing.price / listing.building_sf).toFixed(2);
  }
  if (listing.lease_rate && listing.building_sf) {
    derived.monthly_base = ((listing.lease_rate * listing.building_sf) / 12).toFixed(2);
    derived.annual_rent = (listing.lease_rate * listing.building_sf).toFixed(2);
  }
  if (listing.cam && listing.building_sf) {
    derived.monthly_cam = ((listing.cam * listing.building_sf) / 12).toFixed(2);
  }
  if (derived.monthly_base && derived.monthly_cam) {
    derived.monthly_total = (parseFloat(derived.monthly_base) + parseFloat(derived.monthly_cam)).toFixed(2);
  }

  return derived;
}

/**
 * Transforms a raw CRM listing object into template-ready data
 * This is the core data pipeline for the Handlebars templates
 */
function prepareListingData(listing, brand) {
  const derived = derivePricing(listing);

  return {
    // Identity
    property_name: listing.property_name || '',
    tagline: listing.tagline || '',
    listing_type: listing.listing_type || 'for_sale',
    listing_badge: getListingBadge(listing.listing_type),

    // Address
    address_full: listing.address || '',
    address_line1: listing.address?.split(',')[0]?.trim() || listing.address || '',
    city: listing.city || '',
    state: listing.state || 'FL',
    zip: listing.zip || '',
    city_state_zip: `${listing.city || ''}, ${listing.state || 'FL'} ${listing.zip || ''}`.trim(),

    // Pricing — formatted
    price: listing.price ? formatCurrency(listing.price) : '',
    price_raw: listing.price || '',
    price_psf: listing.price_psf ? formatCurrencyPSF(listing.price_psf) : (derived.price_psf ? formatCurrencyPSF(derived.price_psf) : ''),
    lease_rate: listing.lease_rate ? (typeof listing.lease_rate === 'number' ? formatCurrencyPSF(listing.lease_rate) : listing.lease_rate) : '',
    lease_type: listing.lease_type || '',
    cam: listing.cam ? formatCurrencyPSF(listing.cam) : '',
    cap_rate: listing.cap_rate || '',
    monthly_base: derived.monthly_base ? formatCurrency(derived.monthly_base, 2) : '',
    monthly_cam: derived.monthly_cam ? formatCurrency(derived.monthly_cam, 2) : '',
    monthly_total: derived.monthly_total ? formatCurrency(derived.monthly_total, 2) : '',
    annual_rent: derived.annual_rent ? formatCurrency(derived.annual_rent, 2) : '',

    // Property details — formatted
    building_sf: listing.building_sf ? formatSF(listing.building_sf) : '',
    building_sf_raw: listing.building_sf || '',
    land_acres: listing.land_acres ? formatAcres(listing.land_acres) : '',
    land_acres_raw: listing.land_acres || '',
    zoning: listing.zoning || '',
    year_built: listing.year_built || '',
    parking: listing.parking || '',
    re_taxes: listing.re_taxes ? formatCurrency(listing.re_taxes, 2) : '',
    parcel_id: listing.parcel_id || '',

    // Highlights
    highlights: listing.highlights || [],
    has_highlights: (listing.highlights || []).length > 0,

    // Brokers
    broker_name: listing.broker || '',
    broker_title: listing.broker_title || '',
    broker_phone: listing.broker_phone || '',
    broker_email: listing.broker_email || '',
    has_broker: !!listing.broker,
    broker2_name: listing.broker2 || '',
    broker2_title: listing.broker2_title || '',
    broker2_phone: listing.broker2_phone || '',
    broker2_email: listing.broker2_email || '',
    has_broker2: !!listing.broker2,

    // Overview text (AI-generated or manual)
    overview: listing.overview || '',
    has_overview: !!listing.overview,

    // Photo counts (for template logic)
    photo_count: listing.photos || 0,
    has_photos: (listing.photos || 0) > 0,

    // Brand context
    brand_name: brand.name,
    brand_website: brand.website,
    disclaimer: brand.disclaimer,
    office_addresses: brand.officeAddresses || [],

    // Conditional flags for template logic
    is_sale: ['for_sale', 'sale_or_lease', 'investment', 'nnn_leaseback', 'land_sale', 'specialty'].includes(listing.listing_type),
    is_lease: ['for_lease', 'sale_or_lease', 'build_to_suit', 'retail_lease', 'furnished_lease'].includes(listing.listing_type),
    is_investment: ['investment', 'nnn_leaseback'].includes(listing.listing_type),
    is_land: listing.listing_type === 'land_sale',
  };
}

module.exports = { formatCurrency, formatCurrencyPSF, formatSF, formatAcres, formatNumber, getListingBadge, derivePricing, prepareListingData };
