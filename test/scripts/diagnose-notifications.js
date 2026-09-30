// Reproduce the /api/notifications 500 and print the underlying Sequelize error.
// Run: node test/scripts/diagnose-notifications.js
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'diagnostic-only-secret';

const path = require('node:path');
const backend = path.join(__dirname, '..', '..', 'backend');

// NOTE: this project runs on PostgreSQL (Supabase), so introspection must use
// information_schema rather than MySQL's SHOW TABLES.
(async () => {
  const { connectDB, sequelize } = require(path.join(backend, 'src', 'config', 'db'));
  const { Notification } = require(path.join(backend, 'src', 'models'));
  const NotificationService = require(path.join(backend, 'src', 'services', 'notificationService'));

  await connectDB();

  const [tables] = await sequelize.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name ILIKE '%notification%'"
  );
  console.log('RESULT notification tables:', JSON.stringify(tables.map((t) => t.table_name)));

  for (const t of tables) {
    const [cols] = await sequelize.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",
      { bind: [t.table_name] }
    );
    console.log(`RESULT columns(${t.table_name}):`, cols.map((c) => c.column_name).join(', '));
  }

  try {
    const { rows, count } = await Notification.findAndCountAll({
      where: { userId: 1 },
      order: [['createdAt', 'DESC']],
      limit: 15,
      offset: 0,
    });
    console.log(`RESULT findAndCountAll OK count=${count} rows=${rows.length}`);
  } catch (e) {
    console.log('RESULT findAndCountAll FAILED:', e.message);
    if (e.sql) console.log('RESULT SQL:', e.sql);
  }

  try {
    const r = await NotificationService.getNotifications(1, { limit: 15, offset: 0 });
    console.log(`RESULT service.getNotifications OK count=${r.count} rows=${r.notifications.length}`);
  } catch (e) {
    console.log('RESULT service.getNotifications FAILED:', e.message);
    if (e.sql) console.log('RESULT service SQL:', e.sql);
  }

  await sequelize.close();
  process.exit(0);
})().catch((e) => { console.error('RESULT fatal:', e.message); process.exit(1); });