const hiringController = require('../src/controllers/hiringController');

describe('Hire Assessments CRUD, Multi-Select & Bulk Delete API', () => {
  test('bulkDeleteAssessments validates input ids', async () => {
    let statusCode = 0;
    let jsonResponse = null;
    const res = {
      status(code) { statusCode = code; return this; },
      json(data) { jsonResponse = data; return this; },
    };

    // Missing ids
    await hiringController.bulkDeleteAssessments({ body: {} }, res);
    expect(statusCode).toBe(400);
    expect(jsonResponse.success).toBe(false);

    // Empty ids
    await hiringController.bulkDeleteAssessments({ body: { ids: [] } }, res);
    expect(statusCode).toBe(400);
    expect(jsonResponse.success).toBe(false);

    // Invalid ids
    await hiringController.bulkDeleteAssessments({ body: { ids: ['abc', -1] } }, res);
    expect(statusCode).toBe(400);
    expect(jsonResponse.success).toBe(false);
  });

  test('bulkDeleteAssessments returns already removed if none found in DB', async () => {
    let statusCode = 200;
    let jsonResponse = null;
    const res = {
      status(code) { statusCode = code; return this; },
      json(data) { jsonResponse = data; return this; },
    };

    await hiringController.bulkDeleteAssessments({ body: { ids: [9999999] } }, res);
    expect(jsonResponse.success).toBe(true);
    expect(jsonResponse.deletedIds).toEqual([9999999]);
  });

  test('single delete returns 404 for non-existent assessment', async () => {
    let statusCode = 200;
    let jsonResponse = null;
    const res = {
      status(code) { statusCode = code; return this; },
      json(data) { jsonResponse = data; return this; },
    };

    await hiringController.deleteAssessment({ params: { id: 9999999 } }, res);
    expect(statusCode).toBe(404);
    expect(jsonResponse.success).toBe(false);
  });
});
