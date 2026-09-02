'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { connectDB, sequelize } = require('../config/db');
const { ensureCodingSchema } = require('../config/bootstrapCodingSchema');

(async () => {
  try {
    console.log('Connecting to database...');
    await connectDB();
    console.log('Executing ensureCodingSchema...');
    await ensureCodingSchema();
    console.log('✅ ensureCodingSchema completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  }
})();
