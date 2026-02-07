/**
 * CRE Flyer Template - Page 2
 * 
 * Contains: Highlights section, aerial/location map, photo grid, demographics table
 */

const { CREConsultantsBrand } = require('../config/brand');
const { formatNumber, formatAddress, formatPrice } = require('../config/schema');

/**
 * Generate Page 2 specific styles
 */
function generatePage2Styles(brand = CREConsultantsBrand) {
  return `
    /* === PAGE 2 SPECIFIC STYLES === */
    
    .page-2 {
      display: flex;
      flex-direction: column;
    }
    
    /* Map Section */
    .map-section {
      position: relative;
      height: 380px;
      background: #f0f0f0;
    }
    
    .map-image {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    
    .map-placeholder {
      width: 100%;
      height: 100%;
      background: linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      color: #666;
    }
    
    /* Subject marker on map */
    .subject-marker {
      position: absolute;
      background: none;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    
    .subject-arrow {
      width: 0;
      height: 0;
      border-top: 12px solid transparent;
      border-bottom: 12px solid transparent;
      border-right: 20px solid #ff0000;
    }
    
    .subject-label {
      background: rgba(255, 0, 0, 0.9);
      color: white;
      padding: 4px 10px;
      font-weight: 700;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 1px;
      transform: rotate(-15deg);
    }
    
    /* Compass */
    .compass {
      position: absolute;
      top: 15px;
      left: 15px;
      width: 40px;
      height: 40px;
    }
    
    .compass svg {
      width: 100%;
      height: 100%;
    }
    
    /* Highlights Panel */
    .highlights-panel {
      position: absolute;
      top: 0;
      right: 0;
      width: 220px;
      background: rgba(255, 255, 255, 0.95);
      padding: 20px;
      height: 100%;
      box-shadow: -2px 0 10px rgba(0,0,0,0.1);
    }
    
    .highlights-title {
      font-family: ${brand.fonts.heading.family};
      font-size: 20px;
      font-weight: 700;
      color: ${brand.colors.primary};
      text-transform: uppercase;
      margin-bottom: 16px;
      letter-spacing: 1px;
    }
    
    .highlight-item {
      display: flex;
      align-items: flex-start;
      margin-bottom: 14px;
    }
    
    .highlight-bullet {
      width: 10px;
      height: 10px;
      background: ${brand.colors.primary};
      margin-right: 10px;
      margin-top: 3px;
      flex-shrink: 0;
    }
    
    .highlight-text {
      font-size: 11px;
      line-height: 1.4;
      color: ${brand.colors.textPrimary};
    }
    
    .highlight-text strong {
      display: block;
      font-weight: 700;
    }
    
    /* Frontage callout */
    .frontage-callout {
      position: absolute;
      left: 20px;
      bottom: 20px;
      background: rgba(46, 125, 50, 0.9);
      color: white;
      padding: 12px 16px;
    }
    
    .frontage-number {
      font-family: ${brand.fonts.subheading.family};
      font-size: 42px;
      font-weight: 700;
      line-height: 1;
    }
    
    .frontage-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    /* Photo Grid */
    .photo-grid-section {
      flex: 1;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0;
    }
    
    .photo-grid-2x2 {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      grid-template-rows: repeat(2, 1fr);
    }
    
    .photo-cell {
      position: relative;
      overflow: hidden;
      background: #f0f0f0;
    }
    
    .photo-cell img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    
    .photo-cell.large {
      grid-column: span 2;
      grid-row: span 2;
    }
    
    .photo-placeholder {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #e0e0e0 0%, #c0c0c0 100%);
      color: #888;
      font-size: 14px;
    }
    
    /* Demographics Table */
    .demographics-section {
      padding: 12px 20px;
      background: white;
      border-top: 1px solid #e0e0e0;
    }
    
    .demographics-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9px;
    }
    
    .demographics-table th {
      background: white;
      padding: 6px 12px;
      text-align: center;
      font-weight: 700;
      border-bottom: 2px solid ${brand.colors.primary};
    }
    
    .demographics-table th:first-child {
      text-align: left;
      font-weight: 700;
    }
    
    .demographics-table td {
      padding: 5px 12px;
      text-align: center;
      border-bottom: 1px solid #e0e0e0;
    }
    
    .demographics-table td:first-child {
      text-align: left;
      font-weight: 400;
    }
    
    .demographics-table tr:last-child td {
      border-bottom: none;
    }
    
    .traffic-row td {
      padding-top: 8px;
      border-top: 1px solid #ccc;
    }
    
    .traffic-row td:first-child {
      font-weight: 700;
    }
    
    /* Contact section on page 2 */
    .page2-footer {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      padding: 10px 20px;
      background: white;
    }
    
    .page2-contact {
      text-align: right;
    }
  `;
}

/**
 * Generate Page 2 HTML
 */
function generatePage2HTML(listing, brand = CREConsultantsBrand, options = {}) {
  const address = formatAddress(listing.address);
  
  // Generate highlights list
  const generateHighlights = () => {
    if (!listing.highlights || listing.highlights.length === 0) return '';
    
    return listing.highlights.map(highlight => {
      // Check if highlight has title/subtitle format
      if (typeof highlight === 'object' && highlight.title) {
        return `
          <div class="highlight-item">
            <div class="highlight-bullet"></div>
            <div class="highlight-text">
              <strong>${highlight.title}</strong>
              ${highlight.subtitle || ''}
            </div>
          </div>
        `;
      }
      return `
        <div class="highlight-item">
          <div class="highlight-bullet"></div>
          <div class="highlight-text">${highlight}</div>
        </div>
      `;
    }).join('');
  };
  
  // Generate demographics table
  const generateDemographicsTable = () => {
    if (!listing.demographics) return '';
    
    const { radii, population, households, medianIncome, year } = listing.demographics;
    
    return `
      <div class="demographics-section">
        <table class="demographics-table">
          <thead>
            <tr>
              <th>${year || '2024'} DEMOGRAPHICS</th>
              ${radii.map(r => `<th>${r} MILE${r !== 1 ? 'S' : ''}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>EST. POPULATION</td>
              ${population.map(p => `<td>${formatNumber(p)}</td>`).join('')}
            </tr>
            <tr>
              <td>EST. HOUSEHOLDS</td>
              ${households.map(h => `<td>${formatNumber(h)}</td>`).join('')}
            </tr>
            <tr>
              <td>EST. MEDIAN HOUSEHOLD INCOME</td>
              ${medianIncome.map(i => `<td>${formatPrice(i)}</td>`).join('')}
            </tr>
            ${listing.trafficCounts ? `
            <tr class="traffic-row">
              <td>TRAFFIC COUNTS (${year || '2024'})</td>
              <td colspan="${radii.length}">${listing.trafficCounts}</td>
            </tr>
            ` : ''}
          </tbody>
        </table>
      </div>
    `;
  };
  
  // Generate photo grid
  const generatePhotoGrid = () => {
    const photos = [];
    
    // Collect all available photos
    if (listing.photos?.interior) photos.push(...listing.photos.interior);
    if (listing.photos?.exterior) photos.push(...listing.photos.exterior.slice(0, 2));
    
    // Fill grid (max 4 photos)
    const gridPhotos = photos.slice(0, 4);
    
    if (gridPhotos.length === 0) {
      return `
        <div class="photo-grid-section photo-grid-2x2">
          ${[1,2,3,4].map(() => `
            <div class="photo-cell">
              <div class="photo-placeholder">Photo</div>
            </div>
          `).join('')}
        </div>
      `;
    }
    
    return `
      <div class="photo-grid-section photo-grid-2x2">
        ${gridPhotos.map((photo, i) => `
          <div class="photo-cell">
            <img src="${photo}" alt="Property photo ${i + 1}">
          </div>
        `).join('')}
        ${gridPhotos.length < 4 ? Array(4 - gridPhotos.length).fill().map(() => `
          <div class="photo-cell">
            <div class="photo-placeholder">Photo</div>
          </div>
        `).join('') : ''}
      </div>
    `;
  };
  
  // Format broker info
  const formatBrokerName = (broker) => {
    const creds = broker.credentials?.length > 0 ? broker.credentials.join(', ') : '';
    return creds ? `${broker.name}, ${creds}` : broker.name;
  };
  
  const generateBrokerSection = () => {
    return listing.brokers.map(broker => `
      <div class="broker-card">
        <div class="broker-name">${formatBrokerName(broker)}</div>
        <div class="broker-title">${broker.title}</div>
        <div class="broker-phone">${broker.phone}</div>
        <div class="broker-email">${broker.email}</div>
      </div>
    `).join('');
  };
  
  // Compass SVG
  const compassSVG = `
    <svg viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="25" cy="25" r="20" fill="white" stroke="#333" stroke-width="1"/>
      <polygon points="25,8 28,20 25,18 22,20" fill="#333"/>
      <polygon points="25,42 28,30 25,32 22,30" fill="#ccc"/>
      <text x="25" y="7" text-anchor="middle" font-size="6" font-weight="bold" fill="#333">N</text>
    </svg>
  `;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${listing.propertyTypeCustom || listing.propertyType} - ${address} - Page 2</title>
  <style>
    ${require('./page1').generateStyles(brand)}
    ${generatePage2Styles(brand)}
  </style>
</head>
<body>
  <div class="page page-2">
    <!-- Header (same as page 1) -->
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
    
    <!-- Map Section with Highlights -->
    <div class="map-section">
      ${listing.photos?.aerial?.[0] 
        ? `<img class="map-image" src="${listing.photos.aerial[0]}" alt="Aerial view">`
        : `<div class="map-placeholder">Aerial / Location Map</div>`
      }
      
      <!-- Compass -->
      <div class="compass">${compassSVG}</div>
      
      <!-- Subject Marker -->
      <div class="subject-marker" style="top: 45%; left: 30%;">
        <div class="subject-arrow"></div>
        <div class="subject-label">SUBJECT</div>
      </div>
      
      ${listing.frontage ? `
      <div class="frontage-callout">
        <div class="frontage-number">${listing.frontage.match(/\\d+/)?.[0] || ''}'</div>
        <div class="frontage-label">FRONTAGE ON<br>MAIN ARTERIAL</div>
      </div>
      ` : ''}
      
      <!-- Highlights Panel -->
      <div class="highlights-panel">
        <div class="highlights-title">HIGHLIGHTS</div>
        ${generateHighlights()}
      </div>
    </div>
    
    <!-- Photo Grid (for non-land properties) -->
    ${listing.propertyType !== 'land' ? generatePhotoGrid() : ''}
    
    <!-- Demographics Table (for land/development) -->
    ${listing.demographics ? generateDemographicsTable() : ''}
    
    <!-- Footer with Contact -->
    <div class="page2-footer">
      <div class="disclaimer">${brand.disclaimer}</div>
      <div class="page2-contact">
        <div class="contact-header">CONTACT</div>
        ${generateBrokerSection()}
      </div>
    </div>
    
    <div class="date-stamp" style="position: absolute; bottom: 10px; right: 20px;">
      ${listing.flyerDate || new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' })}
    </div>
    
    <!-- Green Accent Line -->
    <div class="green-accent" style="position: absolute; bottom: 0; left: 0; right: 0;"></div>
  </div>
</body>
</html>
  `;
}

module.exports = {
  generatePage2Styles,
  generatePage2HTML,
};
