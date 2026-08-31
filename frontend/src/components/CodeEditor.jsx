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
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 16px',
    background: theme === 'vs-dark' ? '#15191F' : '#F8FAFC',
    borderBottom: theme === 'vs-dark' ? '1px solid #242B35' : '1px solid #E2E8F0',
    flexShrink: 0,
    gap: 12,
  };

  const selectStyle = {
    background: theme === 'vs-dark' ? '#1C222B' : '#FFFFFF',
    color: theme === 'vs-dark' ? '#F8FAFC' : '#0F172A',
    border: theme === 'vs-dark' ? '1px solid #2E3744' : '1px solid #CBD5E1',
    borderRadius: 8,
    padding: '5px 12px',
    fontSize: 12.5,
    fontWeight: 500,
    cursor: 'pointer',
    outline: 'none',
    transition: 'border-color 0.15s ease',
  };

  const btnStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '5px 10px',
    background: theme === 'vs-dark' ? '#1C222B' : '#F1F5F9',
    color: theme === 'vs-dark' ? '#94A3B8' : '#475569',
    border: theme === 'vs-dark' ? '1px solid #2E3744' : '1px solid #E2E8F0',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 11.5,
    fontWeight: 600,
    transition: 'all 0.15s ease',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: theme === 'vs-dark' ? '#15191F' : '#FFFFFF' }}>
      <div style={toolbarStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: theme === 'vs-dark' ? '#1C222B' : '#FFFFFF',
            border: theme === 'vs-dark' ? '1px solid #2E3744' : '1px solid #CBD5E1',
            borderRadius: 8,
            padding: '2px 8px 2px 10px',
          }}>
            <Code2 size={14} color="#15803D" />
            <select
              value={currentLang}
              onChange={handleLanguageChange}
              style={{
                background: 'transparent',
                border: 'none',
                color: theme === 'vs-dark' ? '#F8FAFC' : '#0F172A',
                fontSize: 12.5,
                fontWeight: 600,
                cursor: 'pointer',
                outline: 'none',
                padding: '4px 0',
              }}
            >
              {LANGUAGES.map(l => <option key={l.id} value={l.id} style={{ background: '#1C222B', color: '#F8FAFC' }}>{l.label}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select value={fontSize} onChange={e => setFontSize(Number(e.target.value))} style={selectStyle}>
            {FONT_SIZES.map(s => <option key={s} value={s} style={{ background: '#1C222B', color: '#F8FAFC' }}>{s}px</option>)}
          </select>
          <select value={theme} onChange={e => setTheme(e.target.value)} style={selectStyle}>
            <option value="vs-dark" style={{ background: '#1C222B', color: '#F8FAFC' }}>Dark</option>
            <option value="vs" style={{ background: '#FFFFFF', color: '#0F172A' }}>Light</option>
            <option value="hc-black" style={{ background: '#000000', color: '#FFFFFF' }}>High Contrast</option>
          </select>
          <button onClick={() => setMinimap(!minimap)} style={btnStyle} title={minimap ? 'Hide minimap' : 'Show minimap'}>
            {minimap ? <PanelRightClose size={13} /> : <PanelRightOpen size={13} />}
          </button>
          <button onClick={() => setWordWrap(!wordWrap)} style={btnStyle} title={wordWrap ? 'Disable word wrap' : 'Enable word wrap'}>
            <Search size={12} /> {wordWrap ? 'Wrap On' : 'Wrap'}
          </button>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {mounting && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: theme === 'vs-dark' ? '#15191F' : '#FFFFFF', zIndex: 10 }}>
            <Loader2 size={24} className="animate-spin text-emerald-500" color="#16A34A" />
          </div>
        )}
        <Editor height="100%" language={monacoLanguage} value={value} theme={theme} onChange={onChange} onMount={handleEditorDidMount} options={editorOptions} />
      </div>
    </div>
  );
};

export default CodeEditor;
