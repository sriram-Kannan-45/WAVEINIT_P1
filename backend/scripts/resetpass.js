const bcrypt = require('bcryptjs');
const { sequelize } = require('../src/config/db');
const { unlockAll } = require('../src/middleware/loginRateLimiter');

(async () => {
  try {
    const pairs = [
      { email: 'admin@test.com', password: 'admin123', role: 'ADMIN' },
      { email: 'wavene20@gmail.com', password: 'sriram123@', role: 'TRAINER' },
      { email: 'participantdd6901@gmail.com', password: 'RoleMatrixPass@2026!', role: 'PARTICIPANT' },
      { email: 'testlogin@gmail.com', password: 'password123', role: 'PARTICIPANT' },
      { email: 'titooram123@gmail.com', password: 'sriram123@', role: 'PARTICIPANT' },
      { email: 'prasanna@gmail.com', password: '123456789', role: 'TRAINER' },
    ];

    console.log('Resetting test account passwords in database...');

    for (const p of pairs) {
      const pw = await bcrypt.hash(p.password, 12);
      const [results] = await sequelize.query(
        'UPDATE users SET password = :pw, "passwordVersion" = 2, status = \'APPROVED\', "isDeleted" = false WHERE LOWER(email) = LOWER(:email)',
        { replacements: { pw, email: p.email } }
      );
      console.log(`✓ Set ${p.email} (${p.role}) => password: "${p.password}"`);
    }

    // Clear any active lockout state
    unlockAll();
    console.log('✓ Cleared all in-memory lockouts.');

    await sequelize.close();
    console.log('Done.');
    process.exit(0);
  } catch (err) {
    console.error('Error resetting passwords:', err);
    process.exit(1);
  }
})();

