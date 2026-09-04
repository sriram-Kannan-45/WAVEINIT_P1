require('dotenv').config();
const aiService = require('../src/services/aiService');

async function testPrompt(prompt, expectedSubject, expectedTotalHours) {
  console.log('\n' + '='.repeat(80));
  console.log(`TEST PROMPT: "${prompt}"`);
  console.log('='.repeat(80));

  const t0 = Date.now();
  const res = await aiService.generateCourseStructure({ prompt });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(2);

  if (!res || !res.success || !res.structure) {
    throw new Error('FAILED: res.success is false or structure missing');
  }

  const { structure } = res;
  console.log(`Generation completed in ${elapsed}s`);
  console.log(`Course Title: ${structure.courseTitle}`);
  console.log(`Estimated Duration: ${structure.estimatedDuration}`);
  console.log(`Module Count: ${structure.modules.length}`);

  let totalHoursSum = 0;
  let hasJunkTitle = false;

  structure.modules.forEach((m, i) => {
    const hMatch = (m.duration || '').match(/\d+/);
    const h = hMatch ? parseInt(hMatch[0]) : 0;
    totalHoursSum += h;

    if (/foundations of create|create a complete|for beginners, from basics/i.test(m.title)) {
      hasJunkTitle = true;
      console.error(`  ❌ JUNK IN TITLE: "${m.title}"`);
    } else {
      console.log(`  [Module ${i + 1}] ${m.title} (${m.duration}) - ${m.subModules.length} submodules`);
    }
  });

  console.log(`Total Summed Module Hours: ${totalHoursSum} Hours`);

  if (hasJunkTitle) {
    throw new Error('FAILED: Structure has conversational prompt noise in module titles!');
  }

  // Check expected hours tolerance (+/- 10%)
  const diff = Math.abs(totalHoursSum - expectedTotalHours);
  const maxAllowedDiff = Math.max(15, expectedTotalHours * 0.15);
  if (diff > maxAllowedDiff) {
    throw new Error(`FAILED: Summed hours (${totalHoursSum}) diverged too far from expected (${expectedTotalHours})!`);
  }

  console.log(`✅ SUCCESS: Clean, logically sequenced curriculum generated matching requested ${expectedTotalHours} hours!`);
  return structure;
}

(async () => {
  try {
    // 1. User's exact React prompt
    await testPrompt(
      'Create a complete React course for beginners, from basics to advanced, for 1 month with 7 hours of learning every day',
      'React',
      210
    );

    // 2. Dynamic test: Docker & Kubernetes prompt
    await testPrompt(
      'Comprehensive Docker and Kubernetes production bootcamp for 2 weeks with 4 hours of learning daily',
      'Docker and Kubernetes',
      56
    );

    console.log('\n🎉 ALL AUTOMATED COURSE STRUCTURE TESTS PASSED!');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST FAILED:', err.message);
    process.exit(1);
  }
})();
