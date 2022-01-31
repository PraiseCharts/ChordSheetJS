import Handlebars from 'handlebars';

import '../template_helpers';
import HtmlFormatter from './html_formatter';
import './templates/html_div_formatter';
import { scopeCss } from '../utilities';

const { html_div_formatter: template } = Handlebars.templates;

const defaultCss = {
  '.chord:not(:last-child)': {
    paddingRight: '10px',
  },

  '.paragraph': {
    marginBottom: '1em',
  },

  '.row': {
    display: 'flex',
  },

  '.chord:after': {
    content: '\'\\200b\'',
  },

  '.lyrics:after': {
    content: '\'\\200b\'',
  },
};

/**
 * Formats a song into HTML. It uses DIVs to align lyrics with chords, which makes it useful for responsive web pages.
 */
class HtmlDivFormatter extends HtmlFormatter {
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
   * {@link HtmlDivFormatter}
   *
   * For example, execute cssString('.chordSheetViewer') will result in CSS like:
   *
   *     .chordSheetViewer .paragraph {
   *       margin-bottom: 1em;
   *     }
   *
   * @param scope the CSS scope to use, for example `.chordSheetViewer`
   * @returns {string} the CSS string
   */
  static cssString(scope = '') {
    return scopeCss(defaultCss, scope);
  }

  /**
   * Basic CSS, in object style à la useStyles, to use with output generated by {@link HtmlDivFormatter}
   *
   * Example:
   *
   *     '.paragraph': {
   *       marginBottom: '1em'
   *     }
   *
   * For a CSS string see {@link cssString}
   * @return {Object.<string, Object.<string, string>>} the CSS object
   */
  static cssObject() {
    return defaultCss;
  }
}

export default HtmlDivFormatter;
