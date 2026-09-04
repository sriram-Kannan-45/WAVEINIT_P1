const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '../..');

const files = [
  { name: 'frontend/src/components/trainer/AIStructureGenerator.jsx', desc: 'Main Trainer AI Course Structure Generator UI Component' },
  { name: 'frontend/src/components/trainer/AIStructureGenerator.css', desc: 'CSS Styles for AI Course Structure Generator' },
  { name: 'backend/src/services/aiService.js', desc: 'Backend AI Service: original generateCourseStructure and LLM calls' },
  { name: 'backend/src/controllers/trainerCourseController.js', desc: 'Trainer Course Controller: structure endpoints, lesson parsing & DB persistence' },
  { name: 'ai-service/main.py', desc: 'Python AI Microservice: original /generate-course-structure & fallback' },
  { name: 'backend/src/models/Course.js', desc: 'Sequelize Model: Course' },
  { name: 'backend/src/models/Lesson.js', desc: 'Sequelize Model: Lesson (hierarchical module/submodule/topic storage)' }
];

let output = '';
output += '================================================================================\n';
output += '   WAVE INIT LMS: ORIGINAL COURSE STRUCTURE CREATION WORKFLOW CODES (PRE-PLAN)   \n';
output += '================================================================================\n';
output += 'Captured from git HEAD before the course structure generation plan.\n';
output += 'Workspace: ' + rootDir + '\n\n';

output += 'WORKFLOW SUMMARY (PRE-PLAN ARCHITECTURE):\n';
output += '-----------------------------------------\n';
output += '1. Frontend (AIStructureGenerator.jsx & AIStructureGenerator.css):\n';
output += '   - Trainer inputs prompt (e.g. "Create a complete React course...") or uploads document (PDF, DOCX, etc.).\n';
output += '   - Sends POST /api/trainer/courses/:courseId/generate-structure.\n';
output += '   - Displays modules accordion, submodules, topics, duration tags, and progress bar.\n';
output += '2. Backend Controller (trainerCourseController.js):\n';
output += '   - Loads owned course.\n';
output += '   - Calls aiService.generateCourseStructure({ prompt, courseTitle, file_path, mime_type }).\n';
output += '   - Saves generated modules, submodules, and topics to the database as Lessons via saveStructureToDatabase.\n';
output += '   - Loads and parses back via parseLessonsToStructure.\n';
output += '3. Backend AI Service (aiService.js):\n';
output += '   - Calls Python AI microservice at http://localhost:8000/generate-course-structure.\n';
output += '   - If microservice is unreachable, attempts direct Google Gemini API call.\n';
output += '4. Python AI Microservice (ai-service/main.py):\n';
output += '   - Endpoint /generate-course-structure received prompt and extracted text.\n';
output += '   - Attempted gemini_client.generate_content.\n';
output += '   - On error or 429 quota exhaustion, called generate_fallback_course_structure, which concatenated:\n';
output += '     title = course_title or prompt[:60].strip()\n';
output += '     title: f"Module 1: Foundations of {title}" (causing the "Foundations of Create a complete..." bug).\n';
output += '5. Database Models (Course.js & Lesson.js):\n';
output += '   - Course: stores course metadata.\n';
output += '   - Lesson: stores hierarchical rows with prefixes ("Module: ...", "Sub Module: ...", "Topic: ...") and durations.\n\n';

output += 'TABLE OF CONTENTS:\n';
output += '------------------\n';
files.forEach((f, i) => {
  output += (i + 1) + '. [' + f.desc + '] ' + f.name + '\n';
});
output += '\n';

files.forEach((f, i) => {
  output += '================================================================================\n';
  output += 'SECTION ' + (i + 1) + ': ' + f.desc + '\n';
  output += 'FILE: ' + f.name + '\n';
  output += '================================================================================\n\n';
  try {
    const content = execSync(`git show HEAD:"${f.name}"`, { cwd: rootDir, maxBuffer: 15 * 1024 * 1024 }).toString();
    output += content + '\n\n';
  } catch (err) {
    output += '// Error reading file from git HEAD: ' + err.message + '\n\n';
  }
});

const targetPath = path.join(rootDir, 'course_structure_workflow_original_codes.txt');
fs.writeFileSync(targetPath, output, 'utf8');
console.log('Successfully written to:', targetPath, 'Size:', output.length, 'bytes');
