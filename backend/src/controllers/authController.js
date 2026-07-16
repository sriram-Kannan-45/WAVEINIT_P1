const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User } = require('../models');
require('dotenv').config();

const BCRYPT_COST = 12;

function isWeakHash(hash) {
  return typeof hash === 'string' && (
    hash.startsWith('$2a$10$') ||
    hash.startsWith('$2b$10$') ||
    hash.startsWith('$2y$10$')
  );
}

const generateUsername = async (name) => {
  const baseName = name.replace(/[^a-zA-Z]/g, '').toLowerCase().slice(0, 4);
  let username = baseName + Math.floor(1000 + Math.random() * 9000);
  
  let exists = await User.findOne({ where: { username } });
  while (exists) {
    username = baseName + Math.floor(1000 + Math.random() * 9000);
    exists = await User.findOne({ where: { username } });
  }
  
  return username;
};

const generateTempPassword = () => {
  return Math.random().toString(36).slice(-8);
};

const login = async (req, res) => {
  try {
    const { email, username, password, role: requestedRole } = req.body;

    const credential = email || username;

    if (!credential || !password) {
      return res.status(422).json({ error: 'Email/Username and password are required' });
    }

    const user = await User.findOne({
      where: { email: credential, isDeleted: false }
    }) || await User.findOne({
      where: { username: credential, isDeleted: false }
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    if (isWeakHash(user.password)) {
      const rehashed = await bcrypt.hash(password, BCRYPT_COST);
      await User.update({ password: rehashed, passwordVersion: 2 }, { where: { id: user.id } });
    }

    if (user.role === 'PARTICIPANT' && user.status === 'PENDING') {
      return res.status(403).json({ error: 'Your account is pending approval. Please wait for admin to approve your registration.' });
    }

    if (user.status === 'INACTIVE') {
      return res.status(403).json({ error: 'Your account has been deactivated. Please contact your administrator.' });
    }

    if (requestedRole && requestedRole !== user.role) {
      console.log(`⚠️ Role mismatch: requested=${requestedRole}, actual=${user.role}`);
      return res.status(403).json({ error: 'Incorrect role selected. Please choose the correct role.' });
    }

    // Force password change on first login (passwordVersion === 1 means temp password)
    const forcePasswordChange = user.passwordVersion < 2;

    const tokenPayload = {
      id: user.id,
      participantId: user.role === 'PARTICIPANT' ? user.id : undefined,
      role: user.role.toLowerCase(),
      email: user.email
    };

    const token = jwt.sign(
      tokenPayload,
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Track login activity
    try {
      const { ParticipantTracking } = require('../models');
      if (user.role === 'PARTICIPANT') {
        await ParticipantTracking.create({
          userId: user.id,
          loginTime: new Date(),
          lastActivity: new Date()
        });
      }
    } catch (e) {
      console.error('Participant tracking login log failed:', e.message);
    }

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      username: user.username,
      role: user.role,
      status: user.status,
      forcePasswordChange,
      token
    });
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({ error: 'Server error during login' });
  }
};

const register = async (req, res) => {
  try {
    const { name, email, password, phone, role } = req.body;

    if (role && role !== 'PARTICIPANT') {
      return res.status(403).json({ error: 'Only participants are allowed to register' });
    }

    if (!name || !email || !password || !phone) {
      return res.status(422).json({ error: 'Name, email, password, and phone are required' });
    }

    const existingUser = await User.findOne({ where: { email } });

    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_COST);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      phone,
      role: 'PARTICIPANT',
      status: 'PENDING',
      passwordVersion: 2
    });

    res.status(201).json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      message: 'Registration submitted. Please wait for admin approval.'
    });
  } catch (error) {
    console.error('Register error:', error.message);
    res.status(500).json({ error: 'Server error during registration' });
  }
};

const createTrainer = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(422).json({ error: 'Name, email, and password are required' });
    }

    if (password.length < 6) {
      return res.status(422).json({ error: 'Password must be at least 6 characters' });
    }

    const existingUser = await User.findOne({ where: { email } });

    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const username = email.split('@')[0];
    
    const hashedPassword = await bcrypt.hash(password, BCRYPT_COST);

    const trainer = await User.create({
      name,
      email,
      username,
      password: hashedPassword,
      phone: null,
      role: 'TRAINER',
      passwordVersion: 2
    });

    res.status(201).json({
      id: trainer.id,
      name: trainer.name,
      email: trainer.email,
      username: trainer.username,
      role: trainer.role,
      message: 'Trainer created successfully'
    });
  } catch (error) {
    console.error('Create trainer error:', error.message);
    res.status(500).json({ error: 'Server error creating trainer' });
  }
};

const changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user.id;

    if (!oldPassword || !newPassword) {
      return res.status(422).json({ error: 'Old and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(422).json({ error: 'Password must be at least 6 characters' });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isValid = await bcrypt.compare(oldPassword, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_COST);

    await User.update(
      { password: hashedPassword, passwordVersion: 2 },
      { where: { id: userId } }
    );

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error.message);
    res.status(500).json({ error: 'Server error changing password' });
  }
};

const getTrainers = async (req, res) => {
  try {
    const trainers = await User.findAll({
      where: { role: 'TRAINER' },
      attributes: ['id', 'name', 'email', 'username']
    });

    res.json({ trainers });
  } catch (error) {
    console.error('Get trainers error:', error.message);
    res.status(500).json({ error: 'Server error fetching trainers' });
  }
};

const logout = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (userId) {
      const { ParticipantTracking } = require('../models');
      const lastRecord = await ParticipantTracking.findOne({
        where: { userId, logoutTime: null },
        order: [['created_at', 'DESC']]
      });
      if (lastRecord) {
        await lastRecord.update({
          logoutTime: new Date(),
          lastActivity: new Date()
        });
      }
    }
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error.message);
    res.status(500).json({ error: 'Server error during logout' });
  }
};

module.exports = {
  login,
  register,
  createTrainer,
  changePassword,
  getTrainers,
  logout
};