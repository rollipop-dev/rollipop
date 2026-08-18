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

/**
 * Rewrite only the *host* of the `//# sourceMappingURL=...` comment so it points
 * at the address the requesting client can actually reach.
 *
 * Rollipop builds the source-map URL from the dev server's bind address (often
 * `0.0.0.0`), which the device cannot route to. The Dev Client / React Native
 * LogBox inspector fetches the `.map` from that URL to render the error
 * code-frame; with an unreachable host it hangs on "Loading, please wait".
 * Metro avoids this by writing the host the client reached. We mirror that here
 * by swapping in the incoming request's `host` header (e.g. the LAN IP the
 * phone used), leaving path/query intact. No-op when there is no sourcemap
 * comment or the host is missing.
 */
export function rewriteSourceMappingUrlHost(code: string, host: string): string {
  const lastLine = findLastNonEmptyLine(code);
  if (lastLine == null || !isSourceMappingUrlCommentLine(code, lastLine.start, lastLine.end)) {
    return code;
  }

  const prefix = code.slice(0, lastLine.start);
  const match = code
    .slice(lastLine.start, lastLine.end)
    .match(/^(.*sourceMappingURL=)(https?:\/\/[^/]+)(.*)$/s);
  if (match == null) {
    return code;
  }

  const schemeAuthority = host.includes('://') ? host : `http://${host}`;
  let original: URL;
  let incoming: URL;
  try {
    original = new URL(match[2]);
    incoming = new URL(schemeAuthority);
  } catch {
    // Missing/invalid host header (or malformed source URL) — leave the
    // comment untouched rather than failing the whole bundle response.
    return code;
  }
  original.host = incoming.host;
  original.protocol = incoming.protocol;
  const rewritten = `${match[1]}${original.origin}${match[3]}`;
  return `${prefix}${rewritten}`;
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
