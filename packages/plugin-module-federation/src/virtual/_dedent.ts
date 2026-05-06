import baseDedent from 'dedent';

// Opt out of dedent's escape-sequence unescaping so that `'` etc.
// embedded in interpolated values survive into the generated runtime
// code and are interpreted by the JS parser at runtime.
export const dedent = baseDedent.withOptions({ escapeSpecialCharacters: false });

// Embedded apostrophe inside generated single-quoted string literals.
// Emitted as `'` so the JS parser at runtime turns it into a literal
// apostrophe without terminating the surrounding string.
export const Q = '\\u0027';
