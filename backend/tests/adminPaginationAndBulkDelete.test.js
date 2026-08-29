const adminController = require('../src/controllers/adminController');
const adminCourseController = require('../src/controllers/adminCourseController');

describe('Admin Module Pagination and Bulk Delete Controller Verification', () => {
  test('bulkDeleteParticipants should reject empty or invalid IDs array', async () => {
    const req = { body: { ids: [] } };
    let statusCode = null;
    let jsonResponse = null;
    const res = {
      status: (code) => {
        statusCode = code;
        return res;
      },
      json: (data) => {
        jsonResponse = data;
        return res;
      }
    };

    await adminController.bulkDeleteParticipants(req, res);
    expect(statusCode).toBe(400);
    expect(jsonResponse.success).toBe(false);
  });

  test('bulkDeleteTrainers should reject empty or invalid IDs array', async () => {
    const req = { body: { ids: ['invalid', -5] } };
    let statusCode = null;
    let jsonResponse = null;
    const res = {
      status: (code) => {
        statusCode = code;
        return res;
      },
      json: (data) => {
        jsonResponse = data;
        return res;
      }
    };

    await adminController.bulkDeleteTrainers(req, res);
    expect(statusCode).toBe(400);
    expect(jsonResponse.success).toBe(false);
  });

  test('bulkDeleteTrainings should reject non-array body', async () => {
    const req = { body: {} };
    let statusCode = null;
    let jsonResponse = null;
    const res = {
      status: (code) => {
        statusCode = code;
        return res;
      },
      json: (data) => {
        jsonResponse = data;
        return res;
      }
    };

    await adminController.bulkDeleteTrainings(req, res);
    expect(statusCode).toBe(400);
    expect(jsonResponse.success).toBe(false);
  });

  test('bulkDeletePrograms should reject invalid IDs array', async () => {
    const req = { body: { ids: [] } };
    let statusCode = null;
    let jsonResponse = null;
    const res = {
      status: (code) => {
        statusCode = code;
        return res;
      },
      json: (data) => {
        jsonResponse = data;
        return res;
      }
    };

    await adminCourseController.bulkDeletePrograms(req, res);
    expect(statusCode).toBe(400);
    expect(jsonResponse.success).toBe(false);
  });

  test('bulkDeleteCourses should reject invalid IDs array', async () => {
    const req = { body: { ids: null } };
    let statusCode = null;
    let jsonResponse = null;
    const res = {
      status: (code) => {
        statusCode = code;
        return res;
      },
      json: (data) => {
        jsonResponse = data;
        return res;
      }
    };

    await adminCourseController.bulkDeleteCourses(req, res);
    expect(statusCode).toBe(400);
    expect(jsonResponse.success).toBe(false);
  });
});
