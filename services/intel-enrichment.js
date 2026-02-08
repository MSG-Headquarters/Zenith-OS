/**
 * INTEL Property Enrichment Service
 * 
 * Integrates:
 * - Google Places API (business info, tenant data)
 * - EagleView API (aerial imagery, property data)
 * - County PA (parcel lookup) - coming soon
 * - ArcGIS (demographics) - coming soon
 * 
 * Main Street Group Technology Division
 */

const https = require('https');
const fetch = require('node-fetch');

// ---------------------------------------------------------------------------
// EAGLEVIEW OAUTH2 TOKEN MANAGEMENT
// ---------------------------------------------------------------------------

let eagleviewToken = null;
let eagleviewTokenExpiry = null;

async function getEagleViewToken() {
    // Return cached token if still valid
    if (eagleviewToken && eagleviewTokenExpiry && Date.now() < eagleviewTokenExpiry) {
        return eagleviewToken;
    }

    const clientId = process.env.EAGLEVIEW_CLIENT_ID;
    const clientSecret = process.env.EAGLEVIEW_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error('EagleView credentials not configured');
    }

    const tokenUrl = 'https://auth.eagleview.com/oauth2/default/v1/token';
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json'
        },
        body: 'grant_type=client_credentials&scope=imagery property-data'
    });

    if (!response.ok) {
        const error = await response.text();
        console.error('[EagleView] Token error:', error);
        throw new Error('Failed to get EagleView token');
    }

    const data = await response.json();
    eagleviewToken = data.access_token;
    // Set expiry 5 minutes before actual expiry for safety
    eagleviewTokenExpiry = Date.now() + ((data.expires_in - 300) * 1000);

    console.log('[EagleView] Token obtained, expires in', data.expires_in, 'seconds');
    return eagleviewToken;
}

// ---------------------------------------------------------------------------
// EAGLEVIEW IMAGERY API
// ---------------------------------------------------------------------------

async function getEagleViewImagery(lat, lon, options = {}) {
    const token = await getEagleViewToken();
    
    const params = new URLSearchParams({
        lat: lat.toString(),
        lon: lon.toString(),
        zoom: options.zoom || '18',
        width: options.width || '800',
        height: options.height || '600',
        imagery_type: options.type || 'ortho' // ortho, oblique-north, oblique-south, etc.
    });

    const response = await fetch(`https://api.eagleview.com/imagery/v1/image?${params}`, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'image/jpeg'
        }
    });

    if (!response.ok) {
        const error = await response.text();
        console.error('[EagleView] Imagery error:', error);
        throw new Error('Failed to get EagleView imagery');
    }

    // Return as base64 for easy embedding
    const buffer = await response.buffer();
    return {
        success: true,
        image: buffer.toString('base64'),
        contentType: 'image/jpeg',
        lat,
        lon
    };
}

// ---------------------------------------------------------------------------
// EAGLEVIEW PROPERTY DATA API
// ---------------------------------------------------------------------------

async function getEagleViewPropertyData(address) {
    const token = await getEagleViewToken();

    const response = await fetch(`https://api.eagleview.com/property-data/v1/property?address=${encodeURIComponent(address)}`, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json'
        }
    });

    if (!response.ok) {
        const error = await response.text();
        console.error('[EagleView] Property data error:', error);
        return { success: false, error: 'Property not found' };
    }

    const data = await response.json();
    return {
        success: true,
        property: data
    };
}

// ---------------------------------------------------------------------------
// GOOGLE PLACES API
// ---------------------------------------------------------------------------

async function googlePlacesSearch(query, location = null) {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
        throw new Error('Google Places API key not configured');
    }

    let url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${apiKey}`;
    
    if (location) {
        url += `&location=${location.lat},${location.lng}&radius=1000`;
    }

    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        console.error('[Google Places] Error:', data.status);
        throw new Error(`Google Places error: ${data.status}`);
    }

    return {
        success: true,
        results: data.results || []
    };
}

async function googlePlaceDetails(placeId) {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
        throw new Error('Google Places API key not configured');
    }

    const fields = 'name,formatted_address,formatted_phone_number,website,opening_hours,photos,rating,reviews,types,geometry';
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&key=${apiKey}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 'OK') {
        return { success: false, error: data.status };
    }

    return {
        success: true,
        place: data.result
    };
}

async function googleGeocode(address) {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
        throw new Error('Google Places API key not configured');
    }

    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 'OK') {
        return { success: false, error: data.status };
    }

    const result = data.results[0];
    return {
        success: true,
        formatted_address: result.formatted_address,
        lat: result.geometry.location.lat,
        lng: result.geometry.location.lng,
        place_id: result.place_id,
        components: result.address_components
    };
}

// ---------------------------------------------------------------------------
// FULL PROPERTY ENRICHMENT (combines all sources)
// ---------------------------------------------------------------------------

async function enrichProperty(address) {
    const enrichment = {
        address: address,
        timestamp: new Date().toISOString(),
        sources: {},
        errors: []
    };

    // 1. Geocode the address
    try {
        const geo = await googleGeocode(address);
        if (geo.success) {
            enrichment.location = {
                lat: geo.lat,
                lng: geo.lng,
                formatted_address: geo.formatted_address,
                place_id: geo.place_id
            };
            enrichment.sources.geocode = true;
        }
    } catch (err) {
        enrichment.errors.push({ source: 'geocode', error: err.message });
    }

    // 2. Get nearby businesses (tenants)
    if (enrichment.location) {
        try {
            const places = await googlePlacesSearch(address, enrichment.location);
            enrichment.nearby_businesses = places.results.slice(0, 10).map(p => ({
                name: p.name,
                address: p.formatted_address,
                rating: p.rating,
                types: p.types,
                place_id: p.place_id
            }));
            enrichment.sources.places = true;
        } catch (err) {
            enrichment.errors.push({ source: 'places', error: err.message });
        }
    }

    // 3. Get EagleView aerial imagery
    if (enrichment.location && process.env.EAGLEVIEW_CLIENT_ID) {
        try {
            const imagery = await getEagleViewImagery(
                enrichment.location.lat,
                enrichment.location.lng,
                { zoom: '19', width: '1200', height: '800' }
            );
            if (imagery.success) {
                enrichment.aerial_image = imagery.image;
                enrichment.sources.eagleview_imagery = true;
            }
        } catch (err) {
            enrichment.errors.push({ source: 'eagleview_imagery', error: err.message });
        }
    }

    // 4. Get EagleView property data
    if (process.env.EAGLEVIEW_CLIENT_ID) {
        try {
            const propData = await getEagleViewPropertyData(address);
            if (propData.success) {
                enrichment.property_data = propData.property;
                enrichment.sources.eagleview_property = true;
            }
        } catch (err) {
            enrichment.errors.push({ source: 'eagleview_property', error: err.message });
        }
    }

    // 5. TODO: County PA parcel lookup
    // 6. TODO: ArcGIS demographics
    // 7. TODO: FDOT traffic counts

    return enrichment;
}

module.exports = {
    // EagleView
    getEagleViewToken,
    getEagleViewImagery,
    getEagleViewPropertyData,
    
    // Google Places
    googlePlacesSearch,
    googlePlaceDetails,
    googleGeocode,
    
    // Full enrichment
    enrichProperty
};
