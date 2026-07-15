const { ActivityLog } = require('../models');

/**
 * Log activity for audit trail
 */
const logActivity = async ({
  userId = null,
  userName = null,
  action,
  entityType = null,
  entityId = null,
  details = null,
  ipAddress = null,
  userAgent = null,
  status = 'SUCCESS'
}) => {
  try {
    await ActivityLog.create({
      userId,
      userName,
      action,
      entityType,
      entityId,
      details,
      ipAddress,
      userAgent,
      status
    });
  } catch (error) {
    console.error('Activity log error:', error.message);
  }
};

/**
 * Standard API response formatter
 */
const apiResponse = (res, statusCode, success, data = null, message = '', error = null) => {
  const response = {
    success,
    message
  };
  
  if (data !== null) {
    response.data = data;
  }
  
  if (error) {
    response.error = error;
  }
  
  return res.status(statusCode).json(response);
};

/**
 * Success response
 */
const successResponse = (res, data = null, message = 'Success') => {
  return apiResponse(res, 200, true, data, message);
};

/**
 * Error response
 */
const errorResponse = (res, statusCode, message, error = null) => {
  return apiResponse(res, statusCode, false, null, message, error);
};

/**
 * Not found response
 */
const notFoundResponse = (res, resource) => {
  return errorResponse(res, 404, `${resource} not found`);
};

/**
 * Unauthorized response
 */
const unauthorizedResponse = (res, message = 'Unauthorized access') => {
  return errorResponse(res, 401, message);
};

/**
 * Forbidden response
 */
const forbiddenResponse = (res, message = 'Access denied') => {
  return errorResponse(res, 403, message);
};

/**
 * Validation error response
 */
const validationErrorResponse = (res, message) => {
  return errorResponse(res, 422, message);
};

module.exports = {
  logActivity,
  apiResponse,
  successResponse,
  errorResponse,
  notFoundResponse,
  unauthorizedResponse,
  forbiddenResponse,
  validationErrorResponse
};