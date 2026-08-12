/**
 * SharedCodeEditor Component
 * Collaborative code editor using Monaco Editor with real-time sync via Socket.IO.
 * Dark theme integrated with interview UI.
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import Editor from '@monaco-editor/react'
import { Code2 } from 'lucide-react'

const LANGUAGES = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'cpp', label: 'C++' },
  { value: 'c', label: 'C' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'sql', label: 'SQL' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
]

const DEFAULT_CODE = `// Interview Coding Challenge
// Write your solution here

function solve(input) {
  // TODO: Implement your solution
  return input;
}

// Example test
console.log(solve("hello"));`

export default function SharedCodeEditor({
  socket,
  interviewId,
  sessionId,
  readOnly = false,
  className = '',
}) {
  const [language, setLanguage] = useState('javascript')
  const [content, setContent] = useState(DEFAULT_CODE)
  const [isRemoteUpdate, setIsRemoteUpdate] = useState(false)
  const editorRef = useRef(null)
  const lastRemoteUpdate = useRef(0)
  const debounceRef = useRef(null)

  // Handle incoming remote code changes
  useEffect(() => {
    if (!socket) return

    const handleCodeSync = (data) => {
      if (data.fromUserId === socket.userId) return
      setIsRemoteUpdate(true)
      lastRemoteUpdate.current = Date.now()
      setContent(data.content)
      if (data.language) setLanguage(data.language)
      setTimeout(() => setIsRemoteUpdate(false), 100)
    }

    socket.on('code-sync', handleCodeSync)
    return () => socket.off('code-sync', handleCodeSync)
  }, [socket])

  // Broadcast local changes (debounced)
  const handleContentChange = useCallback((value) => {
    if (isRemoteUpdate || readOnly) return
    setContent(value)

    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      if (socket && interviewId) {
        socket.emit('code-sync', {
          interviewId,
          sessionId,
          content: value,
          language,
        })
      }
    }, 300)
  }, [socket, interviewId, sessionId, language, isRemoteUpdate, readOnly])

  const handleLanguageChange = useCallback((e) => {
    setLanguage(e.target.value)
    if (socket && interviewId) {
      socket.emit('code-sync', {
        interviewId,
        content,
        language: e.target.value,
      })
    }
  }, [socket, interviewId, content])

  const handleEditorMount = useCallback((editor) => {
    editorRef.current = editor
  }, [])

  return (
    <div className={`flex flex-col bg-slate-900 rounded-xl overflow-hidden border border-slate-700/50 shadow-lg h-full ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-800/90 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <Code2 size={15} className="text-slate-400" />
          <span className="text-slate-300 text-xs font-medium">Shared Code Editor</span>
        </div>
        <select
          value={language}
          onChange={handleLanguageChange}
          className="bg-slate-700 border border-slate-600 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 cursor-pointer transition-all"
        >
          {LANGUAGES.map(lang => (
            <option key={lang.value} value={lang.value}>{lang.label}</option>
          ))}
        </select>
      </div>

      {/* Editor */}
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          language={language}
          value={content}
          onChange={handleContentChange}
          onMount={handleEditorMount}
          theme="vs-dark"
          options={{
            readOnly,
            fontSize: 14,
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            automaticLayout: true,
            padding: { top: 16, bottom: 16 },
            renderLineHighlight: 'all',
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            lineNumbers: 'on',
            glyphMargin: false,
            folding: true,
            lineDecorationsWidth: 10,
            lineNumbersMinChars: 3,
            scrollbar: {
              vertical: 'visible',
              horizontal: 'visible',
              useShadows: false,
              verticalScrollbarSize: 10,
              horizontalScrollbarSize: 10,
            },
          }}
          loading={
            <div className="flex items-center justify-center h-full bg-slate-900">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-slate-700 border-t-primary-500 rounded-full animate-spin" />
                <span className="text-slate-500 text-sm">Loading editor...</span>
              </div>
            </div>
          }
        />
      </div>
    </div>
  )
}
