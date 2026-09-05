const { DataTypes } = require('sequelize');
module.exports = async function bootstrapInterviewGroups(sequelize, Participant) {
  const qi=sequelize.getQueryInterface();
  const columns=await qi.describeTable('interviews');
  if (!columns.mode) await qi.addColumn('interviews','mode',{type:DataTypes.STRING(32),allowNull:false,defaultValue:'INTERVIEW'});
  if (!columns.evaluation_criteria) await qi.addColumn('interviews','evaluation_criteria',{type:DataTypes.JSON,allowNull:true});
  await Participant.sync();
};
