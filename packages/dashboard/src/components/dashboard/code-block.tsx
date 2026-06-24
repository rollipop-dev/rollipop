import {
  Highlight,
  themes,
  type PrismTheme,
  type RenderProps,
  type Token,
} from 'prism-react-renderer';
import type { ReactNode } from 'react';

import type { Theme } from '../../types/dashboard';
import { ScrollArea } from '../ui/scroll-area';

const LIGHT_CODE_THEME: PrismTheme = {
  ...themes.oneLight,
  plain: {
    ...themes.oneLight.plain,
    background: '#ffffff',
    backgroundColor: '#ffffff',
  },
};

export function CodeBlock({
  code,
  language,
  theme,
  startLineNumber = 1,
  showLineNumbers = true,
  lineNumbers,
  highlightLineIndex,
  highlightLineNumber,
  highlightColumn,
  trim = true,
  scrollable = true,
}: {
  code: string;
  language: string;
  theme: Theme;
  startLineNumber?: number;
  showLineNumbers?: boolean;
  lineNumbers?: Array<number | null>;
  highlightLineIndex?: number | null;
  highlightLineNumber?: number | null;
  highlightColumn?: number | null;
  trim?: boolean;
  scrollable?: boolean;
}) {
  const highlightedCode = trim ? code.trim() : code;

  return (
    <Highlight
      code={highlightedCode.length === 0 ? ' ' : highlightedCode}
      language={language}
      theme={theme === 'dark' ? themes.vsDark : LIGHT_CODE_THEME}
    >
      {({ className, style, tokens, getLineProps, getTokenProps }) => {
        const content = (
          <pre
            className={`${className} w-max min-w-full p-4 font-mono text-[13px] leading-6`}
            style={style}
          >
            {tokens.map((line, index) => {
              const lineNumber =
                lineNumbers === undefined ? startLineNumber + index : (lineNumbers[index] ?? null);
              const selectedLine =
                highlightLineIndex != null
                  ? index === highlightLineIndex
                  : lineNumber != null &&
                    highlightLineNumber != null &&
                    lineNumber === highlightLineNumber;
              const pointColumn =
                selectedLine && highlightColumn != null ? Math.max(0, highlightColumn) : null;
              const lineTextLength = line.reduce(
                (length, token) => length + token.content.length,
                0,
              );
              let tokenStart = 0;

              return (
                <div key={index} {...getLineProps({ line })} className="table-row">
                  {showLineNumbers && (
                    <span
                      className={[
                        'table-cell select-none pr-4 text-right opacity-45',
                        selectedLine ? 'bg-primary/10 text-primary opacity-100' : '',
                      ].join(' ')}
                    >
                      {lineNumber}
                    </span>
                  )}
                  <span className={selectedLine ? 'table-cell bg-primary/10' : 'table-cell'}>
                    {line.map((token, tokenIndex) => {
                      const renderedToken = renderTokenWithPoint({
                        token,
                        tokenIndex,
                        tokenStart,
                        pointColumn,
                        getTokenProps,
                      });
                      tokenStart += token.content.length;

                      return renderedToken;
                    })}
                    {pointColumn != null && pointColumn >= lineTextLength
                      ? renderColumnMarker('selected-column-end')
                      : null}
                  </span>
                </div>
              );
            })}
          </pre>
        );

        return scrollable ? (
          <ScrollArea className="h-full min-h-0 overflow-hidden rounded-b-xl">{content}</ScrollArea>
        ) : (
          <div className="h-full min-h-0 overflow-x-auto overflow-y-hidden rounded-b-xl">
            {content}
          </div>
        );
      }}
    </Highlight>
  );
}

function renderTokenWithPoint({
  token,
  tokenIndex,
  tokenStart,
  pointColumn,
  getTokenProps,
}: {
  token: Token;
  tokenIndex: number;
  tokenStart: number;
  pointColumn: number | null;
  getTokenProps: RenderProps['getTokenProps'];
}) {
  const tokenEnd = tokenStart + token.content.length;

  if (pointColumn == null || pointColumn < tokenStart || pointColumn >= tokenEnd) {
    return <span key={tokenIndex} {...getTokenProps({ token })} />;
  }

  const localColumn = pointColumn - tokenStart;
  const before = token.content.slice(0, localColumn);
  const selected = token.content.slice(localColumn, localColumn + 1);
  const after = token.content.slice(localColumn + 1);
  const parts: ReactNode[] = [];

  if (before.length > 0) {
    parts.push(
      <span
        key={`${tokenIndex}-before`}
        {...getTokenProps({ token: { ...token, content: before } })}
      />,
    );
  }

  const selectedProps = getTokenProps({ token: { ...token, content: selected } });
  parts.push(
    <span
      key={`${tokenIndex}-point`}
      {...selectedProps}
      className={`${selectedProps.className} inline-block min-w-[1ch] rounded-[2px] bg-primary/35 ring-1 ring-primary/40`}
    />,
  );

  if (after.length > 0) {
    parts.push(
      <span
        key={`${tokenIndex}-after`}
        {...getTokenProps({ token: { ...token, content: after } })}
      />,
    );
  }

  return parts;
}

function renderColumnMarker(key: string) {
  return (
    <span
      key={key}
      className="inline-block h-[1.25em] w-[1ch] rounded-[2px] bg-primary/35 align-[-0.2em] ring-1 ring-primary/40"
      aria-hidden="true"
    />
  );
}
