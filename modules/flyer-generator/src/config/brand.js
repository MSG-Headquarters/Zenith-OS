/**
 * CRE Consultants Brand Configuration
 * 
 * This configuration defines all brand-specific elements for flyer generation.
 * In a white-label system, this would be pulled from Zenith OS license data.
 */

const CREConsultantsBrand = {
  // Company Information
  company: {
    name: "CRE Consultants",
    legalName: "Commercial Real Estate Consultants, LLC",
    website: "CRECONSULTANTS.COM",
    tagline: "Commercial Real Estate Consultants, LLC",
  },

  // Office Locations
  offices: [
    {
      name: "Fort Myers",
      address: "12140 Carissa Commerce Ct, Suite 102",
      city: "Fort Myers",
      state: "FL",
      zip: "33966",
    },
    {
      name: "Naples",
      address: "1100 Fifth Ave. S, Suite 404",
      city: "Naples",
      state: "FL",
      zip: "34102",
    },
  ],

  // Brand Colors (extracted from flyers)
  colors: {
    primary: "#2E7D32",       // CRE Green - headers, accents
    primaryDark: "#1B5E20",   // Darker green for hover/emphasis
    secondary: "#4A4A4A",     // Dark gray - body text
    accent: "#2E7D32",        // Same green for highlights
    
    // Header gradients/overlays
    headerBg: "#2E7D32",
    headerOverlay: "rgba(46, 125, 50, 0.85)",
    
    // Text colors
    textPrimary: "#1A1A1A",
    textSecondary: "#4A4A4A",
    textMuted: "#666666",
    textWhite: "#FFFFFF",
    
    // Background colors
    bgLight: "#F5F5F5",
    bgWhite: "#FFFFFF",
    bgDark: "#333333",
    
    // Table colors
    tableHeader: "#4A4A4A",
    tableHeaderText: "#FFFFFF",
    tableBorder: "#CCCCCC",
    tableAlt: "#F9F9F9",
    
    // Highlight bullet color
    bulletGreen: "#2E7D32",
  },

  // Typography
  fonts: {
    // Primary heading font (used for property type banners)
    heading: {
      family: "'Oswald', 'Arial Black', sans-serif",
      weights: {
        normal: 400,
        bold: 700,
      },
    },
    // Secondary font for "FOR SALE/LEASE" and addresses
    subheading: {
      family: "'Playfair Display', 'Georgia', serif",
      weights: {
        normal: 400,
        bold: 700,
      },
    },
    // Body text font
    body: {
      family: "'Open Sans', 'Arial', sans-serif",
      weights: {
        light: 300,
        normal: 400,
        semibold: 600,
        bold: 700,
      },
    },
  },

  // Logo configuration
  logo: {
    // Path to logo files (would be uploaded in white-label system)
    primary: "/assets/cre-logo.png",
    white: "/assets/cre-logo-white.png",
    icon: "/assets/cre-icon.png",
    
    // Logo dimensions
    dimensions: {
      header: { width: 180, height: 80 },
      footer: { width: 120, height: 53 },
    },
    
    // Position in header
    position: "top-right",
  },

  // Page Layout Specifications
  layout: {
    // Page size (US Letter)
    page: {
      width: 8.5,      // inches
      height: 11,      // inches
      widthPx: 816,    // at 96 DPI
      heightPx: 1056,  // at 96 DPI
    },
    
    // Margins
    margins: {
      top: 0,          // Full bleed header
      right: 0,
      bottom: 0,
      left: 0,
    },
    
    // Content area padding
    contentPadding: {
      horizontal: 24,  // px
      vertical: 16,    // px
    },
    
    // Header band height
    headerHeight: 110, // px - for property type banner
    
    // Green accent line
    accentLine: {
      height: 8,
      color: "#2E7D32",
    },
  },

  // Standard text sizes (px)
  textSizes: {
    propertyType: 32,      // Main banner heading
    buildingName: 18,      // Secondary heading
    forSaleLease: 42,      // "FOR SALE" / "FOR LEASE"
    address: 14,           // Property address
    sectionHeader: 14,     // "PRICE:", "SIZE:", etc.
    bodyText: 11,          // Description text
    tableText: 10,         // Table content
    highlightText: 11,     // Bullet points
    contactName: 12,       // Broker names
    contactTitle: 10,      // Broker titles
    disclaimer: 7,         // Legal disclaimer
    dateStamp: 8,          // Date in corner
  },

  // Disclaimer text
  disclaimer: `The information contained herein was obtained from sources believed reliable. CRE Consultants makes no guarantees, warranties or representations as to the completeness or accuracy thereof, and is subject to errors, omissions, change of price or conditions prior to sale or lease, or withdrawal without notice.`,

  // Property type display names and colors
  propertyTypes: {
    office: {
      display: "OFFICE",
      color: "#2E7D32",
    },
    medical: {
      display: "MEDICAL/OFFICE",
      alternates: ["PROFESSIONAL/MEDICAL OFFICE"],
      color: "#2E7D32",
    },
    retail: {
      display: "RETAIL",
      color: "#2E7D32",
    },
    industrial: {
      display: "INDUSTRIAL",
      color: "#2E7D32",
    },
    land: {
      display: "LAND",
      alternates: ["DEVELOPMENT SITE", "HOMESITE"],
      color: "#2E7D32",
    },
    multifamily: {
      display: "MULTIFAMILY",
      color: "#2E7D32",
    },
    mixed: {
      display: "MIXED-USE",
      color: "#2E7D32",
    },
  },

  // Transaction type styling
  transactionTypes: {
    sale: {
      display: "FOR SALE",
      color: "#2E7D32",
    },
    lease: {
      display: "FOR LEASE",
      color: "#2E7D32",
    },
    saleOrLease: {
      display: "FOR SALE OR LEASE",
      color: "#2E7D32",
    },
  },
};

// White-label ready: Export function to merge with license data
function createBrandConfig(licenseData = null) {
  if (!licenseData) {
    return CREConsultantsBrand;
  }
  
  // Merge license data with base template
  return {
    ...CREConsultantsBrand,
    company: {
      ...CREConsultantsBrand.company,
      ...licenseData.company,
    },
    colors: {
      ...CREConsultantsBrand.colors,
      ...licenseData.colors,
    },
    logo: {
      ...CREConsultantsBrand.logo,
      ...licenseData.logo,
    },
    offices: licenseData.offices || CREConsultantsBrand.offices,
    disclaimer: licenseData.disclaimer || CREConsultantsBrand.disclaimer,
  };
}

module.exports = {
  CREConsultantsBrand,
  createBrandConfig,
  defaultBrand: CREConsultantsBrand,
};
