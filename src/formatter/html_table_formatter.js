import Handlebars from 'handlebars';

import '../handlebars_helpers';
import HtmlFormatter from './html_formatter';
import './templates/html_table_formatter';
import { scopeCss } from '../utilities';

const { html_table_formatter: template } = Handlebars.templates;

/**
 * Basic CSS, in object style à la useStyles, to use with output generated by {@link }HtmlTableFormatter}
 * For a CSS string see {@link scopedCss}
 * @type {Object.<string, Object.<string, string>>}
 */
export const defaultCss = {
  h1: {
    fontSize: '1.5em',
  },
  h2: {
    fontSize: '1.1em',
  },
  table: {
    borderSpacing: '0',
    color: 'inherit',
  },
  td: {
    padding: '3px 0',
  },
  '.chord:not(:last-child)': {
    paddingRight: '10px',
  },
  '.paragraph': {
    marginBottom: '1em',
  },
};

/**
 * Generates basic CSS, scoped within the provided selector, to use with output generated by {@link }HtmlTableFormatter}
 * @param scope the CSS scope to use, for example `.chordChartViewer`
 * @returns {string} the CSS string
 */
export function scopedCss(scope) {
  return scopeCss(defaultCss, scope);
}

/**
 * Formats a song into HTML. It uses TABLEs to align lyrics with chords, which makes the HTML for things like
 * PDF conversion.
 */
class HtmlTableFormatter extends HtmlFormatter {
  /**
   * Formats a song into HTML.
   * @param {Song} song The song to be formatted
   * @returns {string} The HTML string
   */
  format(song) {
    return this.formatWithTemplate(song, template);
  }

  /**
   * Generates basic CSS, optionally scoped within the provided selector, to use with output generated by
   * {@link HtmlTableFormatter}
   *
   * For example, execute cssString('.chordChartViewer') will result in CSS like:
   *
   *     .chordChartViewer .paragraph {
   *       margin-bottom: 1em;
   *     }
   *
   * @param scope the CSS scope to use, for example `.chordChartViewer`
   * @returns {string} the CSS string
   */
  static cssString(scope = '') {
    return scopeCss(defaultCss, scope);
  }

  /**
   * Basic CSS, in object style à la useStyles, to use with output generated by {@link HtmlTableFormatter}
   * For a CSS string see {@link cssString}
   *
   * Example:
   *
   *     '.paragraph': {
   *       marginBottom: '1em'
   *     }
   *
   * @return {Object.<string, Object.<string, string>>} the CSS object
   */
  static cssObject() {
    return defaultCss;
  }
}

export default HtmlTableFormatter;
