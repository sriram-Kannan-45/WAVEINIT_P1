'use strict';

/**
 * Single source of truth for Hiring assignment/candidate statuses.
 *
 * Every layer (models, bootstrap, services, policies, controllers) must read
 * from this module so the database enum, the ORM enum and the business logic
 * can never drift apart again.
 */

const HIRING_ASSIGNMENT_STATUSES = Object.freeze([
  'ASSIGNED',
  'IN_PROGRESS',
  'COMPLETED',
  'EVALUATED',
  'EXPIRED',
  'REVOKED',
  'DROPPED',
]);

const HIRING_CANDIDATE_STATUSES = Object.freeze([
  'PENDING',
  'ASSIGNED',
  'IN_PROGRESS',
  'COMPLETED',
  'EVALUATED',
  'EXPIRED',
  'REVOKED',
  'DROPPED',
]);

const HIRING_ASSESSMENT_STATUSES = Object.freeze([
  'DRAFT',
  'PUBLISHED',
  'ASSIGNED',
  'IN_PROGRESS',
  'COMPLETED',
  'EVALUATED',
  'EXPIRED',
]);

// Statuses that are no longer considered an active assignment.
const INACTIVE_ASSIGNMENT_STATUSES = Object.freeze(['REVOKED', 'EXPIRED', 'DROPPED']);

const ACTIVE_ASSIGNMENT_STATUSES = Object.freeze([
  'ASSIGNED',
  'IN_PROGRESS',
]);

module.exports = {
  HIRING_ASSIGNMENT_STATUSES,
  HIRING_CANDIDATE_STATUSES,
  HIRING_ASSESSMENT_STATUSES,
  INACTIVE_ASSIGNMENT_STATUSES,
  ACTIVE_ASSIGNMENT_STATUSES,
};