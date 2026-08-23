const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { resolveParticipantAction, getParticipantContext } = require('../src/services/participantChatbotService');

async function testLiveContext() {
  console.log('🔍 Testing live context resolution for participant userId = 3...');
  const context = await getParticipantContext(3, { currentRoute: '/participant', currentTab: 'overview' });
  console.log('Fetched Context:', {
    user: context.user,
    profileCompletion: context.profile?.completionPercent,
    coursesCount: context.courses?.length,
    courses: context.courses?.map(c => c.courseTitle),
    availableQuizzesCount: context.quizzes?.availableList?.length,
    availableQuizzes: context.quizzes?.availableList?.map(q => q.title),
    certificatesCount: context.certificatesCount,
  });

  const testQueries = [
    'open the quiz',
    'start the quiz',
    'open quiz',
    'take quiz',
    'open my course',
    'open the course',
    'open profile',
    'open the profile',
    'show certificates',
    'what should i do next?',
    'scan qr',
    'quiz open pannu'
  ];

  console.log('\n🧠 Testing Intent Resolution on live participant context:\n');
  for (const q of testQueries) {
    const result = resolveParticipantAction(q, context);
    console.log(`Query: "${q}"`);
    console.log(`  -> Intent: ${result.intent}`);
    console.log(`  -> Action:`, result.action);
    console.log(`  -> Reply: ${result.reply?.split('\n')[0]}\n`);
  }
}

testLiveContext().then(() => {
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
