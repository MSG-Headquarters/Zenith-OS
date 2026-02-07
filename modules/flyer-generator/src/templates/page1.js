/**
 * CRE Flyer Template - Page 1
 * 
 * This template generates an HTML page that matches the CRE Consultants flyer design.
 * It's rendered via Puppeteer to produce a print-ready PDF.
 */

const { CREConsultantsBrand } = require('../config/brand');
const { formatPrice, formatPriceWithDecimals, formatNumber, formatAddress } = require('../config/schema');

/**
 * Generate the CSS styles for the flyer
 */
function generateStyles(brand = CREConsultantsBrand) {
  return `
    @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Playfair+Display:wght@400;700&family=Open+Sans:wght@300;400;600;700&display=swap');
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    @page {
      size: 8.5in 11in;
      margin: 0;
    }
    
    body {
      font-family: ${brand.fonts.body.family};
      font-size: 11px;
      line-height: 1.4;
      color: ${brand.colors.textPrimary};
      background: white;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    
    .page {
      width: 8.5in;
      height: 11in;
      position: relative;
      overflow: hidden;
      background: white;
      page-break-after: always;
    }
    
    /* === HEADER SECTION === */
    .header {
      position: relative;
      background: linear-gradient(135deg, #2a2a2a 0%, #3d3d3d 50%, #2a2a2a 100%);
      padding: 12px 20px 8px 20px;
    }
    
    .header::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M 10 0 L 0 0 0 10" fill="none" stroke="rgba(255,255,255,0.03)" stroke-width="0.5"/></pattern></defs><rect width="100" height="100" fill="url(%23grid)"/></svg>');
      pointer-events: none;
    }
    
    .header-content {
      position: relative;
      z-index: 1;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    
    .header-left {
      flex: 1;
    }
    
    .property-type {
      font-family: ${brand.fonts.heading.family};
      font-size: 28px;
      font-weight: 700;
      color: ${brand.colors.primary};
      text-transform: uppercase;
      letter-spacing: 1px;
      line-height: 1.1;
    }
    
    .building-name {
      font-family: ${brand.fonts.heading.family};
      font-size: 16px;
      font-weight: 400;
      color: ${brand.colors.primary};
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-top: 2px;
    }
    
    .header-right {
      text-align: right;
    }
    
    .logo-container {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
    }
    
    .logo-icon {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
    }
    
    .logo-triangles {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    
    .logo-triangles .row {
      display: flex;
      gap: 2px;
      justify-content: flex-end;
    }
    
    .logo-triangles .triangle {
      width: 0;
      height: 0;
      border-left: 6px solid transparent;
      border-right: 6px solid transparent;
      border-bottom: 10px solid ${brand.colors.primary};
    }
    
    .logo-text {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
    }
    
    .logo-cre {
      font-family: ${brand.fonts.heading.family};
      font-size: 36px;
      font-weight: 700;
      color: ${brand.colors.primary};
      line-height: 1;
      letter-spacing: 2px;
    }
    
    .logo-consultants {
      font-family: ${brand.fonts.body.family};
      font-size: 11px;
      font-weight: 600;
      color: ${brand.colors.textWhite};
      letter-spacing: 3px;
      text-transform: uppercase;
    }
    
    .logo-tagline {
      font-family: ${brand.fonts.body.family};
      font-size: 7px;
      color: rgba(255,255,255,0.7);
      font-style: italic;
      margin-top: 2px;
    }
    
    .website {
      font-family: ${brand.fonts.body.family};
      font-size: 11px;
      font-weight: 700;
      color: ${brand.colors.primary};
      margin-top: 4px;
    }
    
    /* === TRANSACTION & ADDRESS BANNER === */
    .transaction-banner {
      background: white;
      padding: 8px 20px;
      border-bottom: 1px solid #e0e0e0;
    }
    
    .for-sale-lease {
      font-family: ${brand.fonts.subheading.family};
      font-size: 36px;
      font-weight: 400;
      color: ${brand.colors.primary};
      line-height: 1;
    }
    
    .address-line {
      font-family: ${brand.fonts.body.family};
      font-size: 12px;
      font-weight: 400;
      color: ${brand.colors.textSecondary};
      letter-spacing: 2px;
      text-transform: uppercase;
      margin-top: 4px;
    }
    
    /* === HERO IMAGE === */
    .hero-section {
      position: relative;
      height: 300px;
      overflow: hidden;
    }
    
    .hero-image {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    
    .hero-placeholder {
      width: 100%;
      height: 100%;
      background: linear-gradient(135deg, #e0e0e0 0%, #c0c0c0 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #888;
      font-size: 24px;
    }
    
    /* Suite highlight overlay */
    .suite-highlight {
      position: absolute;
      border: 3px solid #ff0000;
      background: transparent;
    }
    
    /* === LEASE TABLE === */
    .lease-table-section {
      padding: 0 20px;
      margin-top: -1px;
    }
    
    .lease-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9px;
    }
    
    .lease-table th {
      background: ${brand.colors.tableHeader};
      color: ${brand.colors.tableHeaderText};
      padding: 6px 8px;
      text-align: center;
      font-weight: 600;
      text-transform: uppercase;
      font-size: 8px;
      letter-spacing: 0.5px;
    }
    
    .lease-table td {
      padding: 6px 8px;
      text-align: center;
      border: 1px solid ${brand.colors.tableBorder};
      background: white;
    }
    
    /* === DETAILS SECTION === */
    .content-section {
      display: flex;
      padding: 12px 20px 0 20px;
      gap: 20px;
    }
    
    .details-column {
      flex: 1;
    }
    
    .contact-column {
      width: 200px;
      text-align: right;
    }
    
    /* Property Details */
    .detail-row {
      display: flex;
      margin-bottom: 6px;
      align-items: flex-start;
    }
    
    .detail-label {
      font-weight: 700;
      color: ${brand.colors.primary};
      text-transform: uppercase;
      font-size: 10px;
      min-width: 85px;
      flex-shrink: 0;
    }
    
    .detail-value {
      font-size: 11px;
      color: ${brand.colors.textPrimary};
      flex: 1;
    }
    
    .detail-value strong {
      font-weight: 700;
    }
    
    .detail-value a {
      color: ${brand.colors.primary};
      font-style: italic;
      font-size: 10px;
    }
    
    /* Description */
    .description-section {
      margin-top: 12px;
      padding-right: 20px;
    }
    
    .description-title {
      font-weight: 700;
      color: ${brand.colors.primary};
      text-transform: uppercase;
      font-size: 10px;
      margin-bottom: 4px;
      display: flex;
      align-items: center;
    }
    
    .description-title::after {
      content: '';
      flex: 1;
      height: 1px;
      background: ${brand.colors.primary};
      margin-left: 8px;
    }
    
    .description-text {
      font-size: 10.5px;
      line-height: 1.5;
      color: ${brand.colors.textPrimary};
      text-align: justify;
    }
    
    .description-text strong {
      font-weight: 700;
    }
    
    /* === CONTACT SECTION === */
    .contact-section {
      margin-top: 0;
    }
    
    .contact-header {
      font-family: ${brand.fonts.body.family};
      font-size: 12px;
      font-weight: 700;
      color: ${brand.colors.primary};
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    
    .broker-card {
      margin-bottom: 12px;
    }
    
    .broker-name {
      font-weight: 700;
      font-size: 11px;
      color: ${brand.colors.textPrimary};
    }
    
    .broker-title {
      font-size: 10px;
      color: ${brand.colors.textSecondary};
      font-style: italic;
    }
    
    .broker-phone {
      font-size: 10px;
      color: ${brand.colors.textPrimary};
      margin-top: 2px;
    }
    
    .broker-email {
      font-size: 9px;
      color: ${brand.colors.primary};
    }
    
    .office-addresses {
      margin-top: 16px;
      font-size: 9px;
      color: ${brand.colors.textSecondary};
      line-height: 1.4;
    }
    
    .office-address {
      margin-bottom: 8px;
    }
    
    /* === FOOTER === */
    .footer {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      padding: 8px 20px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    
    .disclaimer {
      font-size: 6.5px;
      color: ${brand.colors.textMuted};
      max-width: 450px;
      line-height: 1.3;
    }
    
    .date-stamp {
      font-size: 9px;
      color: ${brand.colors.textMuted};
    }
    
    /* === GREEN ACCENT LINE === */
    .green-accent {
      height: 6px;
      background: ${brand.colors.primary};
    }
  `;
}

/**
 * Generate Page 1 HTML for a listing
 */
function generatePage1HTML(listing, brand = CREConsultantsBrand) {
  const address = formatAddress(listing.address);
  const isLease = listing.transactionType === 'lease';
  const isSale = listing.transactionType === 'sale';
  
  // Format credentials
  const formatCredentials = (broker) => {
    if (!broker.credentials || broker.credentials.length === 0) return '';
    return broker.credentials.join(', ');
  };
  
  // Build broker name with credentials
  const formatBrokerName = (broker) => {
    const creds = formatCredentials(broker);
    return creds ? `${broker.name}, ${creds}` : broker.name;
  };
  
  // Generate lease table rows
  const generateLeaseTableRows = () => {
    if (!listing.availableSuites || listing.availableSuites.length === 0) return '';
    
    return listing.availableSuites.map(suite => `
      <tr>
        <td>${suite.unit}${suite.footnote || ''}</td>
        <td>${formatNumber(suite.sizeSF)}</td>
        <td>$${suite.leaseRate?.toFixed(2) || ''}</td>
        <td>$${formatNumber(suite.monthlyBaseRent?.toFixed(2))}</td>
        <td>$${suite.cam?.toFixed(2) || ''}</td>
        <td>$${formatNumber(suite.monthlyCAM?.toFixed(2))}</td>
        <td>$${formatNumber(suite.monthlyTotal?.toFixed(2))}</td>
      </tr>
    `).join('');
  };
  
  // Generate details based on transaction type
  const generateDetails = () => {
    let details = [];
    
    if (isLease) {
      details.push({
        label: 'LEASE RATE:',
        value: `<strong>$${listing.leaseRate?.toFixed(2)} PSF ${listing.leaseType || 'NNN'}</strong>${listing.utilities ? ` + Utilities ($${listing.utilities?.toFixed(2)} PSF Estimated)` : ''}`
      });
      if (listing.cam) {
        details.push({ label: 'CAM:', value: `$${listing.cam?.toFixed(2)} PSF` });
      }
    } else {
      const priceDisplay = listing.priceDisplay || `${formatPrice(listing.price)}${listing.pricePerSF ? ` at $${listing.pricePerSF.toFixed(2)} PSF` : ''}${listing.pricePerAcre ? ` ($${formatNumber(listing.pricePerAcre)}/Acres)` : ''}`;
      details.push({ label: 'PRICE:', value: `<strong>${priceDisplay}</strong>` });
    }
    
    // Size
    if (listing.sizeAcres) {
      details.push({ 
        label: 'SIZE:', 
        value: `${listing.sizeAcres}± Acres${listing.sizeSF ? ` (${formatNumber(listing.sizeSF)}± SF)` : ''}${listing.frontage ? ` (${listing.frontage})` : ''}`
      });
    } else if (listing.sizeSF) {
      details.push({ label: 'SIZE:', value: `${formatNumber(listing.sizeSF)}± SF` });
    }
    
    // Dimensions (for land)
    if (listing.dimensions) {
      details.push({ label: 'DIMENSIONS:', value: listing.dimensions });
    }
    
    // Location
    if (listing.locationDescription) {
      details.push({ label: 'LOCATION:', value: listing.locationDescription });
    }
    
    // Zoning
    if (listing.zoning) {
      let zoningValue = `${listing.zoning}${listing.zoningDescription ? ` - ${listing.zoningDescription}` : ''}`;
      if (listing.zoningLink) {
        zoningValue += ` <a href="${listing.zoningLink}">Click here for zoning uses</a>`;
      }
      details.push({ label: 'ZONING:', value: zoningValue });
    }
    
    // Year Built
    if (listing.yearBuilt) {
      let yearValue = listing.yearBuilt.toString();
      if (listing.renovatedYear) {
        yearValue += ` (Renovated in ${listing.renovatedYear})`;
      }
      details.push({ label: 'YEAR BUILT:', value: yearValue });
    }
    
    // Flood Zone (for land)
    if (listing.floodZone) {
      let floodValue = listing.floodZone;
      if (listing.floodZoneLink) {
        floodValue += ` <a href="${listing.floodZoneLink}">Click here for description</a>`;
      }
      details.push({ label: 'FLOOD ZONE:', value: floodValue });
    }
    
    // Taxes
    if (listing.taxes) {
      details.push({ 
        label: 'RE TAXES:', 
        value: `$${formatNumber(listing.taxes.toFixed(2))}${listing.taxYear ? ` (${listing.taxYear})` : ''}`
      });
    }
    
    // Condo Fees
    if (listing.condoFees) {
      details.push({ 
        label: 'CONDO FEES:', 
        value: `$${formatNumber(listing.condoFees.toFixed(2))}/${listing.condoFeePeriod === 'month' ? 'Month' : 'Quarter'}`
      });
    }
    
    // Parking
    if (listing.parkingSpaces || listing.parkingDescription) {
      details.push({ 
        label: 'PARKING:', 
        value: listing.parkingDescription || `${listing.parkingSpaces} Spaces`
      });
    }
    
    // Parcel ID
    if (listing.parcelId) {
      details.push({ label: 'PARCEL ID:', value: listing.parcelId });
    }
    
    return details.map(d => `
      <div class="detail-row">
        <span class="detail-label">${d.label}</span>
        <span class="detail-value">${d.value}</span>
      </div>
    `).join('');
  };
  
  // Generate broker cards
  const generateBrokerCards = () => {
    return listing.brokers.map(broker => `
      <div class="broker-card">
        <div class="broker-name">${formatBrokerName(broker)}</div>
        <div class="broker-title">${broker.title}</div>
        <div class="broker-phone">${broker.phone}${broker.cell ? `<br>Cell: ${broker.cell}` : ''}</div>
        <div class="broker-email">${broker.email}</div>
        ${broker.personalUrl ? `<div class="broker-email">${broker.personalUrl}</div>` : ''}
      </div>
    `).join('');
  };
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${listing.propertyTypeCustom || listing.propertyType} - ${address}</title>
  <style>${generateStyles(brand)}</style>
</head>
<body>
  <div class="page">
    <!-- Header -->
    <div class="header">
      <div class="header-content">
        <div class="header-left">
          <div class="property-type">${listing.propertyTypeCustom || brand.propertyTypes[listing.propertyType]?.display || listing.propertyType.toUpperCase()}</div>
          ${listing.buildingName ? `<div class="building-name">${listing.buildingName}</div>` : ''}
        </div>
        <div class="header-right">
          <div class="logo-container">
            <div class="logo-icon">
              <div class="logo-triangles">
                <div class="row"><div class="triangle"></div></div>
                <div class="row"><div class="triangle"></div><div class="triangle"></div></div>
                <div class="row"><div class="triangle"></div><div class="triangle"></div><div class="triangle"></div></div>
              </div>
            </div>
            <div class="logo-text">
              <div class="logo-cre">CRE</div>
              <div class="logo-consultants">CONSULTANTS</div>
              <div class="logo-tagline">${brand.company.tagline}</div>
            </div>
          </div>
          <div class="website">${brand.company.website}</div>
        </div>
      </div>
    </div>
    
    <!-- Transaction & Address -->
    <div class="transaction-banner">
      <div class="for-sale-lease">${brand.transactionTypes[listing.transactionType]?.display || 'FOR SALE'}</div>
      <div class="address-line">${address}</div>
    </div>
    
    <!-- Hero Image -->
    <div class="hero-section">
      ${listing.photos?.hero 
        ? `<img class="hero-image" src="${listing.photos.hero}" alt="Property exterior">`
        : `<div class="hero-placeholder">Property Photo</div>`
      }
    </div>
    
    <!-- Lease Table (if applicable) -->
    ${isLease && listing.availableSuites?.length > 0 ? `
    <div class="lease-table-section">
      <table class="lease-table">
        <thead>
          <tr>
            <th>UNIT</th>
            <th>SIZE<br>(SF)</th>
            <th>LEASE RATE (PSF)</th>
            <th>MONTHLY BASE RENT</th>
            <th>CAM<br>(PSF)</th>
            <th>MONTHLY CAM</th>
            <th>MONTHLY<br>TOTAL</th>
          </tr>
        </thead>
        <tbody>
          ${generateLeaseTableRows()}
        </tbody>
      </table>
    </div>
    ` : ''}
    
    <!-- Content Section -->
    <div class="content-section">
      <div class="details-column">
        <!-- Property Details -->
        ${generateDetails()}
        
        <!-- Description -->
        ${listing.description ? `
        <div class="description-section">
          ${listing.propertyTypeCustom?.includes('DEVELOPMENT') || listing.propertyType === 'land' 
            ? `<div class="description-title">${listing.propertyTypeCustom?.split(' ').slice(-2).join(' ') || 'PROPERTY DETAILS'}</div>`
            : ''
          }
          <div class="description-text">${listing.description}</div>
        </div>
        ` : ''}
      </div>
      
      <div class="contact-column">
        <div class="contact-section">
          <div class="contact-header">CONTACT</div>
          ${generateBrokerCards()}
          
          <div class="office-addresses">
            ${brand.offices.map(office => `
              <div class="office-address">
                ${office.address}<br>
                ${office.city}, ${office.state} ${office.zip}
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
    
    <!-- Footer -->
    <div class="footer">
      <div class="disclaimer">${brand.disclaimer}</div>
      <div class="date-stamp">${listing.flyerDate || new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' })}</div>
    </div>
    
    <!-- Green Accent Line -->
    <div class="green-accent" style="position: absolute; bottom: 0; left: 0; right: 0;"></div>
  </div>
</body>
</html>
  `;
}

module.exports = {
  generateStyles,
  generatePage1HTML,
};
