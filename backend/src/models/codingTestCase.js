const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const CodingTestCase = sequelize.define('CodingTestCase', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true
  },
  problemId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'problem_id'
  },
  input: {
    type: DataTypes.TEXT,
    allowNull: false,
    defaultValue: ''
  },
  expectedOutput: {
    type: DataTypes.TEXT,
    allowNull: false,
    defaultValue: '',
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
  updatedAt: 'updated_at',
  hooks: {
    beforeValidate: (tc) => {
      if (tc.expectedOutput == null) {
        tc.expectedOutput = tc.output != null
          ? String(tc.output)
          : (tc.expected_output != null
            ? String(tc.expected_output)
            : (tc.expected != null
              ? String(tc.expected)
              : (tc.sampleOutput != null ? String(tc.sampleOutput) : '')));
      } else {
        tc.expectedOutput = String(tc.expectedOutput);
      }

      if (tc.input == null) {
        tc.input = tc.sampleInput != null ? String(tc.sampleInput) : '';
      } else {
        tc.input = String(tc.input);
      }
    }
  }
});

module.exports = CodingTestCase;
