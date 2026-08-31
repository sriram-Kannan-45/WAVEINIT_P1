/**
 * test-training-completion.js
 * ────────────────────────────
 * Comprehensive test suite verifying dynamic training completion percentage calculations:
 * 1. Empty training (0% with hasStructure: false)
 * 2. Structure addition (4 completed out of 10 total -> 40.00%)
 * 3. Adding more structure items reduces percentage dynamically (4 / 15 -> 26.67%)
 * 4. Completing another item increases percentage dynamically (5 / 15 -> 33.33%)
 * 5. Completing all structure items achieves 100.00%
 * 6. Removing structure items recalculates completion immediately
 * 7. Course & Batch calculation APIs
 */

const assert = require('assert');
const {
  sequelize,
  User,
  Training,
  Course,
  Lesson,
} = require('../src/models');
const {
  calculateTrainingCompletion,
  calculateCourseCompletion,
  batchCalculateTrainingsCompletion,
} = require('../src/services/trainingProgressService');

const { connectDB } = require('../src/config/db');

async function runTests() {
  console.log('\n======================================================');
  console.log('🧪 RUNNING DYNAMIC TRAINING COMPLETION TEST SUITE');
  console.log('======================================================\n');

  try {
    await connectDB();
    console.log('✅ Database connected and migrated');

    // 1. Setup Test Trainer
    let testTrainer = await User.findOne({ where: { email: 'test_completion_trainer@lms.local' } });
    if (!testTrainer) {
      testTrainer = await User.create({
        name: 'Completion Test Trainer',
        email: 'test_completion_trainer@lms.local',
        password: 'Password123!',
        role: 'TRAINER',
        status: 'APPROVED',
      });
    }

    // 2. Setup Test Training Program
    const testTraining = await Training.create({
      title: 'Full Stack Web Development Program',
      description: 'Comprehensive software training',
      trainerId: testTrainer.id,
      createdBy: testTrainer.id,
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-10-31'),
      capacity: 50,
    });
    console.log(`✅ Created test training: ID=${testTraining.id}`);

    // TEST 1: Empty Training (0% Completion)
    console.log('\n--- Test 1: Empty Training Initial State ---');
    const emptyProgress = await calculateTrainingCompletion(testTraining.id);
    console.log('Empty Progress Result:', emptyProgress);
    assert.strictEqual(emptyProgress.totalStructureItems, 0, 'Total structure items should be 0');
    assert.strictEqual(emptyProgress.completedStructureItems, 0, 'Completed items should be 0');
    assert.strictEqual(emptyProgress.completionPercentage, 0, 'Completion percentage should be 0');
    assert.strictEqual(emptyProgress.hasStructure, false, 'hasStructure should be false');
    console.log('✅ Test 1 Passed: Empty training returns 0% with hasStructure=false');

    // 3. Create a Course under the Training Program
    const testCourse = await Course.create({
      title: 'Node.js Backend & Architecture',
      description: 'Core backend engineering',
      trainingProgramId: testTraining.id,
      trainerId: testTrainer.id,
      status: 'PUBLISHED',
    });
    console.log(`✅ Created test course: ID=${testCourse.id}`);

    // TEST 2: Add 10 Structure Items (4 Completed, 2 In Progress, 4 Pending)
    console.log('\n--- Test 2: Add 10 Structure Items (4 Completed) ---');
    const initialLessons = [];
    for (let i = 1; i <= 10; i++) {
      let status = 'PENDING';
      if (i <= 4) status = 'COMPLETED';
      else if (i <= 6) status = 'IN_PROGRESS';

      const lesson = await Lesson.create({
        courseId: testCourse.id,
        trainerId: testTrainer.id,
        title: `Module ${i}: Topic ${i}`,
        description: `Description for topic ${i}`,
        status,
        orderIndex: i,
      });
      initialLessons.push(lesson);
    }

    const progress40 = await calculateTrainingCompletion(testTraining.id);
    console.log('Progress with 4/10 completed:', progress40);
    assert.strictEqual(progress40.totalStructureItems, 10, 'Total structure items should be 10');
    assert.strictEqual(progress40.completedStructureItems, 4, 'Completed items should be 4');
    assert.strictEqual(progress40.inProgressStructureItems, 2, 'In progress items should be 2');
    assert.strictEqual(progress40.pendingStructureItems, 4, 'Pending items should be 4');
    assert.strictEqual(progress40.completionPercentage, 40, 'Completion percentage should be exactly 40.00%');
    assert.strictEqual(progress40.hasStructure, true, 'hasStructure should be true');
    console.log('✅ Test 2 Passed: 4 of 10 structure items yields exactly 40.00%');

    // TEST 3: Add 5 More Structure Items (Total 15, Completed 4 -> Percentage decreases dynamically to 26.67%)
    console.log('\n--- Test 3: Add 5 More Structure Items (Total 15, Completed 4) ---');
    const addedLessons = [];
    for (let i = 11; i <= 15; i++) {
      const lesson = await Lesson.create({
        courseId: testCourse.id,
        trainerId: testTrainer.id,
        title: `Module ${i}: Advanced Topic ${i}`,
        description: `Description for topic ${i}`,
        status: 'PENDING',
        orderIndex: i,
      });
      addedLessons.push(lesson);
    }

    const progress26 = await calculateTrainingCompletion(testTraining.id);
    console.log('Progress with 4/15 completed:', progress26);
    assert.strictEqual(progress26.totalStructureItems, 15, 'Total structure items should be 15');
    assert.strictEqual(progress26.completedStructureItems, 4, 'Completed items should still be 4');
    // 4 / 15 * 100 = 26.6666... -> 26.67%
    assert.strictEqual(progress26.completionPercentage, 26.67, 'Completion percentage should drop dynamically to 26.67%');
    console.log('✅ Test 3 Passed: Dynamic percentage reduction verified (26.67%)');

    // TEST 4: Mark 1 more item COMPLETED (5/15 completed -> 33.33%)
    console.log('\n--- Test 4: Complete Another Structure Item (5 / 15) ---');
    await addedLessons[0].update({ status: 'COMPLETED' });

    const progress33 = await calculateTrainingCompletion(testTraining.id);
    console.log('Progress with 5/15 completed:', progress33);
    assert.strictEqual(progress33.totalStructureItems, 15, 'Total items should be 15');
    assert.strictEqual(progress33.completedStructureItems, 5, 'Completed items should now be 5');
    // 5 / 15 * 100 = 33.3333... -> 33.33%
    assert.strictEqual(progress33.completionPercentage, 33.33, 'Completion percentage should increase to 33.33%');
    console.log('✅ Test 4 Passed: Dynamic percentage increase verified (33.33%)');

    // TEST 5: Complete all 15 items (100.00%)
    console.log('\n--- Test 5: Complete All Structure Items (15 / 15) ---');
    await Lesson.update({ status: 'COMPLETED' }, { where: { courseId: testCourse.id } });

    const progress100 = await calculateTrainingCompletion(testTraining.id);
    console.log('Progress with 15/15 completed:', progress100);
    assert.strictEqual(progress100.totalStructureItems, 15, 'Total items should be 15');
    assert.strictEqual(progress100.completedStructureItems, 15, 'Completed items should be 15');
    assert.strictEqual(progress100.completionPercentage, 100, 'Completion percentage should be 100.00%');
    console.log('✅ Test 5 Passed: 100.00% completion verified');

    // TEST 6: Delete 5 items (10/10 remaining -> still 100%, or delete some completed)
    console.log('\n--- Test 6: Delete Structure Items & Course Completion API ---');
    const courseProg = await calculateCourseCompletion(testCourse.id);
    console.log('Course Progress:', courseProg);
    assert.strictEqual(courseProg.completionPercentage, 100, 'Course completion should be 100%');

    // Delete 5 items
    await Lesson.destroy({ where: { id: addedLessons.map(l => l.id) } });
    const afterDeleteProg = await calculateCourseCompletion(testCourse.id);
    console.log('Course Progress after deleting 5 items:', afterDeleteProg);
    assert.strictEqual(afterDeleteProg.totalStructureItems, 10, 'Total items should now be 10');
    assert.strictEqual(afterDeleteProg.completedStructureItems, 10, 'Completed items should be 10');
    assert.strictEqual(afterDeleteProg.completionPercentage, 100, 'Completion should remain 100%');
    console.log('✅ Test 6 Passed: Course completion and dynamic recalculation on deletion verified');

    // TEST 7: Batch Calculation API
    console.log('\n--- Test 7: Batch Calculation Engine ---');
    const batchMap = await batchCalculateTrainingsCompletion([testTraining.id]);
    assert.ok(batchMap.has(testTraining.id), 'Batch map should contain training id');
    const batchProg = batchMap.get(testTraining.id);
    assert.strictEqual(batchProg.completionPercentage, 100, 'Batch progress completion should match 100%');
    console.log('✅ Test 7 Passed: Batch calculation engine verified');

    // Cleanup Test Data
    console.log('\n--- Cleanup Test Records ---');
    await Lesson.destroy({ where: { courseId: testCourse.id } });
    await Course.destroy({ where: { id: testCourse.id } });
    await Training.destroy({ where: { id: testTraining.id } });
    console.log('✅ Cleaned up test records');

    console.log('\n======================================================');
    console.log('🎉 ALL DYNAMIC TRAINING COMPLETION TESTS PASSED!');
    console.log('======================================================\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST FAILED:', err);
    process.exit(1);
  }
}

runTests();
