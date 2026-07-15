function normalize(str) {
  return String(str ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function gradeAnswer(question, submitted) {
  if (!question) {
    return { isCorrect: false, score: 0 };
  }
  if (!submitted) {
    return { isCorrect: false, score: 0 };
  }

  const type = (question.questionType || 'MCQ').toUpperCase();

  if (type === 'MCQ') {
    const expectedStr = String(question.correctAnswer ?? '').trim();
    let selectedIdx = submitted.selectedOption !== undefined && submitted.selectedOption !== null 
      ? parseInt(submitted.selectedOption, 10) 
      : -1;
      
    const submittedVal = String(submitted.answerText || submitted.answer || '').trim();

    if (selectedIdx === -1 && submittedVal) {
      if (Array.isArray(question.options)) {
        selectedIdx = question.options.findIndex(opt => normalize(opt) === normalize(submittedVal));
      }
    }

    // 1. If expected is index (0-3) or letter (A-D)
    let expectedIdx = -1;
    if (['A', 'B', 'C', 'D'].includes(expectedStr.toUpperCase())) {
      expectedIdx = expectedStr.toUpperCase().charCodeAt(0) - 65;
    } else if (['0', '1', '2', '3'].includes(expectedStr)) {
      expectedIdx = parseInt(expectedStr, 10);
    }

    if (expectedIdx !== -1) {
      if (selectedIdx === expectedIdx) return { isCorrect: true, score: 100 };
      if (Array.isArray(question.options) && selectedIdx >= 0 && selectedIdx < question.options.length) {
        if (normalize(question.options[expectedIdx]) === normalize(question.options[selectedIdx])) {
          return { isCorrect: true, score: 100 };
        }
      }
    }

    // 2. If expected is text, check if it matches selected option text
    if (Array.isArray(question.options) && selectedIdx >= 0 && selectedIdx < question.options.length) {
      if (normalize(expectedStr) === normalize(question.options[selectedIdx])) {
        return { isCorrect: true, score: 100 };
      }
    }

    // 3. Fallback: direct text match
    if (submittedVal && normalize(expectedStr) === normalize(submittedVal)) {
      return { isCorrect: true, score: 100 };
    }

    return { isCorrect: false, score: 0 };
  }

  if (type === 'TRUE_FALSE') {
    let expected = normalize(question.correctAnswer); // 'true' or 'false'
    if (expected === '0') expected = 'true';
    if (expected === '1') expected = 'false';

    let selectedIdx = submitted.selectedOption !== undefined && submitted.selectedOption !== null 
      ? parseInt(submitted.selectedOption, 10) 
      : -1;
    
    let submittedVal = '';
    if (selectedIdx === 0) {
      submittedVal = 'true';
    } else if (selectedIdx === 1) {
      submittedVal = 'false';
    } else {
      submittedVal = normalize(submitted.answerText || submitted.answer);
      if (submittedVal === '0') submittedVal = 'true';
      if (submittedVal === '1') submittedVal = 'false';
    }

    const isCorrect = expected === submittedVal;
    return { isCorrect, score: isCorrect ? 100 : 0 };
  }

  if (type === 'FILL_BLANK') {
    const submittedText = normalize(submitted.answerText || submitted.answer);
    
    let acceptable = [];
    if (question.correctAnswer) {
      acceptable.push(normalize(question.correctAnswer));
    }
    
    let accAnswers = question.acceptableAnswers;
    if (accAnswers) {
      if (Array.isArray(accAnswers)) {
        accAnswers.forEach(ans => {
          if (ans) acceptable.push(normalize(ans));
        });
      } else if (typeof accAnswers === 'string') {
        try {
          const parsed = JSON.parse(accAnswers);
          if (Array.isArray(parsed)) {
            parsed.forEach(ans => {
              if (ans) acceptable.push(normalize(ans));
            });
          } else {
            acceptable.push(normalize(accAnswers));
          }
        } catch (e) {
          acceptable.push(normalize(accAnswers));
        }
      }
    }
    
    const isCorrect = acceptable.includes(submittedText);
    return { isCorrect, score: isCorrect ? 100 : 0 };
  }

  if (type === 'MATCHING') {
    let pairs = question.pairs || [];
    if (typeof pairs === 'string') {
      try {
        pairs = JSON.parse(pairs);
      } catch (e) {
        pairs = [];
      }
    }
    if (!Array.isArray(pairs)) {
      pairs = [];
    }

    let submittedMap = submitted.matches;
    if (!submittedMap && (submitted.answerText || submitted.answer)) {
      try {
        submittedMap = JSON.parse(submitted.answerText || submitted.answer);
      } catch (e) {
        submittedMap = {};
      }
    }
    if (!submittedMap || typeof submittedMap !== 'object') {
      submittedMap = {};
    }

    let correctCount = 0;
    pairs.forEach(p => {
      if (p && p.left && p.right) {
        if (normalize(submittedMap[p.left]) === normalize(p.right)) {
          correctCount++;
        }
      }
    });

    const score = pairs.length ? Math.round((correctCount / pairs.length) * 100) : 0;
    return { isCorrect: score === 100, score, correctCount, total: pairs.length };
  }

  return { isCorrect: false, score: 0 };
}

module.exports = { gradeAnswer };
