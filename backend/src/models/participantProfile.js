const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

/**
 * ParticipantProfile
 * ─────────────────────────────────────────────────────────────────────────
 * Stores extra profile fields a participant can fill in (avatar, bio,
 * skills, social links) so the data is visible to trainers and admins.
 *
 * Linked 1-1 with the existing `users` table via userId. Adding this
 * table is purely additive — no existing schema is touched.
 */
const ParticipantProfile = sequelize.define(
  'ParticipantProfile',
  {
    id: {
      type: DataTypes.BIGINT,
      autoIncrement: true,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.BIGINT,
      allowNull: false,
      field: 'user_id',
    },
    displayName: {
      type: DataTypes.STRING(80),
      allowNull: true,
      field: 'display_name',
    },
    bio: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    avatarUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'avatar_url',
    },
    // JSON-encoded list of strings, kept as TEXT for portability.
    skills: {
      type: DataTypes.TEXT,
      allowNull: true,
      get() {
        const raw = this.getDataValue('skills');
        if (!raw) return [];
        try {
          const parsed = JSON.parse(raw);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      },
      set(value) {
        this.setDataValue(
          'skills',
          Array.isArray(value) ? JSON.stringify(value.slice(0, 30)) : null
        );
      },
    },
    // JSON-encoded {website,github,linkedin,twitter}.
    links: {
      type: DataTypes.TEXT,
      allowNull: true,
      get() {
        const raw = this.getDataValue('links');
        if (!raw) return {};
        try {
          const parsed = JSON.parse(raw);
          return parsed && typeof parsed === 'object' ? parsed : {};
        } catch {
          return {};
        }
      },
      set(value) {
        this.setDataValue(
          'links',
          value && typeof value === 'object' ? JSON.stringify(value) : null
        );
      },
    },
  },
  {
    tableName: 'participant_profiles',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { unique: true, fields: ['user_id'], name: 'participant_profiles_user_id_uq' },
    ],
  }
);

module.exports = ParticipantProfile;
