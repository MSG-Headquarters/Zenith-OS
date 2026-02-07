/**
 * CRE Flyer Generator - CRM Dashboard Widget
 * 
 * This React component can be embedded in the Zenith CRM broker dashboard
 * to allow brokers to generate flyers from listing detail pages.
 * 
 * Integration:
 *   Import this component and render it on listing detail pages
 *   Pass the listing data as a prop
 */

import React, { useState } from 'react';

const FLYER_API_BASE = process.env.REACT_APP_FLYER_API || 'http://localhost:3006';

/**
 * FlyerGeneratorWidget
 * 
 * Props:
 *   listing: object - The listing data (from Zenith CRM)
 *   onGenerate: function(files) - Callback when flyers are generated
 *   compact: boolean - Render in compact mode (for sidebars)
 */
export function FlyerGeneratorWidget({ listing, onGenerate, compact = false }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [format, setFormat] = useState('html');
  const [pages, setPages] = useState([1, 2]);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(`${FLYER_API_BASE}/api/flyer-generator/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          listing,
          format,
          pages,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Generation failed');
      }

      setResult(data);
      
      if (onGenerate) {
        onGenerate(data.files);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const togglePage = (pageNum) => {
    if (pages.includes(pageNum)) {
      setPages(pages.filter(p => p !== pageNum));
    } else {
      setPages([...pages, pageNum].sort());
    }
  };

  // Compact mode for sidebar
  if (compact) {
    return (
      <div className="flyer-widget-compact">
        <button 
          onClick={handleGenerate}
          disabled={loading || pages.length === 0}
          className="btn btn-primary btn-sm w-100"
        >
          {loading ? 'Generating...' : '📄 Generate Flyer'}
        </button>
        {error && <small className="text-danger d-block mt-1">{error}</small>}
        {result && (
          <div className="mt-2">
            {result.files.map((file, i) => (
              <a 
                key={i}
                href={`${FLYER_API_BASE}${file.url}`}
                target="_blank"
                rel="noopener noreferrer"
                className="d-block small"
              >
                📄 Page {file.page} ({file.format.toUpperCase()})
              </a>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Full mode for listing detail pages
  return (
    <div className="flyer-widget card">
      <div className="card-header bg-success text-white">
        <h5 className="mb-0">
          <i className="bi bi-file-earmark-pdf me-2"></i>
          Generate Marketing Flyer
        </h5>
      </div>
      
      <div className="card-body">
        {/* Listing Preview */}
        <div className="listing-preview mb-3 p-3 bg-light rounded">
          <strong>{listing.propertyTypeCustom || listing.propertyType}</strong>
          <br />
          {listing.address?.street}, {listing.address?.city}, {listing.address?.state} {listing.address?.zip}
          <br />
          <small className="text-muted">
            {listing.transactionType === 'lease' 
              ? `$${listing.leaseRate?.toFixed(2)} PSF ${listing.leaseType}` 
              : `$${listing.salePrice?.toLocaleString()}`}
          </small>
        </div>

        {/* Options */}
        <div className="row mb-3">
          <div className="col-md-6">
            <label className="form-label">Format</label>
            <select 
              className="form-select"
              value={format}
              onChange={(e) => setFormat(e.target.value)}
            >
              <option value="html">HTML (Preview)</option>
              <option value="pdf">PDF (Download)</option>
              <option value="all">Both Formats</option>
            </select>
          </div>
          <div className="col-md-6">
            <label className="form-label">Pages</label>
            <div className="btn-group w-100">
              <button
                type="button"
                className={`btn ${pages.includes(1) ? 'btn-success' : 'btn-outline-secondary'}`}
                onClick={() => togglePage(1)}
              >
                Page 1
              </button>
              <button
                type="button"
                className={`btn ${pages.includes(2) ? 'btn-success' : 'btn-outline-secondary'}`}
                onClick={() => togglePage(2)}
              >
                Page 2
              </button>
            </div>
          </div>
        </div>

        {/* Generate Button */}
        <button
          className="btn btn-success btn-lg w-100"
          onClick={handleGenerate}
          disabled={loading || pages.length === 0}
        >
          {loading ? (
            <>
              <span className="spinner-border spinner-border-sm me-2"></span>
              Generating Flyer...
            </>
          ) : (
            <>Generate Flyer</>
          )}
        </button>

        {/* Error */}
        {error && (
          <div className="alert alert-danger mt-3 mb-0">
            <i className="bi bi-exclamation-triangle me-2"></i>
            {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="mt-3">
            <div className="alert alert-success">
              <i className="bi bi-check-circle me-2"></i>
              Flyer generated successfully!
            </div>
            
            <div className="list-group">
              {result.files.map((file, index) => (
                <a
                  key={index}
                  href={`${FLYER_API_BASE}${file.url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
                >
                  <span>
                    <i className={`bi ${file.format === 'pdf' ? 'bi-file-earmark-pdf' : 'bi-file-earmark-code'} me-2`}></i>
                    Page {file.page}
                  </span>
                  <span className="badge bg-secondary">{file.format.toUpperCase()}</span>
                </a>
              ))}
            </div>

            {result.pdfError && (
              <div className="alert alert-warning mt-3 mb-0">
                <i className="bi bi-exclamation-triangle me-2"></i>
                PDF generation failed: {result.pdfError}
                <br />
                <small>HTML files were generated successfully.</small>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * FlyerPreviewModal
 * 
 * Modal component to preview generated flyers in an iframe
 */
export function FlyerPreviewModal({ show, onClose, previewUrl, listing }) {
  if (!show) return null;

  return (
    <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog modal-xl modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">
              Flyer Preview: {listing?.address?.street}
            </h5>
            <button type="button" className="btn-close" onClick={onClose}></button>
          </div>
          <div className="modal-body p-0">
            <iframe
              src={previewUrl}
              style={{
                width: '100%',
                height: '80vh',
                border: 'none',
              }}
              title="Flyer Preview"
            />
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={onClose}>
              Close
            </button>
            <a 
              href={previewUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="btn btn-primary"
            >
              Open in New Tab
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * useFlyerGenerator Hook
 * 
 * React hook for programmatic flyer generation
 */
export function useFlyerGenerator() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const generate = async (listing, options = {}) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${FLYER_API_BASE}/api/flyer-generator/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listing,
          format: options.format || 'html',
          pages: options.pages || [1, 2],
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error);
      }

      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const preview = async (listing, page = 1) => {
    const response = await fetch(`${FLYER_API_BASE}/api/flyer-generator/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listing, page }),
    });

    return response.text();
  };

  return { generate, preview, loading, error };
}

export default FlyerGeneratorWidget;
