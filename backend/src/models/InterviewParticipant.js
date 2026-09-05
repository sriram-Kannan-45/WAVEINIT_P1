const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

module.exports = sequelize.define('InterviewParticipant', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  interview_id: { type: DataTypes.BIGINT, allowNull: false, references: { model:'interviews', key:'id' }, onDelete:'CASCADE' },
  user_id: { type: DataTypes.BIGINT, allowNull: false, references: { model:'users', key:'id' }, onDelete:'CASCADE' },
  monitoring_session_id: { type: DataTypes.STRING(128), allowNull:true },
  status: { type: DataTypes.STRING(24), defaultValue:'INVITED', allowNull:false },
  joined_at: DataTypes.DATE,
  last_joined_at: DataTypes.DATE,
  left_at: DataTypes.DATE,
  participation_seconds: { type:DataTypes.INTEGER, defaultValue:0, allowNull:false },
  evaluation: { type:DataTypes.JSON, allowNull:true },
}, { tableName:'interview_participants', timestamps:true, createdAt:'created_at', updatedAt:'updated_at',
  indexes:[{unique:true,fields:['interview_id','user_id']},{fields:['user_id']}] });
