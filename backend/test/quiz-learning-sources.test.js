jest.mock('axios', () => ({post: jest.fn()}));
jest.mock('../src/models', () => ({Lesson: {findAll: jest.fn()}, LessonMaterial: {}}));
jest.mock('fs');
const fs = require('fs');
const {Lesson} = require('../src/models');
const {loadLearningSources} = require('../src/services/quizLearningSources');
beforeEach(() => jest.clearAllMocks());
test('reads course-scoped notes and lesson content after authorization', async () => {
  Lesson.findAll.mockResolvedValue([{title: 'Motion', content: '<p>Speed = distance / time.</p>', materials: [{title: 'Units', materialType: 'NOTE', content: 'Use consistent units.'}]}]);
  const text = await loadLearningSources({courseId: 123});
  expect(Lesson.findAll.mock.calls[0][0].where.courseId).toBe(123);
  expect(text).toContain('Speed = distance / time.');
  expect(text).toContain('Use consistent units.');
});
test('explicit notes take priority over course content', async () => {
  expect(await loadLearningSources({courseId: 123, materials: 'Trainer notes'})).toBe('Trainer notes');
  expect(Lesson.findAll).not.toHaveBeenCalled();
});
test('rejects a selected lesson outside the authorized course', async () => {
  Lesson.findAll.mockResolvedValue([]);
  await expect(loadLearningSources({courseId: 123, lessonIds: [456]})).rejects.toMatchObject({status: 403});
});
test('course without lessons returns no source instead of manufacturing one', async () => {
  Lesson.findAll.mockResolvedValue([]);
  expect(await loadLearningSources({courseId: 123})).toBe('');
});
test('missing file-backed material is skipped instead of aborting generation', async () => {
  fs.existsSync.mockReturnValue(false);
  Lesson.findAll.mockResolvedValue([{id: 7, title: 'Motion', content: '<p>Speed = distance / time.</p>', materials: [{id: 1, title: 'demo', materialType: 'PDF', fileUrl: '/uploads/materials/1788603215327-SRIRAM_TEMPORARY_PROVISIONAL.pdf', content: null}]}]);
  const text = await loadLearningSources({courseId: 123});
  expect(text).toContain('Speed = distance / time.');
  expect(text).not.toContain('demo');
  expect(require('axios').post).not.toHaveBeenCalled();
});
test('missing file does not mask usable material text from the same lesson', async () => {
  fs.existsSync.mockReturnValue(false);
  Lesson.findAll.mockResolvedValue([{id: 7, title: 'Motion', content: null, materials: [{id: 1, title: 'demo', materialType: 'PDF', fileUrl: '/uploads/materials/stale.pdf', content: null}, {id: 2, title: 'Units', materialType: 'NOTE', content: 'Use consistent units.', fileUrl: null}]}]);
  const text = await loadLearningSources({courseId: 123});
  expect(text).toContain('Use consistent units.');
});
