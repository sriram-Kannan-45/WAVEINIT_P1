/**
 * requireUserId — guard middleware that ensures req.user.id exists
 * before any DB query runs. Avoids the SQL error
 *   "WHERE parameter participant_id has invalid undefined value"
 * that occurs when a controller forwards a missing id straight into
 * Sequelize.
 *
 * Must run AFTER `auth` (which sets req.user from the JWT).
 */
module.exports = function requireUserId(req, res, next) {
  const id = req.user?.id;
  if (id == null || id === '' || Number.isNaN(Number(id))) {
    return res.status(401).json({
      success: false,
      message: 'Authenticated user id missing — please sign in again',
      code: 'AUTH_USER_ID_MISSING',
    });
  }
  // Normalise to a number so downstream code never has to coerce.
  req.user.id = Number(id);
  next();
};
