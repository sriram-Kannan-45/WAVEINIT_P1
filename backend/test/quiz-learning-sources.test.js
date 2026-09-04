jest.mock('axios', () => ({post: jest.fn()}));
jest.mock('../src/models', () => ({Lesson: {findAll: jest.fn()}, LessonMaterial: {}}));
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
