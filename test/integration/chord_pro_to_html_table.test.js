import {
  ChordProParser,
  HtmlTableFormatter,
} from '../../src';

describe('chordpro to HTML with TABLEs', () => {
  it('correctly parses and formats meta expressions', () => {
    const chordChart = `
{title: A}
{artist: B}
%{title}
%{artist|%{}}
%{artist=X|artist is X|artist is not X}
%{c|c is set|c is unset}
%{artist|artist is %{}|artist is unset}
%{title|title is set and c is %{c|set|unset}|title is unset}`.substring(1);

    const expectedChordChart = '<h1>A</h1>'
      + '<div class="chord-sheet">'
        + '<div class="paragraph">'
          + '<table class="row">'
            + '<tr>'
              + '<td class="lyrics">A</td>'
            + '</tr>'
          + '</table>'
          + '<table class="row">'
            + '<tr>'
              + '<td class="lyrics">B</td>'
            + '</tr>'
          + '</table>'
          + '<table class="row">'
            + '<tr>'
              + '<td class="lyrics">artist is not X</td>'
            + '</tr>'
          + '</table>'
          + '<table class="row">'
            + '<tr>'
              + '<td class="lyrics">c is unset</td>'
            + '</tr>'
          + '</table>'
          + '<table class="row">'
            + '<tr>'
              + '<td class="lyrics">artist is B</td>'
            + '</tr>'
          + '</table>'
          + '<table class="row">'
            + '<tr>'
              + '<td class="lyrics">title is set and c is unset</td>'
            + '</tr>'
          + '</table>'
        + '</div>'
      + '</div>';

    const song = new ChordProParser().parse(chordChart);
    const formatted = new HtmlTableFormatter().format(song);

    expect(formatted).toEqual(expectedChordChart);
  });

  it('does not fail on empty chord chart', () => {
    const song = new ChordProParser().parse('');
    const formatted = new HtmlTableFormatter().format(song);

    expect(formatted).toEqual('');
  });
});
