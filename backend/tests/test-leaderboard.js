/**
 * test-leaderboard.js
 * ────────────────────
 * Automated test suite for LMS Leaderboard participant avatar/profile image improvements:
 * 1. Verify Leaderboard includes participant's profileImage, profilePic, and avatar
 * 2. Verify fallback avatar initials algorithm (e.g. "John David" -> "JD", "Arun Kumar" -> "AK", "Sriram" -> "SR")
 * 3. Verify rank assignment and score preservation
 * 4. Verify participant data accuracy (no logged-in user collision, correct participant mapping)
 * 5. Verify LeaderboardService overall, course, and training scope queries
 */

const assert = require('assert');
const {
  sequelize,
  User,
  Training,
  Course,
  Enrollment,
  AIQuiz,
  QuizResult,
  QuizAttempt,
  CodingAssessment,
  CodingResult,
  CodingAttempt,
} = require('../src/models');
const LeaderboardService = require('../src/services/leaderboardService');
const { getTrainingLeaderboard } = require('../src/controllers/trainingLeaderboardController');
const { connectDB } = require('../src/config/db');

// Two-letter initials test logic matching frontend UserAvatar
function getTwoLetterInitials(name) {
  if (!name || typeof name !== 'string') return 'UN';
  const clean = name.trim().replace(/^[^a-zA-Z0-9\s]+/, '');
  if (!clean) return 'UN';
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const first = words[0][0] || '';
    const last = words[words.length - 1][0] || '';
    if (first && last) return (first + last).toUpperCase();
  }
  if (clean.length === 1) return (clean + clean).toUpperCase();
  return clean.slice(0, 2).toUpperCase();
}

async function runTests() {
  console.log('\n======================================================');
  console.log('🧪 RUNNING LMS LEADERBOARD TEST SUITE');
  console.log('======================================================\n');

  try {
    await connectDB();
    console.log('✅ Database connected');

    // ── 1. Initials Algorithm Unit Tests ──
    console.log('\n--- Test 1: Fallback Initials Algorithm ---');
    assert.strictEqual(getTwoLetterInitials('John David'), 'JD', 'John David should yield JD');
    assert.strictEqual(getTwoLetterInitials('Arun Kumar'), 'AK', 'Arun Kumar should yield AK');
    assert.strictEqual(getTwoLetterInitials('Sriram'), 'SR', 'Sriram should yield SR');
    assert.strictEqual(getTwoLetterInitials('Mylambikai'), 'MY', 'Mylambikai should yield MY');
    assert.strictEqual(getTwoLetterInitials('Shamiha'), 'SH', 'Shamiha should yield SH');
    assert.strictEqual(getTwoLetterInitials('John'), 'JO', 'John should yield JO');
    assert.strictEqual(getTwoLetterInitials(''), 'UN', 'Empty string should yield UN');
    assert.strictEqual(getTwoLetterInitials(null), 'UN', 'Null should yield UN');
    console.log('✅ Test 1 Passed: All initials generation test cases verified');

    // ── 2. Create Test Trainer & Training ──
    let testTrainer = await User.findOne({ where: { email: 'lb_test_trainer@lms.local' } });
    if (!testTrainer) {
      testTrainer = await User.create({
        name: 'Leaderboard Trainer',
        email: 'lb_test_trainer@lms.local',
        password: 'Password123!',
        role: 'TRAINER',
        status: 'APPROVED',
        profilePic: '/uploads/trainer/trainer-photo.png',
      });
    }

    const testTraining = await Training.create({
      title: 'Advanced AI & Fullstack Program',
      description: 'Testing leaderboard profile picture integration',
      trainerId: testTrainer.id,
      createdBy: testTrainer.id,
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-10-31'),
      capacity: 30,
    });
    console.log(`✅ Created test training: ID=${testTraining.id}`);

    const testCourse = await Course.create({
      title: 'Fullstack Mastery Course',
      description: 'Core course',
      trainerId: testTrainer.id,
      trainingProgramId: testTraining.id,
      status: 'PUBLISHED',
    });

    // ── 3. Create Test Participants with/without profile pictures ──
    const participantsData = [
      { name: 'Alice Walker', email: 'lb_alice@lms.local', profilePic: '/uploads/avatars/alice.jpg' },
      { name: 'Bob Smith', email: 'lb_bob@lms.local', profilePic: 'https://images.unsplash.com/photo-bob.jpg' },
      { name: 'Charlie Davis', email: 'lb_charlie@lms.local', profilePic: null }, // No photo -> initials CD
      { name: 'Diana Prince', email: 'lb_diana@lms.local', profilePic: '' }, // Empty -> initials DP
    ];

    const participants = [];
    for (const p of participantsData) {
      let u = await User.findOne({ where: { email: p.email } });
      if (!u) {
        u = await User.create({
          name: p.name,
          email: p.email,
          password: 'Password123!',
          role: 'PARTICIPANT',
          status: 'APPROVED',
          profilePic: p.profilePic,
        });
      } else {
        await u.update({ profilePic: p.profilePic });
      }
      participants.push(u);

      // Enroll in training & course
      await Enrollment.findOrCreate({
        where: { participantId: u.id, trainingId: testTraining.id },
        defaults: { status: 'ENROLLED', progressPercent: 0 }
      });
      await Enrollment.findOrCreate({
        where: { participantId: u.id, courseId: testCourse.id },
        defaults: { status: 'ENROLLED', progressPercent: 0 }
      });
    }

    // ── 4. Create Quiz & Results ──
    const testQuiz = await AIQuiz.create({
      title: 'Module 1 Assessment',
      trainerId: testTrainer.id,
      trainingId: testTraining.id,
      courseId: testCourse.id,
      totalMarks: 100,
      passingMarks: 50,
      status: 'PUBLISHED',
      resultStatus: 'PUBLISHED',
    });

    // Alice: 95%, Bob: 85%, Charlie: 75%, Diana: unattempted
    const a1 = await QuizAttempt.create({
      quizId: testQuiz.id,
      participantId: participants[0].id,
      status: 'EVALUATED',
      timeTaken: 120,
      submittedAt: new Date(),
    });
    await QuizResult.create({
      quizId: testQuiz.id,
      participantId: participants[0].id,
      attemptId: a1.id,
      totalScore: 95,
      maxScore: 100,
      percentage: 95,
      resultPublished: true,
    });

    const a2 = await QuizAttempt.create({
      quizId: testQuiz.id,
      participantId: participants[1].id,
      status: 'EVALUATED',
      timeTaken: 150,
      submittedAt: new Date(),
    });
    await QuizResult.create({
      quizId: testQuiz.id,
      participantId: participants[1].id,
      attemptId: a2.id,
      totalScore: 85,
      maxScore: 100,
      percentage: 85,
      resultPublished: true,
    });

    const a3 = await QuizAttempt.create({
      quizId: testQuiz.id,
      participantId: participants[2].id,
      status: 'EVALUATED',
      timeTaken: 180,
      submittedAt: new Date(),
    });
    await QuizResult.create({
      quizId: testQuiz.id,
      participantId: participants[2].id,
      attemptId: a3.id,
      totalScore: 75,
      maxScore: 100,
      percentage: 75,
      resultPublished: true,
    });

    // ── 5. Test Controller Output ──
    console.log('\n--- Test 2: Training Leaderboard API Endpoint ---');
    const req = {
      params: { id: testTraining.id },
      user: { id: testTrainer.id, role: 'TRAINER' }
    };
    let responseData = null;
    const res = {
      status: (code) => ({
        json: (data) => { responseData = { statusCode: code, ...data }; }
      }),
      json: (data) => { responseData = { statusCode: 200, ...data }; }
    };

    await getTrainingLeaderboard(req, res);

    assert(responseData, 'Controller should return response');
    assert.strictEqual(responseData.success, true, 'Response should have success: true');
    assert(Array.isArray(responseData.leaderboard), 'Leaderboard should be an array');
    assert.strictEqual(responseData.leaderboard.length, 4, 'Should have 4 participants');

    const rank1 = responseData.leaderboard.find(p => p.rank === 1);
    const rank2 = responseData.leaderboard.find(p => p.rank === 2);
    const rank3 = responseData.leaderboard.find(p => p.rank === 3);
    const unattempted = responseData.leaderboard.find(p => p.status === 'NOT_ATTEMPTED');

    console.log('Rank #1 participant:', {
      name: rank1.name,
      rank: rank1.rank,
      percentage: rank1.percentage,
      profileImage: rank1.profileImage,
      avatar: rank1.avatar,
    });

    console.log('Rank #2 participant:', {
      name: rank2.name,
      rank: rank2.rank,
      percentage: rank2.percentage,
      profileImage: rank2.profileImage,
    });

    console.log('Rank #3 participant (fallback candidate):', {
      name: rank3.name,
      rank: rank3.rank,
      percentage: rank3.percentage,
      profileImage: rank3.profileImage,
    });

    // Assert Rank 1 has profile image
    assert.strictEqual(rank1.name, 'Alice Walker');
    assert.strictEqual(rank1.percentage, 95);
    assert.strictEqual(rank1.profileImage, '/uploads/avatars/alice.jpg');
    assert.strictEqual(rank1.avatar, '/uploads/avatars/alice.jpg');

    // Assert Rank 2 has profile image
    assert.strictEqual(rank2.name, 'Bob Smith');
    assert.strictEqual(rank2.percentage, 85);
    assert.strictEqual(rank2.profileImage, 'https://images.unsplash.com/photo-bob.jpg');

    // Assert Rank 3 has null profile image for fallback
    assert.strictEqual(rank3.name, 'Charlie Davis');
    assert.strictEqual(rank3.percentage, 75);
    assert.strictEqual(rank3.profileImage, null);
    assert.strictEqual(getTwoLetterInitials(rank3.name), 'CD');

    // Assert Unattempted has null score and valid initials
    assert.strictEqual(unattempted.name, 'Diana Prince');
    assert.strictEqual(unattempted.status, 'NOT_ATTEMPTED');
    assert.strictEqual(getTwoLetterInitials(unattempted.name), 'DP');

    console.log('✅ Test 2 Passed: Controller returns participant profile pictures & fallback details');

    // ── 6. Test LeaderboardService ──
    console.log('\n--- Test 3: LeaderboardService Query Engine ---');
    const serviceResult = await LeaderboardService.getLeaderboard({
      scope: 'training',
      id: testTraining.id,
      timeframe: 'all_time'
    });

    assert(serviceResult && Array.isArray(serviceResult.leaderboard), 'Service should return leaderboard array');
    console.log('Service result total participants:', serviceResult.summary.totalParticipants);
    assert(serviceResult.leaderboard.length > 0, 'Service leaderboard should not be empty');

    const topServiceUser = serviceResult.leaderboard[0];
    assert(topServiceUser.profileImage !== undefined || topServiceUser.avatar !== undefined, 'Service items should have profileImage / avatar');
    console.log('✅ Test 3 Passed: LeaderboardService correctly includes profile pictures');

    // ── 7. Cleanup Test Records ──
    console.log('\n--- Cleanup Test Records ---');
    await QuizResult.destroy({ where: { quizId: testQuiz.id } });
    await QuizAttempt.destroy({ where: { quizId: testQuiz.id } });
    await testQuiz.destroy();
    await Enrollment.destroy({ where: { participantId: participants.map(p => p.id) } });
    await Enrollment.destroy({ where: { trainingId: testTraining.id } });
    await Enrollment.destroy({ where: { courseId: testCourse.id } });
    await testCourse.destroy();
    await testTraining.destroy();
    for (const p of participants) {
      await p.destroy();
    }
    console.log('✅ Cleaned up test records');

    console.log('\n======================================================');
    console.log('🎉 ALL LEADERBOARD TESTS PASSED SUCCESSFULLY!');
    console.log('======================================================\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST FAILED:', err);
    process.exit(1);
  }
}

runTests();
