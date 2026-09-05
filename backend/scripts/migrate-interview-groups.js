const { sequelize, InterviewParticipant } = require('../src/models');
require('../src/config/bootstrapInterviewGroups')(sequelize,InterviewParticipant)
  .then(()=>console.log('Interview Group Discussion schema ready'))
  .catch(error=>{console.error(error.message);process.exitCode=1;})
  .finally(()=>sequelize.close());
