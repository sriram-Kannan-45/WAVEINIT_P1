import { useCallback, useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { Code2, Loader2, Search, PanelRightClose, PanelRightOpen } from 'lucide-react';

const LANGUAGES = [
  { id: 'javascript', label: 'JavaScript' },
  { id: 'python', label: 'Python' },
  { id: 'java', label: 'Java' },
  { id: 'cpp', label: 'C++' },
  { id: 'c', label: 'C' },
  { id: 'csharp', label: 'C#' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'go', label: 'Go' },
  { id: 'rust', label: 'Rust' },
  { id: 'php', label: 'PHP' },
  { id: 'kotlin', label: 'Kotlin' },
  { id: 'swift', label: 'Swift' },
];

const FONT_SIZES = [12, 13, 14, 15, 16, 18, 20, 22, 24];
const THEMES = ['vs-dark', 'vs', 'hc-black'];
const LANGUAGE_MONACO_MAP = {
  javascript: 'javascript', python: 'python', java: 'java', cpp: 'cpp',
  c: 'c', csharp: 'csharp', typescript: 'typescript', go: 'go',
  rust: 'rust', php: 'php', kotlin: 'kotlin', swift: 'swift',
};

const CodeEditor = ({
  value = '',
  language = 'javascript',
  onChange,
  onLanguageChange,
  readOnly = false,
  theme: initialTheme = 'dark',
}) => {
  const [theme, setTheme] = useState(initialTheme === 'dark' ? 'vs-dark' : 'vs');
  const [fontSize, setFontSize] = useState(14);
  const [currentLang, setCurrentLang] = useState(language);
  const [mounting, setMounting] = useState(true);
  const [minimap, setMinimap] = useState(true);
  const [wordWrap, setWordWrap] = useState(false);
  const editorRef = useRef(null);

  useEffect(() => { setCurrentLang(language) }, [language]);
  useEffect(() => { const t = setTimeout(() => setMounting(false), 300); return () => clearTimeout(t) }, []);

  const handleLanguageChange = useCallback((e) => {
    const newLang = e.target.value;
    setCurrentLang(newLang);
    if (onLanguageChange) onLanguageChange(newLang);
  }, [onLanguageChange]);

  const handleEditorDidMount = useCallback((editor) => {
    editorRef.current = editor;
    editor.focus();
    editor.addAction({ id: 'run-code', label: 'Run Code', keybindings: [2048 | 66], run: () => { const btn = document.querySelector('[data-run-button]'); if (btn) btn.click() } });
    editor.addAction({ id: 'submit-code', label: 'Submit Code', keybindings: [2048 | 13], run: () => { const btn = document.querySelector('[data-submit-button]'); if (btn) btn.click() } });
  }, []);

  const monacoLanguage = LANGUAGE_MONACO_MAP[currentLang] || 'javascript';

  const editorOptions = {
    fontSize,
    fontFamily: "'Fira Code', 'Cascadia Code', 'JetBrains Mono', 'Consolas', monospace",
    minimap: { enabled: minimap, scale: 1 },
    scrollBeyondLastLine: false,
    automaticLayout: true,
    readOnly,
    lineNumbers: 'on',
    renderLineHighlight: 'all',
    cursorBlinking: 'smooth',
    cursorSmoothCaretAnimation: 'on',
    smoothScrolling: true,
    bracketPairColorization: { enabled: true },
    autoIndenting: 'full',
    formatOnPaste: true,
    formatOnType: true,
    wordWrap: wordWrap ? 'on' : 'off',
    tabSize: 4,
    insertSpaces: true,
    detectIndentation: true,
    folding: true,
    foldingHighlight: true,
    foldingStrategy: 'indentation',
    glyphMargin: true,
    lineDecorationsWidth: 8,
    lineNumbersMinChars: 3,
    matchBrackets: 'always',
    occurrencesHighlight: 'singleFile',
    parameterHints: { enabled: true },
    quickSuggestions: true,
    suggestOnTriggerCharacters: true,
    acceptSuggestionOnEnter: 'on',
    tabCompletion: 'on',
    wordBasedSuggestions: 'currentDocument',
    codeLens: true,
    colorDecorators: true,
    selectionHighlight: true,
    unfoldOnClickAfterEndOfLine: true,
    guides: { indentation: true, bracketPairs: true, highlightActiveIndentation: true },
    hover: { enabled: true, sticky: true },
    autoClosingBrackets: 'always',
    autoClosingQuotes: 'always',
    autoClosingComments: 'always',
    autoSurround: 'always',
    contextmenu: true,
    copyWithSyntaxHighlighting: true,
    padding: { top: 8, bottom: 8 },
    suggestSelection: 'first',
    suggest: { showMethods: true, showFunctions: true, showConstructors: true, showFields: true, showVariables: true, showClasses: true, showStructs: true, showInterfaces: true, showModules: true, showProperties: true, showEvents: true, showOperators: true, showUnits: true, showValues: true, showConstants: true, showEnums: true, showEnumMembers: true, showKeywords: true, showWords: true, showColors: true, showFiles: true, showReferences: true, showSnippets: true },
    multiCursorModifier: 'alt',
    multiCursorMergeOverlapping: true,
    selectionClipboard: true,
    dragAndDrop: true,
    links: true,
    mouseWheelZoom: true,
    find: { addExtraSpaceOnTop: false, autoFindInSelection: 'never', seedSearchStringFromSelection: 'always' },
  };

  const toolbarStyle = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '6px 12px', background: theme === 'vs-dark' ? '#1e1e1e' : '#f3f3f3',
    borderBottom: theme === 'vs-dark' ? '1px solid #333' : '1px solid #e5e5e5',
    flexShrink: 0, gap: 8,
  };

  const selectStyle = {
    background: theme === 'vs-dark' ? '#2d2d2d' : '#fff',
    color: theme === 'vs-dark' ? '#ccc' : '#333',
    border: theme === 'vs-dark' ? '1px solid #555' : '1px solid #d4d4d4',
    borderRadius: 4, padding: '2px 8px', fontSize: 12,
    cursor: 'pointer', outline: 'none',
  };

  const btnStyle = {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '2px 8px', background: 'transparent',
    color: theme === 'vs-dark' ? '#888' : '#666',
    border: 'none', borderRadius: 4, cursor: 'pointer',
    fontSize: 11, fontWeight: 600,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: theme === 'vs-dark' ? '#1e1e1e' : '#ffffff' }}>
      <div style={toolbarStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Code2 size={14} color={theme === 'vs-dark' ? '#888' : '#666'} />
          <select value={currentLang} onChange={handleLanguageChange} style={selectStyle}>
            {LANGUAGES.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <select value={fontSize} onChange={e => setFontSize(Number(e.target.value))} style={selectStyle}>
            {FONT_SIZES.map(s => <option key={s} value={s}>{s}px</option>)}
          </select>
          <select value={theme} onChange={e => setTheme(e.target.value)} style={{ ...selectStyle, fontSize: 11 }}>
            <option value="vs-dark">Dark</option>
            <option value="vs">Light</option>
            <option value="hc-black">High Contrast</option>
          </select>
          <button onClick={() => setMinimap(!minimap)} style={btnStyle} title={minimap ? 'Hide minimap' : 'Show minimap'}>
            {minimap ? <PanelRightClose size={12} /> : <PanelRightOpen size={12} />}
          </button>
          <button onClick={() => setWordWrap(!wordWrap)} style={btnStyle} title={wordWrap ? 'Disable word wrap' : 'Enable word wrap'}>
            <Search size={12} /> {wordWrap ? 'Wrap On' : 'Wrap'}
          </button>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {mounting && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: theme === 'vs-dark' ? '#1e1e1e' : '#ffffff', zIndex: 10 }}>
            <Loader2 size={20} className="animate-spin" color="#14B8A6" />
          </div>
        )}
        <Editor height="100%" language={monacoLanguage} value={value} theme={theme} onChange={onChange} onMount={handleEditorDidMount} options={editorOptions} />
      </div>
    </div>
  );
};

export default CodeEditor;
