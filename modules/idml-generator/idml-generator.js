// ═══════════════════════════════════════════════════════════════════════
// CRE OS — IDML GENERATOR SERVICE
// Produces InDesign Markup Language (.idml) files from CRM listing data
// Danimal Data LLC © 2026
// ═══════════════════════════════════════════════════════════════════════
const archiver = require('archiver');
const path = require('path');
const fs = require('fs');

class IDMLGenerator {
  constructor(config = {}) {
    this.config = {
      outputDir: config.outputDir || path.join(__dirname, 'output'),
      ...config
    };
    // Ensure output directory exists
    if (!fs.existsSync(this.config.outputDir)) {
      fs.mkdirSync(this.config.outputDir, { recursive: true });
    }
  }

  // ── MAIN GENERATION METHOD ────────────────────────────────────────
  async generate(lead, photos = [], broker = {}) {
    const listing = this._normalizeLead(lead, broker);
    const filename = this._generateFilename(listing);
    const outputPath = path.join(this.config.outputDir, filename);

    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(outputPath);
      // IDML is a ZIP with no compression for mimetype, deflate for rest
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => {
        console.log(`[IDML] Generated: ${filename} (${archive.pointer()} bytes)`);
        resolve({
          success: true,
          filename,
          path: outputPath,
          size: archive.pointer()
        });
      });

      archive.on('error', (err) => reject(err));
      archive.pipe(output);

      // ── IDML PACKAGE STRUCTURE ──
      // 1. mimetype (must be first, uncompressed)
      archive.append('application/vnd.adobe.indesign-idml-package+xml', {
        name: 'mimetype',
        store: true // no compression
      });

      // 2. META-INF/container.xml
      archive.append(this._containerXml(), { name: 'META-INF/container.xml' });

      // 3. designmap.xml (master document descriptor)
      archive.append(this._designmapXml(), { name: 'designmap.xml' });

      // 4. Resources
      archive.append(this._fontsXml(), { name: 'Resources/Fonts.xml' });
      archive.append(this._stylesXml(listing), { name: 'Resources/Styles.xml' });
      archive.append(this._graphicXml(), { name: 'Resources/Graphic.xml' });
      archive.append(this._preferencesXml(), { name: 'Resources/Preferences.xml' });

      // 5. MasterSpread
      archive.append(this._masterSpreadXml(), { name: 'MasterSpreads/MasterSpread_udd.xml' });

      // 6. Spreads (pages)
      archive.append(this._spread1Xml(listing, photos), { name: 'Spreads/Spread_u13d.xml' });
      archive.append(this._spread2Xml(listing, photos), { name: 'Spreads/Spread_u14d.xml' });

      // 7. Stories (text content)
      const stories = this._generateStories(listing, photos);
      stories.forEach(story => {
        archive.append(story.xml, { name: `Stories/Story_${story.id}.xml` });
      });

      // 8. XML/BackingStory.xml
      archive.append(this._backingStoryXml(), { name: 'XML/BackingStory.xml' });
      archive.append(this._tagsXml(), { name: 'XML/Tags.xml' });
      archive.append(this._mappingXml(), { name: 'XML/Mapping.xml' });

      // 9. Add photos if provided
      if (photos.length > 0) {
        photos.forEach((photo, i) => {
          if (fs.existsSync(photo)) {
            archive.file(photo, { name: `Resources/Images/photo_${i + 1}${path.extname(photo)}` });
          }
        });
      }

      archive.finalize();
    });
  }

  // ── NORMALIZE CRM LEAD DATA ───────────────────────────────────────
  _normalizeLead(lead, broker = {}) {
    const address = lead.property_address || '123 Main Street';
    const city = lead.property_city || 'Fort Myers';
    const state = lead.property_state || 'FL';
    const zip = lead.property_zip || '33901';
    const value = parseFloat(lead.value) || 0;

    return {
      // Property info
      propertyName: lead.company || lead.name || 'Commercial Property',
      address: address,
      cityStateZip: `${city}, ${state} ${zip}`,
      city, state, zip,
      propertyType: lead.property_type || 'Commercial',
      sqft: lead.property_sqft ? lead.property_sqft.toLocaleString() : 'TBD',
      sqftRaw: lead.property_sqft || 0,

      // Transaction
      transactionType: lead.stage === 'Closed Won' ? 'FOR SALE' : 'FOR LEASE',
      price: value > 0 ? this._formatPrice(value) : 'Contact for Pricing',
      pricePerSqft: (value > 0 && lead.property_sqft > 0)
        ? '$' + (value / lead.property_sqft).toFixed(2) + '/SF'
        : '',

      // Contact
      brokerName: broker.name || 'CRE Consultants',
      brokerTitle: broker.title || 'Commercial Real Estate Advisor',
      brokerPhone: broker.phone || '(239) 489-3600',
      brokerEmail: broker.email || 'info@creconsultants.com',
      companyName: 'CRE Consultants',
      companyTagline: 'Southwest Florida Commercial Real Estate',

      // Metadata
      source: lead.source || '',
      notes: lead.notes || '',
      tags: lead.tags || [],
      lat: lead.property_lat,
      lng: lead.property_lng,
    };
  }

  _formatPrice(value) {
    if (value >= 1000000) return '$' + (value / 1000000).toFixed(2) + 'M';
    if (value >= 1000) return '$' + (value / 1000).toFixed(0) + 'K';
    return '$' + value.toLocaleString();
  }

  _generateFilename(listing) {
    const slug = listing.address.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const date = new Date().toISOString().split('T')[0];
    return `CRE-Flyer-${slug}-${date}.idml`;
  }

  // ── XML GENERATORS ────────────────────────────────────────────────

  _containerXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="designmap.xml"/>
  </rootfiles>
</container>`;
  }

  _designmapXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Document xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging"
  DOMVersion="18.0" Self="d"
  StoryList="u1001 u1002 u1003 u1004 u1005 u1006 u1007 u1008 u1009 u1010 u1011"
  Name="CRE-Flyer"
  DocumentPageCount="2"
  ActiveProcess="Nothing">
  <idPkg:Graphic src="Resources/Graphic.xml"/>
  <idPkg:Fonts src="Resources/Fonts.xml"/>
  <idPkg:Styles src="Resources/Styles.xml"/>
  <idPkg:Preferences src="Resources/Preferences.xml"/>
  <idPkg:Tags src="XML/Tags.xml"/>
  <idPkg:MasterSpread src="MasterSpreads/MasterSpread_udd.xml"/>
  <idPkg:Spread src="Spreads/Spread_u13d.xml"/>
  <idPkg:Spread src="Spreads/Spread_u14d.xml"/>
  <idPkg:BackingStory src="XML/BackingStory.xml"/>
  <idPkg:Story src="Stories/Story_u1001.xml"/>
  <idPkg:Story src="Stories/Story_u1002.xml"/>
  <idPkg:Story src="Stories/Story_u1003.xml"/>
  <idPkg:Story src="Stories/Story_u1004.xml"/>
  <idPkg:Story src="Stories/Story_u1005.xml"/>
  <idPkg:Story src="Stories/Story_u1006.xml"/>
  <idPkg:Story src="Stories/Story_u1007.xml"/>
  <idPkg:Story src="Stories/Story_u1008.xml"/>
  <idPkg:Story src="Stories/Story_u1009.xml"/>
  <idPkg:Story src="Stories/Story_u1010.xml"/>
  <idPkg:Story src="Stories/Story_u1011.xml"/>
  <Language Self="Language/$ID/English%3a USA" Name="$ID/English: USA" SingleQuotes="&#x2018;&#x2019;" DoubleQuotes="&#x201c;&#x201d;"
    Id="269" HyphenationVendor="Hunspell" SpellingVendor="Hunspell"/>
  <Section Self="ueb" Length="2" Name="" PageNumberStyle="Arabic"
    ContinueNumbering="true" IncludeSectionPrefix="false"
    Marker="" PageStart="1" SectionPrefix="" Pagination="NextPage"
    AlternateLayoutLength="0" AlternateLayout=""/>
</Document>`;
  }

  _fontsXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<idPkg:Fonts xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="18.0">
  <FontFamily Self="di2d0" Name="Arial">
    <Font Self="di2d0Font0" FontFamily="Arial" Name="Regular" PostScriptName="ArialMT" Status="Installed" FontStyleName="Regular" FontType="TrueType" WritingScript="0"/>
    <Font Self="di2d0Font1" FontFamily="Arial" Name="Bold" PostScriptName="Arial-BoldMT" Status="Installed" FontStyleName="Bold" FontType="TrueType" WritingScript="0"/>
    <Font Self="di2d0Font2" FontFamily="Arial" Name="Italic" PostScriptName="Arial-ItalicMT" Status="Installed" FontStyleName="Italic" FontType="TrueType" WritingScript="0"/>
  </FontFamily>
  <FontFamily Self="di2d1" Name="Arial Narrow">
    <Font Self="di2d1Font0" FontFamily="Arial Narrow" Name="Regular" PostScriptName="ArialNarrow" Status="Installed" FontStyleName="Regular" FontType="TrueType" WritingScript="0"/>
    <Font Self="di2d1Font1" FontFamily="Arial Narrow" Name="Bold" PostScriptName="ArialNarrow-Bold" Status="Installed" FontStyleName="Bold" FontType="TrueType" WritingScript="0"/>
  </FontFamily>
  <FontFamily Self="di2d2" Name="Georgia">
    <Font Self="di2d2Font0" FontFamily="Georgia" Name="Regular" PostScriptName="Georgia" Status="Installed" FontStyleName="Regular" FontType="TrueType" WritingScript="0"/>
    <Font Self="di2d2Font1" FontFamily="Georgia" Name="Bold" PostScriptName="Georgia-Bold" Status="Installed" FontStyleName="Bold" FontType="TrueType" WritingScript="0"/>
  </FontFamily>
</idPkg:Fonts>`;
  }

  _stylesXml(listing) {
    // Brand colors
    const emerald = 'COLOR_EMERALD';
    const darkNavy = 'COLOR_NAVY';
    const white = 'COLOR_WHITE';

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<idPkg:Styles xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="18.0">
  <RootParagraphStyleGroup Self="u8f">
    <ParagraphStyle Self="ParagraphStyle/$ID/[No paragraph style]" Name="$ID/[No paragraph style]"
      Imported="false" NextStyle="ParagraphStyle/$ID/[No paragraph style]"
      AppliedFont="Arial" PointSize="10" FillColor="Color/Black"/>

    <ParagraphStyle Self="ParagraphStyle/Header" Name="Header"
      AppliedFont="Arial" FontStyle="Bold" PointSize="42" Leading="44"
      FillColor="Color/White" Justification="LeftAlign"
      SpaceBefore="0" SpaceAfter="6"
      Tracking="-10"/>

    <ParagraphStyle Self="ParagraphStyle/Subheader" Name="Subheader"
      AppliedFont="Arial" FontStyle="Bold" PointSize="14" Leading="18"
      FillColor="Color/White" Justification="LeftAlign"
      SpaceBefore="0" SpaceAfter="4"
      Tracking="60" Capitalization="AllCaps"/>

    <ParagraphStyle Self="ParagraphStyle/TransactionType" Name="TransactionType"
      AppliedFont="Arial" FontStyle="Bold" PointSize="11" Leading="14"
      FillColor="Color/Emerald" Justification="LeftAlign"
      Tracking="120" Capitalization="AllCaps"/>

    <ParagraphStyle Self="ParagraphStyle/Price" Name="Price"
      AppliedFont="Arial" FontStyle="Bold" PointSize="28" Leading="32"
      FillColor="Color/Navy" Justification="LeftAlign"
      SpaceBefore="4" SpaceAfter="2"/>

    <ParagraphStyle Self="ParagraphStyle/Body" Name="Body"
      AppliedFont="Arial" FontStyle="Regular" PointSize="9.5" Leading="14"
      FillColor="Color/Black" Justification="LeftAlign"
      SpaceBefore="0" SpaceAfter="6"/>

    <ParagraphStyle Self="ParagraphStyle/SectionTitle" Name="SectionTitle"
      AppliedFont="Arial" FontStyle="Bold" PointSize="11" Leading="14"
      FillColor="Color/Navy" Justification="LeftAlign"
      Tracking="80" Capitalization="AllCaps"
      SpaceBefore="12" SpaceAfter="6"/>

    <ParagraphStyle Self="ParagraphStyle/DetailLabel" Name="DetailLabel"
      AppliedFont="Arial Narrow" FontStyle="Bold" PointSize="8" Leading="12"
      FillColor="Color/DarkGray" Justification="LeftAlign"
      Tracking="60" Capitalization="AllCaps"/>

    <ParagraphStyle Self="ParagraphStyle/DetailValue" Name="DetailValue"
      AppliedFont="Arial" FontStyle="Regular" PointSize="10" Leading="14"
      FillColor="Color/Black" Justification="LeftAlign"/>

    <ParagraphStyle Self="ParagraphStyle/BrokerName" Name="BrokerName"
      AppliedFont="Arial" FontStyle="Bold" PointSize="10" Leading="14"
      FillColor="Color/Navy" Justification="LeftAlign"/>

    <ParagraphStyle Self="ParagraphStyle/BrokerInfo" Name="BrokerInfo"
      AppliedFont="Arial" FontStyle="Regular" PointSize="8.5" Leading="12"
      FillColor="Color/DarkGray" Justification="LeftAlign"/>

    <ParagraphStyle Self="ParagraphStyle/Footer" Name="Footer"
      AppliedFont="Arial Narrow" FontStyle="Regular" PointSize="7" Leading="10"
      FillColor="Color/MidGray" Justification="CenterAlign"/>

    <ParagraphStyle Self="ParagraphStyle/Highlight" Name="Highlight"
      AppliedFont="Arial" FontStyle="Regular" PointSize="9" Leading="14"
      FillColor="Color/Black" Justification="LeftAlign"
      SpaceBefore="2" SpaceAfter="2"
      BulletsAndNumberingListType="BulletList"
      BulletChar_BulletCharacterType="UnicodeWithFont" BulletChar_BulletCharacterValue="8226"/>

  </RootParagraphStyleGroup>

  <RootCharacterStyleGroup Self="u8e">
    <CharacterStyle Self="CharacterStyle/$ID/[No character style]" Name="$ID/[No character style]"/>
    <CharacterStyle Self="CharacterStyle/Bold" Name="Bold" FontStyle="Bold"/>
    <CharacterStyle Self="CharacterStyle/Emerald" Name="Emerald" FillColor="Color/Emerald"/>
    <CharacterStyle Self="CharacterStyle/White" Name="White" FillColor="Color/White"/>
  </RootCharacterStyleGroup>

  <RootObjectStyleGroup Self="u8d">
    <ObjectStyle Self="ObjectStyle/$ID/[None]" Name="$ID/[None]"/>
    <ObjectStyle Self="ObjectStyle/$ID/[Normal Graphics Frame]" Name="$ID/[Normal Graphics Frame]"
      AppliedParagraphStyle="ParagraphStyle/$ID/[No paragraph style]"/>
    <ObjectStyle Self="ObjectStyle/$ID/[Normal Text Frame]" Name="$ID/[Normal Text Frame]"
      AppliedParagraphStyle="ParagraphStyle/$ID/[No paragraph style]"/>
  </RootObjectStyleGroup>

  <RootTableStyleGroup Self="u8c">
    <TableStyle Self="TableStyle/$ID/[No table style]" Name="$ID/[No table style]"/>
  </RootTableStyleGroup>
  <RootCellStyleGroup Self="u8b">
    <CellStyle Self="CellStyle/$ID/[None]" Name="$ID/[None]"/>
  </RootCellStyleGroup>

  <TrapPreset Self="TrapPreset/$ID/[No Trap Preset]" Name="$ID/[No Trap Preset]"/>
</idPkg:Styles>`;
  }

  _graphicXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<idPkg:Graphic xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="18.0">
  <Color Self="Color/Black" Model="Process" Space="CMYK" ColorValue="0 0 0 100" Name="Black"/>
  <Color Self="Color/White" Model="Process" Space="CMYK" ColorValue="0 0 0 0" Name="White"/>
  <Color Self="Color/Emerald" Model="Process" Space="CMYK" ColorValue="70 0 55 0" Name="Emerald"/>
  <Color Self="Color/Navy" Model="Process" Space="CMYK" ColorValue="90 70 20 10" Name="Navy"/>
  <Color Self="Color/LightGray" Model="Process" Space="CMYK" ColorValue="0 0 0 8" Name="LightGray"/>
  <Color Self="Color/MidGray" Model="Process" Space="CMYK" ColorValue="0 0 0 45" Name="MidGray"/>
  <Color Self="Color/DarkGray" Model="Process" Space="CMYK" ColorValue="0 0 0 70" Name="DarkGray"/>
  <Color Self="Color/EmeraldLight" Model="Process" Space="CMYK" ColorValue="20 0 15 0" Name="EmeraldLight"/>
  <Color Self="Color/None" Model="Process" Space="CMYK" ColorValue="0 0 0 0" Name="None"/>
  <Ink Self="Ink/$ID/Process Cyan" Name="$ID/Process Cyan" IsProcessInk="true"/>
  <Ink Self="Ink/$ID/Process Magenta" Name="$ID/Process Magenta" IsProcessInk="true"/>
  <Ink Self="Ink/$ID/Process Yellow" Name="$ID/Process Yellow" IsProcessInk="true"/>
  <Ink Self="Ink/$ID/Process Black" Name="$ID/Process Black" IsProcessInk="true"/>
  <Swatch Self="Swatch/None" Name="None" ColorValue="0 0 0 0" SpotColorType="SpotColorNone"/>
</idPkg:Graphic>`;
  }

  _preferencesXml() {
    // US Letter: 612pt × 792pt (8.5" × 11")
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<idPkg:Preferences xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="18.0">
  <DocumentPreference Self="DocumentPreference" PageHeight="792" PageWidth="612"
    PagesPerDocument="2" FacingPages="false" DocumentBleedTopOffset="9"
    DocumentBleedBottomOffset="9" DocumentBleedInsideOrLeftOffset="9"
    DocumentBleedOutsideOrRightOffset="9" ColumnGuideColor="InCopyGoldenrod"
    PageBinding="LeftToRight" AllowPageShuffle="true"/>
  <MarginPreference Self="MarginPreference" ColumnCount="1" ColumnGutter="12"
    Top="36" Bottom="36" Left="36" Right="36" ColumnDirection="Horizontal"/>
  <TextDefault Self="TextDefault" AppliedFont="Arial" PointSize="10"
    Leading="12" AppliedLanguage="$ID/English: USA"
    AppliedParagraphStyle="ParagraphStyle/$ID/[No paragraph style]"
    AppliedCharacterStyle="CharacterStyle/$ID/[No character style]"/>
</idPkg:Preferences>`;
  }

  _masterSpreadXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<idPkg:MasterSpread xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="18.0">
  <MasterSpread Self="udd" Name="A-Master" NamePrefix="A" BaseName="Master"
    ShowMasterItems="true" PageCount="1" ItemTransform="1 0 0 1 0 0">
    <Page Self="uddp0" Name="A" AppliedMaster="n"
      GeometricBounds="0 0 792 612" ItemTransform="1 0 0 1 0 0"
      MasterPageTransform="1 0 0 1 0 0">
      <MarginPreference ColumnCount="1" ColumnGutter="12"
        Top="36" Bottom="36" Left="36" Right="36"/>
    </Page>
  </MasterSpread>
</idPkg:MasterSpread>`;
  }

  // ── PAGE 1: HERO SPREAD ───────────────────────────────────────────
  // Layout: Full-bleed hero image top half, property details bottom half
  _spread1Xml(listing, photos) {
    const hasPhoto = photos.length > 0;

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<idPkg:Spread xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="18.0">
  <Spread Self="u13d" PageCount="1" BindingLocation="0"
    ShowMasterItems="true" ItemTransform="1 0 0 1 0 0"
    FlattenerOverride="Default" PageTransitionType="None">
    <Page Self="u13dp0" Name="1" AppliedMaster="udd"
      GeometricBounds="0 0 792 612" ItemTransform="1 0 0 1 0 0"
      MasterPageTransform="1 0 0 1 0 0">
      <MarginPreference ColumnCount="1" ColumnGutter="12"
        Top="36" Bottom="36" Left="36" Right="36"/>
    </Page>

    <!-- ═══ HERO IMAGE AREA (top 55% of page) ═══ -->
    <Rectangle Self="u200" ItemTransform="1 0 0 1 0 0"
      StrokeWeight="0" StrokeColor="Color/None">
      <Properties>
        <PathGeometry>
          <GeometryPathType PathOpen="false">
            <PathPointArray>
              <PathPointType Anchor="0 0" LeftDirection="0 0" RightDirection="0 0"/>
              <PathPointType Anchor="0 612" LeftDirection="0 612" RightDirection="0 612"/>
              <PathPointType Anchor="435 612" LeftDirection="435 612" RightDirection="435 612"/>
              <PathPointType Anchor="435 0" LeftDirection="435 0" RightDirection="435 0"/>
            </PathPointArray>
          </GeometryPathType>
        </PathGeometry>
      </Properties>
      ${hasPhoto ? `<Image Self="u200img" ItemTransform="1 0 0 1 0 0">
        <Link Self="u200lnk" LinkResourceURI="Resources/Images/photo_1${path.extname(photos[0])}"/>
      </Image>` : `<FrameFittingOption AutoFit="true"/>` }
    </Rectangle>

    <!-- ═══ DARK OVERLAY BAND (gradient effect zone) ═══ -->
    <Rectangle Self="u201" ItemTransform="1 0 0 1 0 0"
      FillColor="Color/Navy" FillTint="85" StrokeWeight="0" StrokeColor="Color/None">
      <Properties>
        <PathGeometry>
          <GeometryPathType PathOpen="false">
            <PathPointArray>
              <PathPointType Anchor="340 0" LeftDirection="340 0" RightDirection="340 0"/>
              <PathPointType Anchor="340 612" LeftDirection="340 612" RightDirection="340 612"/>
              <PathPointType Anchor="435 612" LeftDirection="435 612" RightDirection="435 612"/>
              <PathPointType Anchor="435 0" LeftDirection="435 0" RightDirection="435 0"/>
            </PathPointArray>
          </GeometryPathType>
        </PathGeometry>
      </Properties>
    </Rectangle>

    <!-- ═══ TRANSACTION TYPE LABEL (FOR SALE / FOR LEASE) ═══ -->
    <TextFrame Self="u210" ParentStory="u1001"
      ItemTransform="1 0 0 1 36 350"
      ContentType="TextType">
      <Properties>
        <PathGeometry>
          <GeometryPathType PathOpen="false">
            <PathPointArray>
              <PathPointType Anchor="0 0" LeftDirection="0 0" RightDirection="0 0"/>
              <PathPointType Anchor="0 200" LeftDirection="0 200" RightDirection="0 200"/>
              <PathPointType Anchor="16 200" LeftDirection="16 200" RightDirection="16 200"/>
              <PathPointType Anchor="16 0" LeftDirection="16 0" RightDirection="16 0"/>
            </PathPointArray>
          </GeometryPathType>
        </PathGeometry>
      </Properties>
      <TextFramePreference AutoSizingType="HeightOnly" AutoSizingReferencePoint="TopLeftPoint"/>
    </TextFrame>

    <!-- ═══ PROPERTY NAME / HEADLINE ═══ -->
    <TextFrame Self="u211" ParentStory="u1002"
      ItemTransform="1 0 0 1 36 368"
      ContentType="TextType">
      <Properties>
        <PathGeometry>
          <GeometryPathType PathOpen="false">
            <PathPointArray>
              <PathPointType Anchor="0 0" LeftDirection="0 0" RightDirection="0 0"/>
              <PathPointType Anchor="0 360" LeftDirection="0 360" RightDirection="0 360"/>
              <PathPointType Anchor="56 360" LeftDirection="56 360" RightDirection="56 360"/>
              <PathPointType Anchor="56 0" LeftDirection="56 0" RightDirection="56 0"/>
            </PathPointArray>
          </GeometryPathType>
        </PathGeometry>
      </Properties>
      <TextFramePreference AutoSizingType="HeightOnly" AutoSizingReferencePoint="TopLeftPoint"/>
    </TextFrame>

    <!-- ═══ ADDRESS LINE ═══ -->
    <TextFrame Self="u212" ParentStory="u1003"
      ItemTransform="1 0 0 1 36 418"
      ContentType="TextType">
      <Properties>
        <PathGeometry>
          <GeometryPathType PathOpen="false">
            <PathPointArray>
              <PathPointType Anchor="0 0" LeftDirection="0 0" RightDirection="0 0"/>
              <PathPointType Anchor="0 360" LeftDirection="0 360" RightDirection="0 360"/>
              <PathPointType Anchor="18 360" LeftDirection="18 360" RightDirection="18 360"/>
              <PathPointType Anchor="18 0" LeftDirection="18 0" RightDirection="18 0"/>
            </PathPointArray>
          </GeometryPathType>
        </PathGeometry>
      </Properties>
    </TextFrame>

    <!-- ═══ WHITE CONTENT AREA (bottom section) ═══ -->
    <Rectangle Self="u220" ItemTransform="1 0 0 1 0 0"
      FillColor="Color/White" StrokeWeight="0" StrokeColor="Color/None">
      <Properties>
        <PathGeometry>
          <GeometryPathType PathOpen="false">
            <PathPointArray>
              <PathPointType Anchor="440 0" LeftDirection="440 0" RightDirection="440 0"/>
              <PathPointType Anchor="440 612" LeftDirection="440 612" RightDirection="440 612"/>
              <PathPointType Anchor="792 612" LeftDirection="792 612" RightDirection="792 612"/>
              <PathPointType Anchor="792 0" LeftDirection="792 0" RightDirection="792 0"/>
            </PathPointArray>
          </GeometryPathType>
        </PathGeometry>
      </Properties>
    </Rectangle>

    <!-- ═══ EMERALD ACCENT BAR ═══ -->
    <Rectangle Self="u221" ItemTransform="1 0 0 1 0 0"
      FillColor="Color/Emerald" StrokeWeight="0" StrokeColor="Color/None">
      <Properties>
        <PathGeometry>
          <GeometryPathType PathOpen="false">
            <PathPointArray>
              <PathPointType Anchor="440 36" LeftDirection="440 36" RightDirection="440 36"/>
              <PathPointType Anchor="440 90" LeftDirection="440 90" RightDirection="440 90"/>
              <PathPointType Anchor="443 90" LeftDirection="443 90" RightDirection="443 90"/>
              <PathPointType Anchor="443 36" LeftDirection="443 36" RightDirection="443 36"/>
            </PathPointArray>
          </GeometryPathType>
        </PathGeometry>
      </Properties>
    </Rectangle>

    <!-- ═══ PRICE ═══ -->
    <TextFrame Self="u230" ParentStory="u1004"
      ItemTransform="1 0 0 1 454 446"
      ContentType="TextType">
      <Properties>
        <PathGeometry>
          <GeometryPathType PathOpen="false">
            <PathPointArray>
              <PathPointType Anchor="0 0" LeftDirection="0 0" RightDirection="0 0"/>
              <PathPointType Anchor="0 300" LeftDirection="0 300" RightDirection="0 300"/>
              <PathPointType Anchor="40 300" LeftDirection="40 300" RightDirection="40 300"/>
              <PathPointType Anchor="40 0" LeftDirection="40 0" RightDirection="40 0"/>
            </PathPointArray>
          </GeometryPathType>
        </PathGeometry>
      </Properties>
    </TextFrame>

    <!-- ═══ PROPERTY DETAILS GRID ═══ -->
    <TextFrame Self="u231" ParentStory="u1005"
      ItemTransform="1 0 0 1 454 496"
      ContentType="TextType">
      <Properties>
        <PathGeometry>
          <GeometryPathType PathOpen="false">
            <PathPointArray>
              <PathPointType Anchor="0 0" LeftDirection="0 0" RightDirection="0 0"/>
              <PathPointType Anchor="0 300" LeftDirection="0 300" RightDirection="0 300"/>
              <PathPointType Anchor="130 300" LeftDirection="130 300" RightDirection="130 300"/>
              <PathPointType Anchor="130 0" LeftDirection="130 0" RightDirection="130 0"/>
            </PathPointArray>
          </GeometryPathType>
        </PathGeometry>
      </Properties>
    </TextFrame>

    <!-- ═══ PROPERTY HIGHLIGHTS ═══ -->
    <TextFrame Self="u232" ParentStory="u1006"
      ItemTransform="1 0 0 1 454 620"
      ContentType="TextType">
      <Properties>
        <PathGeometry>
          <GeometryPathType PathOpen="false">
            <PathPointArray>
              <PathPointType Anchor="0 0" LeftDirection="0 0" RightDirection="0 0"/>
              <PathPointType Anchor="0 300" LeftDirection="0 300" RightDirection="0 300"/>
              <PathPointType Anchor="130 300" LeftDirection="130 300" RightDirection="130 300"/>
              <PathPointType Anchor="130 0" LeftDirection="130 0" RightDirection="130 0"/>
            </PathPointArray>
          </GeometryPathType>
        </PathGeometry>
      </Properties>
    </TextFrame>

    <!-- ═══ BROKER CONTACT BAR ═══ -->
    <Rectangle Self="u240" ItemTransform="1 0 0 1 0 0"
      FillColor="Color/Navy" StrokeWeight="0" StrokeColor="Color/None">
      <Properties>
        <PathGeometry>
          <GeometryPathType PathOpen="false">
            <PathPointArray>
              <PathPointType Anchor="748 0" LeftDirection="748 0" RightDirection="748 0"/>
              <PathPointType Anchor="748 612" LeftDirection="748 612" RightDirection="748 612"/>
              <PathPointType Anchor="792 612" LeftDirection="792 612" RightDirection="792 612"/>
              <PathPointType Anchor="792 0" LeftDirection="792 0" RightDirection="792 0"/>
            </PathPointArray>
          </GeometryPathType>
        </PathGeometry>
      </Properties>
    </Rectangle>

    <!-- ═══ BROKER INFO ═══ -->
    <TextFrame Self="u241" ParentStory="u1007"
      ItemTransform="1 0 0 1 36 752"
      ContentType="TextType">
      <Properties>
        <PathGeometry>
          <GeometryPathType PathOpen="false">
            <PathPointArray>
              <PathPointType Anchor="0 0" LeftDirection="0 0" RightDirection="0 0"/>
              <PathPointType Anchor="0 540" LeftDirection="0 540" RightDirection="0 540"/>
              <PathPointType Anchor="34 540" LeftDirection="34 540" RightDirection="34 540"/>
              <PathPointType Anchor="34 0" LeftDirection="34 0" RightDirection="34 0"/>
            </PathPointArray>
          </GeometryPathType>
        </PathGeometry>
      </Properties>
    </TextFrame>

  </Spread>
</idPkg:Spread>`;
  }

  // ── PAGE 2: DETAILS SPREAD ────────────────────────────────────────
  _spread2Xml(listing, photos) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<idPkg:Spread xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="18.0">
  <Spread Self="u14d" PageCount="1" BindingLocation="0"
    ShowMasterItems="true" ItemTransform="1 0 0 1 0 0"
    FlattenerOverride="Default" PageTransitionType="None">
    <Page Self="u14dp0" Name="2" AppliedMaster="udd"
      GeometricBounds="0 0 792 612" ItemTransform="1 0 0 1 0 0"
      MasterPageTransform="1 0 0 1 0 0">
      <MarginPreference ColumnCount="1" ColumnGutter="12"
        Top="36" Bottom="36" Left="36" Right="36"/>
    </Page>

    <!-- ═══ EMERALD HEADER BAR ═══ -->
    <Rectangle Self="u300" ItemTransform="1 0 0 1 0 0"
      FillColor="Color/Emerald" StrokeWeight="0" StrokeColor="Color/None">
      <Properties>
        <PathGeometry>
          <GeometryPathType PathOpen="false">
            <PathPointArray>
              <PathPointType Anchor="0 0" LeftDirection="0 0" RightDirection="0 0"/>
              <PathPointType Anchor="0 612" LeftDirection="0 612" RightDirection="0 612"/>
              <PathPointType Anchor="50 612" LeftDirection="50 612" RightDirection="50 612"/>
              <PathPointType Anchor="50 0" LeftDirection="50 0" RightDirection="50 0"/>
            </PathPointArray>
          </GeometryPathType>
        </PathGeometry>
      </Properties>
    </Rectangle>

    <!-- ═══ PAGE 2 HEADER ═══ -->
    <TextFrame Self="u310" ParentStory="u1008"
      ItemTransform="1 0 0 1 36 12"
      ContentType="TextType">
      <Properties>
        <PathGeometry>
          <GeometryPathType PathOpen="false">
            <PathPointArray>
              <PathPointType Anchor="0 0" LeftDirection="0 0" RightDirection="0 0"/>
              <PathPointType Anchor="0 540" LeftDirection="0 540" RightDirection="0 540"/>
              <PathPointType Anchor="30 540" LeftDirection="30 540" RightDirection="30 540"/>
              <PathPointType Anchor="30 0" LeftDirection="30 0" RightDirection="30 0"/>
            </PathPointArray>
          </GeometryPathType>
        </PathGeometry>
      </Properties>
    </TextFrame>

    <!-- ═══ PROPERTY OVERVIEW ═══ -->
    <TextFrame Self="u311" ParentStory="u1009"
      ItemTransform="1 0 0 1 36 65"
      ContentType="TextType">
      <Properties>
        <PathGeometry>
          <GeometryPathType PathOpen="false">
            <PathPointArray>
              <PathPointType Anchor="0 0" LeftDirection="0 0" RightDirection="0 0"/>
              <PathPointType Anchor="0 540" LeftDirection="0 540" RightDirection="0 540"/>
              <PathPointType Anchor="320 540" LeftDirection="320 540" RightDirection="320 540"/>
              <PathPointType Anchor="320 0" LeftDirection="320 0" RightDirection="320 0"/>
            </PathPointArray>
          </GeometryPathType>
        </PathGeometry>
      </Properties>
    </TextFrame>

    <!-- ═══ ADDITIONAL PHOTOS (right column) ═══ -->
    ${photos.length > 1 ? `<Rectangle Self="u320" ItemTransform="1 0 0 1 0 0"
      StrokeWeight="0.5" StrokeColor="Color/LightGray">
      <Properties>
        <PathGeometry>
          <GeometryPathType PathOpen="false">
            <PathPointArray>
              <PathPointType Anchor="65 310" LeftDirection="65 310" RightDirection="65 310"/>
              <PathPointType Anchor="65 576" LeftDirection="65 576" RightDirection="65 576"/>
              <PathPointType Anchor="280 576" LeftDirection="280 576" RightDirection="280 576"/>
              <PathPointType Anchor="280 310" LeftDirection="280 310" RightDirection="280 310"/>
            </PathPointArray>
          </GeometryPathType>
        </PathGeometry>
      </Properties>
      <Image Self="u320img" ItemTransform="1 0 0 1 0 0">
        <Link Self="u320lnk" LinkResourceURI="Resources/Images/photo_2${path.extname(photos[1])}"/>
      </Image>
    </Rectangle>` : ''}

    <!-- ═══ LOCATION / MAP PLACEHOLDER ═══ -->
    <TextFrame Self="u330" ParentStory="u1010"
      ItemTransform="1 0 0 1 36 400"
      ContentType="TextType">
      <Properties>
        <PathGeometry>
          <GeometryPathType PathOpen="false">
            <PathPointArray>
              <PathPointType Anchor="0 0" LeftDirection="0 0" RightDirection="0 0"/>
              <PathPointType Anchor="0 260" LeftDirection="0 260" RightDirection="0 260"/>
              <PathPointType Anchor="130 260" LeftDirection="130 260" RightDirection="130 260"/>
              <PathPointType Anchor="130 0" LeftDirection="130 0" RightDirection="130 0"/>
            </PathPointArray>
          </GeometryPathType>
        </PathGeometry>
      </Properties>
    </TextFrame>

    <!-- ═══ FOOTER ═══ -->
    <Rectangle Self="u340" ItemTransform="1 0 0 1 0 0"
      FillColor="Color/Navy" StrokeWeight="0" StrokeColor="Color/None">
      <Properties>
        <PathGeometry>
          <GeometryPathType PathOpen="false">
            <PathPointArray>
              <PathPointType Anchor="756 0" LeftDirection="756 0" RightDirection="756 0"/>
              <PathPointType Anchor="756 612" LeftDirection="756 612" RightDirection="756 612"/>
              <PathPointType Anchor="792 612" LeftDirection="792 612" RightDirection="792 612"/>
              <PathPointType Anchor="792 0" LeftDirection="792 0" RightDirection="792 0"/>
            </PathPointArray>
          </GeometryPathType>
        </PathGeometry>
      </Properties>
    </Rectangle>

    <TextFrame Self="u341" ParentStory="u1011"
      ItemTransform="1 0 0 1 36 762"
      ContentType="TextType">
      <Properties>
        <PathGeometry>
          <GeometryPathType PathOpen="false">
            <PathPointArray>
              <PathPointType Anchor="0 0" LeftDirection="0 0" RightDirection="0 0"/>
              <PathPointType Anchor="0 540" LeftDirection="0 540" RightDirection="0 540"/>
              <PathPointType Anchor="24 540" LeftDirection="24 540" RightDirection="24 540"/>
              <PathPointType Anchor="24 0" LeftDirection="24 0" RightDirection="24 0"/>
            </PathPointArray>
          </GeometryPathType>
        </PathGeometry>
      </Properties>
    </TextFrame>

  </Spread>
</idPkg:Spread>`;
  }

  // ── STORIES (TEXT CONTENT) ────────────────────────────────────────
  _generateStories(listing, photos) {
    return [
      // Story u1001: Transaction type (FOR SALE / FOR LEASE)
      {
        id: 'u1001',
        xml: this._storyXml('u1001', [
          { text: listing.transactionType, style: 'ParagraphStyle/TransactionType' }
        ])
      },
      // Story u1002: Property name / headline
      {
        id: 'u1002',
        xml: this._storyXml('u1002', [
          { text: listing.propertyName, style: 'ParagraphStyle/Header' }
        ])
      },
      // Story u1003: Address
      {
        id: 'u1003',
        xml: this._storyXml('u1003', [
          { text: `${listing.address}  |  ${listing.cityStateZip}`, style: 'ParagraphStyle/Subheader' }
        ])
      },
      // Story u1004: Price
      {
        id: 'u1004',
        xml: this._storyXml('u1004', [
          { text: listing.price, style: 'ParagraphStyle/Price' },
          ...(listing.pricePerSqft ? [{ text: listing.pricePerSqft, style: 'ParagraphStyle/DetailLabel' }] : [])
        ])
      },
      // Story u1005: Property details grid
      {
        id: 'u1005',
        xml: this._storyXml('u1005', [
          { text: 'PROPERTY DETAILS', style: 'ParagraphStyle/SectionTitle' },
          { text: 'PROPERTY TYPE', style: 'ParagraphStyle/DetailLabel' },
          { text: listing.propertyType, style: 'ParagraphStyle/DetailValue' },
          { text: 'BUILDING SIZE', style: 'ParagraphStyle/DetailLabel' },
          { text: `${listing.sqft} SF`, style: 'ParagraphStyle/DetailValue' },
          { text: 'LOCATION', style: 'ParagraphStyle/DetailLabel' },
          { text: `${listing.city}, ${listing.state}`, style: 'ParagraphStyle/DetailValue' },
          ...(listing.pricePerSqft ? [
            { text: 'PRICE / SF', style: 'ParagraphStyle/DetailLabel' },
            { text: listing.pricePerSqft, style: 'ParagraphStyle/DetailValue' }
          ] : [])
        ])
      },
      // Story u1006: Highlights
      {
        id: 'u1006',
        xml: this._storyXml('u1006', [
          { text: 'HIGHLIGHTS', style: 'ParagraphStyle/SectionTitle' },
          { text: `Prime ${listing.propertyType.toLowerCase()} property in ${listing.city}`, style: 'ParagraphStyle/Body' },
          { text: `${listing.sqft} SF of ${listing.propertyType.toLowerCase()} space available`, style: 'ParagraphStyle/Body' },
          { text: `Excellent visibility and accessibility`, style: 'ParagraphStyle/Body' },
          ...(listing.notes ? [{ text: listing.notes, style: 'ParagraphStyle/Body' }] : [])
        ])
      },
      // Story u1007: Broker contact info
      {
        id: 'u1007',
        xml: this._storyXml('u1007', [
          { text: listing.brokerName, style: 'ParagraphStyle/BrokerName', charStyle: 'CharacterStyle/White' },
          { text: listing.brokerTitle, style: 'ParagraphStyle/BrokerInfo', charStyle: 'CharacterStyle/White' },
          { text: `${listing.brokerPhone}  |  ${listing.brokerEmail}`, style: 'ParagraphStyle/BrokerInfo', charStyle: 'CharacterStyle/White' }
        ])
      },
      // Story u1008: Page 2 header
      {
        id: 'u1008',
        xml: this._storyXml('u1008', [
          { text: listing.propertyName, style: 'ParagraphStyle/Header', charStyle: 'CharacterStyle/White' },
          { text: `${listing.address}  |  ${listing.cityStateZip}`, style: 'ParagraphStyle/Subheader', charStyle: 'CharacterStyle/White' }
        ])
      },
      // Story u1009: Property overview / description
      {
        id: 'u1009',
        xml: this._storyXml('u1009', [
          { text: 'PROPERTY OVERVIEW', style: 'ParagraphStyle/SectionTitle' },
          { text: `This ${listing.sqft} SF ${listing.propertyType.toLowerCase()} property is located at ${listing.address} in ${listing.city}, ${listing.state}. The property offers excellent potential for investors and owner-occupants alike.`, style: 'ParagraphStyle/Body' },
          { text: `Situated in a high-traffic corridor, this ${listing.propertyType.toLowerCase()} asset benefits from strong demographics and accessibility. The property is well-maintained and positioned for immediate occupancy or value-add opportunities.`, style: 'ParagraphStyle/Body' },
          ...(listing.notes ? [
            { text: 'ADDITIONAL NOTES', style: 'ParagraphStyle/SectionTitle' },
            { text: listing.notes, style: 'ParagraphStyle/Body' }
          ] : [])
        ])
      },
      // Story u1010: Location info
      {
        id: 'u1010',
        xml: this._storyXml('u1010', [
          { text: 'LOCATION', style: 'ParagraphStyle/SectionTitle' },
          { text: `${listing.address}`, style: 'ParagraphStyle/DetailValue' },
          { text: `${listing.cityStateZip}`, style: 'ParagraphStyle/DetailValue' },
          ...(listing.lat && listing.lng ? [
            { text: `GPS: ${parseFloat(listing.lat).toFixed(4)}, ${parseFloat(listing.lng).toFixed(4)}`, style: 'ParagraphStyle/DetailLabel' }
          ] : []),
          { text: '[INSERT MAP HERE]', style: 'ParagraphStyle/DetailLabel' }
        ])
      },
      // Story u1011: Footer
      {
        id: 'u1011',
        xml: this._storyXml('u1011', [
          { text: `${listing.companyName}  |  ${listing.companyTagline}  |  ${listing.brokerPhone}`, style: 'ParagraphStyle/Footer' },
          { text: 'The information contained herein has been obtained from sources believed reliable. While we do not doubt its accuracy, we have not verified it and make no guarantee, warranty or representation about it.', style: 'ParagraphStyle/Footer' }
        ])
      }
    ];
  }

  _storyXml(id, paragraphs) {
    const paraXml = paragraphs.map(p => {
      const escapedText = this._escapeXml(p.text);
      const charStyleAttr = p.charStyle
        ? ` AppliedCharacterStyle="${p.charStyle}"`
        : ' AppliedCharacterStyle="CharacterStyle/$ID/[No character style]"';

      return `    <ParagraphStyleRange AppliedParagraphStyle="${p.style}">
      <CharacterStyleRange${charStyleAttr}>
        <Content>${escapedText}</Content>
      </CharacterStyleRange>
    </ParagraphStyleRange>`;
    }).join('\n    <Br/>\n');

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<idPkg:Story xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="18.0">
  <Story Self="${id}" AppliedTOCStyle="n" TrackChanges="false" StoryTitle="$ID/">
${paraXml}
  </Story>
</idPkg:Story>`;
  }

  _escapeXml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  _backingStoryXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<idPkg:BackingStory xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="18.0">
  <Story Self="ue4" AppliedTOCStyle="n" TrackChanges="false" StoryTitle="$ID/">
    <ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/$ID/[No paragraph style]">
      <CharacterStyleRange AppliedCharacterStyle="CharacterStyle/$ID/[No character style]"/>
    </ParagraphStyleRange>
  </Story>
</idPkg:BackingStory>`;
  }

  _tagsXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<idPkg:Tags xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="18.0">
  <XMLTag Self="XMLTag/Root" Name="Root"/>
  <XMLTag Self="XMLTag/Story" Name="Story"/>
</idPkg:Tags>`;
  }

  _mappingXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<idPkg:Mapping xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="18.0">
</idPkg:Mapping>`;
  }
}

module.exports = IDMLGenerator;
