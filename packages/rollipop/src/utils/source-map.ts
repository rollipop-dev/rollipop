import {
  endsWithLineBreak,
  findFirstNonInlineWhitespaceIndex,
  findLastNonEmptyLine,
} from './string';

const SOURCE_MAPPING_URL_PREFIX = 'sourceMappingURL=';
const HASH_SOURCE_MAPPING_COMMENT_MARKER = '#';
const AT_SOURCE_MAPPING_COMMENT_MARKER = '@';
const LINE_COMMENT_PREFIX = '//';

export function replaceSourceMappingUrl(code: string, sourceMapUrl: string) {
  const comment = `//# sourceMappingURL=${sourceMapUrl}`;
  const lastLine = findLastNonEmptyLine(code);

  if (lastLine != null && isSourceMappingUrlCommentLine(code, lastLine.start, lastLine.end)) {
    return `${code.slice(0, lastLine.start)}${comment}`;
  }

  return `${code}${endsWithLineBreak(code) ? '' : '\n'}${comment}`;
}

function isSourceMappingUrlCommentLine(code: string, start: number, end: number) {
  if (!code.startsWith(LINE_COMMENT_PREFIX, start)) {
    return false;
  }

  let index = findFirstNonInlineWhitespaceIndex(code, start + LINE_COMMENT_PREFIX.length, end);
  const commentType = code[index];

  if (
    commentType !== HASH_SOURCE_MAPPING_COMMENT_MARKER &&
    commentType !== AT_SOURCE_MAPPING_COMMENT_MARKER
  ) {
    return false;
  }

  index = findFirstNonInlineWhitespaceIndex(
    code,
    index + HASH_SOURCE_MAPPING_COMMENT_MARKER.length,
    end,
  );

  return code.startsWith(SOURCE_MAPPING_URL_PREFIX, index);
}
