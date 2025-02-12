import { Blob } from 'buffer';
import JsPDF, { jsPDFOptions } from 'jspdf';
import { Performance } from 'perf_hooks';

import ChordDefinition, { isNonSoundingString, isOpenFret } from '../chord_definition/chord_definition';
import ChordDiagram, { StringMarker, StringNumber } from '../chord_diagram/chord_diagram';
import Configuration, { defaultConfiguration } from './configuration';
import Dimensions from './pdf_formatter/dimensions';
import Formatter from './formatter';
import Item from '../chord_sheet/item';
import JsPDFRenderer from '../chord_diagram/js_pdf_renderer';
import Line from '../chord_sheet/line';
import Paragraph from '../chord_sheet/paragraph';
import Song from '../chord_sheet/song';
import defaultPDFConfiguration from './pdf_formatter/default_configuration';
import { ChordLyricsPair, SoftLineBreak, Tag } from '../index';
import { Fret } from '../constants';
import { getCapos } from '../helpers';

import {
  isChordLyricsPair,
  isColumnBreak,
  isComment,
  isSoftLineBreak,
  isTag,
  lineHasContents,
  renderChord,
} from '../template_helpers';

import {
  Alignment,
  Condition,
  FontConfiguration,
  LayoutContentItem,
  LayoutContentItemWithImage,
  LayoutContentItemWithLine,
  LayoutContentItemWithText,
  LayoutItem,
  LayoutSection,
  LineLayout,
  Margins,
  MeasuredItem,
  PDFConfiguration,
  PdfConstructor,
  PdfDoc,
} from './pdf_formatter/types';

import {
  NimbusSansLBolBold,
  NimbusSansLBolItaBoldItalic,
  NimbusSansLRegItaItalic,
  NimbusSansLRegNormal,
} from './pdf_formatter/fonts/NimbusSansLFonts.base64';

declare const performance: Performance;

class PdfFormatter extends Formatter {
  song: Song = new Song();

  y = 0;

  paragraphY = 0;

  x = 0;

  doc: any = new JsPDF();

  startTime = 0;

  currentColumn = 1;

  totalPages = 1;

  currentPage = 1;

  configuration: Configuration = defaultConfiguration;

  pdfConfiguration: PDFConfiguration = defaultPDFConfiguration;

  fontConfiguration: FontConfiguration = defaultPDFConfiguration.fonts.text;

  margins: Margins = defaultPDFConfiguration.layout.global.margins;

  _dimensions: Dimensions | null = null;

  get dimensions(): Dimensions {
    if (!this._dimensions) {
      this._dimensions = this.buildDimensions();
    }
    return this._dimensions;
  }

  // Main function to format and save the song as a PDF
  format(
    song: Song,
    configuration: Configuration,
    pdfConfiguration: PDFConfiguration = defaultPDFConfiguration,
    docConstructor: PdfConstructor = JsPDF,
  ): void {
    this.startTime = performance.now();
    this.song = song;
    this.configuration = configuration;
    this.pdfConfiguration = pdfConfiguration;
    this.doc = this.setupDoc(docConstructor);

    this.y = this.dimensions.minY;
    this.x = this.dimensions.minX;
    this.currentColumn = 1;
    this.formatParagraphs();
    this.renderChordDiagrams();
    this.recordFormattingTime();

    // Must render the footer and header after all formatting
    // to ensure the correct total number of pages
    for (let i = 1; i <= this.totalPages; i += 1) {
      this.currentPage = i;
      this.doc.setPage(i);
      this.renderLayout(this.pdfConfiguration.layout.header, 'header');
      this.renderLayout(this.pdfConfiguration.layout.footer, 'footer');
    }
  }

  get chordDefinitions(): ChordDefinition[] {
    const chordDefinitions = this.song.chordDefinitions.withDefaults();

    return this.song
      .getChords()
      .map((chord) => chordDefinitions.get(chord))
      .filter((chordDefinition) => chordDefinition !== null);
  }

  newPage() {
    this.doc.addPage();
    this.totalPages += 1;
    this.y = this.dimensions.minY;
  }

  renderChordDiagrams() {
    this.x = this.dimensions.minX;
    const chordDiagramWidth = 60;
    const chordDiagramHeight = JsPDFRenderer.calculateHeight(chordDiagramWidth);
    const xMargin = 10;
    const yMargin = 10;

    this.chordDefinitions.forEach((chordDefinition: ChordDefinition) => {
      if ((this.x + chordDiagramWidth) > this.dimensions.maxX) {
        this.y += chordDiagramHeight + yMargin;
        this.x = this.dimensions.minX;
      }

      if (this.y + chordDiagramHeight > this.dimensions.maxY) {
        this.newPage();
      }

      const chordDiagram = this.buildChordDiagram(chordDefinition);
      const renderer = new JsPDFRenderer(this.doc, { x: this.x, y: this.y, width: chordDiagramWidth });
      chordDiagram.render(renderer);
      this.x += renderer.width + xMargin;
    });
  }

  buildChordDiagram(chordDefinition: ChordDefinition): ChordDiagram {
    const openStrings = chordDefinition.frets
      .map((fret: Fret, index: number) => (isOpenFret(fret) ? (index + 1) as StringNumber : null))
      .filter((stringNumber: StringNumber | null) => stringNumber !== null);

    const unusedStrings = chordDefinition.frets
      .map((fret: Fret, index: number) => (isNonSoundingString(fret) ? (index + 1) as StringNumber : null))
      .filter((stringNumber: StringNumber | null) => stringNumber !== null);

    const markers = chordDefinition.frets
      .map((fret: Fret, index: number) => {
        if (isNonSoundingString(fret) || isOpenFret(fret)) {
          return null;
        }

        return {
          string: index + 1 as StringNumber,
          fret: fret as number,
          finger: chordDefinition.fingers[index],
        } as StringMarker;
      })
      .filter((marker: StringMarker | null) => marker !== null);

    return new ChordDiagram({
      chord: chordDefinition.name,
      openStrings,
      unusedStrings,
      markers,
    });
  }

  // Save the formatted document as a PDF file
  save(): void {
    this.doc.save(`${this.song.title || 'untitled'}.pdf`);
  }

  // Generate the PDF as a Blob object
  async generatePDF(): Promise<Blob> {
    return new Promise((resolve): void => {
      const blob = this.doc.output('blob');
      resolve(blob);
    });
  }

  // Document setup configurations
  private setupDoc(DocConstructor: PdfConstructor): PdfDoc {
    const constructorOptions: jsPDFOptions = {
      orientation: 'p',
      unit: 'pt',
      format: 'letter',
      compress: true,
      putOnlyUsedFonts: true,
    };

    const doc = new DocConstructor(constructorOptions);
    doc.setLineWidth(0);
    doc.setDrawColor(0, 0, 0, 0);

    PdfFormatter.addFonts(doc);

    return doc;
  }

  private static addFonts(doc: PdfDoc) {
    doc.addFileToVFS('NimbusSansL-Reg.ttf', NimbusSansLRegNormal);
    doc.addFont('NimbusSansL-Reg.ttf', 'NimbusSansL-Reg', 'normal');

    doc.addFileToVFS('NimbusSansL-Bol.ttf', NimbusSansLBolBold);
    doc.addFont('NimbusSansL-Bol.ttf', 'NimbusSansL-Bol', 'bold');

    doc.addFileToVFS('NimbusSansL-RegIta-italic.ttf', NimbusSansLRegItaItalic);
    doc.addFont('NimbusSansL-RegIta-italic.ttf', 'NimbusSansL-RegIta', 'italic');

    doc.addFileToVFS('NimbusSanL-BolIta-bolditalic.ttf', NimbusSansLBolItaBoldItalic);
    doc.addFont('NimbusSanL-BolIta-bolditalic.ttf', 'NimbusSansL-BolIta', 'bolditalic');
  }

  buildDimensions() {
    const { width, height } = this.doc.internal.pageSize;
    const { columnCount, columnSpacing } = this.pdfConfiguration.layout.sections.global;
    return new Dimensions(width, height, this.pdfConfiguration.layout, { columnCount, columnSpacing });
  }

  // Sets the font style based on the configuration
  private setFontStyle(styleConfig: FontConfiguration) {
    this.doc.setFont(styleConfig.name, styleConfig.style, styleConfig.weight);
    this.doc.setFontSize(styleConfig.size);
    this.setTextColor(styleConfig.color);
  }

  private setTextColor(color: string | number) {
    switch (typeof color) {
      case 'string':
        this.doc.setTextColor(color);
        break;
      case 'number':
        this.doc.setTextColor(color);
        break;
      default:
        break;
    }
  }

  private getFontConfiguration(objectType: string): FontConfiguration {
    return this.pdfConfiguration.fonts[objectType];
  }

  private getFontSize(fontConfig: FontConfiguration): number {
    return fontConfig.size;
  }

  private withFontConfiguration(fontConfiguration: FontConfiguration | null, callback: () => any): any {
    const previousFontConfiguration = this.fontConfiguration;
    if (fontConfiguration) this.setFontStyle(fontConfiguration);
    const returnValue = callback();
    this.setFontStyle(previousFontConfiguration);
    return returnValue;
  }

  // Renders the layout for header and footer
  private renderLayout(layoutConfig: LayoutItem, section: LayoutSection) {
    const { height } = layoutConfig;
    const pageHeight = this.doc.internal.pageSize.getHeight();
    const sectionY = section === 'header' ? this.margins.top : pageHeight - height - this.margins.bottom;

    layoutConfig.content.forEach((contentItem) => {
      const item = contentItem as LayoutContentItem;

      if (this.shouldRenderContent(item)) {
        if (item.type === 'text') {
          this.renderTextItem(item as LayoutContentItemWithText, sectionY);
        } else if (item.type === 'image') {
          this.renderImage(item as LayoutContentItemWithImage, sectionY);
        } else if (item.type === 'line') {
          this.renderLine(item as LayoutContentItemWithLine, sectionY);
        }
      }
    });
  }

  private shouldRenderContent(contentItem: LayoutContentItem): boolean {
    if (!contentItem.condition) {
      return true;
    }

    return this.evaluateCondition(contentItem.condition);
  }

  private evaluateCondition(condition: Condition): boolean {
    if ('and' in condition && Array.isArray(condition.and)) {
      // All conditions in the 'and' array must be true
      return condition.and.every((subCondition) => this.evaluateCondition(subCondition));
    }

    if ('or' in condition && Array.isArray(condition.or)) {
      // At least one condition in the 'or' array must be true
      return condition.or.some((subCondition) => this.evaluateCondition(subCondition));
    }

    // Evaluate a single condition
    const [field, rule] = Object.entries(condition)[0];
    const value = field === 'totalPages' ? this.totalPages : (this.song.metadata[field] ?? this[field]);

    if (!rule) {
      return false;
    }

    // Handle all supported conditions
    if ('equals' in rule) {
      return value === rule.equals;
    }
    if ('not_equals' in rule) {
      return value !== rule.not_equals;
    }
    if ('greater_than' in rule) {
      return typeof value === 'number' && value > rule.greater_than;
    }
    if ('greater_than_equal' in rule) {
      return typeof value === 'number' && value >= rule.greater_than_equal;
    }
    if ('less_than' in rule) {
      return typeof value === 'number' && value < rule.less_than;
    }
    if ('less_than_equal' in rule) {
      return typeof value === 'number' && value <= rule.less_than_equal;
    }
    if ('like' in rule) {
      return typeof value === 'string' && value.toLowerCase().includes(rule.like.toLowerCase());
    }
    if ('contains' in rule) {
      return typeof value === 'string' && value.toLowerCase().includes(rule.contains.toLowerCase());
    }
    if ('in' in rule) {
      return Array.isArray(rule.in) && rule.in.includes(value);
    }
    if ('not_in' in rule) {
      return Array.isArray(rule.not_in) && !rule.not_in.includes(value);
    }
    if ('all' in rule) {
      return Array.isArray(value) && rule.all.every((item: any) => value.includes(item));
    }
    if ('exists' in rule) {
      return rule.exists ? value !== undefined : value === undefined;
    }

    // Check for first page condition
    if ('first' in rule) {
      return rule.first && this.currentPage === 1;
    }

    // Check for last page condition
    if ('last' in rule) {
      return rule.last && this.currentPage === this.totalPages;
    }

    return false;
  }

  private renderTextItem(textItem: LayoutContentItemWithText, sectionY: number) {
    const {
      value, template = '', style, position,
    } = textItem;

    const textValue = value || this.parseTemplate(template, this.song.metadata);

    if (!textValue) {
      return;
    }

    this.setFontStyle(style);
    const pageWidth = this.doc.internal.pageSize.getWidth();
    const availableWidth = position.width ||
      (pageWidth - this.margins.left - this.margins.right);
    let y = sectionY + position.y;

    if (position.clip) {
      if (position.ellipsis) {
        let clippedText = textValue;
        let textWidth = this.doc.getTextDimensions(clippedText).w;

        while (textWidth > availableWidth) {
          clippedText = clippedText.slice(0, -1);
          textWidth = this.doc.getTextDimensions(`${clippedText}...`).w;
        }

        if (clippedText !== textValue) {
          clippedText += '...';
        }

        const x = this.calculateX(position.x, textWidth);

        this.doc.text(clippedText, x, y);
      } else {
        let clippedText = textValue;
        let textWidth = this.doc.getTextDimensions(clippedText).w;

        while (textWidth > availableWidth) {
          clippedText = clippedText.slice(0, -1);
          textWidth = this.doc.getTextDimensions(clippedText).w;
        }

        const x = this.calculateX(position.x, textWidth);

        this.doc.text(clippedText, x, y);
      }
    } else {
      const lines = this.doc.splitTextToSize(textValue, availableWidth);

      lines.forEach((line: string) => {
        const lineWidth = this.doc.getTextDimensions(line).w;
        const x = this.calculateX(position.x, lineWidth);

        this.doc.text(line, x, y);
        y += style.size * (style.lineHeight ?? 1.2);
      });
    }
  }

  // Renders individual image items
  private renderImage(imageItem: LayoutContentItemWithImage, sectionY: number) {
    const {
      src, position, size, alias, compression, rotation,
    } = imageItem;

    const x = this.calculateX(position.x, size.width);
    const y = sectionY + position.y;
    const format = src.split('.').pop()?.toUpperCase() as string;

    this.doc.addImage(src, format, x, y, size.width, size.height, alias, compression, rotation);
  }

  // Renders individual line items
  private renderLine(lineItem: LayoutContentItemWithLine, sectionY: number) {
    const { style, position } = lineItem;

    this.doc.setDrawColor(style.color);
    this.doc.setLineWidth(style.width);

    if (style.dash && Array.isArray(style.dash)) {
      this.doc.setLineDash(style.dash);
      this.doc.setLineCap(1);
    } else {
      this.doc.setLineDash([]);
    }

    const x = this.margins.left + (position.x || 0);
    const y = sectionY + position.y;

    const pageWidth = this.doc.internal.pageSize.getWidth();
    const availableWidth = pageWidth - this.margins.left - this.margins.right;
    const lineWidth = position.width === 'auto' ? availableWidth : position.width;

    this.doc.line(x, y, x + lineWidth, y + (position.height || 0));
    this.doc.setLineDash([]); // Reset dash pattern
  }

  private parseTemplate(template: string, metadata: Record<string, any>): string {
    const shorthandMapping: Record<string, string> = {
      'k': 'key',
      // TODO:: share with tag.ts class
    };

    // Merge metadata and metadata.metadata to ensure both are accessible
    // supports conditional logic on x_metadata fields
    const mergedMetadata = {
      ...metadata.metadata,
      ...metadata,
    };

    if (mergedMetadata.capo && mergedMetadata.key) {
      const capoInt = parseInt(mergedMetadata.capo, 10);
      mergedMetadata.capoKey = getCapos(metadata.key)[capoInt];
    }

    // Include class variables like currentPage and totalPages if available
    mergedMetadata.currentPage = this.currentPage;
    mergedMetadata.totalPages = this.totalPages;

    // Normalize metadata keys to include shorthand equivalents
    const normalizedMetadata: Record<string, any> = { ...mergedMetadata };
    Object.entries(shorthandMapping).forEach(([shorthand, longform]) => {
      if (mergedMetadata[shorthand] !== undefined) {
        normalizedMetadata[longform] = mergedMetadata[shorthand];
      }
    });

    // Replace placeholders with their corresponding values
    let parsedTemplate = template.replace(/%\{(\w+)\}/g, (match, key) => (
      normalizedMetadata[key] !== null && normalizedMetadata[key] !== undefined ?
        normalizedMetadata[key] :
        ''
    ));

    // Remove conditional blocks for unavailable fields
    parsedTemplate = parsedTemplate.replace(
      /{\?(\w+)}(.*?){\/\1}/g,
      (match, key, content) => (
        normalizedMetadata[key] !== null && normalizedMetadata[key] !== undefined ?
          content :
          ''),
    );

    // Remove unnecessary bullet separators if adjacent content is missing
    parsedTemplate = parsedTemplate.replace(/•\s+/g, (_match) => '').trim();

    return parsedTemplate;
  }

  // Helper method to calculate x position based on alignment
  private calculateX(alignment: Alignment | number, width = 0): number {
    switch (alignment) {
      case 'center':
        return this.doc.internal.pageSize.getWidth() / 2 - width / 2;
      case 'right':
        return this.doc.internal.pageSize.getWidth() - this.margins.right - width;
      case 'left':
      default:
        if (typeof alignment === 'number') {
          return this.margins.left + alignment;
        }
        return this.margins.left;
    }
  }

  // Format paragraphs in the song
  private formatParagraphs() {
    const { bodyParagraphs } = this.song;
    bodyParagraphs.forEach((paragraph) => {
      this.formatParagraph(paragraph);
    });
  }

  private formatParagraph(paragraph: Paragraph) {
    const paragraphSummary: {
      totalHeight: number;
      countChordLyricPairLines: number;
      countNonLyricLines: number;
      lineLayouts: LineLayout[][];
      sectionType: string;
    } = {
      totalHeight: 0,
      countChordLyricPairLines: 0,
      countNonLyricLines: 0,
      lineLayouts: [],
      sectionType: paragraph.type,
    };

    paragraph.lines.forEach((line) => {
      if (lineHasContents(line)) {
        const lineLayouts = this.measureAndComputeLineLayouts(line);
        const lineHeight = lineLayouts.reduce((sum, l) => sum + l.lineHeight, 0);
        paragraphSummary.totalHeight += lineHeight;
        lineLayouts.forEach((lineLayout) => {
          if (lineLayout.type === 'ChordLyricsPair') {
            paragraphSummary.countChordLyricPairLines += 1;
          } else if (lineLayout.type === 'Comment' || lineLayout.type === 'SectionLabel') {
            paragraphSummary.countNonLyricLines += 1;
          }
        });
        paragraphSummary.lineLayouts.push(lineLayouts);
      }
    });

    paragraphSummary.lineLayouts = this.insertColumnBreaks(paragraphSummary);

    // don't render empty chords only sections if lyricsOnly is true
    if (
      paragraphSummary.countNonLyricLines === 1 &&
      paragraphSummary.countChordLyricPairLines === 0 &&
      this.pdfConfiguration.layout.sections.base.display?.lyricsOnly
    ) {
      return;
    }

    paragraphSummary.lineLayouts.forEach((lines) => {
      this.renderLines(lines);
    });

    this.y += this.pdfConfiguration.layout.sections.global.paragraphSpacing || 0;
  }

  private measureAndComputeLineLayouts(line: Line): LineLayout[] {
    const measuredItems: MeasuredItem[] = line.items.flatMap(
      (item: Item, index: number): MeasuredItem[] => {
        const nextItem = line.items[index + 1] ?? null;

        // Find the next item with lyrics after the current index and get its index
        let nextItemWithLyrics: ChordLyricsPair | null = null;
        let nextItemWithLyricsIndex: number | null = null;
        if (this.pdfConfiguration.layout.sections.base.display?.lyricsOnly && index === 0) {
          for (let i = index + 1; i < line.items.length; i += 1) {
            if (isChordLyricsPair(line.items[i]) && (line.items[i] as ChordLyricsPair).lyrics?.trim() !== '') {
              nextItemWithLyrics = line.items[i] as ChordLyricsPair;
              nextItemWithLyricsIndex = i;
              break;
            }
          }
        }

        if (isChordLyricsPair(item)) {
          if (nextItemWithLyrics && nextItemWithLyricsIndex) {
            for (let i = index + 1; i < nextItemWithLyricsIndex; i += 1) {
              if (isChordLyricsPair(line.items[i])) {
                const chordLyricsPair = line.items[i] as ChordLyricsPair;
                chordLyricsPair.lyrics = '';
              }
            }
          }
          if (this.pdfConfiguration.layout.sections.base.display?.lyricsOnly &&
            index === 0 && (item as ChordLyricsPair).lyrics?.trim() === '') {
            const chordLyricsPairItem = item as ChordLyricsPair;
            chordLyricsPairItem.lyrics = '';
          }
          const items: (ChordLyricsPair | SoftLineBreak)[] =
            this.addSoftLineBreaksToChordLyricsPair(item as ChordLyricsPair);
          return items.flatMap((i): MeasuredItem[] => this.measureItem(i, nextItem, line));
        }

        const itemIsTag = isTag(item);
        const itemIsComment = itemIsTag && isComment(item as Tag);
        const itemIsSectionDelimiter = itemIsTag && (item as Tag).isSectionDelimiter();

        if (isTag(item) && (itemIsComment || itemIsSectionDelimiter)) {
          return this.measureTag(item as Tag);
        }

        if (isSoftLineBreak(item)) {
          return this.measureItem(
            item as SoftLineBreak,
            nextItem,
            line,
          );
        }

        return [{ item, width: 0 }];
      },
    );

    const lines = this.computeLineLayouts(measuredItems, this.paragraphY, line);
    return lines;
  }

  // Compute line layouts
  private computeLineLayouts(items: MeasuredItem[], startY: number, originalLine: Line): LineLayout[] {
    const lines: LineLayout[] = []; // Stores the final lines to render
    let currentLine: MeasuredItem[] = []; // Items on the current line
    let currentLineWidth = 0; // Width of the current line
    let currentY = startY; // Current vertical position
    let lastSoftLineBreakIndex = -1; // Index of the last SoftLineBreak
    let i = 0; // Index to iterate over items

    while (i < items.length) {
      let item = items[i];
      let itemWidth = item.width;

      // Check if the item fits in the current line
      if (currentLineWidth + itemWidth > this.columnAvailableWidth()) {
        let breakIndex = -1;

        if (lastSoftLineBreakIndex >= 0) {
          // **Case 1: Break at the last SoftLineBreak**
          breakIndex = lastSoftLineBreakIndex;

          // Remove the SoftLineBreak from currentLine
          currentLine.splice(breakIndex, 1);

          // Recalculate currentLineWidth after removing SoftLineBreak
          currentLineWidth = currentLine.reduce((sum, mi) => sum + mi.width, 0);
        } else if (itemWidth > this.columnAvailableWidth()) {
          // **Attempt to split the item**
          const [firstPart, secondPart] =
            this.splitMeasuredItem(item, this.columnAvailableWidth() - currentLineWidth);

          if (secondPart) {
            // Insert the second part back into items to process next
            items.splice(i + 1, 0, secondPart);
          }

          // Update the current item to the first part
          item = firstPart;
          itemWidth = item.width;

          // Add the first part to currentLine
          currentLine.push(item);
          currentLineWidth += itemWidth;

          // Increment 'i' to process the second part in the next iteration
          i += 1;

          // Proceed to break the line after adding the first part
          breakIndex = currentLine.length;
        } else {
          // **Case 3: Move the item to the next line**
          breakIndex = currentLine.length;

          if (breakIndex === 0) {
            // **Special Case: Item is too wide even for an empty line**
            // Add the item to currentLine and increment 'i' to avoid infinite loop
            currentLine.push(item);
            currentLineWidth += itemWidth;
            i += 1;
            breakIndex = currentLine.length;
          }
        }

        // **Actual Line Break Occurs Here**

        // Get the items for the current line
        const lineItems = currentLine.slice(0, breakIndex);

        // Remove trailing commas from the last item's lyrics
        const lastItemInLineItems = lineItems[lineItems.length - 1];
        if (lastItemInLineItems.item instanceof ChordLyricsPair) {
          const lastItemLyrics = (lastItemInLineItems.item as ChordLyricsPair).lyrics;
          if (lastItemLyrics && lastItemLyrics.endsWith(',')) {
            (lineItems[lineItems.length - 1].item as ChordLyricsPair).lyrics = lastItemLyrics.slice(0, -1);
          }
        }

        // Create a LineLayout and add it to lines
        const lineLayout = this.createLineLayout(lineItems, originalLine);
        lines.push(lineLayout);

        // Update currentY for the next line
        currentY += lineLayout.lineHeight;

        // Prepare currentLine and currentLineWidth for the next line
        currentLine = currentLine.slice(breakIndex);
        currentLineWidth = currentLine.reduce((sum, mi) => sum + mi.width, 0);
        lastSoftLineBreakIndex = -1;

        // **Capitalize the first word of the next item's lyrics**
        const nextItemWithLyrics = this.findNextItemWithLyrics(currentLine, items, i);
        if (nextItemWithLyrics) {
          const nextItem = nextItemWithLyrics.item;
          const { lyrics } = nextItemWithLyrics;
          const nextPair = nextItem.item as ChordLyricsPair;
          nextPair.lyrics = this.capitalizeFirstWord(lyrics);

          // // next item has to be re-measured becasue the lyrics have changed
          const lyricsFont = this.getFontConfiguration('text');
          const lyricsWidth = lyrics ? this.getTextDimensions(nextPair.lyrics, lyricsFont).w : 0;
          if (lyricsWidth > nextItem.width) {
            nextItem.width = lyricsWidth;
          }
        }
      } else {
        // **Item fits in the current line; add it**
        currentLine.push(item);
        currentLineWidth += itemWidth;

        // Update lastSoftLineBreakIndex if the item is a SoftLineBreak
        if (item.item instanceof SoftLineBreak) {
          lastSoftLineBreakIndex = currentLine.length - 1;
        }

        // Move to the next item
        i += 1;
      }
    }

    // **Handle any remaining items in currentLine**
    if (currentLine.length > 0) {
      const lineLayout = this.createLineLayout(currentLine, originalLine);
      lines.push(lineLayout);
      currentY += lineLayout.lineHeight;
    }

    // Update the vertical position
    this.paragraphY = currentY;

    return lines;
  }

  // Splits a MeasuredItem into two parts based on available width
  private splitMeasuredItem(item: MeasuredItem, availableWidth: number): [MeasuredItem, MeasuredItem | null] {
    if (item.item instanceof ChordLyricsPair) {
      const lyricsFont = this.getFontConfiguration('text');

      const { chords } = item.item;
      const { lyrics } = item.item;

      // Use splitTextToSize to split lyrics into lines that fit the available width
      const lyricLines = this.withFontConfiguration(lyricsFont, () => this.doc.splitTextToSize(lyrics, availableWidth));

      if (lyricLines.length === 1) {
      // Cannot split further; return the original item as is
        return [item, null];
      }

      // Create two ChordLyricsPair items
      const firstLyrics = lyricLines[0];
      const secondLyrics = lyricLines.slice(1).join(' ');

      // Measure widths of new items
      const firstWidth = this.getTextDimensions(firstLyrics, lyricsFont).w;
      const secondWidth = this.getTextDimensions(secondLyrics, lyricsFont).w;

      // First part with chords
      const firstItem: MeasuredItem = {
        item: new ChordLyricsPair(chords, firstLyrics),
        width: firstWidth,
        chordHeight: item.chordHeight,
      };

      // Second part without chords
      const secondItem: MeasuredItem = {
        item: new ChordLyricsPair('', secondLyrics),
        width: secondWidth,
        chordHeight: 0,
      };

      return [firstItem, secondItem];
    }
    // Cannot split other item types; return the original item
    return [item, null];
  }

  // Helper function to find the next item with lyrics
  private findNextItemWithLyrics(
    currentLine: MeasuredItem[],
    items: MeasuredItem[],
    currentIndex: number,
  ): { item: MeasuredItem; lyrics: string } | null {
    // Check currentLine first
    let foundItem: { item: MeasuredItem; lyrics: string } | null = null;

    currentLine.some((item) => {
      if (item.item instanceof ChordLyricsPair) {
        const pair = item.item as ChordLyricsPair;
        if (pair.lyrics && pair.lyrics.trim() !== '') {
          foundItem = { item, lyrics: pair.lyrics };
          return true;
        }
      }
      return false;
    });

    if (foundItem) {
      return foundItem;
    }

    // Then check the remaining items
    for (let idx = currentIndex; idx < items.length; idx += 1) {
      const item = items[idx];
      if (item.item instanceof ChordLyricsPair) {
        const pair = item.item as ChordLyricsPair;
        if (pair.lyrics && pair.lyrics.trim() !== '') {
          return { item, lyrics: pair.lyrics };
        }
      }
    }

    return null;
  }

  private capitalizeFirstWord(lyrics: string): string {
    if (!lyrics || lyrics.length === 0) return lyrics;
    return lyrics.replace(/^\s*\S*/, (word) => word.charAt(0).toUpperCase() + word.slice(1));
  }

  private createLineLayout(items: MeasuredItem[], originalLine: Line): LineLayout {
    const lineHeight = this.estimateLineHeight(items);
    const hasChords = items.some(({ item }) => item instanceof ChordLyricsPair && item.chords);
    const hasLyrics = items.some(
      ({ item }) => item instanceof ChordLyricsPair && item.lyrics && item.lyrics.trim() !== '',
    );
    const hasComments = items.some(({ item }) => item instanceof Tag && isComment(item));
    const hasSectionLabel = items.some(({ item }) => item instanceof Tag && item.isSectionDelimiter());
    const hasTags = items.some(({ item }) => item instanceof Tag);
    const allItemsAreNull = items.every(({ item }) => item == null);

    let type;
    if (hasChords || hasLyrics) {
      type = 'ChordLyricsPair';
    } else if (hasComments && !hasSectionLabel) {
      type = 'Comment';
    } else if (hasSectionLabel) {
      type = 'SectionLabel';
    } else if (hasTags) {
      type = 'Tag';
    } else if (allItemsAreNull) {
      type = 'Empty';
    }

    if (this.pdfConfiguration.layout.sections.base.display?.lyricsOnly && type === 'ChordLyricsPair') {
      const indexOfFirstItemContainingLyrics = items.findIndex(
        ({ item }) => (
          item instanceof ChordLyricsPair &&
          item.lyrics &&
          item.lyrics.trim() !== ''
        ),
      );

      // Create a new array of updated items without modifying the original parameter.
      const updatedItems = items.map((measuredItem, i) => {
        if (i < indexOfFirstItemContainingLyrics && measuredItem.item instanceof ChordLyricsPair) {
          const updatedChordLyricsPair = {
            ...measuredItem.item,
            lyrics: '',
          } as ChordLyricsPair;

          return {
            ...measuredItem,
            item: updatedChordLyricsPair,
            width: 0,
          };
        }
        return measuredItem;
      });

      return {
        type,
        items: updatedItems,
        lineHeight,
      };
    }

    return {
      type,
      items,
      lineHeight,
      line: originalLine,
    };
  }

  private getChordLyricYOffset(items: MeasuredItem[], yOffset) {
    // Determine line types
    const hasChords = items.some(({ item }) => item instanceof ChordLyricsPair && item.chords);
    const hasLyrics = items.some(
      ({ item }) => item instanceof ChordLyricsPair && item.lyrics && item.lyrics.trim() !== '',
    );

    const { chordLyricSpacing } = this.pdfConfiguration.layout.sections.global;
    let chordsYOffset = yOffset;
    let lyricsYOffset = yOffset;

    if (hasChords && hasLyrics) {
      chordsYOffset = yOffset;
      lyricsYOffset = chordsYOffset + this.maxChordHeight(items) + chordLyricSpacing;
    } else if (hasChords && !hasLyrics) {
      chordsYOffset = yOffset;
    } else if (!hasChords && hasLyrics) {
      lyricsYOffset = yOffset;
    }

    return { chordsYOffset, lyricsYOffset };
  }

  // Render lines
  private renderLines(lines: LineLayout[]): void {
    const chordFont = this.getFontConfiguration('chord');
    const lyricsFont = this.getFontConfiguration('text');

    lines.forEach((lineLayout) => {
      const { items, lineHeight, line } = lineLayout;

      // Filter items that are column breaks and handle them first.
      const hasColumnBreak = items.length === 1 && items[0].item instanceof Tag && isColumnBreak(items[0].item);
      if (hasColumnBreak) {
        this.moveToNextColumn();
        return; // Skip to the next iteration of lines.
      }

      const yOffset = this.y;
      const { chordsYOffset, lyricsYOffset } = this.getChordLyricYOffset(items, yOffset);

      let { x } = this;

      // Render each item in the line
      items.forEach((measuredItem) => {
        const { item, width } = measuredItem;

        if (item instanceof ChordLyricsPair) {
          let { chords } = item;
          const { lyrics } = item;

          chords = renderChord(
            chords,
            (line as Line),
            this.song,
            {
              renderKey: null,
              useUnicodeModifier: this.configuration.useUnicodeModifiers,
              normalizeChords: this.configuration.normalizeChords,
            },
          );

          // Render chords only if `lyricsOnly` is false
          if (!this.pdfConfiguration.layout.sections.base.display?.lyricsOnly && chords) {
            const chordDimensions = this.getTextDimensions(chords, chordFont);
            const chordBaseline = chordsYOffset + this.maxChordHeight(items) - chordDimensions.h;
            this.renderText(chords, x, chordBaseline, chordFont);
          }

          // Always render lyrics
          if (lyrics && lyrics.trim() !== '') {
            this.renderText(lyrics, x, lyricsYOffset, lyricsFont);
          }

          x += width;
        } else if (item instanceof Tag) {
          if (isColumnBreak(item)) {
            // Column break already handled at the beginning, so we don't need `continue`.

          } else if (item.isSectionDelimiter()) {
            this.formatSectionLabel(item.label, x, yOffset);
            x += width;
          } else if (isComment(item)) {
            this.formatComment(item.value, x, yOffset);
            x += width;
          }
        } else if (item instanceof SoftLineBreak) {
          this.renderText(item.content, x, lyricsYOffset, lyricsFont);
          x += width;
        }
      });

      // Update the vertical position after rendering the line
      this.y += lineHeight;

      // Reset x to the left margin for the next line
      this.x = this.columnStartX();
    });
  }

  private insertColumnBreaks(paragraphSummary: {
    totalHeight: number;
    countChordLyricPairLines: number;
    countNonLyricLines: number;
    lineLayouts: LineLayout[][];
  }): LineLayout[][] {
    const { lineLayouts, totalHeight, countChordLyricPairLines } = paragraphSummary;
    let newLineLayouts: LineLayout[][] = [];
    const cumulativeHeight = this.y;
    const columnStartY = this.margins.top + this.pdfConfiguration.layout.header.height;
    const columnBottomY = this.getColumnBottomY();

    // Check if the entire paragraph fits in the current column
    if (cumulativeHeight + totalHeight <= columnBottomY) {
      // The entire paragraph fits; no need for column breaks
      return lineLayouts;
    }

    // Paragraph does not fit entirely in current column
    if (countChordLyricPairLines <= 3) {
      // Paragraphs with 3 chord-lyric lines or less
      // Insert column break before the paragraph if not at the top of the column
      if (cumulativeHeight !== columnStartY) {
        newLineLayouts.push([this.createColumnBreakLineLayout()]);
      }
      newLineLayouts = newLineLayouts.concat(lineLayouts);
      return newLineLayouts;
    }

    if (countChordLyricPairLines === 4) {
      // Paragraphs with 4 chord-lyric lines
      // Try to split after the 2nd chord-lyric line
      newLineLayouts = this.splitParagraphAfterNthChordLyricLine(
        lineLayouts,
        2,
        cumulativeHeight,
      );
      return newLineLayouts;
    }

    if (countChordLyricPairLines >= 5) {
      // Paragraphs with 5 or more chord-lyric lines
      newLineLayouts = this.splitParagraphWithMinimumChordLyricLines(
        lineLayouts,
        cumulativeHeight,
        countChordLyricPairLines,
      );
      return newLineLayouts;
    }

    // Default case: return the original lineLayouts
    return lineLayouts;
  }

  private splitParagraphAfterNthChordLyricLine(
    lineLayouts: LineLayout[][],
    n: number,
    cumulativeHeight: number,
  ): LineLayout[][] {
    let newLineLayouts: LineLayout[][] = [];
    const columnStartY = this.margins.bottom + this.pdfConfiguration.layout.header.height;
    const columnBottomY = this.getColumnBottomY();

    let chordLyricPairLinesSeen = 0;
    let splitIndex = -1;
    let heightFirstPart = 0;

    for (let i = 0; i < lineLayouts.length; i += 1) {
      const lines = lineLayouts[i];
      let linesHeight = 0;
      let chordLyricPairLinesSeenInLineLayout = 0;
      lines.forEach((lineLayout) => {
        linesHeight += lineLayout.lineHeight;

        if (lineLayout.type === 'ChordLyricsPair') {
          chordLyricPairLinesSeenInLineLayout += 1;
        }
      });

      chordLyricPairLinesSeen += chordLyricPairLinesSeenInLineLayout;

      heightFirstPart += linesHeight;
      if (chordLyricPairLinesSeen >= n) {
        splitIndex = i + 1;
        break;
      }
    }

    if (cumulativeHeight + heightFirstPart <= columnBottomY) {
      // First part fits in current column
      newLineLayouts = newLineLayouts.concat(lineLayouts.slice(0, splitIndex));
      newLineLayouts.push([this.createColumnBreakLineLayout()]);
      newLineLayouts = newLineLayouts.concat(lineLayouts.slice(splitIndex));
    } else {
      // First part doesn't fit; insert column break before paragraph
      if (cumulativeHeight !== columnStartY) {
        newLineLayouts.push([this.createColumnBreakLineLayout()]);
      }
      newLineLayouts = newLineLayouts.concat(lineLayouts);
    }

    return newLineLayouts;
  }

  private splitParagraphWithMinimumChordLyricLines(
    lineLayouts: LineLayout[][],
    cumulativeHeight: number,
    totalChordLyricPairLines: number,
  ): LineLayout[][] {
    let newLineLayouts: LineLayout[][] = [];
    const columnStartY =
      this.margins.top + this.pdfConfiguration.layout.header.height;
    const columnBottomY = this.getColumnBottomY();

    // Flatten lineLayouts into a flat array of LineLayout
    const flatLineLayouts: LineLayout[] = [];
    const lineLayoutIndices: { outerIndex: number; innerIndex: number }[] = [];

    for (let outerIndex = 0; outerIndex < lineLayouts.length; outerIndex += 1) {
      const innerArray = lineLayouts[outerIndex];
      for (let innerIndex = 0; innerIndex < innerArray.length; innerIndex += 1) {
        flatLineLayouts.push(innerArray[innerIndex]);
        lineLayoutIndices.push({ outerIndex, innerIndex });
      }
    }

    const acceptableSplits: { index: number; heightFirstPart: number }[] = [];

    let heightFirstPart = 0;
    let chordLyricLinesInFirstPart = 0;

    // Identify all acceptable split points where both parts have at least two chord-lyric lines
    for (let i = 0; i < flatLineLayouts.length - 1; i += 1) {
      const lineLayout = flatLineLayouts[i];
      heightFirstPart += lineLayout.lineHeight;

      if (lineLayout.type === 'ChordLyricsPair') {
        chordLyricLinesInFirstPart += 1;
      }

      const remainingChordLyricLines = totalChordLyricPairLines - chordLyricLinesInFirstPart;

      // Ensure at least two chord-lyric lines remain in both parts
      if (chordLyricLinesInFirstPart >= 2 && remainingChordLyricLines >= 2) {
        acceptableSplits.push({ index: i + 1, heightFirstPart });
      }
    }

    // Try to find the best split point that fits in the current column
    let splitFound = false;

    // Start from the split point that includes the most lines in the first part
    for (let i = acceptableSplits.length - 1; i >= 0; i -= 1) {
      const split = acceptableSplits[i];

      if (cumulativeHeight + split.heightFirstPart <= columnBottomY) {
        // First part fits in current column

        // Map the flat indices back to lineLayouts indices
        const splitIndex = split.index;
        const firstPartLineLayouts: LineLayout[][] = [];
        const secondPartLineLayouts: LineLayout[][] = [];

        // Collect lineLayouts for the first part
        let currentOuterIndex = lineLayoutIndices[0].outerIndex;
        let currentInnerArray: LineLayout[] = [];
        for (let j = 0; j < splitIndex; j += 1) {
          const { outerIndex } = lineLayoutIndices[j];
          const lineLayout = flatLineLayouts[j];

          if (outerIndex !== currentOuterIndex) {
            if (currentInnerArray.length > 0) {
              firstPartLineLayouts.push(currentInnerArray);
            }
            currentInnerArray = [];
            currentOuterIndex = outerIndex;
          }
          currentInnerArray.push(lineLayout);
        }
        if (currentInnerArray.length > 0) {
          firstPartLineLayouts.push(currentInnerArray);
        }

        // Collect lineLayouts for the second part
        currentOuterIndex = lineLayoutIndices[splitIndex].outerIndex;
        currentInnerArray = [];
        for (let j = splitIndex; j < flatLineLayouts.length; j += 1) {
          const { outerIndex } = lineLayoutIndices[j];
          const lineLayout = flatLineLayouts[j];

          if (outerIndex !== currentOuterIndex) {
            if (currentInnerArray.length > 0) {
              secondPartLineLayouts.push(currentInnerArray);
            }
            currentInnerArray = [];
            currentOuterIndex = outerIndex;
          }
          currentInnerArray.push(lineLayout);
        }
        if (currentInnerArray.length > 0) {
          secondPartLineLayouts.push(currentInnerArray);
        }

        // Build newLineLayouts
        newLineLayouts = newLineLayouts.concat(firstPartLineLayouts);
        newLineLayouts.push([this.createColumnBreakLineLayout()]);
        newLineLayouts = newLineLayouts.concat(secondPartLineLayouts);

        splitFound = true;
        break;
      }
    }

    if (!splitFound) {
      // No acceptable split point fits; move entire paragraph to the next column
      if (cumulativeHeight !== columnStartY) {
        newLineLayouts.push([this.createColumnBreakLineLayout()]);
      }
      newLineLayouts = newLineLayouts.concat(lineLayouts);
    }

    return newLineLayouts;
  }

  private createColumnBreakLineLayout(): LineLayout {
    return {
      type: 'Tag',
      items: [{ item: new Tag('column_break'), width: 0 }],
      lineHeight: 0,
    };
  }

  // Estimate the line height
  private estimateLineHeight(items: MeasuredItem[]): number {
    const maxChordHeight = this.maxChordHeight(items);
    const { chordLyricSpacing, linePadding } = this.pdfConfiguration.layout.sections.global;

    const hasChords = items.some(({ item }) => item instanceof ChordLyricsPair && item.chords);
    const hasLyrics = items.some(
      ({ item }) => item instanceof ChordLyricsPair && item.lyrics && item.lyrics.trim() !== '',
    );
    const hasComments = items.some(({ item }) => item instanceof Tag && isComment(item));

    const hasSectionDelimiter = items.some(({ item }) => item instanceof Tag && item.isSectionDelimiter());

    let estimatedHeight = linePadding;
    let lineHeight = 1;
    let fontConfiguration: FontConfiguration | null = null;

    if (hasChords && hasLyrics) {
      fontConfiguration = this.getFontConfiguration('text');
      const lyricsFontSize = this.getFontSize(fontConfiguration);
      estimatedHeight += maxChordHeight + chordLyricSpacing + lyricsFontSize;
    } else if (hasChords && !hasLyrics) {
      estimatedHeight += maxChordHeight;
    } else if (!hasChords && hasLyrics) {
      fontConfiguration = this.getFontConfiguration('text');
      const lyricsFontSize = this.getFontSize(fontConfiguration);
      estimatedHeight += lyricsFontSize;
    } else if (hasComments) {
      fontConfiguration = this.getFontConfiguration('comment');
      const commentFontSize = this.getFontSize(fontConfiguration);
      estimatedHeight += commentFontSize;
    } else if (hasSectionDelimiter) {
      fontConfiguration = this.getFontConfiguration('sectionLabel');
      const commentFontSize = this.getFontSize(fontConfiguration);
      estimatedHeight += commentFontSize;
    }

    if (fontConfiguration && fontConfiguration.lineHeight) {
      lineHeight = fontConfiguration.lineHeight;
    }

    return estimatedHeight * lineHeight;
  }

  // Get the maximum chord height
  private maxChordHeight(items: MeasuredItem[]): number {
    return items.reduce((maxHeight, { chordHeight }) => Math.max(maxHeight, chordHeight || 0), 0);
  }

  // Move to the next column or page
  private moveToNextColumn() {
    this.currentColumn += 1;

    const {
      columnCount,
    } = this.pdfConfiguration.layout.sections.global;

    if (this.currentColumn > columnCount) {
      this.doc.addPage();
      this.currentPage += 1;
      this.totalPages += 1;
      this.currentColumn = 1;
    }

    this.x = this.columnStartX();
    this.y = this.margins.top + this.pdfConfiguration.layout.header.height;
  }

  // Get the bottom Y coordinate of the column
  private getColumnBottomY(): number {
    const pageHeight = this.doc.internal.pageSize.getHeight();
    const { layout } = this.pdfConfiguration;
    const footerHeight = layout.footer.height;
    return pageHeight - this.margins.bottom - footerHeight;
  }

  // Helper methods for layout calculations
  private columnAvailableWidth(): number {
    return this.dimensions.columnWidth - (this.x - this.columnStartX());
  }

  private columnStartX(): number {
    const { columnSpacing } = this.pdfConfiguration.layout.sections.global;
    return this.margins.left + (this.currentColumn - 1) * (this.dimensions.columnWidth + columnSpacing);
  }

  private getSpaceWidth(): number {
    return this.getTextDimensions(' ').w;
  }

  // Render text at a given position
  private renderText(text: string, x: number, y: number, style: FontConfiguration | null = null): void {
    this.withFontConfiguration(style, () => this.doc.text(text, x, y));
  }

  private formatSectionLabel(label: string, x: number, y: number): void {
    const style = this.getFontConfiguration('sectionLabel');
    this.withFontConfiguration(style, () => this.doc.text(label, x, y));
    const { w: textWidth } = this.getTextDimensions(label, style);

    if (style.underline) {
      this.doc.setDrawColor(0);
      this.doc.setLineWidth(1.25);
      this.doc.line(x, y + 3, x + textWidth, y + 3);
    }
  }

  private formatComment(commentText: string, x: number, y: number): void {
    const style = this.getFontConfiguration('comment');
    this.withFontConfiguration(style, () => this.doc.text(commentText, x, y));
    const { w: textWidth } = this.getTextDimensions(commentText, style);

    if (style.underline) {
      this.doc.setDrawColor(0);
      this.doc.setLineWidth(1.25);
      this.doc.line(x, y + 3, x + textWidth, y + 3);
    }
  }

  // Measure items
  private measureItem(
    item: ChordLyricsPair | SoftLineBreak | Item,
    nextItem: ChordLyricsPair | SoftLineBreak | Item,
    line: Line,
  ): MeasuredItem[] {
    if (item instanceof ChordLyricsPair) {
      let nextItemHasChords = false;
      let lyrics = item.lyrics ?? '';
      if (nextItem && nextItem instanceof ChordLyricsPair) {
        const nextLyrics = nextItem.lyrics ?? '';
        const nextChords = nextItem.chords;

        // Check if the next item has chords
        if (nextChords && nextChords.trim() !== '') {
          nextItemHasChords = true;
        }

        // Check if the next item has a hyphen
        if (this.pdfConfiguration.layout.sections.base.display?.lyricsOnly) {
          if (nextLyrics.startsWith(' -') || nextLyrics.startsWith('-')) {
            lyrics = lyrics.trimEnd();
            // eslint-disable-next-line no-param-reassign
            nextItem.lyrics = this.removeHyphens(nextLyrics);
          }
        }
      }
      if (this.pdfConfiguration.layout.sections.base.display?.lyricsOnly) {
        // clean next lyrics and this lyrics
        // eslint-disable-next-line no-param-reassign
        item.lyrics = this.removeHyphens(lyrics);
      }
      return this.measureChordLyricsPair(line, item, nextItemHasChords);
    }

    if (item instanceof Tag && (isComment(item) || item.isSectionDelimiter())) {
      return this.measureTag(item);
    }

    if (item instanceof SoftLineBreak) {
      const lyricsFont = this.getFontConfiguration('text');
      const width = this.getTextDimensions(item.content, lyricsFont).w;
      return [{ item, width }];
    }

    return [];
  }

  private removeHyphens(lyrics: string): string {
    let cleanedLyrics = lyrics;
    // Remove hyphenated word splits (e.g., "well - known" -> "wellknown")
    cleanedLyrics = lyrics.replace(/\b(\w+)\s*-\s*(\w+)\b/g, '$1$2');

    // Remove trailing hyphens and hyphen-space combinations
    cleanedLyrics = cleanedLyrics.replace(/(?:\b(\w+)\s*-\s*$)|(?:-\s*$)|(?:\s+-\s+$)/g, '$1');

    // If the entire string is just hyphens and spaces, return an empty string
    if (/^\s*-\s*$/.test(cleanedLyrics)) {
      return '';
    }

    return cleanedLyrics;
  }

  private measureChordLyricsPair(
    line: Line,
    item: ChordLyricsPair,
    nextItemHasChords = false,
  ): MeasuredItem[] {
    const chordFont = this.getFontConfiguration('chord');
    const lyricsFont = this.getFontConfiguration('text');

    let { chords } = item;
    let beforeChords = chords || '';
    const { lyrics } = item;

    chords = renderChord(
      chords,
      line,
      this.song,
      {
        renderKey: null,
        useUnicodeModifier: this.configuration.useUnicodeModifiers,
        normalizeChords: this.configuration.normalizeChords,
      },
    );
    const chordWidth = chords ? this.getTextDimensions(chords, chordFont).w : 0;
    const lyricsWidth = lyrics ? this.getTextDimensions(lyrics, lyricsFont).w : 0;

    if (this.pdfConfiguration.layout.sections.base.display?.lyricsOnly) {
      if (lyrics === '') {
        return [
          {
            item: null,
            width: 0,
          },
        ];
      }
      return [
        {
          item: new ChordLyricsPair('', lyrics),
          width: lyricsWidth,
          chordHeight: 0,
        },
      ];
    }

    let adjustedChords = chords || '';
    const adjustedLyrics = lyrics || '';
    if (chordWidth >= (lyricsWidth - this.getSpaceWidth()) && nextItemHasChords) {
      adjustedChords += this.chordSpacingAsSpaces;
      beforeChords += this.chordSpacingAsSpaces;
    }

    const adjustedChordWidth = this.getTextDimensions(adjustedChords, chordFont).w;
    const totalWidth = Math.max(adjustedChordWidth, lyricsWidth);
    const chordLyricWidthDifference =
      adjustedChordWidth > 0 && adjustedChordWidth > lyricsWidth ?
        Math.abs(adjustedChordWidth - lyricsWidth) : 0;

    return [
      {
        // even though we measure against the "rendered" chord
        // we have to keep the original chord in the item so that
        // when it is rendered, it is rendered correctly
        item: new ChordLyricsPair(beforeChords, adjustedLyrics),
        width: totalWidth,
        chordLyricWidthDifference,
        chordHeight: chords ? this.getTextDimensions(chords, chordFont).h : 0,
      },
    ];
  }

  private measureTag(item: Tag): MeasuredItem[] {
    const commentFont = this.getFontConfiguration('comment');
    const sectionLabelFont = this.getFontConfiguration('sectionLabel');

    const font = isComment(item) ? commentFont : sectionLabelFont;

    const columnWidth = this.columnAvailableWidth();
    let tagLines: string[] = [];
    this.withFontConfiguration(font, () => {
      tagLines = this.doc.splitTextToSize(item.label, columnWidth);
    });

    return tagLines.map((line) => ({
      item: new Tag(item.name, line),
      width: this.getTextDimensions(line, font).w,
    }));
  }

  private addSoftLineBreaksToChordLyricsPair(
    chordLyricsPair: ChordLyricsPair,
  ): (ChordLyricsPair | SoftLineBreak)[] {
    const { chords, lyrics, annotation } = chordLyricsPair;

    if (!lyrics || lyrics.trim() === '') {
      return [chordLyricsPair];
    }

    const lyricFragments = lyrics.split(/,\s*/);

    const items: (ChordLyricsPair | SoftLineBreak)[] = [];

    lyricFragments.forEach((fragment, index) => {
      if (index > 0 && index !== 0) {
        items.push(new SoftLineBreak(' '));
        if (fragment.trim() !== '') {
          items.push(new ChordLyricsPair('', fragment, ''));
        }
      }

      if (index === 0 && lyricFragments.length === 1) {
        items.push(new ChordLyricsPair(chords, fragment, annotation));
      } else if (index === 0 && lyricFragments.length > 1) {
        let commaAdjustedFragment = fragment;
        commaAdjustedFragment += ',';
        items.push(new ChordLyricsPair(chords, commaAdjustedFragment, annotation));
      }
    });

    return items;
  }

  // Get text dimensions
  private getTextDimensions(
    text: string | null,
    styleConfig: FontConfiguration | null = null,
  ): { w: number; h: number } {
    if (!text || text.length === 0) {
      return { w: 0, h: 0 };
    }
    return this.withFontConfiguration(styleConfig, () => this.doc.getTextDimensions(text));
  }

  // Get chord spacing
  private get chordSpacingAsSpaces(): string {
    let str = '';
    for (let i = 0; i < this.pdfConfiguration.layout.sections.global.chordSpacing; i += 1) {
      str += ' ';
    }
    return str;
  }

  // Record formatting time
  private recordFormattingTime(): void {
    const endTime = performance.now();
    const timeTaken = ((endTime - this.startTime) / 1000).toFixed(5);

    const style = this.getFontConfiguration('text');
    this.setFontStyle(style);
    this.doc.setTextColor(100);

    const pageWidth = this.doc.internal.pageSize.getWidth();
    const timeTextWidth = this.getTextDimensions(`${timeTaken}s`).w;
    const timeTextX = pageWidth - timeTextWidth - this.margins.right;
    const timeTextY = this.margins.top / 2;

    this.doc.text(`${timeTaken}s`, timeTextX, timeTextY);
  }
}

export default PdfFormatter;
