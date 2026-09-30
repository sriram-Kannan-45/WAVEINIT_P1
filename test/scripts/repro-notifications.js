// Direct reproduction of the GET /api/notifications 500 (no schema sync, no
// MySQL-only introspection). Run: node test/scripts/repro-notifications.js
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'diagnostic-only-secret';

const path = require('node:path');
const backend = path.join(__dirname, '..', '..', 'backend');

(async () => {
  const { sequelize } = require(path.join(backend, 'src', 'config', 'db'));
  const { Notification } = require(path.join(backend, 'src', 'models'));
  const NotificationService = require(path.join(backend, 'src', 'services', 'notificationService'));

  await sequelize.authenticate();
  const table = Notification.getTableName();
  console.log('RESULT table:', JSON.stringify(table));

  const [rows] = await sequelize.query(
    'SELECT column_name FROM information_schema.columns WHERE table_schema = :schema AND table_name = :table ORDER BY ordinal_position',
    { replacements: { schema: 'public', table: typeof table === 'string' ? table : table.tableName } }
  );
  console.log('RESULT columns:', rows.map((r) => Object.values(r)[0]).join(', '));

  try {
    const c = await Notification.count();
    console.log('RESULT plain count OK:', c);
  } catch (e) {
    console.log('RESULT plain count THREW:', e.name, '|', e.message);
  }

  try {
    const r = await NotificationService.getNotifications(1, { limit: 15, offset: 0 });
    console.log(`RESULT service OK count=${r.count} rows=${r.notifications.length} unread=${r.unreadCount}`);
  } catch (e) {
    console.log('RESULT service THREW:', e.name, '|', e.message);
    if (e.sql) console.log('RESULT sql:', String(e.sql).slice(0, 400));
  }

  await sequelize.close();
  process.exit(0);
})().catch((e) => { console.error('RESULT fatal:', e.name, e.message); process.exit(1); });