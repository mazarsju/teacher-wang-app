import { useMemo, useState, type ReactNode } from "react";
import type { Character } from "../types/character";
import {
  FINAL,
  isInvalidPinyinSyllable,
  parsePinyinSyllable,
  parseTone,
  START,
  type PinyinTone,
} from "../types/pinyin";

type GridCharacter = {
  char: string;
  pinyin: string;
  tone: PinyinTone | null;
};

type HoveredCell = {
  rowIndex: number;
  colIndex: number;
};

function formatStartLabel(start: string): string {
  return start === "" ? "—" : start;
}

export function getColumnMinWidthCh(finalValue: string): number {
  return Math.max(finalValue.length, 3);
}

export function chunkCharacters(
  characters: string[],
  lineSize = 3,
): string[] {
  const lines: string[] = [];

  for (let index = 0; index < characters.length; index += lineSize) {
    lines.push(characters.slice(index, index + lineSize).join(""));
  }

  return lines;
}

function getToneClassName(tone: PinyinTone | null): string {
  if (tone === null) {
    return "pinyin-grid-char-tone-none";
  }

  return `pinyin-grid-char-tone-${tone}`;
}

function chunkGridCharacters(
  characters: GridCharacter[],
  lineSize = 3,
): GridCharacter[][] {
  const lines: GridCharacter[][] = [];

  for (let index = 0; index < characters.length; index += lineSize) {
    lines.push(characters.slice(index, index + lineSize));
  }

  return lines;
}

function renderCellCharacters(
  characters: GridCharacter[],
  characterHasWords?: (char: string, pinyin: string) => boolean,
  onCharacterClick?: (char: string, pinyin: string) => void,
): ReactNode {
  const lines = chunkGridCharacters(characters);

  return (
    <span className="pinyin-grid-cell-content">
      {lines.map((line, lineIndex) => (
        <span key={lineIndex} className="pinyin-grid-cell-line">
          {line.map((item, itemIndex) => {
            const hasWords =
              characterHasWords?.(item.char, item.pinyin) ?? false;
            const toneClassName = getToneClassName(item.tone);

            return (
              <span
                key={`${item.char}-${item.pinyin}-${lineIndex}-${itemIndex}`}
                className={
                  hasWords
                    ? `${toneClassName} pinyin-grid-char-clickable`
                    : toneClassName
                }
                role={hasWords ? "button" : undefined}
                tabIndex={hasWords ? 0 : undefined}
                aria-label={
                  hasWords ? `${item.char} associated words` : undefined
                }
                onClick={
                  hasWords
                    ? () => onCharacterClick?.(item.char, item.pinyin)
                    : undefined
                }
                onKeyDown={
                  hasWords
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onCharacterClick?.(item.char, item.pinyin);
                        }
                      }
                    : undefined
                }
              >
                {item.char}
              </span>
            );
          })}
        </span>
      ))}
    </span>
  );
}

function groupCharactersByPinyin(
  characters: Character[],
): Map<string, Map<string, GridCharacter[]>> {
  const grid = new Map<string, Map<string, GridCharacter[]>>();

  for (const character of characters) {
    const readings = character.pinyin_readings ?? [character.pinyin];

    for (const reading of readings) {
      const syllable = parsePinyinSyllable(reading);
      if (syllable === null) {
        continue;
      }

      const { start, final } = syllable;
      const finalsForStart =
        grid.get(start) ?? new Map<string, GridCharacter[]>();
      const charsForCell = finalsForStart.get(final) ?? [];

      charsForCell.push({
        char: character.char,
        pinyin: reading,
        tone: parseTone(reading),
      });
      finalsForStart.set(final, charsForCell);
      grid.set(start, finalsForStart);
    }
  }

  return grid;
}

type PinyinGridViewProps = {
  characters: Character[];
  characterHasWords?: (char: string, pinyin: string) => boolean;
  onCharacterClick?: (char: string, pinyin: string) => void;
};

export default function PinyinGridView({
  characters,
  characterHasWords,
  onCharacterClick,
}: PinyinGridViewProps) {
  const [hoveredCell, setHoveredCell] = useState<HoveredCell | null>(null);
  const grid = useMemo(
    () => groupCharactersByPinyin(characters),
    [characters],
  );

  return (
    <div className="pinyin-grid-bleed">
      <div className="pinyin-grid-wrapper">
        <table
          className="pinyin-grid"
          onMouseLeave={() => setHoveredCell(null)}
        >
          <colgroup>
            <col className="pinyin-grid-corner-col" />
            {FINAL.map((finalValue) => (
              <col
                key={finalValue}
                className="pinyin-grid-final-col"
                style={{
                  minWidth: `${getColumnMinWidthCh(finalValue)}ch`,
                }}
              />
            ))}
          </colgroup>
        <thead>
          <tr>
            <th className="pinyin-grid-corner" scope="col">
              start \ final
            </th>
            {FINAL.map((finalValue) => (
              <th key={finalValue} scope="col">
                {finalValue}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {START.map((startValue, rowIndex) => (
            <tr key={startValue || "empty-start"}>
              <th className="pinyin-grid-row-header" scope="row">
                {formatStartLabel(startValue)}
              </th>
              {FINAL.map((finalValue, colIndex) => {
                const cellCharacters =
                  grid.get(startValue)?.get(finalValue) ?? [];
                const isInvalid = isInvalidPinyinSyllable(
                  startValue,
                  finalValue,
                );
                const isHighlighted =
                  !isInvalid &&
                  hoveredCell !== null &&
                  (hoveredCell.rowIndex === rowIndex ||
                    hoveredCell.colIndex === colIndex);

                return (
                  <td
                    key={finalValue}
                    className={
                      isInvalid
                        ? "pinyin-grid-cell-invalid"
                        : isHighlighted
                          ? "pinyin-grid-cell-highlight"
                          : undefined
                    }
                    onMouseEnter={() =>
                      setHoveredCell({ rowIndex, colIndex })
                    }
                  >
                    {cellCharacters.length > 0
                      ? renderCellCharacters(
                          cellCharacters,
                          characterHasWords,
                          onCharacterClick,
                        )
                      : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
