// ═══════════════════════════════════════════════════════════════════════
// CRE OS — LOI & LISTING AGREEMENT GENERATOR
// Produces professional .docx documents from CRM lead data
// Danimal Data LLC © 2026
// ═══════════════════════════════════════════════════════════════════════
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        AlignmentType, BorderStyle, WidthType, ShadingType,
        Header, Footer, PageNumber, PageBreak, LevelFormat, HeadingLevel, TabStopType } = require('docx');
const fs = require('fs');
const path = require('path');

class DocumentGenerator {
  constructor(config = {}) {
    this.config = {
      outputDir: config.outputDir || path.join(__dirname, 'output'),
      companyName: config.companyName || 'CRE Consultants',
      companyAddress: config.companyAddress || '1415 Hendry Street, Fort Myers, FL 33901',
      companyPhone: config.companyPhone || '(239) 489-3600',
      companyEmail: config.companyEmail || 'info@creconsultants.com',
      ...config
    };
    if (!fs.existsSync(this.config.outputDir)) {
      fs.mkdirSync(this.config.outputDir, { recursive: true });
    }
  }

  // ══════════════════════════════════════════════════════════════
  // LETTER OF INTENT (LOI) — Buyer submits to Seller
  // ══════════════════════════════════════════════════════════════
  async generateLOI(lead, broker = {}) {
    const today = new Date();
    const dateStr = today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const closingDate = new Date(today.getTime() + 45 * 24 * 60 * 60 * 1000);
    const closingDateStr = closingDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const dueDiligenceDays = 30;
    const inspectionDays = 15;
    const depositAmount = lead.value ? Math.round(parseFloat(lead.value) * 0.05) : 50000;

    const fullAddress = [lead.property_address, lead.property_city, lead.property_state, lead.property_zip].filter(Boolean).join(', ');
    const buyerName = lead.name || 'Buyer';
    const buyerCompany = lead.company || '';
    const sellerName = lead.notes && lead.notes.includes('Owner:') 
      ? lead.notes.split('Owner:')[1].split('\n')[0].trim() 
      : 'Property Owner';
    const purchasePrice = lead.value ? parseFloat(lead.value) : 0;
    const brokerName = broker.name || 'CRE Consultants';
    const brokerEmail = broker.email || this.config.companyEmail;

    const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
    const borders = { top: border, bottom: border, left: border, right: border };
    const cellMargins = { top: 60, bottom: 60, left: 100, right: 100 };

    const doc = new Document({
      styles: {
        default: { document: { run: { font: "Arial", size: 22 } } },
        paragraphStyles: [
          { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
            run: { size: 28, bold: true, font: "Arial", color: "1B3A5C" },
            paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 0 } },
          { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
            run: { size: 24, bold: true, font: "Arial", color: "1B3A5C" },
            paragraph: { spacing: { before: 160, after: 80 }, outlineLevel: 1 } },
        ]
      },
      numbering: {
        config: [{
          reference: "terms",
          levels: [{
            level: 0, format: LevelFormat.DECIMAL, text: "%1.",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } }
          }]
        }]
      },
      sections: [{
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
          }
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.LEFT,
                border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "1B6B3A", space: 4 } },
                spacing: { after: 200 },
                children: [
                  new TextRun({ text: this.config.companyName.toUpperCase(), bold: true, size: 20, font: "Arial", color: "1B3A5C" }),
                  new TextRun({ text: "    ", size: 20 }),
                  new TextRun({ text: "Commercial Real Estate", italics: true, size: 18, font: "Arial", color: "666666" }),
                ]
              })
            ]
          })
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                border: { top: { style: BorderStyle.SINGLE, size: 2, color: "CCCCCC", space: 4 } },
                children: [
                  new TextRun({ text: this.config.companyName + " | " + this.config.companyAddress, size: 14, color: "999999", font: "Arial" }),
                ]
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: "Page ", size: 14, color: "999999" }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 14, color: "999999" }),
                  new TextRun({ text: " of ", size: 14, color: "999999" }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 14, color: "999999" }),
                ]
              })
            ]
          })
        },
        children: [
          // ── TITLE ──
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 80 },
            children: [new TextRun({ text: "LETTER OF INTENT", bold: true, size: 36, font: "Arial", color: "1B3A5C" })]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 },
            children: [new TextRun({ text: "Non-Binding Expression of Interest", italics: true, size: 22, color: "666666" })]
          }),

          // ── DATE & PARTIES ──
          new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: dateStr, size: 22 })] }),
          new Paragraph({ spacing: { after: 200 }, children: [] }),

          // Parties table
          new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: [2200, 7160],
            rows: [
              this._tableRow("Buyer:", `${buyerName}${buyerCompany ? ' / ' + buyerCompany : ''}`, borders, cellMargins),
              this._tableRow("Seller:", sellerName, borders, cellMargins),
              this._tableRow("Property:", fullAddress, borders, cellMargins),
              this._tableRow("Property Type:", lead.property_type || 'Commercial', borders, cellMargins),
              ...(lead.property_sqft ? [this._tableRow("Building Size:", `${parseInt(lead.property_sqft).toLocaleString()} SF`, borders, cellMargins)] : []),
              this._tableRow("Date:", dateStr, borders, cellMargins),
            ]
          }),

          new Paragraph({ spacing: { before: 300, after: 200 }, children: [
            new TextRun({ text: "Dear " + sellerName + ",", size: 22 })
          ]}),

          new Paragraph({ spacing: { after: 200 }, children: [
            new TextRun({ text: "This Letter of Intent (\"LOI\") sets forth the principal terms upon which ", size: 22 }),
            new TextRun({ text: buyerName + (buyerCompany ? ', on behalf of ' + buyerCompany + ',' : ''), bold: true, size: 22 }),
            new TextRun({ text: " (\"Buyer\") is interested in acquiring the property located at ", size: 22 }),
            new TextRun({ text: fullAddress, bold: true, size: 22 }),
            new TextRun({ text: " (\"Property\"). This LOI is non-binding and is intended solely to facilitate negotiations between the parties.", size: 22 }),
          ]}),

          // ── TERMS ──
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Principal Terms")] }),

          // 1. Purchase Price
          new Paragraph({
            numbering: { reference: "terms", level: 0 },
            spacing: { after: 160 },
            children: [
              new TextRun({ text: "Purchase Price. ", bold: true, size: 22 }),
              new TextRun({ text: `The total purchase price for the Property shall be `, size: 22 }),
              new TextRun({ text: `$${purchasePrice.toLocaleString()}`, bold: true, size: 22 }),
              new TextRun({ text: ` (${this._numberToWords(purchasePrice)} Dollars)`, size: 22 }),
              ...(lead.price_per_sqft ? [
                new TextRun({ text: `, representing approximately $${parseFloat(lead.price_per_sqft).toFixed(2)} per square foot`, size: 22 })
              ] : []),
              new TextRun({ text: `, payable in cash or immediately available funds at closing, subject to customary prorations and adjustments.`, size: 22 }),
            ]
          }),

          // 2. Earnest Money Deposit
          new Paragraph({
            numbering: { reference: "terms", level: 0 },
            spacing: { after: 160 },
            children: [
              new TextRun({ text: "Earnest Money Deposit. ", bold: true, size: 22 }),
              new TextRun({ text: `Within five (5) business days of full execution of the Purchase and Sale Agreement (\"PSA\"), Buyer shall deposit `, size: 22 }),
              new TextRun({ text: `$${depositAmount.toLocaleString()}`, bold: true, size: 22 }),
              new TextRun({ text: ` as earnest money (\"Deposit\") with a mutually agreed upon title company or escrow agent. The Deposit shall be fully refundable during the Due Diligence Period and shall become non-refundable upon expiration of the Due Diligence Period, except as otherwise provided in the PSA.`, size: 22 }),
            ]
          }),

          // 3. Due Diligence Period
          new Paragraph({
            numbering: { reference: "terms", level: 0 },
            spacing: { after: 160 },
            children: [
              new TextRun({ text: "Due Diligence Period. ", bold: true, size: 22 }),
              new TextRun({ text: `Buyer shall have a period of `, size: 22 }),
              new TextRun({ text: `${dueDiligenceDays} days`, bold: true, size: 22 }),
              new TextRun({ text: ` from the Effective Date of the PSA (\"Due Diligence Period\") to conduct its investigation of the Property, including but not limited to review of all leases, contracts, financial records, environmental assessments, title, survey, zoning, and physical inspections. Buyer may terminate the PSA for any reason during the Due Diligence Period, in which case the Deposit shall be returned to Buyer.`, size: 22 }),
            ]
          }),

          // 4. Inspection Period
          new Paragraph({
            numbering: { reference: "terms", level: 0 },
            spacing: { after: 160 },
            children: [
              new TextRun({ text: "Inspection Period. ", bold: true, size: 22 }),
              new TextRun({ text: `Buyer shall have `, size: 22 }),
              new TextRun({ text: `${inspectionDays} days`, bold: true, size: 22 }),
              new TextRun({ text: ` from the Effective Date to complete all physical inspections of the Property, including structural, mechanical, environmental (Phase I and, if warranted, Phase II), and any other inspections deemed necessary by Buyer. Seller shall provide reasonable access to the Property during this period.`, size: 22 }),
            ]
          }),

          // 5. Closing Date
          new Paragraph({
            numbering: { reference: "terms", level: 0 },
            spacing: { after: 160 },
            children: [
              new TextRun({ text: "Closing Date. ", bold: true, size: 22 }),
              new TextRun({ text: `The closing shall occur on or before `, size: 22 }),
              new TextRun({ text: closingDateStr, bold: true, size: 22 }),
              new TextRun({ text: `, or such other date as mutually agreed upon by the parties. Closing shall take place at a location and with a title company mutually acceptable to both parties.`, size: 22 }),
            ]
          }),

          // 6. Title & Survey
          new Paragraph({
            numbering: { reference: "terms", level: 0 },
            spacing: { after: 160 },
            children: [
              new TextRun({ text: "Title and Survey. ", bold: true, size: 22 }),
              new TextRun({ text: `Seller shall deliver the Property with marketable and insurable fee simple title, free and clear of all liens, encumbrances, and exceptions, except for Permitted Exceptions as defined in the PSA. Buyer shall obtain, at Buyer's expense, a current ALTA survey and owner's title insurance policy.`, size: 22 }),
            ]
          }),

          // 7. Representations & Warranties
          new Paragraph({
            numbering: { reference: "terms", level: 0 },
            spacing: { after: 160 },
            children: [
              new TextRun({ text: "Representations and Warranties. ", bold: true, size: 22 }),
              new TextRun({ text: `The PSA shall contain customary representations and warranties by Seller, including but not limited to: (a) authority to sell the Property; (b) no pending or threatened litigation affecting the Property; (c) compliance with applicable laws and regulations; (d) accuracy of financial information provided; and (e) no undisclosed environmental conditions.`, size: 22 }),
            ]
          }),

          // 8. Conditions Precedent
          new Paragraph({
            numbering: { reference: "terms", level: 0 },
            spacing: { after: 160 },
            children: [
              new TextRun({ text: "Conditions Precedent to Closing. ", bold: true, size: 22 }),
              new TextRun({ text: `Buyer's obligation to close shall be conditioned upon: (a) satisfactory completion of due diligence; (b) Seller's representations and warranties being true and correct as of closing; (c) receipt of all required governmental approvals; and (d) no material adverse change in the condition of the Property between the Effective Date and closing.`, size: 22 }),
            ]
          }),

          // 9. Broker
          new Paragraph({
            numbering: { reference: "terms", level: 0 },
            spacing: { after: 160 },
            children: [
              new TextRun({ text: "Broker. ", bold: true, size: 22 }),
              new TextRun({ text: `${this.config.companyName} (\"Broker\") has represented Buyer in this transaction. Any brokerage commission shall be paid by Seller at closing pursuant to a separate agreement between Seller and Broker. Each party represents that it has not engaged any other broker or finder in connection with this transaction.`, size: 22 }),
            ]
          }),

          // 10. Confidentiality
          new Paragraph({
            numbering: { reference: "terms", level: 0 },
            spacing: { after: 160 },
            children: [
              new TextRun({ text: "Confidentiality. ", bold: true, size: 22 }),
              new TextRun({ text: `The terms and conditions of this LOI and any information exchanged between the parties shall be kept strictly confidential and shall not be disclosed to any third party without the prior written consent of the other party, except as required by law or to the parties' respective advisors, lenders, and consultants who agree to maintain confidentiality.`, size: 22 }),
            ]
          }),

          // 11. Non-Binding
          new Paragraph({
            numbering: { reference: "terms", level: 0 },
            spacing: { after: 200 },
            children: [
              new TextRun({ text: "Non-Binding Nature. ", bold: true, size: 22 }),
              new TextRun({ text: `This LOI is a non-binding expression of interest and does not constitute a binding agreement between the parties, except for the provisions regarding Confidentiality and Broker, which shall be binding. A binding obligation shall arise only upon execution and delivery of a mutually acceptable PSA.`, size: 22 }),
            ]
          }),

          // ── EXPIRATION ──
          new Paragraph({ spacing: { before: 100, after: 200 }, children: [
            new TextRun({ text: `This LOI shall expire if not accepted by Seller within `, size: 22 }),
            new TextRun({ text: `seven (7) business days`, bold: true, size: 22 }),
            new TextRun({ text: ` of the date hereof.`, size: 22 }),
          ]}),

          new Paragraph({ spacing: { after: 100 }, children: [
            new TextRun({ text: "We look forward to working with you on this transaction. Please do not hesitate to contact the undersigned with any questions.", size: 22 }),
          ]}),

          new Paragraph({ spacing: { before: 200, after: 80 }, children: [new TextRun({ text: "Respectfully submitted,", size: 22 })] }),

          // ── SIGNATURE BLOCKS ──
          new Paragraph({ spacing: { before: 400 }, children: [] }),

          // Buyer signature
          new Paragraph({ children: [new TextRun({ text: "________________________________________", size: 22, color: "999999" })] }),
          new Paragraph({ spacing: { after: 20 }, children: [
            new TextRun({ text: buyerName, bold: true, size: 22 }),
            ...(buyerCompany ? [new TextRun({ text: `, ${buyerCompany}`, size: 22 })] : [])
          ]}),
          new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: "Buyer", italics: true, size: 20, color: "666666" })] }),
          new Paragraph({ children: [new TextRun({ text: "Date: ________________________", size: 22, color: "666666" })] }),

          new Paragraph({ spacing: { before: 300 }, children: [] }),

          // Seller acceptance
          new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Accepted and Agreed")] }),
          new Paragraph({ spacing: { before: 300 }, children: [] }),
          new Paragraph({ children: [new TextRun({ text: "________________________________________", size: 22, color: "999999" })] }),
          new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: sellerName, bold: true, size: 22 })] }),
          new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: "Seller / Authorized Representative", italics: true, size: 20, color: "666666" })] }),
          new Paragraph({ children: [new TextRun({ text: "Date: ________________________", size: 22, color: "666666" })] }),

          new Paragraph({ spacing: { before: 300 }, children: [] }),

          // Broker acknowledgment
          new Paragraph({ children: [new TextRun({ text: "________________________________________", size: 22, color: "999999" })] }),
          new Paragraph({ spacing: { after: 20 }, children: [
            new TextRun({ text: brokerName, bold: true, size: 22 }),
            new TextRun({ text: `, ${this.config.companyName}`, size: 22 }),
          ]}),
          new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: "Licensed Real Estate Broker", italics: true, size: 20, color: "666666" })] }),
          new Paragraph({ children: [new TextRun({ text: `${this.config.companyPhone} | ${brokerEmail}`, size: 20, color: "666666" })] }),
        ]
      }]
    });

    const filename = `LOI-${this._slugify(lead.property_address || lead.company)}-${this._dateSlug()}.docx`;
    const outputPath = path.join(this.config.outputDir, filename);
    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(outputPath, buffer);
    console.log(`[DOC] LOI generated: ${filename} (${buffer.length} bytes)`);
    return { success: true, filename, path: outputPath, size: buffer.length, type: 'loi' };
  }

  // ══════════════════════════════════════════════════════════════
  // LISTING AGREEMENT — Seller engages Broker
  // ══════════════════════════════════════════════════════════════
  async generateListingAgreement(lead, broker = {}) {
    const today = new Date();
    const dateStr = today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const expirationDate = new Date(today.getTime() + 180 * 24 * 60 * 60 * 1000);
    const expirationStr = expirationDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const commissionRate = 6;

    const fullAddress = [lead.property_address, lead.property_city, lead.property_state, lead.property_zip].filter(Boolean).join(', ');
    const ownerName = lead.name || 'Property Owner';
    const ownerCompany = lead.company || '';
    const listPrice = lead.value ? parseFloat(lead.value) : 0;
    const brokerName = broker.name || 'CRE Consultants';

    const doc = new Document({
      styles: {
        default: { document: { run: { font: "Arial", size: 22 } } },
        paragraphStyles: [
          { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
            run: { size: 28, bold: true, font: "Arial", color: "1B3A5C" },
            paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 0 } },
          { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
            run: { size: 24, bold: true, font: "Arial", color: "1B3A5C" },
            paragraph: { spacing: { before: 180, after: 80 }, outlineLevel: 1 } },
        ]
      },
      numbering: {
        config: [{
          reference: "sections",
          levels: [{
            level: 0, format: LevelFormat.DECIMAL, text: "%1.",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } }
          }]
        }]
      },
      sections: [{
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
          }
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.LEFT,
                border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "1B6B3A", space: 4 } },
                spacing: { after: 200 },
                children: [
                  new TextRun({ text: this.config.companyName.toUpperCase(), bold: true, size: 20, font: "Arial", color: "1B3A5C" }),
                  new TextRun({ text: "    ", size: 20 }),
                  new TextRun({ text: "Exclusive Listing Agreement", italics: true, size: 18, font: "Arial", color: "666666" }),
                ]
              })
            ]
          })
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                border: { top: { style: BorderStyle.SINGLE, size: 2, color: "CCCCCC", space: 4 } },
                children: [
                  new TextRun({ text: this.config.companyName + " | " + this.config.companyAddress, size: 14, color: "999999", font: "Arial" }),
                ]
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: "Page ", size: 14, color: "999999" }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 14, color: "999999" }),
                  new TextRun({ text: " of ", size: 14, color: "999999" }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 14, color: "999999" }),
                ]
              })
            ]
          })
        },
        children: [
          // ── TITLE ──
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 80 },
            children: [new TextRun({ text: "EXCLUSIVE LISTING AGREEMENT", bold: true, size: 36, font: "Arial", color: "1B3A5C" })]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 },
            children: [new TextRun({ text: "Commercial Real Estate", italics: true, size: 22, color: "666666" })]
          }),

          // ── PREAMBLE ──
          new Paragraph({ spacing: { after: 200 }, children: [
            new TextRun({ text: `This Exclusive Listing Agreement (\"Agreement\") is entered into as of `, size: 22 }),
            new TextRun({ text: dateStr, bold: true, size: 22 }),
            new TextRun({ text: `, by and between:`, size: 22 }),
          ]}),

          new Paragraph({ spacing: { after: 100 }, children: [
            new TextRun({ text: "Owner: ", bold: true, size: 22 }),
            new TextRun({ text: `${ownerName}${ownerCompany ? ' / ' + ownerCompany : ''} (\"Owner\")`, size: 22 }),
          ]}),
          new Paragraph({ spacing: { after: 200 }, children: [
            new TextRun({ text: "Broker: ", bold: true, size: 22 }),
            new TextRun({ text: `${this.config.companyName}, a Florida licensed real estate brokerage (\"Broker\")`, size: 22 }),
          ]}),

          // ── SECTIONS ──

          // 1. Property
          new Paragraph({
            numbering: { reference: "sections", level: 0 },
            spacing: { after: 160 },
            children: [
              new TextRun({ text: "Property. ", bold: true, size: 22 }),
              new TextRun({ text: `Owner hereby grants Broker the exclusive right to market and sell the following property: `, size: 22 }),
              new TextRun({ text: fullAddress, bold: true, size: 22 }),
              ...(lead.property_type ? [new TextRun({ text: ` (${lead.property_type})`, size: 22 })] : []),
              ...(lead.property_sqft ? [new TextRun({ text: `, comprising approximately ${parseInt(lead.property_sqft).toLocaleString()} square feet`, size: 22 })] : []),
              new TextRun({ text: ` (\"Property\"), together with all improvements, fixtures, and appurtenances thereto.`, size: 22 }),
            ]
          }),

          // 2. Listing Price
          new Paragraph({
            numbering: { reference: "sections", level: 0 },
            spacing: { after: 160 },
            children: [
              new TextRun({ text: "Listing Price. ", bold: true, size: 22 }),
              new TextRun({ text: `The Property shall be listed at an initial asking price of `, size: 22 }),
              new TextRun({ text: `$${listPrice.toLocaleString()}`, bold: true, size: 22 }),
              ...(lead.price_per_sqft ? [
                new TextRun({ text: ` ($${parseFloat(lead.price_per_sqft).toFixed(2)} per SF)`, size: 22 })
              ] : []),
              new TextRun({ text: `. Owner acknowledges that the listing price may be adjusted from time to time upon mutual written agreement of the parties.`, size: 22 }),
            ]
          }),

          // 3. Term
          new Paragraph({
            numbering: { reference: "sections", level: 0 },
            spacing: { after: 160 },
            children: [
              new TextRun({ text: "Term. ", bold: true, size: 22 }),
              new TextRun({ text: `This Agreement shall commence on the date first written above and shall continue for a period of `, size: 22 }),
              new TextRun({ text: `one hundred eighty (180) days`, bold: true, size: 22 }),
              new TextRun({ text: `, expiring on `, size: 22 }),
              new TextRun({ text: expirationStr, bold: true, size: 22 }),
              new TextRun({ text: `, unless earlier terminated or extended by mutual written agreement.`, size: 22 }),
            ]
          }),

          // 4. Commission
          new Paragraph({
            numbering: { reference: "sections", level: 0 },
            spacing: { after: 160 },
            children: [
              new TextRun({ text: "Commission. ", bold: true, size: 22 }),
              new TextRun({ text: `Owner agrees to pay Broker a commission equal to `, size: 22 }),
              new TextRun({ text: `${commissionRate}%`, bold: true, size: 22 }),
              new TextRun({ text: ` of the gross sale price at closing. If a cooperating broker is involved, the commission shall be split as follows: ${commissionRate / 2}% to Broker and ${commissionRate / 2}% to the cooperating broker. The commission shall be earned upon the earlier of: (a) closing of the sale; (b) Owner's default or refusal to close; or (c) Owner entering into a transaction during the Protection Period with a party introduced by Broker.`, size: 22 }),
            ]
          }),

          // 5. Broker Duties
          new Paragraph({
            numbering: { reference: "sections", level: 0 },
            spacing: { after: 160 },
            children: [
              new TextRun({ text: "Broker's Duties. ", bold: true, size: 22 }),
              new TextRun({ text: `Broker shall use commercially reasonable efforts to market the Property, including: (a) preparation of marketing materials and property information packages; (b) listing on appropriate commercial real estate databases and platforms; (c) targeted outreach to qualified prospects; (d) coordination of property showings and inspections; (e) negotiation of offers on behalf of Owner; and (f) assistance with due diligence and closing processes.`, size: 22 }),
            ]
          }),

          // 6. Owner Duties
          new Paragraph({
            numbering: { reference: "sections", level: 0 },
            spacing: { after: 160 },
            children: [
              new TextRun({ text: "Owner's Obligations. ", bold: true, size: 22 }),
              new TextRun({ text: `Owner shall: (a) cooperate with Broker in marketing the Property; (b) provide Broker with all relevant property information, including leases, financial statements, surveys, and environmental reports; (c) make the Property available for showings with reasonable notice; (d) refer all inquiries regarding the Property to Broker; and (e) not list the Property with any other broker during the term of this Agreement.`, size: 22 }),
            ]
          }),

          // 7. Protection Period
          new Paragraph({
            numbering: { reference: "sections", level: 0 },
            spacing: { after: 160 },
            children: [
              new TextRun({ text: "Protection Period. ", bold: true, size: 22 }),
              new TextRun({ text: `For a period of one hundred eighty (180) days following the expiration or termination of this Agreement (\"Protection Period\"), Owner shall pay Broker the commission set forth herein if the Property is sold to or contracted with any party who was introduced to the Property by Broker during the term of this Agreement, provided Broker delivers to Owner within ten (10) days of expiration a written list of all such parties.`, size: 22 }),
            ]
          }),

          // 8. Governing Law
          new Paragraph({
            numbering: { reference: "sections", level: 0 },
            spacing: { after: 200 },
            children: [
              new TextRun({ text: "Governing Law. ", bold: true, size: 22 }),
              new TextRun({ text: `This Agreement shall be governed by and construed in accordance with the laws of the State of Florida. Any disputes arising hereunder shall be resolved in the courts of Lee County, Florida.`, size: 22 }),
            ]
          }),

          // ── SIGNATURES ──
          new Paragraph({ spacing: { before: 300, after: 100 }, children: [
            new TextRun({ text: "IN WITNESS WHEREOF, the parties have executed this Agreement as of the date first written above.", size: 22 }),
          ]}),

          new Paragraph({ spacing: { before: 400 }, children: [] }),

          // Owner signature
          new Paragraph({ children: [new TextRun({ text: "________________________________________", size: 22, color: "999999" })] }),
          new Paragraph({ spacing: { after: 20 }, children: [
            new TextRun({ text: ownerName, bold: true, size: 22 }),
            ...(ownerCompany ? [new TextRun({ text: `, ${ownerCompany}`, size: 22 })] : [])
          ]}),
          new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: "Owner", italics: true, size: 20, color: "666666" })] }),
          new Paragraph({ children: [new TextRun({ text: "Date: ________________________", size: 22, color: "666666" })] }),

          new Paragraph({ spacing: { before: 300 }, children: [] }),

          // Broker signature
          new Paragraph({ children: [new TextRun({ text: "________________________________________", size: 22, color: "999999" })] }),
          new Paragraph({ spacing: { after: 20 }, children: [
            new TextRun({ text: brokerName, bold: true, size: 22 }),
            new TextRun({ text: `, ${this.config.companyName}`, size: 22 }),
          ]}),
          new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: "Licensed Real Estate Broker", italics: true, size: 20, color: "666666" })] }),
          new Paragraph({ children: [new TextRun({ text: `License #: ________________________`, size: 22, color: "666666" })] }),
          new Paragraph({ children: [new TextRun({ text: "Date: ________________________", size: 22, color: "666666" })] }),
        ]
      }]
    });

    const filename = `Listing-Agreement-${this._slugify(lead.property_address || lead.company)}-${this._dateSlug()}.docx`;
    const outputPath = path.join(this.config.outputDir, filename);
    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(outputPath, buffer);
    console.log(`[DOC] Listing Agreement generated: ${filename} (${buffer.length} bytes)`);
    return { success: true, filename, path: outputPath, size: buffer.length, type: 'listing_agreement' };
  }

  // ── HELPERS ──
  _tableRow(label, value, borders, cellMargins) {
    return new TableRow({
      children: [
        new TableCell({
          borders, margins: cellMargins,
          width: { size: 2200, type: WidthType.DXA },
          shading: { fill: "F0F5F8", type: ShadingType.CLEAR },
          children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 20, color: "1B3A5C" })] })]
        }),
        new TableCell({
          borders, margins: cellMargins,
          width: { size: 7160, type: WidthType.DXA },
          children: [new Paragraph({ children: [new TextRun({ text: value || 'TBD', size: 20 })] })]
        })
      ]
    });
  }

  _numberToWords(num) {
    if (num === 0) return 'Zero';
    const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten',
      'Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
    const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
    if (num >= 1000000000) return Math.floor(num/1000000000) + ' Billion';
    if (num >= 1000000) {
      const m = Math.floor(num / 1000000);
      const remainder = num % 1000000;
      return (m < 20 ? ones[m] : tens[Math.floor(m/10)] + (m%10 ? ' ' + ones[m%10] : '')) +
        ' Million' + (remainder > 0 ? ' ' + this._numberToWords(remainder) : '');
    }
    if (num >= 1000) {
      const t = Math.floor(num / 1000);
      const remainder = num % 1000;
      return (t < 20 ? ones[t] : tens[Math.floor(t/10)] + (t%10 ? ' ' + ones[t%10] : '')) +
        ' Thousand' + (remainder > 0 ? ' ' + this._numberToWords(remainder) : '');
    }
    if (num >= 100) {
      return ones[Math.floor(num/100)] + ' Hundred' + (num%100 ? ' ' + this._numberToWords(num%100) : '');
    }
    if (num >= 20) return tens[Math.floor(num/10)] + (num%10 ? ' ' + ones[num%10] : '');
    return ones[num];
  }

  _slugify(str) {
    if (!str) return 'property';
    return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').substring(0, 40);
  }

  _dateSlug() {
    return new Date().toISOString().split('T')[0];
  }
}

module.exports = DocumentGenerator;
