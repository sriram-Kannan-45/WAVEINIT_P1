const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const TrainerEducation = sequelize.define('TrainerEducation', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true
  },
  userId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    field: 'user_id'
  },
  school: {
    type: DataTypes.STRING(200),
    allowNull: false,
    comment: 'School or university name'
  },
  degree: {
    type: DataTypes.STRING(200),
    allowNull: true,
    comment: 'e.g. Bachelor of Science'
  },
  fieldOfStudy: {
    type: DataTypes.STRING(200),
    allowNull: true,
    field: 'field_of_study',
    comment: 'e.g. Computer Science'
  },
  startYear: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'start_year'
  },
  endYear: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'end_year'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'trainer_educations',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = TrainerEducation;
