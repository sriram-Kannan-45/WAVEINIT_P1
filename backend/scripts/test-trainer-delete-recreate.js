const { sequelize } = require('../src/config/db');
const { User, Training, Course, CourseTrainerAssignment, TrainingTrainerAssignment } = require('../src/models');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

async function call(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || data.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function run() {
  console.log('=== STARTING TRAINER CREATE -> DELETE -> RECREATE INTEGRATION TEST ===\n');

  try {
    // 1. Admin login
    console.log('[STEP 1] Login as Admin');
    const adminLogin = await call('POST', '/api/auth/login', {
      body: { email: 'admin@test.com', password: 'admin123', role: 'ADMIN' }
    });
    const adminToken = adminLogin.token;
    console.log('  ✓ Admin logged in successfully');

    // 2. Create Trainer with test email
    const testEmail = `trainer_lifecycle_${Date.now()}@test.com`;
    console.log(`\n[STEP 2] Create Trainer with email: ${testEmail}`);
    const createRes1 = await call('POST', '/api/admin/create-trainer', {
      token: adminToken,
      body: {
        name: 'Test Lifecycle Trainer',
        email: testEmail,
        password: 'Password123!',
        phone: '9876543210',
        employeeId: 'EMP-9999',
        department: 'Engineering',
        designation: 'Senior Trainer',
        status: 'APPROVED',
      }
    });
    const trainer1Id = createRes1.id || createRes1.trainer?.id;
    console.log(`  ✓ Trainer created with ID: ${trainer1Id}`);

    // Verify DB
    const dbTrainer1 = await User.findOne({ where: { email: testEmail, isDeleted: false } });
    if (!dbTrainer1 || dbTrainer1.id != trainer1Id) throw new Error('Trainer not found in DB after create');
    console.log('  ✓ DB record verified for Trainer #1');

    // Test trainer login
    const trLogin = await call('POST', '/api/auth/login', {
      body: { email: testEmail, password: 'Password123!', role: 'TRAINER' }
    });
    if (!trLogin.token) throw new Error('Trainer login failed');
    console.log('  ✓ Trainer logged in successfully');

    // 3. Delete Trainer
    console.log(`\n[STEP 3] Delete Trainer #${trainer1Id}`);
    const deleteRes1 = await call('DELETE', `/api/admin/trainers/${trainer1Id}`, {
      token: adminToken
    });
    console.log('  ✓ Delete response:', deleteRes1.message || 'Success');

    // Verify DB state after delete
    const dbTrainerAfterDel = await User.findOne({ where: { id: trainer1Id } });
    console.log(`  ✓ DB state after delete: isDeleted=${dbTrainerAfterDel?.isDeleted}, email=${dbTrainerAfterDel?.email || 'N/A (HARD DELETED)'}`);

    // Verify trainer list does not return deleted trainer
    const listRes = await call('GET', '/api/admin/trainers', { token: adminToken });
    const inList = (listRes.trainers || []).some(t => t.id === trainer1Id);
    if (inList) throw new Error('Deleted trainer still appears in trainer list!');
    console.log('  ✓ Trainer correctly excluded from GET /api/admin/trainers');

    // 4. Recreate Trainer using the EXACT SAME EMAIL
    console.log(`\n[STEP 4] Recreate Trainer using EXACT SAME EMAIL: ${testEmail}`);
    const createRes2 = await call('POST', '/api/admin/create-trainer', {
      token: adminToken,
      body: {
        name: 'Recreated Lifecycle Trainer',
        email: testEmail,
        password: 'NewPassword123!',
        phone: '1122334455',
        employeeId: 'EMP-9998',
        department: 'Product',
        designation: 'Lead Trainer',
        status: 'APPROVED',
      }
    });
    const trainer2Id = createRes2.id || createRes2.trainer?.id;
    console.log(`  ✓ Recreated Trainer successfully with ID: ${trainer2Id}`);

    // Verify new trainer can login with new credentials
    const trLogin2 = await call('POST', '/api/auth/login', {
      body: { email: testEmail, password: 'NewPassword123!', role: 'TRAINER' }
    });
    if (!trLogin2.token) throw new Error('Recreated trainer login failed');
    console.log('  ✓ Recreated trainer logged in successfully with new password');

    // 5. Test with assigned training & course
    console.log('\n[STEP 5] Test Trainer Deletion when assigned to Training Program & Course');
    const prog = await call('POST', '/api/admin/training-programs', {
      token: adminToken,
      body: { title: `Prog For Trainer ${Date.now()}`, description: 'Test program' }
    });
    const course = await call('POST', `/api/admin/training-programs/${prog.program.id}/courses`, {
      token: adminToken,
      body: {
        title: 'Assigned Course',
        description: 'Test course',
        trainerId: trainer2Id,
        status: 'PUBLISHED'
      }
    });
    console.log(`  ✓ Created training #${prog.program.id} and course #${course.course.id} assigned to trainer #${trainer2Id}`);

    // Delete trainer who has course assignment
    console.log(`  ✓ Deleting trainer #${trainer2Id} with active course assignments...`);
    const delRes2 = await call('DELETE', `/api/admin/trainers/${trainer2Id}`, {
      token: adminToken
    });
    console.log('  ✓ Delete response:', delRes2.message);

    // Recreate trainer for the 3rd time with same email to ensure assignment cleanup works
    console.log(`\n[STEP 6] Recreate Trainer for the 3rd time with same email: ${testEmail}`);
    const createRes3 = await call('POST', '/api/admin/create-trainer', {
      token: adminToken,
      body: {
        name: 'Third Generation Trainer',
        email: testEmail,
        password: 'ThirdPassword123!',
        phone: '9998887777',
        status: 'APPROVED',
      }
    });
    const trainer3Id = createRes3.id || createRes3.trainer?.id;
    console.log(`  ✓ Recreated Trainer #3 successfully with ID: ${trainer3Id}`);

    // Cleanup mock training & 3rd trainer
    console.log('\n[STEP 7] Cleanup test data');
    await call('DELETE', `/api/admin/training-programs/${prog.program.id}`, { token: adminToken }).catch(() => {});
    await call('DELETE', `/api/admin/trainers/${trainer3Id}`, { token: adminToken }).catch(() => {});
    console.log('  ✓ Cleanup finished');

    console.log('\n━━━ ALL TRAINER LIFECYCLE & RECREATION TESTS PASSED 100% ━━━\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST FAILED:', err.message);
    if (err.data) console.error('Error Details:', err.data);
    process.exit(1);
  }
}

run();
