import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './premium-enhancements.css'
import './styles/saas-premium.css'
import './styles/login-shared.css'
import './styles/ai-quizzes.css'
import './styles/quiz-taking.css'
import './styles/academic-theme.css'
import './styles/profile.css'
import './styles/resources.css'

const RootElement = import.meta.env.DEV ? (
  <React.StrictMode>
    <App />
  </React.StrictMode>
) : (
  <App />
)

ReactDOM.createRoot(document.getElementById('root')).render(RootElement)