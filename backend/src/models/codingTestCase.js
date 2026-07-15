const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const CodingTestCase = sequelize.define('CodingTestCase', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true
  },
  problemId: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    field: 'problem_id'
  },
  input: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  expectedOutput: {
    type: DataTypes.TEXT,
    allowNull: false,
    field: 'expected_output'
  },
  isHidden: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_hidden'
  },
  description: {
    type: DataTypes.STRING,
    allowNull: true
  },
  order: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
}, {
  tableName: 'coding_test_cases',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = CodingTestCase;
