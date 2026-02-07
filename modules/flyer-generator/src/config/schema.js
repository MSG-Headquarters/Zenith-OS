/**
 * Listing Data Schema
 * 
 * Defines the data structure for all property types supported by the flyer generator.
 * Includes validation, defaults, and computed fields.
 */

// Transaction type enum
const TransactionType = {
  SALE: 'sale',
  LEASE: 'lease',
  SALE_OR_LEASE: 'saleOrLease',
};

// Property type enum
const PropertyType = {
  OFFICE: 'office',
  MEDICAL: 'medical',
  RETAIL: 'retail',
  INDUSTRIAL: 'industrial',
  LAND: 'land',
  MULTIFAMILY: 'multifamily',
  MIXED: 'mixed',
};

// Unit availability status
const AvailabilityStatus = {
  AVAILABLE_NOW: 'availableNow',
  NOTICE_REQUIRED: 'noticeRequired',
  FUTURE_DATE: 'futureDate',
};

/**
 * Base Listing Schema
 * Common fields across all property types
 */
const baseListingSchema = {
  // Identifiers
  id: null,
  createdAt: null,
  updatedAt: null,
  
  // Property Classification
  propertyType: PropertyType.OFFICE,
  propertyTypeCustom: null,        // Override display name (e.g., "PRIME DEVELOPMENT SITE")
  buildingName: null,              // Secondary line (e.g., "MOORINGS PROFESSIONAL BUILDING")
  transactionType: TransactionType.SALE,
  
  // Address
  address: {
    street: '',
    unit: null,
    city: '',
    state: 'FL',
    zip: '',
    fullDisplay: null,             // Override formatted address
  },
  
  // Core Financials (Sale)
  price: null,                     // Sale price in dollars
  pricePerSF: null,                // $/SF (auto-calculated or manual)
  pricePerAcre: null,              // $/Acre for land
  priceDisplay: null,              // Override (e.g., "BELOW COUNTY ASSESSED VALUE $87,000")
  
  // Core Financials (Lease)
  leaseRate: null,                 // $/SF/Year
  leaseType: null,                 // NNN, Gross, Modified Gross
  cam: null,                       // CAM $/SF
  nnn: null,                       // NNN $/SF
  utilities: null,                 // Utilities estimate $/SF
  
  // Size
  sizeSF: null,                    // Square footage
  sizeAcres: null,                 // Acreage
  dimensions: null,                // "180'± x 660'±"
  frontage: null,                  // "430' Summerlin Road Frontage"
  
  // Property Details
  yearBuilt: null,
  renovatedYear: null,
  zoning: null,                    // Code
  zoningDescription: null,         // Full description
  zoningLink: null,                // URL for "Click here for zoning uses"
  parcelId: null,
  
  // Additional Financials
  taxes: null,                     // Annual RE taxes
  taxYear: null,                   // Year for tax figure
  condoFees: null,                 // $/Quarter or $/Month
  condoFeePeriod: 'quarter',       // 'quarter' or 'month'
  hoaIncludes: [],                 // ["Water", "Trash", "Recycling"]
  
  // Location Description
  locationDescription: null,       // "Just off US 41, north of..."
  
  // Description (main body text)
  description: '',
  
  // Highlights (bullet points)
  highlights: [],                  // ["First floor unit", "Newly renovated in 2019"]
  
  // Traffic & Demographics
  trafficCounts: null,             // "34,500 AADT (Summerlin Road)"
  demographics: null,              // See demographicsSchema below
  
  // Flood Zone
  floodZone: null,
  floodZoneLink: null,             // URL for "Click here for description"
  
  // Parking
  parkingSpaces: null,
  parkingDescription: null,        // "35 Spaces" or "One deeded space with open parking"
  
  // Photos
  photos: {
    hero: null,                    // Main exterior photo
    exterior: [],                  // Additional exterior shots
    interior: [],                  // Interior photos
    aerial: [],                    // Drone/satellite views
    floorPlan: [],                 // Floor plan images
    siteMap: [],                   // Site/parcel maps
    rendering: [],                 // Architectural renderings
    other: [],                     // Miscellaneous
  },
  
  // Brokers
  brokers: [],                     // See brokerSchema below
  
  // Metadata
  flyerDate: null,                 // Date shown on flyer (defaults to generation date)
  status: 'active',                // draft, active, pending, sold, leased
};

/**
 * Lease-specific fields
 * For multi-unit/suite availability
 */
const leaseListingSchema = {
  ...baseListingSchema,
  
  availableSuites: [
    // {
    //   unit: "101",
    //   sizeSF: 1713,
    //   sizeType: "RSF",           // RSF, USF, GSF
    //   leaseRate: 17.00,
    //   cam: null,
    //   nnn: 7.00,
    //   monthlyBaseRent: 2426.75,  // Auto-calculated
    //   monthlyNNN: 999.25,        // Auto-calculated
    //   monthlyTotal: 3426.00,     // Auto-calculated
    //   availability: AvailabilityStatus.AVAILABLE_NOW,
    //   noticeRequired: null,      // "60 day notice"
    //   footnote: "*",             // Links to footnote text
    // }
  ],
  
  // Footnotes for availability table
  footnotes: [
    // { symbol: "*", text: "Available Now" },
    // { symbol: "**", text: "Requires a 60 day notice" },
  ],
};

/**
 * Land/Development specific fields
 */
const landListingSchema = {
  ...baseListingSchema,
  
  // Development specifics
  developmentOrder: null,          // "DO S2014-00052"
  futureBuilding: null,            // Description of planned structure
  futureBuildingSF: null,
  
  // Condo unit breakdown (for development sales)
  condoUnits: [
    // {
    //   unit: "101",
    //   parcelId: "06-46-26-L4-14000.0101",
    //   sizeDrawings: 1380,        // Per construction drawings
    //   sizeDocs: 1421,            // Per condo docs
    //   taxes: 462.87,
    // }
  ],
  condoCommonArea: null,           // SF of common area
  condoTotalSF: null,              // Total building SF
  condoTotalTaxes: null,           // Combined annual taxes
  
  // Size footnotes
  sizeFootnotes: [
    // { symbol: "*", text: "Size Per Construction Drawings" },
    // { symbol: "**", text: "Size Per Condominium Documents & County Assessor's Office" },
  ],
};

/**
 * Demographics data schema
 */
const demographicsSchema = {
  year: 2024,
  radii: [3, 5, 10],               // Miles - can be [1, 3, 5] or [3, 5, 10]
  population: [],                  // [761, 4595, 22184]
  households: [],                  // [229, 1328, 7086]
  medianIncome: [],                // [88241, 91922, 89841]
};

/**
 * Broker/Agent schema
 */
const brokerSchema = {
  name: '',
  title: '',                       // "Senior Vice President"
  credentials: [],                 // ["CCIM", "SIOR", "AIA"]
  phone: '',                       // "239.659.1447 x218"
  cell: null,                      // Optional cell phone
  email: '',
  personalUrl: null,               // "CREConsultants.com/FredKermani"
  headshot: null,                  // URL to photo
};

/**
 * Computed field helpers
 */
const computeMonthlyRent = (sizeSF, ratePerSF) => {
  if (!sizeSF || !ratePerSF) return null;
  return Number(((sizeSF * ratePerSF) / 12).toFixed(2));
};

const computePricePerSF = (price, sizeSF) => {
  if (!price || !sizeSF) return null;
  return Number((price / sizeSF).toFixed(2));
};

const computePricePerAcre = (price, acres) => {
  if (!price || !acres) return null;
  return Number((price / acres).toFixed(0));
};

const formatPrice = (price) => {
  if (!price) return '';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
};

const formatPriceWithDecimals = (price) => {
  if (!price) return '';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
};

const formatNumber = (num) => {
  if (!num) return '';
  return new Intl.NumberFormat('en-US').format(num);
};

const formatAddress = (address) => {
  if (address.fullDisplay) return address.fullDisplay;
  
  let formatted = address.street;
  if (address.unit) formatted += `, ${address.unit}`;
  formatted += `, ${address.city}, ${address.state} ${address.zip}`;
  
  return formatted.toUpperCase();
};

/**
 * Create a new listing with defaults
 */
function createListing(data = {}, type = 'base') {
  let schema;
  
  switch (type) {
    case 'lease':
      schema = { ...leaseListingSchema };
      break;
    case 'land':
      schema = { ...landListingSchema };
      break;
    default:
      schema = { ...baseListingSchema };
  }
  
  // Deep merge with provided data
  const listing = deepMerge(schema, data);
  
  // Set timestamps
  const now = new Date().toISOString();
  listing.createdAt = listing.createdAt || now;
  listing.updatedAt = now;
  
  // Auto-compute fields if not provided
  if (listing.price && listing.sizeSF && !listing.pricePerSF) {
    listing.pricePerSF = computePricePerSF(listing.price, listing.sizeSF);
  }
  if (listing.price && listing.sizeAcres && !listing.pricePerAcre) {
    listing.pricePerAcre = computePricePerAcre(listing.price, listing.sizeAcres);
  }
  
  // Compute monthly rents for available suites
  if (listing.availableSuites) {
    listing.availableSuites = listing.availableSuites.map(suite => {
      const rate = suite.leaseRate || listing.leaseRate;
      const cam = suite.cam ?? listing.cam ?? 0;
      const nnn = suite.nnn ?? listing.nnn ?? 0;
      
      return {
        ...suite,
        monthlyBaseRent: suite.monthlyBaseRent || computeMonthlyRent(suite.sizeSF, rate),
        monthlyCAM: suite.monthlyCAM || computeMonthlyRent(suite.sizeSF, cam),
        monthlyNNN: suite.monthlyNNN || computeMonthlyRent(suite.sizeSF, nnn),
        monthlyTotal: suite.monthlyTotal || computeMonthlyRent(suite.sizeSF, rate + cam + nnn),
      };
    });
  }
  
  return listing;
}

/**
 * Deep merge helper
 */
function deepMerge(target, source) {
  const output = { ...target };
  
  for (const key in source) {
    if (source[key] === null || source[key] === undefined) {
      continue;
    }
    
    if (Array.isArray(source[key])) {
      output[key] = source[key].length > 0 ? [...source[key]] : output[key];
    } else if (typeof source[key] === 'object' && !Array.isArray(source[key])) {
      output[key] = deepMerge(output[key] || {}, source[key]);
    } else {
      output[key] = source[key];
    }
  }
  
  return output;
}

module.exports = {
  TransactionType,
  PropertyType,
  AvailabilityStatus,
  baseListingSchema,
  leaseListingSchema,
  landListingSchema,
  demographicsSchema,
  brokerSchema,
  createListing,
  computeMonthlyRent,
  computePricePerSF,
  computePricePerAcre,
  formatPrice,
  formatPriceWithDecimals,
  formatNumber,
  formatAddress,
};
