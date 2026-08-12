process.env.NODE_ENV = 'development';
require('dotenv').config({ path: 'D:/feedWeb (2)/feedWeb/backend/.env' });
const { sequelize, Interview, User, InterviewSession, InterviewResult, InterviewFeedback } = require('D:/feedWeb (2)/feedWeb/backend/src/models');
(async () => {
  try {
    const interview = await Interview.findByPk(13, {
      include: [
        { model: User, as: 'candidate', attributes: ['id', 'name', 'email', 'phone'] },
        { model: User, as: 'interviewer', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'creator', attributes: ['id', 'name'] },
        { model: InterviewSession, as: 'sessions' },
        { model: InterviewResult, as: 'result' },
        { model: InterviewFeedback, as: 'feedbacks' },
      ],
    });
    console.log('INTERVIEW FOUND:', !!interview);
    if (interview) {
      const json = interview.toJSON();
      console.log('id:', json.id, 'status:', json.status, 'type:', json.type);
      console.log('candidate:', json.candidate && json.candidate.name);
      console.log('interviewer:', json.interviewer && json.interviewer.name);
      console.log('creator:', json.creator && json.creator.name);
      console.log('sessions:', json.sessions && json.sessions.length);
      console.log('result:', json.result ? 'yes' : 'no');
      console.log('feedbacks:', json.feedbacks && json.feedbacks.length);
    }
  } catch (e) {
    console.log('QUERY ERROR:', e.message);
    if (e.stack) console.log(e.stack.split('\n').slice(0, 6).join('\n'));
  } finally {
    await sequelize.close();
  }
})();
