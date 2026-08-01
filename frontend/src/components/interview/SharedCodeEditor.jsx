/**
 * SharedCodeEditor Component
 * Collaborative code editor using Monaco Editor with real-time sync via Socket.IO.
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import Editor from '@monaco-editor/react'

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
    <div className={`flex flex-col bg-gray-900 rounded-2xl overflow-hidden border border-gray-700/50 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800/80 border-b border-gray-700/50">
        <span className="text-gray-300 text-xs font-medium">Shared Code Editor</span>
        <select
          value={language}
          onChange={handleLanguageChange}
          className="bg-gray-700 border border-gray-600 text-white text-xs rounded-lg px-2 py-1 focus:outline-none focus:border-indigo-500"
        >
          {LANGUAGES.map(lang => (
            <option key={lang.value} value={lang.value}>{lang.label}</option>
          ))}
        </select>
      </div>

      {/* Editor */}
      <div className="flex-1 min-h-[300px]">
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
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            automaticLayout: true,
            padding: { top: 12 },
            renderLineHighlight: 'all',
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
          }}
          loading={
            <div className="flex items-center justify-center h-full bg-gray-900 text-gray-400 text-sm">
              Loading editor...
            </div>
          }
        />
      </div>
    </div>
  )
}
