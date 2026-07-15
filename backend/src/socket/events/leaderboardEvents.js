/**
 * Leaderboard Socket Events
 *
 * Allows clients to subscribe to scoped leaderboard rooms so they receive
 * `leaderboard:update` broadcasts emitted by the quiz-submit handler.
 *
 * Rooms:
 *   leaderboard:global
 *   leaderboard:training:<trainingId>
 *   leaderboard:quiz:<quizId>
 */

const logger = require('../../utils/logger');

function roomFor(scope, id) {
  if (scope === 'global') return 'leaderboard:global';
  if ((scope === 'training' || scope === 'quiz') && id != null && String(id).length > 0) {
    return `leaderboard:${scope}:${id}`;
  }
  return null;
}

module.exports = (io, socket) => {
  socket.on('leaderboard:join', ({ scope, id } = {}) => {
    const room = roomFor((scope || 'global').toLowerCase(), id);
    if (!room) return;
    socket.join(room);
    logger.debug?.('Leaderboard subscribed', { userId: socket.userId, room });
  });

  socket.on('leaderboard:leave', ({ scope, id } = {}) => {
    const room = roomFor((scope || 'global').toLowerCase(), id);
    if (!room) return;
    socket.leave(room);
    logger.debug?.('Leaderboard unsubscribed', { userId: socket.userId, room });
  });
};
