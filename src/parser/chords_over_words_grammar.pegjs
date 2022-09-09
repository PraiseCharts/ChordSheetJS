ChordSheet
  = frontMatterLines:FrontMatter? lines:ChordSheetContents? {
      return {
        type: "chordSheet",
        lines: [
          ...frontMatterLines,
          ...lines,
        ]
      };
    }

ChordSheetContents
  = NewLine items:ChordSheetItem* {
    return items;
  }

ChordSheetItem
  = item:(ChordLyricsLines / LyricsLine) NewLine {
    return item;
  }

ChordLyricsLines
  = chords:ChordsLine NewLine lyrics:Lyrics {
      const chordLyricsPairs = chords.map((chord, i) => {
         const nextChord = chords[i + 1];
         const start = chord.column - 1;
         const end = nextChord ? nextChord.column - 1 : lyrics.length;

         return {
           type: "chordLyricsPair",
           chord,
           lyrics: lyrics.substring(start, end)
         };
      });

      const firstChord = chords[0];

      if (firstChord && chords[0].column > 0) {
      	const firstChordPosition = firstChord.column;

        if (firstChordPosition > 0) {
          chordLyricsPairs.unshift({
            type: "chordLyricsPair",
            chord: null,
            lyrics: lyrics.substring(0, firstChordPosition - 1),
          });
        }
      }

      return { type: "line", items: chordLyricsPairs };
    }

ChordsLine
  = ChordWithSpacing+

LyricsLine
  = lyrics:Lyrics {
  	if (lyrics.length === 0) {
      return { type: "line", items: [] };
    }

    return {
      type: "line",
      items: [
        { type: "tag", name: "comment", value: lyrics }
      ]
    };
  }

Lyrics
  = $(WordChar*)

WordChar
  = [^\n\r]

ChordWithSpacing
  = _ chord:Chord _ {
      return chord;
    }

Chord
  = chordSymbol:ChordSymbol {
    return { type: "chord", ...chordSymbol, column: location().start.column };
  }

ChordSymbol
  = root:ChordSymbolRoot modifier:ChordModifier? suffix:$(ChordSuffix) bass:ChordBass? {
  	  return { base: root, modifier, suffix, ...bass };
    }

ChordSymbolRoot
  = [A-Ga-g]

ChordModifier
  = "#" / "b"

ChordSuffix
  = [a-zA-Z0-9]*

ChordBass
  = "/" root:ChordSymbolRoot modifier:ChordModifier? {
      return { bassBase: root, bassModifier: modifier };
    }

FrontMatter
  = pairs:FrontMatterPair* FrontMatterSeparator {
      return pairs.map(([key, value]) => ({
        type: "line",
        items: [
          { type: "tag", name: key, value },
        ],
      }));
    }

FrontMatterPair
  = key:$(FrontMatterKey) _ ":" _ value:$(FrontMatterValue) NewLine {
      return [key, value];
    }

FrontMatterKey
  = [^\n\r\t: -]+

FrontMatterValue
  = [^\n\r]+

FrontMatterSeparator
  = "---"

_ "whitespace"
  = [ \t]*

NewLine
  = CarriageReturn / LineFeed / CarriageReturnLineFeed

CarriageReturnLineFeed
  = CarriageReturn LineFeed

LineFeed
  = "\n"

CarriageReturn
  = "\r"
