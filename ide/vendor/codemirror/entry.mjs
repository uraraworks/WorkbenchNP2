export {
  Compartment, EditorState, RangeSet, RangeSetBuilder, StateEffect, StateField,
} from '@codemirror/state';
export {
  Decoration, EditorView, GutterMarker, crosshairCursor, drawSelection, dropCursor,
  gutter, highlightActiveLine, highlightActiveLineGutter, highlightSpecialChars, keymap,
  lineNumbers, rectangularSelection,
} from '@codemirror/view';
export { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
export {
  bracketMatching, defaultHighlightStyle, indentOnInput, syntaxHighlighting,
} from '@codemirror/language';
export { cpp } from '@codemirror/lang-cpp';
export { lintGutter, setDiagnostics } from '@codemirror/lint';
