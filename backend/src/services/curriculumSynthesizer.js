'use strict';
// Compatibility API: curriculum synthesis is asynchronous and always uses live AI.
// No domain blueprints or generic curriculum templates are retained.
async function synthesizeCurriculum(intent = {}) {
  const {generateCourseStructure} = require('./courseStructureService');
  const result=await generateCourseStructure({prompt:JSON.stringify(intent),courseTitle:intent.courseTitle || ''});
  return result.structure;
}
module.exports={synthesizeCurriculum};
