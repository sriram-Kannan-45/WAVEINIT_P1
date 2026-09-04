'use strict';

/**
 * Enterprise Course Intent Parser
 * Extracts structured educational intent (clean subject, level, duration, daily hours,
 * total hours, syllabus topics) from conversational user prompts.
 */

// Common technology capitalization map for pristine display
const TECH_CASING = {
  react: 'React',
  'react.js': 'React.js',
  'react native': 'React Native',
  python: 'Python',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  node: 'Node.js',
  'node.js': 'Node.js',
  express: 'Express.js',
  'express.js': 'Express.js',
  angular: 'Angular',
  vue: 'Vue.js',
  'vue.js': 'Vue.js',
  nextjs: 'Next.js',
  'next.js': 'Next.js',
  java: 'Java',
  'java selenium': 'Java Selenium',
  selenium: 'Selenium',
  golang: 'Go (Golang)',
  go: 'Go (Golang)',
  rust: 'Rust',
  c: 'C',
  'c++': 'C++',
  'c#': 'C#',
  dotnet: '.NET',
  '.net': '.NET',
  sql: 'SQL & Database Design',
  mysql: 'MySQL',
  postgresql: 'PostgreSQL',
  mongodb: 'MongoDB',
  docker: 'Docker',
  kubernetes: 'Kubernetes',
  aws: 'AWS Cloud Architecture',
  azure: 'Azure Cloud',
  gcp: 'Google Cloud Platform',
  devops: 'DevOps & CI/CD',
  linux: 'Linux System Administration',
  git: 'Git & Version Control',
  graphql: 'GraphQL',
  html: 'HTML5',
  css: 'CSS3',
  tailwind: 'Tailwind CSS',
  'machine learning': 'Machine Learning',
  'deep learning': 'Deep Learning',
  'artificial intelligence': 'Artificial Intelligence',
  'data science': 'Data Science',
  'data structures and algorithms': 'Data Structures & Algorithms',
  dsa: 'Data Structures & Algorithms',
  cybersecurity: 'Cybersecurity',
  blockchain: 'Blockchain Development',
};

const KNOWN_ACRONYMS = new Set(['AWS', 'GCP', 'CSS', 'HTML', 'SQL', 'API', 'SDK', 'CI/CD', 'JSX', 'REST', 'UI', 'UX', 'LLM', 'AI', 'DSA', 'JVM', 'MVC', 'OOP']);

/**
 * Format subject casing nicely
 */
function formatSubject(raw) {
  if (!raw) return 'Technical Course';
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  if (TECH_CASING[lower]) return TECH_CASING[lower];

  // Capitalize title case
  return trimmed
    .split(/\s+/)
    .map(word => {
      const wUpper = word.toUpperCase();
      if (KNOWN_ACRONYMS.has(wUpper)) return wUpper;
      if (/^(and|or|of|in|for|the|to|with|a|an)$/i.test(word)) return word.toLowerCase();
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * Parse natural language user prompt into structured course requirements
 */
function parseCourseIntent(prompt = '', fallbackTitle = '') {
  const cleanPrompt = (prompt || '').trim();

  // 1. DURATION & PACING PARSING
  let days = null;
  let dailyHours = null;
  let totalHours = null;
  let durationText = '';

  // Match months: "1 month", "2 months", "3 months"
  const monthMatch = cleanPrompt.match(/(\d+(?:\.\d+)?)\s*(?:months?)\b/i);
  if (monthMatch) {
    const months = parseFloat(monthMatch[1]);
    days = Math.round(months * 30);
  }

  // Match weeks: "2 weeks", "4 weeks"
  const weekMatch = cleanPrompt.match(/(\d+(?:\.\d+)?)\s*(?:weeks?)\b/i);
  if (weekMatch && !days) {
    const weeks = parseFloat(weekMatch[1]);
    days = Math.round(weeks * 7);
  }

  // Match days: "30 days", "15 days", "10 days"
  const dayMatch = cleanPrompt.match(/(\d+)\s*(?:days?)\b/i);
  if (dayMatch && !days) {
    days = parseInt(dayMatch[1], 10);
  }

  // Match daily hours: "7 hours of learning every day", "4 hours per day", "4 hours of learning daily", "5 hrs/day", "7 hours each day"
  const dailyHourMatch = cleanPrompt.match(
    /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)(?:\s*of\s+learning)?\s*(?:per\s*day|every\s*day|each\s*day|a\s*day|daily|\/\s*day)\b/i
  ) || cleanPrompt.match(
    /(?:every|each)\s*day(?:\s*for|\s*with)?\s*(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)/i
  ) || cleanPrompt.match(
    /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\s*(?:a|per)\s*day/i
  );

  if (dailyHourMatch) {
    dailyHours = parseFloat(dailyHourMatch[1]);
  }

  // Match total hours if explicitly specified: "40 hours course", "100 hours of training"
  const totalHourMatch = cleanPrompt.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\s*(?:total|course|curriculum|bootcamp|training)/i);
  if (totalHourMatch) {
    totalHours = parseFloat(totalHourMatch[1]);
  }

  // Calculate total hours based on days and dailyHours
  if (days && dailyHours) {
    totalHours = Math.round(days * dailyHours);
  } else if (days && !dailyHours) {
    dailyHours = 3; // sensible default
    totalHours = Math.round(days * dailyHours);
  } else if (!days && dailyHours) {
    days = 30; // default to 1 month
    totalHours = Math.round(days * dailyHours);
  } else if (!totalHours) {
    days = 30;
    dailyHours = 2;
    totalHours = 60;
  }

  // Build readable duration label
  if (days >= 28 && days <= 31) {
    durationText = `${totalHours} Hours / 1 Month (${dailyHours} Hours/Day)`;
  } else if (days > 31 && days % 30 === 0) {
    durationText = `${totalHours} Hours / ${Math.round(days / 30)} Months (${dailyHours} Hours/Day)`;
  } else if (days % 7 === 0) {
    durationText = `${totalHours} Hours / ${Math.round(days / 7)} Weeks (${dailyHours} Hours/Day)`;
  } else {
    durationText = `${totalHours} Hours / ${days} Days (${dailyHours} Hours/Day)`;
  }

  // 2. LEVEL EXTRACTION
  let level = 'Beginner to Advanced';
  if (/(?:from\s+)?(?:basics?|beginner|scratch)\s+to\s+(?:advanced|mastery|expert|pro)/i.test(cleanPrompt)) {
    level = 'Beginner to Advanced';
  } else if (/\b(?:advanced|expert|deep\s+dive|pro|mastery)\b/i.test(cleanPrompt) && !/\b(?:beginner|basics?)\b/i.test(cleanPrompt)) {
    level = 'Advanced';
  } else if (/\b(?:intermediate)\b/i.test(cleanPrompt) && !/\b(?:beginner|basics?)\b/i.test(cleanPrompt)) {
    level = 'Intermediate';
  } else if (/\b(?:beginners?|basics?|scratch|freshers?)\b/i.test(cleanPrompt)) {
    level = 'Beginner';
  }

  // 3. CLEAN SUBJECT EXTRACTION
  let workingSubject = cleanPrompt;

  // Remove conversational starter commands (e.g. "Create a complete...", "Comprehensive Docker...", "Full React bootcamp...")
  workingSubject = workingSubject.replace(
    /^(?:please\s+)?(?:can\s+you\s+)?(?:create|generate|design|build|make|give\s+me|develop|prepare|write|plan|provide)?\s*(?:an?\s+)?(?:complete|comprehensive|full|in-depth|intensive|crash|practical|hands-on|step-by-step|detailed)?\s*(?:course|curriculum|syllabus|roadmap|training|program|guide|bootcamp|masterclass)?\s*(?:on|for|about|in|covering|regarding)?\s*/i,
    ''
  );

  // Remove trailing duration / pacing clauses: "for 1 month with 7 hours...", "for 2 weeks...", ", 10 days, 5 hours daily"
  workingSubject = workingSubject.replace(
    /[,;\s]+(?:for|duration:?|over)?\s*\d+(?:\.\d+)?\s*(?:months?|weeks?|days?|hours?|hrs?).*$/i,
    ''
  );
  workingSubject = workingSubject.replace(
    /[,;\s]+(?:with|at)?\s*\d+(?:\.\d+)?\s*(?:hours?|hrs?)(?:\s*(?:of\s+learning\s+)?(?:per|every|each|a)\s*day|(?:\s*\/\s*day)|(?:\s*daily)).*$/i,
    ''
  );

  // Remove level phrases: "for beginners, from basics to advanced", "from scratch to advanced"
  workingSubject = workingSubject.replace(
    /\b(?:for\s+)?(?:from\s+)?(?:basics?|beginner|scratch)\s+to\s+(?:advanced|mastery|expert|pro|deep\s+dive)\b/gi,
    ''
  );
  workingSubject = workingSubject.replace(
    /\b(?:for\s+)?(?:beginners?|intermediates?|advanced|pros?|freshers?|all\s+levels?)\b/gi,
    ''
  );

  // Remove syllabus "covering ..." clause if attached to the subject
  workingSubject = workingSubject.replace(/\b(?:covering|including|with\s+topics?)\s+.*$/i, '');

  // Remove trailing or standalone "course", "curriculum", "bootcamp", etc.
  workingSubject = workingSubject.replace(
    /\b(?:production|development|developer|engineering)?\s*\b(?:course|curriculum|syllabus|training|program|roadmap|guide|bootcamp|masterclass)\b/gi,
    ''
  );

  // Clean trailing and leading punctuation/whitespace
  workingSubject = workingSubject.replace(/^[,\s:-]+|[,\s:-]+$/g, '').trim();

  // If working subject got emptied or is generic, fall back to fallbackTitle or default
  if (!workingSubject || workingSubject.length < 2 || /^(course|it|this|that|training)$/i.test(workingSubject)) {
    if (fallbackTitle && fallbackTitle !== 'Untitled Course' && fallbackTitle !== 'New Course') {
      workingSubject = fallbackTitle;
    } else {
      workingSubject = 'Software Engineering';
    }
  }

  const cleanSubject = formatSubject(workingSubject);

  // 4. EXTRACT SPECIFIC SYLLABUS REQUIREMENTS
  const syllabusRequirements = [];
  const coveringMatch = cleanPrompt.match(/(?:covering|topics?|includes?|including):\s*([^.\n]+)/i)
    || cleanPrompt.match(/(?:covering|including)\s+([^.\n]+)/i);

  if (coveringMatch && coveringMatch[1]) {
    const rawList = coveringMatch[1].split(/,| and /i);
    for (const item of rawList) {
      const cleanItem = item.trim().replace(/^\s*(?:and|the|a|an)\s+/i, '');
      if (cleanItem.length > 1 && !/^(etc|more|all)$/i.test(cleanItem)) {
        syllabusRequirements.push(cleanItem);
      }
    }
  }

  // 5. CONSTRUCT PROFESSIONAL COURSE TITLE
  let courseTitle = '';
  if (level === 'Beginner to Advanced') {
    courseTitle = `${cleanSubject}: Complete Masterclass (From Basics to Advanced)`;
  } else if (level === 'Advanced') {
    courseTitle = `Advanced ${cleanSubject} Engineering & Architecture`;
  } else if (level === 'Beginner') {
    courseTitle = `${cleanSubject} Fundamentals for Beginners`;
  } else {
    courseTitle = `${cleanSubject} Comprehensive Professional Curriculum`;
  }

  return {
    cleanSubject,
    level,
    days,
    dailyHours,
    totalHours,
    durationText,
    courseTitle,
    syllabusRequirements,
    originalPrompt: cleanPrompt,
  };
}

/**
 * Sanitizes generated module and submodule titles to eliminate any conversational or prompt boilerplate
 */
function sanitizeTitle(rawTitle, defaultPrefix = 'Module') {
  if (!rawTitle || typeof rawTitle !== 'string') return `${defaultPrefix} Overview`;
  let title = rawTitle.trim();

  // Remove repetitive leading tags like "Module 1:", "Sub Module 2:", "Topic 3:"
  title = title.replace(/^(?:module|sub\s*module|sub\s*topic|topic)\s*\d*[:.-]?\s*/i, '').trim();

  // Strip prompt boilerplate e.g. "Foundations of Create a complete React course..."
  title = title.replace(/^(?:foundations?\s+of\s+|introduction\s+to\s+|overview\s+of\s+)?(?:create\s+(?:a\s+)?(?:complete\s+)?|build\s+(?:a\s+)?|design\s+(?:a\s+)?|generate\s+(?:a\s+)?)/i, '').trim();
  title = title.replace(/\b(?:course\s+)?for\s+beginners.*$/i, '').trim();
  title = title.replace(/\bfrom\s+basics\s+to\s+advanced.*$/i, '').trim();
  title = title.replace(/\bfor\s+\d+\s*(?:month|week|day).*$/i, '').trim();

  // Clean trailing punctuation
  title = title.replace(/^[,\s:-]+|[,\s:-]+$/g, '').trim();

  if (!title || title.length < 3) {
    return `${defaultPrefix} Core Concepts`;
  }

  return title;
}

/**
 * Sanitizes entire generated structure object before database persistence or API response
 */
function sanitizeStructure(structure, intent) {
  if (!structure || !Array.isArray(structure.modules)) return structure;

  const sanitizedModules = structure.modules.map((m, mIdx) => {
    const cleanModTitle = sanitizeTitle(m.title, `Module ${mIdx + 1}`);
    const finalModTitle = cleanModTitle.toLowerCase().startsWith('module')
      ? cleanModTitle
      : `Module ${mIdx + 1}: ${cleanModTitle}`;

    return {
      id: m.id,
      title: finalModTitle,
      duration: m.duration || `${Math.round((intent?.totalHours || 60) / structure.modules.length)} Hours`,
      description: m.description ? m.description.replace(/^(?:this module covers\s+)?create a complete.*$/i, `In-depth mastery of ${cleanModTitle}.`) : `Comprehensive coverage of ${cleanModTitle}.`,
      status: m.status || 'PENDING',
      expanded: mIdx === 0,
      subModules: (m.subModules || []).map((sm, sIdx) => {
        const cleanSmTitle = sanitizeTitle(sm.title, `Submodule ${sIdx + 1}`);
        return {
          id: sm.id,
          title: cleanSmTitle,
          duration: sm.duration || '5 Hours',
          status: sm.status || 'PENDING',
          expanded: true,
          topics: (sm.topics || []).map((t, tIdx) => ({
            id: t.id,
            title: sanitizeTitle(t.title, `Topic ${tIdx + 1}`),
            duration: t.duration || '2 Hours',
            description: t.description || `Key concepts and applied implementation of ${t.title || 'the topic'}.`,
            status: t.status || 'PENDING',
          })),
        };
      }),
    };
  });

  return {
    courseTitle: intent?.courseTitle || structure.courseTitle || `${intent?.cleanSubject || 'Course'} Curriculum`,
    estimatedDuration: intent?.durationText || structure.estimatedDuration || `${intent?.totalHours || 60} Hours`,
    modules: sanitizedModules,
  };
}

module.exports = {
  parseCourseIntent,
  sanitizeTitle,
  sanitizeStructure,
  formatSubject,
};
