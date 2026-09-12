const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'src');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

describe('Hire uses shared LMS engines', () => {
  test('active model registry has no Hire question or attempt engine', () => {
    const models = read('models/index.js');
    expect(models).not.toMatch(/require\(['"]\.\/HiringQuestion['"]\)/);
    expect(models).not.toMatch(/require\(['"]\.\/HiringAttempt['"]\)/);
  });

  test('Hire routes expose workflow discovery but no duplicate attempt API', () => {
    const routes = read('routes/hiringRoutes.js');
    expect(routes).toContain("router.get('/my-assessments'");
    expect(routes).not.toMatch(/router\.(get|post)\(['"]\/attempt/);
    expect(routes).not.toMatch(/assessments\/:id\/questions/);
  });

  test('canonical coding gate recognizes only assigned Hire workflows', () => {
    const controller = read('controllers/codingAssessmentController.js');
    expect(controller).toContain("assessment.context === 'HIRE'");
    expect(controller).toContain('HiringAssignment.findOne');
  });

  test('canonical quiz question delivery recognizes a direct assignment', () => {
    const routes = read('routes/quizzesRoutes.js');
    expect(routes).toContain('const quizAssignment = await QuizAssignment.findOne');
    expect(routes).toContain('if (!quizAssignment && !enrollmentCheck)');
  });

  test('GD requires six candidates on server and shared scheduler', () => {
    const controller = read('controllers/interviewController.js');
    const scheduler = path.join(__dirname, '..', '..', 'frontend', 'src', 'pages', 'interview', 'ScheduleInterview.jsx');
    expect(controller).toContain("ids.length!==6");
    expect(fs.readFileSync(scheduler, 'utf8')).toContain('form.candidateIds.length !== 6');
  });

  test('Hire evidence uses the existing protected upload pipeline and excludes trainers', () => {
    const files = read('controllers/fileController.js');
    expect(files).toContain("'hire-proctoring'");
    expect(files).toContain("['bulk-import', 'hire-proctoring']");
    expect(files).toContain('models.MonitoringSession.findOne');
  });
});
