// ═══════════════════════════════════════════════════════════════════════════
// ZENITH OS — MARKETING SUITE — BRAND PROFILES
// White-label brand configurations for multi-tenant CRE marketing
// Main Street Group LLC © 2026
// ═══════════════════════════════════════════════════════════════════════════

const BRANDS = {
  cre_consultants: {
    id: 'cre_consultants',
    name: 'CRE Consultants',
    colors: {
      primary: '#1B6B3A',
      primaryDark: '#145A2E',
      primaryLight: '#2A8B4A',
      accent: '#C41E3A',
      accentLight: '#E8354F',
      text: '#333333',
      textLight: '#FFFFFF',
      textMuted: '#666666',
      background: '#FFFFFF',
      backgroundDark: '#4A4A4A',
      backgroundDarker: '#2D2D2D',
      border: '#E0E0E0',
      borderLight: '#F0F0F0',
      success: '#1B6B3A',
      highlight: '#F7F7F7',
    },
    fonts: {
      heading: "'Montserrat', 'Arial Black', sans-serif",
      subheading: "'Montserrat', 'Arial', sans-serif",
      body: "'Open Sans', 'Helvetica Neue', sans-serif",
      detail: "'Open Sans', 'Helvetica', sans-serif",
      mono: "'Courier New', monospace",
    },
    weights: {
      headingBold: 800,
      headingMedium: 700,
      subBold: 600,
      body: 400,
      bodyBold: 600,
      light: 300,
    },
    disclaimer: "The information contained herein was obtained from sources believed reliable. CRE Consultants makes no guarantees, warranties or representations as to the completeness or accuracy thereof. The presentation of this property is submitted subject to errors, omissions, change of price or conditions prior to sale or lease, or withdrawal without notice. No liability is assumed for the accuracy of the data contained herein. Prospective purchasers/tenants are advised to independently verify the data.",
    officeAddresses: [
      { city: 'Fort Myers', address: '4524 Gun Club Rd., Suite 203 · Fort Myers, FL 33907', phone: '239.481.3800' },
      { city: 'Naples', address: '4501 Tamiami Trail N., Suite 300 · Naples, FL 34103', phone: '239.659.1447' },
    ],
    website: 'CRECONSULTANTS.COM',
    logoSvg: `<svg viewBox="0 0 240 80" xmlns="http://www.w3.org/2000/svg">
      <polygon points="30,5 55,70 5,70" fill="{{primary}}" stroke="none"/>
      <polygon points="30,18 48,62 12,62" fill="{{primaryDark}}" stroke="none"/>
      <text x="68" y="32" font-family="Montserrat, Arial Black, sans-serif" font-weight="800" font-size="22" fill="{{primary}}" letter-spacing="1">CRE</text>
      <text x="68" y="56" font-family="Montserrat, Arial, sans-serif" font-weight="400" font-size="11" fill="{{text}}" letter-spacing="3">CONSULTANTS</text>
      <line x1="68" y1="38" x2="190" y2="38" stroke="{{primary}}" stroke-width="0.8"/>
    </svg>`,
  },

  tcg: {
    id: 'tcg',
    name: 'Trinity Commercial Group',
    colors: {
      primary: '#00B4D8',
      primaryDark: '#0077B6',
      primaryLight: '#48CAE4',
      accent: '#FF6B35',
      text: '#333333',
      textLight: '#FFFFFF',
      textMuted: '#666666',
      background: '#FFFFFF',
      backgroundDark: '#333333',
      backgroundDarker: '#1A1A2E',
      border: '#E0E0E0',
      success: '#00B4D8',
      highlight: '#F0FAFE',
    },
    fonts: {
      heading: "'Open Sans', 'Arial', sans-serif",
      subheading: "'Open Sans', 'Arial', sans-serif",
      body: "'Roboto', 'Helvetica Neue', sans-serif",
      detail: "'Roboto', 'Helvetica', sans-serif",
    },
    weights: {
      headingBold: 800,
      headingMedium: 700,
      subBold: 600,
      body: 400,
      bodyBold: 600,
      light: 300,
    },
    disclaimer: "The information contained herein was obtained from sources believed reliable. Trinity Commercial Group makes no guarantees, warranties or representations as to the completeness or accuracy thereof.",
    website: 'TRINITYCOMMERCIALGROUP.COM',
    logoSvg: `<svg viewBox="0 0 200 70" xmlns="http://www.w3.org/2000/svg">
      <circle cx="25" cy="35" r="18" fill="none" stroke="{{primary}}" stroke-width="3"/>
      <circle cx="25" cy="35" r="4" fill="{{primary}}"/>
      <text x="52" y="30" font-family="Open Sans, Arial, sans-serif" font-weight="800" font-size="20" fill="{{primary}}" letter-spacing="1">TCG</text>
      <text x="52" y="50" font-family="Open Sans, Arial, sans-serif" font-weight="400" font-size="7" fill="{{text}}" letter-spacing="3">TRINITY COMMERCIAL GROUP</text>
    </svg>`,
  },
};

function getBrand(brandId) {
  return BRANDS[brandId] || BRANDS.cre_consultants;
}

function renderBrandLogo(brand) {
  let svg = brand.logoSvg || brand.logo_svg || BRANDS.cre_consultants.logoSvg;
  if (!svg) return '';
  const colors = brand.colors || {};
  svg = svg.replace(/\{\{primary\}\}/g, colors.primary || '#1B6B3A');
  svg = svg.replace(/\{\{primaryDark\}\}/g, colors.primaryDark || '#145A2E');
  svg = svg.replace(/\{\{text\}\}/g, colors.text || '#333333');
  const encoded = Buffer.from(svg).toString('base64');
  return `data:image/svg+xml;base64,${encoded}`;
}

module.exports = { BRANDS, getBrand, renderBrandLogo };
