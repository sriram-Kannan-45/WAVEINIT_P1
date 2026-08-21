const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const LessonAssessment = sequelize.define('LessonAssessment', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true
  },
  lessonId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'lesson_id'
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  instructions: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  maxScore: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    defaultValue: 100,
    field: 'max_score'
  },
  isMandatory: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'is_mandatory'
  }
}, {
  tableName: 'lesson_assessments',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = LessonAssessment;
