import React from 'react'

const TECH_THUMBNAILS = {
  react: {
    gradient: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0c4a6e 100%)',
    accent: '#38bdf8',
    secondaryAccent: '#818cf8',
    label: 'React',
    icon: '⚛',
    patternType: 'atom',
  },
  angular: {
    gradient: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #7f1d1d 100%)',
    accent: '#f87171',
    secondaryAccent: '#9ca3af',
    label: 'Angular',
    icon: '◆',
    patternType: 'shield',
  },
  vue: {
    gradient: 'linear-gradient(135deg, #052e16 0%, #14532d 50%, #064e3b 100%)',
    accent: '#4ade80',
    secondaryAccent: '#a7f3d0',
    label: 'Vue.js',
    icon: '▽',
    patternType: 'diamond',
  },
  java: {
    gradient: 'linear-gradient(135deg, #431407 0%, #78350f 50%, #7c2d12 100%)',
    accent: '#fb923c',
    secondaryAccent: '#fbbf24',
    label: 'Java',
    icon: '☕',
    patternType: 'steam',
  },
  spring: {
    gradient: 'linear-gradient(135deg, #14532d 0%, #166534 50%, #064e3b 100%)',
    accent: '#4ade80',
    secondaryAccent: '#86efac',
    label: 'Spring Boot',
    icon: '🌱',
    patternType: 'leaves',
  },
  node: {
    gradient: 'linear-gradient(135deg, #052e16 0%, #166534 50%, #0f766e 100%)',
    accent: '#34d399',
    secondaryAccent: '#2dd4bf',
    label: 'Node.js',
    icon: '⬡',
    patternType: 'hexgrid',
  },
  express: {
    gradient: 'linear-gradient(135deg, #111827 0%, #1f2937 50%, #374151 100%)',
    accent: '#a3a3a3',
    secondaryAccent: '#d4d4d4',
    label: 'Express.js',
    icon: '⚡',
    patternType: 'fastway',
  },
  python: {
    gradient: 'linear-gradient(135deg, #1e3a5f 0%, #1e40af 50%, #1d4ed8 100%)',
    accent: '#60a5fa',
    secondaryAccent: '#fbbf24',
    label: 'Python',
    icon: '🐍',
    patternType: 'snake',
  },
  django: {
    gradient: 'linear-gradient(135deg, #064e3b 0%, #065f46 50%, #047857 100%)',
    accent: '#6ee7b7',
    secondaryAccent: '#a7f3d0',
    label: 'Django',
    icon: 'D',
    patternType: 'framework',
  },
  'machine learning': {
    gradient: 'linear-gradient(135deg, #3b0764 0%, #581c87 50%, #6d28d9 100%)',
    accent: '#c084fc',
    secondaryAccent: '#a78bfa',
    label: 'Machine Learning',
    icon: '🧠',
    patternType: 'neural',
  },
  'artificial intelligence': {
    gradient: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%)',
    accent: '#818cf8',
    secondaryAccent: '#a5b4fc',
    label: 'Artificial Intelligence',
    icon: '🤖',
    patternType: 'brain',
  },
  'data science': {
    gradient: 'linear-gradient(135deg, #0c4a6e 0%, #075985 50%, #0369a1 100%)',
    accent: '#38bdf8',
    secondaryAccent: '#7dd3fc',
    label: 'Data Science',
    icon: '📊',
    patternType: 'chart',
  },
  'cloud computing': {
    gradient: 'linear-gradient(135deg, #e0f2fe 0%, #bae6fd 30%, #7dd3fc 100%)',
    accent: '#0284c7',
    secondaryAccent: '#0ea5e9',
    label: 'Cloud Computing',
    icon: '☁',
    patternType: 'clouds',
    dark: true,
  },
  aws: {
    gradient: 'linear-gradient(135deg, #78350f 0%, #92400e 50%, #b45309 100%)',
    accent: '#fbbf24',
    secondaryAccent: '#f97316',
    label: 'AWS',
    icon: '☁',
    patternType: 'aws',
  },
  azure: {
    gradient: 'linear-gradient(135deg, #1e3a5f 0%, #1e40af 50%, #2563eb 100%)',
    accent: '#60a5fa',
    secondaryAccent: '#93c5fd',
    label: 'Azure',
    icon: '△',
    patternType: 'azure',
  },
  docker: {
    gradient: 'linear-gradient(135deg, #0c4a6e 0%, #0369a1 50%, #0284c7 100%)',
    accent: '#38bdf8',
    secondaryAccent: '#7dd3fc',
    label: 'Docker',
    icon: '🐳',
    patternType: 'containers',
  },
  kubernetes: {
    gradient: 'linear-gradient(135deg, #1e3a5f 0%, #1d4ed8 50%, #4f46e5 100%)',
    accent: '#818cf8',
    secondaryAccent: '#a5b4fc',
    label: 'Kubernetes',
    icon: '⎈',
    patternType: 'helm',
  },
  devops: {
    gradient: 'linear-gradient(135deg, #581c87 0%, #7c3aed 50%, #8b5cf6 100%)',
    accent: '#c084fc',
    secondaryAccent: '#ddd6fe',
    label: 'DevOps',
    icon: '⟳',
    patternType: 'pipeline',
  },
  'cyber security': {
    gradient: 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 50%, #b91c1c 100%)',
    accent: '#fca5a5',
    secondaryAccent: '#f87171',
    label: 'Cyber Security',
    icon: '🛡',
    patternType: 'shield',
  },
  sql: {
    gradient: 'linear-gradient(135deg, #1e3a5f 0%, #1e40af 50%, #2563eb 100%)',
    accent: '#93c5fd',
    secondaryAccent: '#bfdbfe',
    label: 'SQL',
    icon: '🗄',
    patternType: 'database',
  },
  mongodb: {
    gradient: 'linear-gradient(135deg, #14532d 0%, #15803d 50%, #16a34a 100%)',
    accent: '#86efac',
    secondaryAccent: '#4ade80',
    label: 'MongoDB',
    icon: '🍃',
    patternType: 'leaf',
  },
  'ui/ux': {
    gradient: 'linear-gradient(135deg, #831843 0%, #9d174d 50%, #be185d 100%)',
    accent: '#f9a8d4',
    secondaryAccent: '#f472b6',
    label: 'UI/UX Design',
    icon: '🎨',
    patternType: 'palette',
  },
  figma: {
    gradient: 'linear-gradient(135deg, #4a1942 0%, #7c2d8e 50%, #a855f7 100%)',
    accent: '#e879f9',
    secondaryAccent: '#c084fc',
    label: 'Figma',
    icon: '◇',
    patternType: 'figma',
  },
  testing: {
    gradient: 'linear-gradient(135deg, #14532d 0%, #166534 50%, #15803d 100%)',
    accent: '#4ade80',
    secondaryAccent: '#86efac',
    label: 'Testing',
    icon: '✓',
    patternType: 'checkmarks',
  },
  playwright: {
    gradient: 'linear-gradient(135deg, #1e3a5f 0%, #1d4ed8 50%, #4f46e5 100%)',
    accent: '#818cf8',
    secondaryAccent: '#a5b4fc',
    label: 'Playwright',
    icon: '🎭',
    patternType: 'browser',
  },
  selenium: {
    gradient: 'linear-gradient(135deg, #064e3b 0%, #047857 50%, #059669 100%)',
    accent: '#6ee7b7',
    secondaryAccent: '#34d399',
    label: 'Selenium',
    icon: '⚙',
    patternType: 'gear',
  },
  jmeter: {
    gradient: 'linear-gradient(135deg, #78350f 0%, #b45309 50%, #d97706 100%)',
    accent: '#fcd34d',
    secondaryAccent: '#fbbf24',
    label: 'JMeter',
    icon: '📈',
    patternType: 'perf',
  },
}

const DEFAULT_THUMBNAIL = {
  gradient: 'linear-gradient(135deg, #1e293b 0%, #334155 50%, #475569 100%)',
  accent: '#94a3b8',
  secondaryAccent: '#cbd5e1',
  label: 'General Training',
  icon: '📚',
  patternType: 'abstract',
}

const KEYWORD_MAP = [
  { keywords: ['react', 'next.js', 'nextjs', 'frontend', 'html', 'css'], key: 'react' },
  { keywords: ['angular'], key: 'angular' },
  { keywords: ['vue', 'vue.js', 'vuejs'], key: 'vue' },
  { keywords: ['java', 'spring', 'springboot', 'spring boot', 'backend'], key: 'java' },
  { keywords: ['spring'], key: 'spring' },
  { keywords: ['node', 'node.js', 'nodejs', 'javascript', 'js', 'express', 'express.js'], key: 'node' },
  { keywords: ['express'], key: 'express' },
  { keywords: ['python', 'pandas', 'numpy'], key: 'python' },
  { keywords: ['django', 'flask'], key: 'django' },
  { keywords: ['machine learning', 'ml', 'deep learning', 'neural', 'tensorflow', 'pytorch'], key: 'machine learning' },
  { keywords: ['artificial intelligence', 'ai', 'chatbot', 'nlp'], key: 'artificial intelligence' },
  { keywords: ['data science', 'analytics', 'visualization', 'power bi', 'tableau'], key: 'data science' },
  { keywords: ['cloud', 'cloud computing', 'saas', 'paas'], key: 'cloud computing' },
  { keywords: ['aws', 'amazon web'], key: 'aws' },
  { keywords: ['azure', 'microsoft cloud'], key: 'azure' },
  { keywords: ['docker', 'container'], key: 'docker' },
  { keywords: ['kubernetes', 'k8s'], key: 'kubernetes' },
  { keywords: ['devops', 'ci/cd', 'cicd', 'pipeline', 'jenkins', 'github actions'], key: 'devops' },
  { keywords: ['cyber security', 'security', 'penetration', 'ethical hacking', 'network security'], key: 'cyber security' },
  { keywords: ['sql', 'mysql', 'postgresql', 'oracle', 'database', 'db'], key: 'sql' },
  { keywords: ['mongodb', 'nosql', 'cassandra', 'redis'], key: 'mongodb' },
  { keywords: ['ui/ux', 'ui', 'ux', 'user interface', 'user experience', 'design'], key: 'ui/ux' },
  { keywords: ['figma', 'sketch', 'adobe xd', 'zeplin'], key: 'figma' },
  { keywords: ['testing', 'qa', 'quality', 'test automation'], key: 'testing' },
  { keywords: ['playwright'], key: 'playwright' },
  { keywords: ['selenium', 'webdriver'], key: 'selenium' },
  { keywords: ['jmeter', 'performance testing', 'load testing', 'stress testing'], key: 'jmeter' },
]

export function getCourseThumbnail(courseName, category) {
  const searchStr = `${courseName || ''} ${category || ''}`.toLowerCase()

  for (const { keywords, key } of KEYWORD_MAP) {
    for (const kw of keywords) {
      if (searchStr.includes(kw)) {
        return TECH_THUMBNAILS[key]
      }
    }
  }

  return DEFAULT_THUMBNAIL
}

export function getThumbnailSVG(thumbnail) {
  const { accent, secondaryAccent, patternType, icon } = thumbnail

  const patterns = {
    atom: (
      <>
        <circle cx="200" cy="120" r="30" fill="none" stroke={accent} strokeWidth="1.5" opacity="0.5" />
        <ellipse cx="200" cy="120" rx="70" ry="25" fill="none" stroke={accent} strokeWidth="1" opacity="0.3" transform="rotate(0 200 120)" />
        <ellipse cx="200" cy="120" rx="70" ry="25" fill="none" stroke={secondaryAccent} strokeWidth="1" opacity="0.3" transform="rotate(60 200 120)" />
        <ellipse cx="200" cy="120" rx="70" ry="25" fill="none" stroke={accent} strokeWidth="1" opacity="0.3" transform="rotate(120 200 120)" />
        <circle cx="200" cy="120" r="6" fill={accent} opacity="0.8" />
        <circle cx="200" cy="95" r="3" fill={secondaryAccent} opacity="0.6" />
        <circle cx="222" cy="133" r="3" fill={accent} opacity="0.6" />
        <circle cx="178" cy="133" r="3" fill={secondaryAccent} opacity="0.6" />
      </>
    ),
    shield: (
      <>
        <path d="M200 60 L240 90 L240 140 L200 170 L160 140 L160 90 Z" fill="none" stroke={accent} strokeWidth="2" opacity="0.5" />
        <path d="M200 75 L230 97 L230 135 L200 155 L170 135 L170 97 Z" fill="none" stroke={secondaryAccent} strokeWidth="1" opacity="0.3" />
        <circle cx="200" cy="115" r="15" fill={accent} opacity="0.15" />
      </>
    ),
    diamond: (
      <>
        <polygon points="200,60 250,120 200,180 150,120" fill="none" stroke={accent} strokeWidth="2" opacity="0.5" />
        <polygon points="200,80 235,120 200,160 165,120" fill="none" stroke={secondaryAccent} strokeWidth="1" opacity="0.3" />
        <polygon points="200,95 220,120 200,145 180,120" fill={accent} opacity="0.15" />
      </>
    ),
    steam: (
      <>
        <path d="M185 150 Q185 130 195 120 Q185 110 185 90 Q185 70 200 60" fill="none" stroke={accent} strokeWidth="1.5" opacity="0.4" strokeLinecap="round" />
        <path d="M200 150 Q200 125 210 115 Q200 105 200 85 Q200 65 215 55" fill="none" stroke={secondaryAccent} strokeWidth="1.5" opacity="0.35" strokeLinecap="round" />
        <path d="M215 150 Q215 135 225 125 Q215 115 215 100 Q215 85 225 75" fill="none" stroke={accent} strokeWidth="1.5" opacity="0.3" strokeLinecap="round" />
        <rect x="175" y="150" width="60" height="25" rx="4" fill={accent} opacity="0.2" />
      </>
    ),
    leaves: (
      <>
        <path d="M200 60 Q220 90 210 120 Q200 150 180 130 Q160 110 180 80 Q190 65 200 60" fill="none" stroke={accent} strokeWidth="1.5" opacity="0.4" />
        <path d="M220 80 Q235 100 225 125 Q215 145 200 135" fill="none" stroke={secondaryAccent} strokeWidth="1" opacity="0.3" />
        <line x1="200" y1="60" x2="200" y2="145" stroke={accent} strokeWidth="1" opacity="0.2" />
      </>
    ),
    hexgrid: (
      <>
        <polygon points="200,70 220,82 220,106 200,118 180,106 180,82" fill="none" stroke={accent} strokeWidth="1.5" opacity="0.5" />
        <polygon points="230,85 250,97 250,121 230,133 210,121 210,97" fill="none" stroke={secondaryAccent} strokeWidth="1" opacity="0.3" />
        <polygon points="170,85 190,97 190,121 170,133 150,121 150,97" fill="none" stroke={accent} strokeWidth="1" opacity="0.3" />
        <polygon points="200,100 215,108 215,124 200,132 185,124 185,108" fill={accent} opacity="0.15" />
      </>
    ),
    fastway: (
      <>
        <path d="M160 120 L200 120" stroke={accent} strokeWidth="2" opacity="0.5" strokeLinecap="round" />
        <path d="M200 120 L240 120" stroke={secondaryAccent} strokeWidth="2" opacity="0.5" strokeLinecap="round" />
        <polygon points="240,120 230,110 230,130" fill={secondaryAccent} opacity="0.5" />
        <circle cx="160" cy="120" r="8" fill={accent} opacity="0.3" />
        <path d="M180 100 L180 140" stroke={accent} strokeWidth="1" opacity="0.2" />
        <path d="M220 100 L220 140" stroke={secondaryAccent} strokeWidth="1" opacity="0.2" />
      </>
    ),
    snake: (
      <>
        <path d="M170 80 Q190 70 200 85 Q210 100 195 110 Q180 120 190 135 Q200 150 220 140" fill="none" stroke={accent} strokeWidth="2" opacity="0.4" strokeLinecap="round" />
        <circle cx="170" cy="80" r="3" fill={accent} opacity="0.5" />
        <circle cx="170" cy="80" r="5" fill="none" stroke={secondaryAccent} strokeWidth="1" opacity="0.3" />
        <circle cx="220" cy="140" r="2" fill={secondaryAccent} opacity="0.5" />
      </>
    ),
    framework: (
      <>
        <rect x="175" y="75" width="50" height="50" rx="8" fill="none" stroke={accent} strokeWidth="2" opacity="0.4" />
        <text x="200" y="107" textAnchor="middle" fill={accent} fontSize="24" fontWeight="700" fontFamily="serif" opacity="0.5">D</text>
        <line x1="175" y1="140" x2="225" y2="140" stroke={secondaryAccent} strokeWidth="1" opacity="0.2" />
      </>
    ),
    neural: (
      <>
        {[
          { x: 155, y: 85 }, { x: 155, y: 115 }, { x: 155, y: 145 },
          { x: 200, y: 75 }, { x: 200, y: 105 }, { x: 200, y: 135 }, { x: 200, y: 155 },
          { x: 245, y: 85 }, { x: 245, y: 115 }, { x: 245, y: 145 },
        ].map((n, i) => (
          <React.Fragment key={i}>
            <circle cx={n.x} cy={n.y} r="5" fill={i < 3 ? accent : i < 7 ? secondaryAccent : accent} opacity="0.4" />
            {i < 3 && [3, 4, 5, 6].map(j => (
              <line key={`${i}-${j}`} x1={n.x} y1={n.y} x2={[200, 200, 200, 200][j - 3]} y2={[75, 105, 135, 155][j - 3]} stroke={accent} strokeWidth="0.5" opacity="0.2" />
            ))}
            {i >= 7 && [3, 4, 5, 6].map(j => (
              <line key={`${i}-${j}`} x1={[200, 200, 200, 200][j - 3]} y1={[75, 105, 135, 155][j - 3]} x2={n.x} y2={n.y} stroke={secondaryAccent} strokeWidth="0.5" opacity="0.2" />
            ))}
          </React.Fragment>
        ))}
      </>
    ),
    brain: (
      <>
        <circle cx="185" cy="105" r="25" fill="none" stroke={accent} strokeWidth="1.5" opacity="0.4" />
        <circle cx="215" cy="105" r="25" fill="none" stroke={secondaryAccent} strokeWidth="1.5" opacity="0.4" />
        <path d="M185 80 Q200 95 215 80" fill="none" stroke={accent} strokeWidth="1" opacity="0.3" />
        <path d="M185 130 Q200 115 215 130" fill="none" stroke={secondaryAccent} strokeWidth="1" opacity="0.3" />
        <circle cx="195" cy="100" r="3" fill={accent} opacity="0.5" />
        <circle cx="205" cy="100" r="3" fill={secondaryAccent} opacity="0.5" />
      </>
    ),
    chart: (
      <>
        <rect x="165" y="110" width="14" height="35" rx="3" fill={accent} opacity="0.3" />
        <rect x="185" y="90" width="14" height="55" rx="3" fill={secondaryAccent} opacity="0.3" />
        <rect x="205" y="70" width="14" height="75" rx="3" fill={accent} opacity="0.4" />
        <rect x="225" y="100" width="14" height="45" rx="3" fill={secondaryAccent} opacity="0.3" />
        <line x1="160" y1="150" x2="245" y2="150" stroke={accent} strokeWidth="1" opacity="0.2" />
      </>
    ),
    clouds: (
      <>
        <ellipse cx="185" cy="105" rx="30" ry="18" fill={accent} opacity="0.15" />
        <ellipse cx="210" cy="100" rx="25" ry="15" fill={secondaryAccent} opacity="0.15" />
        <ellipse cx="200" cy="110" rx="35" ry="16" fill={accent} opacity="0.1" />
        <path d="M170 125 L175 140 L180 125" fill="none" stroke={accent} strokeWidth="1" opacity="0.2" />
        <path d="M210 120 L215 135 L220 120" fill="none" stroke={secondaryAccent} strokeWidth="1" opacity="0.2" />
      </>
    ),
    aws: (
      <>
        <path d="M175 115 Q200 85 225 115" fill="none" stroke={accent} strokeWidth="2" opacity="0.5" strokeLinecap="round" />
        <path d="M185 125 Q200 105 215 125" fill="none" stroke={secondaryAccent} strokeWidth="1.5" opacity="0.4" strokeLinecap="round" />
        <text x="200" y="145" textAnchor="middle" fill={accent} fontSize="10" fontWeight="700" fontFamily="system-ui" opacity="0.4">AWS</text>
      </>
    ),
    azure: (
      <>
        <polygon points="200,70 235,100 220,140 180,140 165,100" fill="none" stroke={accent} strokeWidth="1.5" opacity="0.4" />
        <polygon points="200,85 220,105 212,130 188,130 180,105" fill={accent} opacity="0.1" />
        <circle cx="200" cy="110" r="8" fill={secondaryAccent} opacity="0.3" />
      </>
    ),
    containers: (
      <>
        <rect x="165" y="95" width="30" height="30" rx="4" fill="none" stroke={accent} strokeWidth="1.5" opacity="0.4" />
        <rect x="205" y="85" width="30" height="30" rx="4" fill="none" stroke={secondaryAccent} strokeWidth="1.5" opacity="0.4" />
        <rect x="185" y="115" width="30" height="30" rx="4" fill={accent} opacity="0.15" />
        <line x1="180" y1="95" x2="195" y2="115" stroke={accent} strokeWidth="0.8" opacity="0.2" />
        <line x1="220" y1="85" x2="205" y2="105" stroke={secondaryAccent} strokeWidth="0.8" opacity="0.2" />
      </>
    ),
    helm: (
      <>
        <circle cx="200" cy="110" r="30" fill="none" stroke={accent} strokeWidth="1.5" opacity="0.4" />
        <line x1="200" y1="80" x2="200" y2="140" stroke={secondaryAccent} strokeWidth="1" opacity="0.3" />
        <line x1="170" y1="110" x2="230" y2="110" stroke={secondaryAccent} strokeWidth="1" opacity="0.3" />
        <line x1="178" y1="88" x2="222" y2="132" stroke={accent} strokeWidth="0.8" opacity="0.2" />
        <line x1="222" y1="88" x2="178" y2="132" stroke={accent} strokeWidth="0.8" opacity="0.2" />
        <circle cx="200" cy="110" r="6" fill={accent} opacity="0.3" />
      </>
    ),
    pipeline: (
      <>
        <rect x="155" y="100" width="20" height="20" rx="4" fill={accent} opacity="0.2" />
        <line x1="175" y1="110" x2="195" y2="110" stroke={secondaryAccent} strokeWidth="1.5" opacity="0.4" strokeDasharray="4 3" />
        <rect x="195" y="100" width="20" height="20" rx="4" fill={secondaryAccent} opacity="0.2" />
        <line x1="215" y1="110" x2="235" y2="110" stroke={accent} strokeWidth="1.5" opacity="0.4" strokeDasharray="4 3" />
        <rect x="235" y="100" width="20" height="20" rx="4" fill={accent} opacity="0.2" />
        <circle cx="165" cy="110" r="3" fill={accent} opacity="0.5" />
        <circle cx="205" cy="110" r="3" fill={secondaryAccent} opacity="0.5" />
        <polygon points="245,110 238,105 238,115" fill={accent} opacity="0.4" />
      </>
    ),
    database: (
      <>
        <ellipse cx="200" cy="85" rx="30" ry="10" fill="none" stroke={accent} strokeWidth="1.5" opacity="0.4" />
        <path d="M170 85 L170 135" stroke={accent} strokeWidth="1.5" opacity="0.4" />
        <path d="M230 85 L230 135" stroke={accent} strokeWidth="1.5" opacity="0.4" />
        <ellipse cx="200" cy="135" rx="30" ry="10" fill="none" stroke={accent} strokeWidth="1.5" opacity="0.4" />
        <ellipse cx="200" cy="105" rx="30" ry="10" fill="none" stroke={secondaryAccent} strokeWidth="1" opacity="0.2" />
        <ellipse cx="200" cy="120" rx="30" ry="10" fill="none" stroke={secondaryAccent} strokeWidth="1" opacity="0.2" />
      </>
    ),
    leaf: (
      <>
        <path d="M200 60 Q240 90 230 140 Q220 150 200 155 Q180 150 170 140 Q160 90 200 60" fill={accent} opacity="0.1" />
        <path d="M200 60 Q240 90 230 140 Q220 150 200 155 Q180 150 170 140 Q160 90 200 60" fill="none" stroke={accent} strokeWidth="1.5" opacity="0.4" />
        <line x1="200" y1="70" x2="200" y2="150" stroke={secondaryAccent} strokeWidth="1" opacity="0.3" />
        <path d="M200 90 Q215 85 220 95" fill="none" stroke={secondaryAccent} strokeWidth="0.8" opacity="0.25" />
        <path d="M200 110 Q185 105 180 115" fill="none" stroke={secondaryAccent} strokeWidth="0.8" opacity="0.25" />
      </>
    ),
    palette: (
      <>
        <circle cx="185" cy="100" r="12" fill={accent} opacity="0.3" />
        <circle cx="210" cy="90" r="10" fill={secondaryAccent} opacity="0.3" />
        <circle cx="225" cy="110" r="8" fill={accent} opacity="0.25" />
        <circle cx="210" cy="130" r="11" fill={secondaryAccent} opacity="0.25" />
        <circle cx="180" cy="125" r="9" fill={accent} opacity="0.2" />
        <circle cx="200" cy="110" r="14" fill="none" stroke={accent} strokeWidth="1" opacity="0.3" />
      </>
    ),
    figma: (
      <>
        <rect x="185" y="70" width="15" height="15" rx="7.5" fill={accent} opacity="0.4" />
        <rect x="202" y="70" width="15" height="15" rx="7.5" fill={secondaryAccent} opacity="0.4" />
        <rect x="185" y="87" width="15" height="15" rx="7.5" fill={secondaryAccent} opacity="0.4" />
        <circle cx="209.5" cy="94.5" r="7.5" fill={accent} opacity="0.4" />
        <rect x="185" y="104" width="15" height="15" rx="7.5" fill={accent} opacity="0.3" />
      </>
    ),
    checkmarks: (
      <>
        <circle cx="170" cy="100" r="12" fill="none" stroke={accent} strokeWidth="1.5" opacity="0.4" />
        <path d="M164 100 L168 104 L176 96" fill="none" stroke={accent} strokeWidth="1.5" opacity="0.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="200" cy="115" r="12" fill="none" stroke={secondaryAccent} strokeWidth="1.5" opacity="0.4" />
        <path d="M194 115 L198 119 L206 111" fill="none" stroke={secondaryAccent} strokeWidth="1.5" opacity="0.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="230" cy="100" r="12" fill={accent} opacity="0.15" />
        <path d="M224 100 L228 104 L236 96" fill="none" stroke={accent} strokeWidth="1.5" opacity="0.4" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
    browser: (
      <>
        <rect x="160" y="80" width="80" height="55" rx="6" fill="none" stroke={accent} strokeWidth="1.5" opacity="0.4" />
        <line x1="160" y1="95" x2="240" y2="95" stroke={accent} strokeWidth="1" opacity="0.2" />
        <circle cx="170" cy="88" r="2.5" fill={secondaryAccent} opacity="0.4" />
        <circle cx="178" cy="88" r="2.5" fill={accent} opacity="0.4" />
        <circle cx="186" cy="88" r="2.5" fill={secondaryAccent} opacity="0.4" />
        <path d="M180 110 L190 105 L200 115 L210 100 L225 110" fill="none" stroke={accent} strokeWidth="1" opacity="0.3" strokeLinecap="round" />
      </>
    ),
    gear: (
      <>
        <circle cx="200" cy="110" r="15" fill="none" stroke={accent} strokeWidth="1.5" opacity="0.4" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => {
          const rad = (deg * Math.PI) / 180
          const x1 = 200 + 18 * Math.cos(rad)
          const y1 = 110 + 18 * Math.sin(rad)
          const x2 = 200 + 25 * Math.cos(rad)
          const y2 = 110 + 25 * Math.sin(rad)
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={accent} strokeWidth="2.5" opacity="0.35" strokeLinecap="round" />
        })}
        <circle cx="200" cy="110" r="6" fill={secondaryAccent} opacity="0.3" />
      </>
    ),
    perf: (
      <>
        <polyline points="160,140 180,120 195,130 215,90 235,100 250,70" fill="none" stroke={accent} strokeWidth="1.5" opacity="0.4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="215" cy="90" r="4" fill={accent} opacity="0.5" />
        <circle cx="235" cy="100" r="3" fill={secondaryAccent} opacity="0.4" />
        <line x1="160" y1="145" x2="250" y2="145" stroke={accent} strokeWidth="1" opacity="0.15" />
        <rect x="165" y="135" width="8" height="10" rx="2" fill={accent} opacity="0.2" />
        <rect x="180" y="125" width="8" height="20" rx="2" fill={secondaryAccent} opacity="0.2" />
      </>
    ),
    abstract: (
      <>
        <circle cx="180" cy="95" r="20" fill="none" stroke={accent} strokeWidth="1" opacity="0.3" />
        <circle cx="220" cy="105" r="25" fill="none" stroke={secondaryAccent} strokeWidth="1" opacity="0.25" />
        <circle cx="200" cy="120" r="15" fill={accent} opacity="0.08" />
        <line x1="160" y1="80" x2="240" y2="80" stroke={accent} strokeWidth="0.5" opacity="0.15" />
        <line x1="160" y1="140" x2="240" y2="140" stroke={accent} strokeWidth="0.5" opacity="0.15" />
        <polygon points="200,65 210,85 190,85" fill={secondaryAccent} opacity="0.1" />
      </>
    ),
  }

  return patterns[patternType] || patterns.abstract
}

export default TECH_THUMBNAILS
