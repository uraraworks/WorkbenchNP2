export {
  Compartment, EditorState, RangeSet, RangeSetBuilder, StateEffect, StateField,
} from '@codemirror/state';
export {
  Decoration, EditorView, GutterMarker, crosshairCursor, drawSelection, dropCursor,
  gutter, highlightActiveLine, highlightActiveLineGutter, highlightSpecialChars, keymap,
  lineNumbers, rectangularSelection,
} from '@codemirror/view';
export {
  defaultKeymap, history, historyKeymap, indentLess, indentWithTab, insertTab,
} from '@codemirror/commands';
export {
  HighlightStyle, bracketMatching, defaultHighlightStyle, indentOnInput, indentUnit,
  syntaxHighlighting,
} from '@codemirror/language';
export { tags } from '@lezer/highlight';
export { cpp } from '@codemirror/lang-cpp';
export { lintGutter, setDiagnostics } from '@codemirror/lint';
