import Line, { LineType } from './line';
import Paragraph from './paragraph';
import Key from '../key';
import ChordLyricsPair from './chord_lyrics_pair';
import Metadata from './metadata';
import ParserWarning from '../parser/parser_warning';
import MetadataAccessors from './metadata_accessors';
import Item from './item';
import TraceInfo from './trace_info';
import FontStack from './font_stack';

import {
  ABC,
  BRIDGE, CHORUS, GRID, LILYPOND, Modifier, NONE, ParagraphType, TAB, VERSE,
} from '../constants';

import Tag, {
  CAPO,
  CHORUS as CHORUS_TAG, END_OF_ABC,
  END_OF_BRIDGE,
  END_OF_CHORUS,
  END_OF_GRID, END_OF_LY,
  END_OF_TAB,
  END_OF_VERSE,
  KEY,
  NEW_KEY, START_OF_ABC,
  START_OF_BRIDGE,
  START_OF_CHORUS,
  START_OF_GRID, START_OF_LY,
  START_OF_TAB,
  START_OF_VERSE,
  TRANSPOSE,
} from './tag';

const START_TAG_TO_SECTION_TYPE = {
  [START_OF_ABC]: ABC,
  [START_OF_BRIDGE]: BRIDGE,
  [START_OF_CHORUS]: CHORUS,
  [START_OF_GRID]: GRID,
  [START_OF_LY]: LILYPOND,
  [START_OF_TAB]: TAB,
  [START_OF_VERSE]: VERSE,
};

const END_TAG_TO_SECTION_TYPE = {
  [END_OF_ABC]: ABC,
  [END_OF_BRIDGE]: BRIDGE,
  [END_OF_CHORUS]: CHORUS,
  [END_OF_GRID]: GRID,
  [END_OF_LY]: LILYPOND,
  [END_OF_TAB]: TAB,
  [END_OF_VERSE]: VERSE,
};

type MapItemsCallback = (_item: Item) => Item | null;

type MapLinesCallback = (_line: Line) => Line | null;

/**
 * Represents a song in a chord sheet. Currently a chord sheet can only have one song.
 */
class Song extends MetadataAccessors {
  /**
   * The {@link Line} items of which the song consists
   * @member {Line[]}
   */
  lines: Line[] = [];

  /**
   * The song's metadata. When there is only one value for an entry, the value is a string. Else, the value is
   * an array containing all unique values for the entry.
   * @type {Metadata}
   */
  metadata: Metadata;

  _bodyLines: Line[] | null = null;

  _bodyParagraphs: Paragraph[] | null = null;

  currentKey: string | null = null;

  currentLine: Line | null = null;

  fontStack: FontStack = new FontStack();

  sectionType: ParagraphType = NONE;

  transposeKey: string | null = null;

  warnings: ParserWarning[] = [];

  /**
   * Creates a new {Song} instance
   * @param metadata {Object|Metadata} predefined metadata
   */
  constructor(metadata = {}) {
    super();
    this.metadata = new Metadata(metadata);
  }

  get previousLine(): Line | null {
    const count = this.lines.length;

    if (count >= 2) {
      return this.lines[count - 2];
    }

    return null;
  }

  /**
   * Returns the song lines, skipping the leading empty lines (empty as in not rendering any content). This is useful
   * if you want to skip the "header lines": the lines that only contain meta data.
   * @returns {Line[]} The song body lines
   */
  get bodyLines(): Line[] {
    if (!this._bodyLines) {
      this._bodyLines = this.selectRenderableItems(this.lines) as Line[];
    }

    return this._bodyLines;
  }

  /**
   * Returns the song paragraphs, skipping the paragraphs that only contain empty lines
   * (empty as in not rendering any content)
   * @see {@link bodyLines}
   * @returns {Paragraph[]}
   */
  get bodyParagraphs(): Paragraph[] {
    if (!this._bodyParagraphs) {
      this._bodyParagraphs = this.selectRenderableItems(this.paragraphs) as Paragraph[];
    }

    return this._bodyParagraphs;
  }

  selectRenderableItems(items: (Line | Paragraph)[]): (Line | Paragraph)[] {
    const copy = [...items];

    while (copy.length && !copy[0].hasRenderableItems()) {
      copy.shift();
    }

    return copy;
  }

  chords(chr: string): void {
    if (!this.currentLine) throw new Error('Expected this.currentLine to be present');
    this.currentLine.chords(chr);
  }

  lyrics(chr: string): void {
    this.ensureLine();
    if (!this.currentLine) throw new Error('Expected this.currentLine to be present');
    this.currentLine.lyrics(chr);
  }

  addLine(line?: Line): Line {
    if (line) {
      this.currentLine = line;
    } else {
      this.currentLine = new Line();
      this.lines.push(this.currentLine);
    }

    this.setCurrentProperties(this.sectionType);
    this.currentLine.transposeKey = this.transposeKey ?? this.currentKey;
    this.currentLine.key = this.currentKey || this.metadata.getSingle(KEY);
    this.currentLine.lineNumber = this.lines.length - 1;
    return this.currentLine;
  }

  private expandLine(line: Line): Line[] {
    const expandedLines = line.items.flatMap((item: Item) => {
      if (item instanceof Tag && item.name === CHORUS_TAG) {
        return this.getLastChorusBefore(line.lineNumber);
      }

      return [];
    });

    return [line, ...expandedLines];
  }

  private getLastChorusBefore(lineNumber: number | null): Line[] {
    const lines: Line[] = [];

    if (!lineNumber) {
      return lines;
    }

    for (let i = lineNumber - 1; i >= 0; i -= 1) {
      const line = this.lines[i];

      if (line.type === CHORUS) {
        const filteredLine = this.filterChorusStartEndDirectives(line);

        if (!(line.isNotEmpty() && filteredLine.isEmpty())) {
          lines.unshift(line);
        }
      } else if (lines.length > 0) {
        break;
      }
    }

    return lines;
  }

  private filterChorusStartEndDirectives(line: Line) {
    return line.mapItems((item: Item) => {
      if (item instanceof Tag) {
        if (item.name === START_OF_CHORUS || item.name === END_OF_CHORUS) {
          return null;
        }
      }

      return item;
    });
  }

  /**
   * The {@link Paragraph} items of which the song consists
   * @member {Paragraph[]}
   */
  get paragraphs(): Paragraph[] {
    return this.linesToParagraphs(this.lines);
  }

  /**
   * The body paragraphs of the song, with any `{chorus}` tag expanded into the targeted chorus
   * @type {Paragraph[]}
   */
  get expandedBodyParagraphs(): Paragraph[] {
    return this.selectRenderableItems(
      this.linesToParagraphs(
        this.lines.flatMap((line: Line) => this.expandLine(line)),
      ),
    ) as Paragraph[];
  }

  linesToParagraphs(lines: Line[]) {
    let currentParagraph = new Paragraph();
    const paragraphs = [currentParagraph];

    lines.forEach((line, index) => {
      const nextLine: Line | null = lines[index + 1] || null;

      if (line.isEmpty() || (line.isSectionEnd() && nextLine && !nextLine.isEmpty())) {
        currentParagraph = new Paragraph();
        paragraphs.push(currentParagraph);
      } else if (line.hasRenderableItems()) {
        currentParagraph.addLine(line);
      }
    });

    return paragraphs;
  }

  setCurrentProperties(sectionType: ParagraphType): void {
    if (!this.currentLine) throw new Error('Expected this.currentLine to be present');

    this.currentLine.type = sectionType as LineType;
    this.currentLine.textFont = this.fontStack.textFont.clone();
    this.currentLine.chordFont = this.fontStack.chordFont.clone();
  }

  ensureLine(): void {
    if (this.currentLine === null) {
      this.addLine();
    }
  }

  addTag(tagContents: string | Tag): Tag {
    const tag = Tag.parseOrFail(tagContents);
    this.applyTagOnSong(tag);
    this.applyTagOnLine(tag);
    return tag;
  }

  private applyTagOnLine(tag: Tag) {
    this.ensureLine();
    if (!this.currentLine) throw new Error('Expected this.currentLine to be present');
    this.currentLine.addTag(tag);
  }

  private applyTagOnSong(tag: Tag) {
    if (tag.isMetaTag()) {
      this.setMetadata(tag.name, tag.value || '');
    } else if (tag.name === TRANSPOSE) {
      this.transposeKey = tag.value;
    } else if (tag.name === NEW_KEY) {
      this.currentKey = tag.value;
    } else if (tag.isSectionDelimiter()) {
      this.setSectionTypeFromTag(tag);
    } else if (tag.isInlineFontTag()) {
      this.fontStack.applyTag(tag);
    }
  }

  setSectionTypeFromTag(tag: Tag): void {
    if (tag.name in START_TAG_TO_SECTION_TYPE) {
      this.startSection(START_TAG_TO_SECTION_TYPE[tag.name], tag);
      return;
    }

    if (tag.name in END_TAG_TO_SECTION_TYPE) {
      this.endSection(END_TAG_TO_SECTION_TYPE[tag.name], tag);
    }
  }

  startSection(sectionType: ParagraphType, tag: Tag): void {
    this.checkCurrentSectionType(NONE, tag);
    this.sectionType = sectionType;
    this.setCurrentProperties(sectionType);
  }

  endSection(sectionType: ParagraphType, tag: Tag): void {
    this.checkCurrentSectionType(sectionType, tag);
    this.sectionType = NONE;
  }

  checkCurrentSectionType(sectionType: ParagraphType, tag: Tag): void {
    if (this.sectionType !== sectionType) {
      this.addWarning(`Unexpected tag {${tag.originalName}}, current section is: ${this.sectionType}`, tag);
    }
  }

  addWarning(message: string, { line, column }: TraceInfo): void {
    const warning = new ParserWarning(message, line || null, column || null);
    this.warnings.push(warning);
  }

  addItem(item: Item): void {
    if (item instanceof Tag) {
      this.addTag(item);
    } else {
      this.ensureLine();
      if (!this.currentLine) throw new Error('Expected this.currentLine to be present');
      this.currentLine.addItem(item);
    }
  }

  /**
   * Returns a deep clone of the song
   * @returns {Song} The cloned song
   */
  clone(): Song {
    return this.mapItems((item) => item);
  }

  setMetadata(name: string, value: string): void {
    this.metadata.add(name, value);
  }

  getMetadata(name: string): string | string[] | null {
    return this.metadata.getMetadata(name);
  }

  getSingleMetadata(name: string): string | null {
    return this.metadata.getSingleMetadata(name);
  }

  /**
   * Returns a copy of the song with the key value set to the specified key. It changes:
   * - the value for `key` in the {@link metadata} set
   * - any existing `key` directive
   * @param {number|null} key the key. Passing `null` will:
   * - remove the current key from {@link metadata}
   * - remove any `key` directive
   * @returns {Song} The changed song
   */
  setKey(key: string | number | null): Song {
    const strKey = key ? key.toString() : null;
    return this.changeMetadata(KEY, strKey);
  }

  /**
   * Returns a copy of the song with the key value set to the specified capo. It changes:
   * - the value for `capo` in the {@link metadata} set
   * - any existing `capo` directive
   * @param {number|null} capo the capo. Passing `null` will:
   * - remove the current key from {@link metadata}
   * - remove any `capo` directive
   * @returns {Song} The changed song
   */
  setCapo(capo: number | null): Song {
    const strCapo = capo ? capo.toString() : null;
    return this.changeMetadata(CAPO, strCapo);
  }

  private setDirective(name: string, value: string | null): Song {
    if (value === null) {
      return this.removeItem((item: Item) => item instanceof Tag && item.name === name);
    }

    return this.updateItem(
      (item: Item) => item instanceof Tag && item.name === name,
      (item: Item) => (('set' in item) ? item.set({ value }) : item),
      (song: Song) => song.insertDirective(name, value),
    );
  }

  /**
   * Transposes the song by the specified delta. It will:
   * - transpose all chords, see: {@link Chord#transpose}
   * - transpose the song key in {@link metadata}
   * - update any existing `key` directive
   * @param {number} delta The number of semitones (positive or negative) to transpose with
   * @param {Object} [options={}] options
   * @param {boolean} [options.normalizeChordSuffix=false] whether to normalize the chord suffixes after transposing
   * @returns {Song} The transposed song
   */
  transpose(delta: number, { normalizeChordSuffix = false } = {}): Song {
    let transposedKey: Key | null = null;
    const song = (this as Song);

    return song.mapItems((item) => {
      if (item instanceof Tag && item.name === KEY) {
        transposedKey = Key.wrapOrFail(item.value).transpose(delta);
        return item.set({ value: transposedKey.toString() });
      }

      if (item instanceof ChordLyricsPair) {
        return item.transpose(delta, transposedKey, { normalizeChordSuffix });
      }

      return item;
    });
  }

  /**
   * Transposes the song up by one semitone. It will:
   * - transpose all chords, see: {@link Chord#transpose}
   * - transpose the song key in {@link metadata}
   * - update any existing `key` directive
   * @param {Object} [options={}] options
   * @param {boolean} [options.normalizeChordSuffix=false] whether to normalize the chord suffixes after transposing
   * @returns {Song} The transposed song
   */
  transposeUp({ normalizeChordSuffix = false } = {}): Song {
    return this.transpose(1, { normalizeChordSuffix });
  }

  /**
   * Transposes the song down by one semitone. It will:
   * - transpose all chords, see: {@link Chord#transpose}
   * - transpose the song key in {@link metadata}
   * - update any existing `key` directive
   * @param {Object} [options={}] options
   * @param {boolean} [options.normalizeChordSuffix=false] whether to normalize the chord suffixes after transposing
   * @returns {Song} The transposed song
   */
  transposeDown({ normalizeChordSuffix = false } = {}): Song {
    return this.transpose(-1, { normalizeChordSuffix });
  }

  /**
   * Returns a copy of the song with the key set to the specified key. It changes:
   * - the value for `key` in the {@link metadata} set
   * - any existing `key` directive
   * - all chords, those are transposed according to the distance between the current and the new key
   * @param {string} newKey The new key.
   * @returns {Song} The changed song
   */
  changeKey(newKey: string | Key): Song {
    const currentKey = this.requireCurrentKey();
    const targetKey = Key.wrapOrFail(newKey);
    const delta = currentKey.distanceTo(targetKey);
    const transposedSong = this.transpose(delta);

    if (targetKey.modifier) {
      return transposedSong.useModifier(targetKey.modifier);
    }

    return transposedSong;
  }

  /**
   * Returns a copy of the song with all chords changed to the specified modifier.
   * @param {Modifier} modifier the new modifier
   * @returns {Song} the changed song
   */
  useModifier(modifier: Modifier) {
    return this.mapItems((item) => {
      if (item instanceof ChordLyricsPair) {
        return (item as ChordLyricsPair).useModifier(modifier);
      }

      return item;
    });
  }

  requireCurrentKey(): Key {
    const wrappedKey = Key.wrap(this.key);

    if (!wrappedKey) {
      throw new Error(`
Cannot change song key, the original key is unknown.

Either ensure a key directive is present in the song (when using chordpro):
  \`{key: C}\`

Or set the song key before changing key:
  \`song.setKey('C');\``.substring(1));
    }

    return wrappedKey;
  }

  /**
   * Returns a copy of the song with the directive value set to the specified value.
   * - when there is a matching directive in the song, it will update the directive
   * - when there is no matching directive, it will be inserted
   * If `value` is `null` it will act as a delete, any directive matching `name` will be removed.
   * @param {string} name The directive name
   * @param {string | null} value The value to set, or `null` to remove the directive
   */
  changeMetadata(name: string, value: string | null): Song {
    const updatedSong = this.setDirective(name, value);
    updatedSong.metadata.set(name, value);
    return updatedSong;
  }

  private insertDirective(name: string, value: string, { after = null } = {}): Song {
    const insertIndex = this.lines.findIndex((line) => (
      line.items.some((item) => (
        !(item instanceof Tag) || (after && item.name === after)
      ))
    ));

    const newLine = new Line();
    newLine.addTag(name, value);

    const clonedSong = this.clone();
    const { lines } = clonedSong;
    clonedSong.lines = [...lines.slice(0, insertIndex), newLine, ...lines.slice(insertIndex)];

    return clonedSong;
  }

  /**
   * Change the song contents inline. Return a new {@link Item} to replace it. Return `null` to remove it.
   * @example
   * // transpose all chords:
   * song.mapItems((item) => {
   *   if (item instanceof ChordLyricsPair) {
   *     return item.transpose(2, 'D');
   *   }
   *
   *   return item;
   * });
   * @param {MapItemsCallback} func the callback function
   * @returns {Song} the changed song
   */
  mapItems(func: MapItemsCallback): Song {
    const clonedSong = new Song();

    this.lines.forEach((line) => {
      clonedSong.addLine();

      line.items.forEach((item) => {
        const changedItem = func(item);

        if (changedItem) {
          clonedSong.addItem(changedItem);
        }
      });
    });

    return clonedSong;
  }

  /**
   * Change the song contents inline. Return a new {@link Line} to replace it. Return `null` to remove it.
   * @example
   * // remove lines with only Tags:
   * song.mapLines((line) => {
   *   if (line.items.every(item => item instanceof Tag)) {
   *     return null;
   *   }
   *
   *   return line;
   * });
   * @param {MapLinesCallback} func the callback function
   * @returns {Song} the changed song
   */
  mapLines(func: MapLinesCallback): Song {
    const clonedSong = new Song();

    this.lines.forEach((line) => {
      const changedLine = func(line);

      if (changedLine) {
        clonedSong.addLine();
        changedLine.items.forEach((item) => clonedSong.addItem(item));
      }
    });

    return clonedSong;
  }

  private updateItem(
    findCallback: (_item: Item) => boolean,
    updateCallback: (_item: Item) => Item,
    notFoundCallback: (_song: Song) => Song,
  ): Song {
    let found = false;

    const updatedSong = this.mapItems((item) => {
      if (findCallback(item)) {
        found = true;
        return updateCallback(item);
      }

      return item;
    });

    if (!found) {
      return notFoundCallback(updatedSong);
    }

    return updatedSong;
  }

  private removeItem(callback: (_item: Item) => boolean): Song {
    return this.mapLines((line) => {
      const { items } = line;
      const index = items.findIndex(callback);

      if (index === -1) {
        return line;
      }

      if (items.length === 1) {
        return null;
      }

      return line.set({
        items: [...items.slice(0, index), ...items.slice(index + 1)],
      });
    });
  }
}

export default Song;
