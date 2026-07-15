/**
 * One-off migration: rehash existing passwords that use the old cost factor (10)
 * to the new cost factor (12).
 *
 * Usage:  node scripts/rehash-passwords.js
 *
 * This reads all users, checks if their bcrypt hash starts with $2a$10$,
 * and if so re-hashes with cost 12 using the password stored in the DB.
 * Since we don't have the plaintext, this script can only be used if you
 * have access to plaintext passwords (NEVER log them).
 *
 * ALTERNATIVE: The auth service already rehashes on next successful login,
 * so this script is optional — existing passwords will be upgraded
 * automatically as users log in. Run this only if you want to force an
 * immediate bulk upgrade and have a way to obtain plaintext passwords.
 */
const bcrypt = require('bcryptjs');
const { sequelize } = require('../src/config/db');
const { User } = require('../src/models');

const BCRYPT_COST = 12;

async function rehashPasswords() {
  console.log('Scanning for passwords with weak hash (cost < 12)...');

  const users = await User.findAll({
    attributes: ['id', 'email', 'password', 'passwordVersion'],
  });

  let rehashed = 0;
  let skipped = 0;

  for (const user of users) {
    const hash = user.password;
    if (
      hash.startsWith('$2a$12$') ||
      hash.startsWith('$2b$12$') ||
      hash.startsWith('$2y$12$')
    ) {
      skipped++;
      continue;
    }

    if (
      !hash.startsWith('$2a$') &&
      !hash.startsWith('$2b$') &&
      !hash.startsWith('$2y$')
    ) {
      console.warn(`SKIP user ${user.email}: does not appear to be a bcrypt hash`);
      skipped++;
      continue;
    }

    const cost = parseInt(hash.substring(4, 2), 10);
    if (cost >= 12) {
      skipped++;
      continue;
    }

    // We can't rehash without the plaintext, but we flag the user
    // so the next login triggers rehashing.
    await User.update({ passwordVersion: 1 }, { where: { id: user.id } });
    rehashed++;
  }

  console.log(`Done. Flagged ${rehashed} user(s) for rehash on next login. Skipped ${skipped} user(s).`);
  console.log('Passwords will be upgraded to cost 12 on next successful login via the auth service.');
  await sequelize.close();
}

rehashPasswords().catch(err => {
  console.error('Rehash migration failed:', err);
  process.exit(1);
});
