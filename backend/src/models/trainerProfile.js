const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const TrainerProfile = sequelize.define('TrainerProfile', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true
  },
  userId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'user_id'
  },
  dob: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: true
  },
  address: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  qualification: {
    type: DataTypes.STRING,
    allowNull: true
  },
  experience: {
    type: DataTypes.STRING,
    allowNull: true
  },
  imagePath: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'image_path'
  },
  coverImagePath: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'cover_image_path'
  },
  headline: {
    type: DataTypes.STRING(200),
    allowNull: true,
    comment: 'e.g. Senior Software Engineer | React & Node.js Expert'
  },
  about: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  skills: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    comment: 'JSON array of skill strings'
  },
  certifications: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    comment: 'JSON array of certification strings'
  },
  socialLinks: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: {},
    field: 'social_links',
    comment: 'JSON object with linkedin, github, website, twitter keys'
  }
}, {
  tableName: 'trainer_profiles',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { unique: true, fields: ['user_id'], name: 'trainer_profiles_user_id_uq' },
  ]
});

module.exports = TrainerProfile;
