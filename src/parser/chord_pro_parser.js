import ChordProPegParser from './chord_pro_peg_parser';
import ChordChartSerializer from '../chord_chart_serializer';

/**
 * Parses a ChordPro chord chart
 */
class ChordProParser {
  /**
   * Parses a ChordPro chord chart into a song
   * @param {string} chordProChordChart the ChordPro chord chart
   * @returns {Song} The parsed song
   */
  parse(chordProChordChart) {
    /**
     * All warnings raised during parsing the ChordPro chord chart
     * @member
     * @type {Array<ParserWarning>}
     */
    const ast = ChordProPegParser.parse(chordProChordChart);
    this.song = new ChordChartSerializer().deserialize(ast);
    return this.song;
  }

  /**
   * All warnings raised during parsing the ChordPro chord chart
   * @member
   * @type {ParserWarning[]}
   */
  get warnings() {
    return this.song.warnings;
  }
}

export default ChordProParser;
