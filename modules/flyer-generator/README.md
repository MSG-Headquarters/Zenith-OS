# CRE Flyer Generator

**Zenith OS Module for CRE Tenant**  
Port: 3006

Automated marketing flyer generation for commercial real estate listings. Produces professional 2-page flyers with CRE Consultants branding.

## Quick Start

```bash
# Install dependencies
npm install

# Start API server
npm start

# Server runs on http://localhost:3006
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/flyer-generator/health` | Health check |
| `POST` | `/api/flyer-generator/generate` | Generate flyer |
| `POST` | `/api/flyer-generator/preview` | HTML preview for iframe |
| `GET` | `/api/flyer-generator/templates` | List available templates |
| `GET` | `/api/flyer-generator/brands` | List brand configurations |
| `GET` | `/api/flyer-generator/flyers` | List generated flyers |
| `DELETE` | `/api/flyer-generator/flyers/:filename` | Delete a flyer |
| `GET` | `/api/flyer-generator/schema` | Listing data schema |
| `GET` | `/api/flyer-generator/schema/example` | Example listing JSON |

## Generate Flyer

```bash
curl -X POST http://localhost:3006/api/flyer-generator/generate \
  -H "Content-Type: application/json" \
  -d '{
    "listing": {
      "id": "listing-001",
      "propertyType": "office",
      "propertyTypeCustom": "CLASS A OFFICE",
      "transactionType": "lease",
      "address": {
        "street": "123 Main Street",
        "city": "Naples",
        "state": "FL",
        "zip": "34102"
      },
      "leaseRate": 25.00,
      "leaseType": "NNN",
      "cam": 12.50,
      "sizeSF": 5000,
      "description": "Prime office space...",
      "brokers": [{
        "name": "John Smith",
        "title": "Broker Associate",
        "phone": "239.555.1234",
        "email": "john@creconsultants.com"
      }]
    },
    "format": "html",
    "pages": [1, 2]
  }'
```

**Response:**
```json
{
  "success": true,
  "jobId": "uuid-here",
  "listing": {
    "id": "listing-001",
    "address": "123 Main Street, Naples, FL 34102",
    "type": "lease"
  },
  "files": [
    {
      "page": 1,
      "format": "html",
      "filename": "flyer-uuid-page1.html",
      "url": "/outputs/flyer-uuid-page1.html"
    },
    {
      "page": 2,
      "format": "html",
      "filename": "flyer-uuid-page2.html",
      "url": "/outputs/flyer-uuid-page2.html"
    }
  ]
}
```

## Output Formats

| Format | Description | Requirements |
|--------|-------------|--------------|
| `html` | Self-contained HTML files | None |
| `pdf` | Print-ready PDF | Chrome/Chromium |
| `png` | Preview images | Chrome/Chromium |
| `all` | All formats | Chrome/Chromium |

## Listing Data Schema

### Required Fields
- `address.street` - Street address
- `address.city` - City
- `address.state` - State abbreviation
- `address.zip` - ZIP code

### Transaction Type Fields

**For Leases:**
- `leaseRate` - Base rent PSF
- `leaseType` - NNN, NN, Gross, Modified Gross
- `cam` - CAM charges PSF

**For Sales:**
- `salePrice` - Sale price
- `pricePSF` - Price per square foot

**For Land:**
- `acres` - Acreage
- `pricePerAcre` - Price per acre

### Common Fields
- `id` - Unique identifier
- `propertyType` - office, retail, industrial, medical, land
- `propertyTypeCustom` - Custom header text
- `buildingName` - Building/project name
- `sizeSF` - Square footage
- `description` - Property description
- `highlights` - Array of feature strings
- `photos.hero` - Main image URL
- `brokers` - Array of broker objects

## CRM Integration

### React Widget

Copy `crm-widget/FlyerGeneratorWidget.jsx` to your Zenith CRM project:

```jsx
import { FlyerGeneratorWidget } from './FlyerGeneratorWidget';

function ListingDetailPage({ listing }) {
  return (
    <div>
      {/* ... listing details ... */}
      
      <FlyerGeneratorWidget 
        listing={listing}
        onGenerate={(files) => console.log('Generated:', files)}
      />
    </div>
  );
}
```

### Direct API Call

```javascript
async function generateFlyer(listing) {
  const response = await fetch('/api/flyer-generator/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      listing,
      format: 'pdf',
      pages: [1, 2]
    })
  });
  
  const result = await response.json();
  
  if (result.success) {
    // Download or display the files
    result.files.forEach(file => {
      window.open(file.url, '_blank');
    });
  }
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FLYER_GENERATOR_PORT` | `3006` | API server port |
| `FLYER_OUTPUT_DIR` | `./output` | Generated file storage |
| `PUPPETEER_EXECUTABLE_PATH` | Auto-detect | Chrome path for PDF |

## File Structure

```
cre-flyer-generator/
├── server.js               # Express API server
├── package.json
├── src/
│   ├── index.js           # Core generation logic
│   ├── config/
│   │   ├── brand.js       # CRE Consultants branding
│   │   └── schema.js      # Listing data schema
│   ├── templates/
│   │   ├── page1.js       # Hero + Details template
│   │   └── page2.js       # Map + Photos template
│   └── services/
│       └── pdfGenerator.js # Puppeteer PDF service
├── crm-widget/
│   └── FlyerGeneratorWidget.jsx  # React component
├── sample-data/
│   ├── 950-encore-way-lease.json
│   └── 72nd-ave-homesite-sale.json
├── output/                 # Generated flyers
└── test-api.js            # API test suite
```

## Zenith OS Integration

1. **Copy module to CRE tenant:**
   ```bash
   cp -r cre-flyer-generator /path/to/zenith-os/tenants/cre/flyer-generator
   ```

2. **Add to PM2 ecosystem:**
   ```javascript
   // ecosystem.config.js
   {
     name: 'flyer-generator',
     cwd: './tenants/cre/flyer-generator',
     script: 'server.js',
     env: {
       FLYER_GENERATOR_PORT: 3006
     }
   }
   ```

3. **Register in Zenith gateway/proxy** (if applicable)

4. **Add CRM dashboard widget** to listing detail pages

## Templates

### Standard 2-Page (Default)
- **Page 1:** Hero image, property details, lease/sale terms, broker contacts
- **Page 2:** Location map, photo gallery, demographics table

### Coming Soon
- Development Package (4-page)
- Social Media Card (1200x630)
- Email-optimized format

## White-Label Support

The generator supports white-label branding for future tenants:

```javascript
// Add new brand in src/config/brands/
module.exports = {
  name: 'RE/MAX',
  colors: {
    primary: '#DC0032',
    secondary: '#003DA5',
    // ...
  },
  contact: {
    // ...
  }
};
```

## Testing

```bash
# Start server
npm start

# In another terminal, run tests
npm test
```

## License

Proprietary - MSG Engineering

---

**Module:** CRE Flyer Generator  
**Version:** 1.0.0  
**Port:** 3006  
**Tenant:** CRE Consultants  
**Platform:** Zenith OS
