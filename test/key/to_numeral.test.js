/* eslint quote-props: 0 */

import { Key } from '../../src';

import '../matchers';

const examples = {
  'C': {
    'C': 'I',
    'C#': '#I',
    'D': 'II',
    'D#': '#II',
    'B': 'VII',

    '1': 'I',
    '#1': '#I',
    '2': 'II',
    '#2': '#II',
    '7': 'VII',
  },

  'C#': {
    'D#': 'II',
    'E': '#II',
    'D': '#I',
    'G': '#IV',

    '2': 'II',
    '#2': '#II',
    '#1': '#I',
    '#4': '#IV',
  },

  'Eb': {
    'F': 'II',
    'Gb': 'bIII',
    'E': 'bII',

    '2': 'II',
    'b3': 'bIII',
    'b2': 'bII',
  },

  'B': {
    'F#': 'V',
    'A#': 'VII',

    '5': 'V',
    '7': 'VII',
  },
};

describe('Key', () => {
  describe('toNumeral', () => {
    Object.entries(examples).forEach(([songKeyString, conversions]) => {
      const songKey = Key.parse(songKeyString);

      Object.entries(conversions).forEach(([symbolKey, numeralKey]) => {
        it(`converts ${symbolKey} to ${numeralKey} (actual key: ${songKey})`, () => {
          const key = Key.parse(symbolKey);
          const numeralString = key.toNumeralString(songKey);
          expect(numeralString).toEqual(numeralKey);
        });
      });
    });

    it('returns a clone when the key is already numeral', () => {
      const key = new Key({ note: 5, modifier: '#' });
      const numeralKey = key.toNumeral();

      expect(numeralKey).toBeKey({ note: 'V', modifier: '#' });
      expect(numeralKey).not.toBe(key);
    });
  });
});
