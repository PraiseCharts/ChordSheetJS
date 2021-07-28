import {
  ChordProParser,
  TextFormatter,
} from '../../src';

describe('chordpro to chord chart', () => {
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

    const expectedChordChart = `
A

A
B
artist is not X
c is unset
artist is B
title is set and c is unset`.substring(1);

    const song = new ChordProParser().parse(chordChart);
    const formatted = new TextFormatter().format(song);

    expect(formatted).toEqual(expectedChordChart);
  });

  it('skips the chordpro header', () => {
    const chordChart = `
{title: Let it be}
{subtitle: ChordChartJS example version}
{Chorus}

Let it [Am]be, let it [C/G]be, let it [F]be, let it [C]be
[C]Whisper words of [G]wisdom, let it [F]be [C/E] [Dm] [C]`.substring(1);

    const expectedChordChart = `
LET IT BE
ChordChartJS example version

       Am         C/G        F          C
Let it be, let it be, let it be, let it be
C                G              F  C/E Dm C
Whisper words of wisdom, let it be`.substring(1);

    const song = new ChordProParser().parse(chordChart);
    const formatted = new TextFormatter().format(song);

    expect(formatted).toEqual(expectedChordChart);
  });

  it('does not fail on empty chord chart', () => {
    const song = new ChordProParser().parse('');
    const formatted = new TextFormatter().format(song);

    expect(formatted).toEqual('');
  });
});
