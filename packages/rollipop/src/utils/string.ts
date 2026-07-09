const CARRIAGE_RETURN = '\r';
const LINE_FEED = '\n';

const CARRIAGE_RETURN_CHAR_CODE = CARRIAGE_RETURN.charCodeAt(0);
const LINE_FEED_CHAR_CODE = LINE_FEED.charCodeAt(0);
const SPACE_CHAR_CODE = ' '.charCodeAt(0);
const TAB_CHAR_CODE = '\t'.charCodeAt(0);

export interface StringRange {
  start: number;
  end: number;
}

export function indent(text: string, indent: number, space = ' ') {
  return text.replace(/^/gm, space.repeat(indent));
}

export function findLastNonEmptyLine(text: string): StringRange | null {
  let end = text.length;

  while (end > 0) {
    const previousLineBreak = text.lastIndexOf(LINE_FEED, end - 1);
    const start = previousLineBreak + 1;
    const lineEnd = text.charCodeAt(end - 1) === CARRIAGE_RETURN_CHAR_CODE ? end - 1 : end;

    if (lineEnd > start) {
      return { start, end: lineEnd };
    }

    if (previousLineBreak < 0) {
      return null;
    }

    end = previousLineBreak;
  }

  return null;
}

export function endsWithLineBreak(text: string) {
  if (text.length === 0) {
    return false;
  }

  const charCode = text.charCodeAt(text.length - 1);
  return charCode === LINE_FEED_CHAR_CODE || charCode === CARRIAGE_RETURN_CHAR_CODE;
}

export function findFirstNonInlineWhitespaceIndex(text: string, start: number, end = text.length) {
  let index = start;

  while (index < end) {
    const charCode = text.charCodeAt(index);

    if (charCode !== TAB_CHAR_CODE && charCode !== SPACE_CHAR_CODE) {
      break;
    }

    index += 1;
  }

  return index;
}
