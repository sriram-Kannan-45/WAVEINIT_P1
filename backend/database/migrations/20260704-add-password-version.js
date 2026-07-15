/**
 * Migration: add passwordVersion column to users table
 *
 * Tracks the hash algorithm version for future-proofing:
 *   - 1 = legacy bcrypt (cost 10 or unknown)
 *   - 2 = bcrypt cost 12+
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('users', 'passwordVersion', {
      type: Sequelize.INTEGER,
      defaultValue: 1,
      allowNull: false,
      comment: 'Tracks password hash algorithm version for future upgrades',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('users', 'passwordVersion');
  },
};
