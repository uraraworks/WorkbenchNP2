export { Compartment, EditorState } from '@codemirror/state';
export {
  EditorView, crosshairCursor, drawSelection, dropCursor, highlightActiveLine,
  highlightActiveLineGutter, highlightSpecialChars, keymap, lineNumbers,
  rectangularSelection,
} from '@codemirror/view';
export { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
export {
  bracketMatching, defaultHighlightStyle, indentOnInput, syntaxHighlighting,
} from '@codemirror/language';
export { cpp } from '@codemirror/lang-cpp';
export { lintGutter, setDiagnostics } from '@codemirror/lint';
