/**
 * adminBulkImportController.js
 * ────────────────────────────
 * Handles bulk participant import from Excel files.
 * Validates rows, normalizes data via AI, generates accounts with
 * unique IDs and secure passwords, and produces downloadable credential sheets.
 */
const ExcelJS = require('exceljs');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const { User } = require('../models');
const { Op } = require('sequelize');
const axios = require('axios');

const BCRYPT_COST = 12;
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';
const MAX_ROWS = 10000;

const REQUIRED_COLUMNS = ['Full Name', 'Email', 'Phone Number'];
const OPTIONAL_COLUMNS = ['Department', 'Batch', 'Role'];
const ALL_COLUMNS = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS];

// ─── Helpers ───────────────────────────────────────────────────────────────

function generateParticipantId(index, year) {
  const seq = String(index).padStart(4, '0');
  return `WI${year}${seq}`;
}

function generateSecurePassword() {
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const special = '!@#$%^&*';
  const all = upper + lower + digits + special;

  let pw = '';
  // Ensure at least one of each category
  pw += upper[crypto.randomInt(upper.length)];
  pw += lower[crypto.randomInt(lower.length)];
  pw += digits[crypto.randomInt(digits.length)];
  pw += special[crypto.randomInt(special.length)];
  // Fill remaining 6 characters randomly
  for (let i = 0; i < 6; i++) {
    pw += all[crypto.randomInt(all.length)];
  }
  // Shuffle the password
  return pw.split('').sort(() => crypto.randomInt(3) - 1).join('');
}

function generateUsername(email) {
  const base = (email || '').split('@')[0].replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  return base || `user${Date.now()}`;
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

async function callAINormalize(names, departments) {
  try {
    const response = await axios.post(`${AI_SERVICE_URL}/normalize-data`, {
      names,
      departments,
    }, { timeout: 30000, headers: { 'Content-Type': 'application/json' } });
    if (response.data?.success) return response.data;
    return null;
  } catch (e) {
    console.warn('[BulkImport] AI normalization unavailable, using local fallback:', e.message);
    return null;
  }
}

function localNormalizeName(name) {
  if (!name) return name;
  return name.trim().replace(/\s+/g, ' ')
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function localNormalizeDept(dept) {
  if (!dept) return dept;
  return dept.trim()
    .split(/[\s\-]+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

// ─── Generate Sample Template ──────────────────────────────────────────────

async function downloadTemplate(req, res) {
  try {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Participants');

    // Header row
    const headers = ['Full Name', 'Email', 'Phone Number', 'Department', 'Batch', 'Role'];
    const headerRow = sheet.addRow(headers);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FF047857' } },
      };
    });
    headerRow.height = 28;

    // Example row
    const exampleRow = sheet.addRow(['John Doe', 'john@gmail.com', '9876543210', 'IT', 'React Batch', 'Participant']);
    exampleRow.eachCell((cell) => {
      cell.font = { italic: true, color: { argb: 'FF94A3B8' }, size: 10 };
      cell.alignment = { horizontal: 'left', vertical: 'middle' };
    });

    // Column widths
    sheet.getColumn(1).width = 22;
    sheet.getColumn(2).width = 30;
    sheet.getColumn(3).width = 18;
    sheet.getColumn(4).width = 18;
    sheet.getColumn(5).width = 20;
    sheet.getColumn(6).width = 16;

    // Instructions sheet
    const instrSheet = workbook.addWorksheet('Instructions');
    instrSheet.addRow(['Bulk Participant Import — Instructions']);
    instrSheet.addRow([]);
    instrSheet.addRow(['Required Columns:']);
    instrSheet.addRow(['  Full Name', 'Participant full name']);
    instrSheet.addRow(['  Email', 'Valid email address (must be unique)']);
    instrSheet.addRow(['  Phone Number', 'Phone number (7-15 digits)']);
    instrSheet.addRow([]);
    instrSheet.addRow(['Optional Columns:']);
    instrSheet.addRow(['  Department', 'Department or team name']);
    instrSheet.addRow(['  Batch', 'Batch or cohort identifier']);
    instrSheet.addRow(['  Role', 'Default: Participant']);
    instrSheet.addRow([]);
    instrSheet.addRow([`Maximum rows: ${MAX_ROWS}`]);
    instrSheet.getColumn(1).width = 30;
    instrSheet.getColumn(2).width = 45;
    instrSheet.getRow(1).font = { bold: true, size: 14 };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=Participant_Import_Template.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (e) {
    console.error('downloadTemplate:', e.message);
    res.status(500).json({ error: 'Failed to generate template' });
  }
}

// ─── Validate & Preview ────────────────────────────────────────────────────

async function validateAndPreview(req, res) {
  try {
    if (!req.file) return res.status(422).json({ error: 'No file uploaded' });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(req.file.path);
    const sheet = workbook.worksheets[0];
    if (!sheet || sheet.rowCount < 2) {
      return res.status(422).json({ error: 'Excel file is empty or has no data rows' });
    }

    // Parse headers
    const headerRow = sheet.getRow(1);
    const headers = [];
    headerRow.eachCell((cell, colNumber) => {
      headers[colNumber] = String(cell.value || '').trim();
    });

    // Validate required columns exist
    const headerMap = {};
    for (let col = 1; col <= headerRow.cellCount; col++) {
      const h = headers[col];
      if (h) headerMap[h.toLowerCase()] = col;
    }
    const missingCols = REQUIRED_COLUMNS.filter(c => !headerMap[c.toLowerCase()]);
    if (missingCols.length > 0) {
      return res.status(422).json({ error: `Missing required columns: ${missingCols.join(', ')}` });
    }

    // Parse rows
    const rows = [];
    const errors = [];
    const seenEmails = new Set();
    const dataRows = Math.min(sheet.rowCount - 1, MAX_ROWS);

    for (let i = 2; i <= dataRows + 1; i++) {
      const row = sheet.getRow(i);
      const rowNum = i - 1; // 1-based data row number

      const get = (colName) => {
        const col = headerMap[colName.toLowerCase()];
        if (!col) return '';
        const val = row.getCell(col).value;
        return val != null ? String(val).trim() : '';
      };

      const name = get('Full Name');
      const email = get('Email').toLowerCase();
      const phone = get('Phone Number');
      const department = get('Department');
      const batch = get('Batch');
      const role = get('Role') || 'Participant';

      // Skip fully empty rows
      if (!name && !email && !phone) continue;

      const rowErrors = [];
      if (!name) rowErrors.push('Full Name is required');
      if (!email) rowErrors.push('Email is required');
      else if (!validateEmail(email)) rowErrors.push('Invalid email format');
      else if (seenEmails.has(email)) rowErrors.push('Duplicate email in file');
      else seenEmails.add(email);
      if (!phone) rowErrors.push('Phone Number is required');
      else if (!validatePhone(phone)) rowErrors.push('Invalid phone number');

      rows.push({
        row: rowNum,
        name,
        email,
        phone: normalizePhone(phone),
        department,
        batch,
        role,
        valid: rowErrors.length === 0,
        errors: rowErrors,
      });

      if (rowErrors.length > 0) {
        errors.push({ row: rowNum, name, email, errors: rowErrors });
      }
    }

    if (rows.length === 0) {
      return res.status(422).json({ error: 'No valid data rows found in the Excel file' });
    }

    // Check for existing emails in database
    const allEmails = rows.filter(r => r.valid).map(r => r.email);
    const existingUsers = await User.findAll({
      where: { email: { [Op.in]: allEmails } },
      attributes: ['email'],
    });
    const existingEmails = new Set(existingUsers.map(u => u.email));

    for (const row of rows) {
      if (row.valid && existingEmails.has(row.email)) {
        row.valid = false;
        row.errors.push('Email already exists in the system');
        errors.push({ row: row.row, name: row.name, email: row.email, errors: ['Email already exists in the system'] });
      }
    }

    // Call AI normalization for valid rows
    const validRows = rows.filter(r => r.valid);
    const names = [...new Set(validRows.map(r => r.name))];
    const departments = [...new Set(validRows.filter(r => r.department).map(r => r.department))];

    let aiResult = null;
    if (names.length > 0) {
      aiResult = await callAINormalize(names, departments);
    }

    // Apply normalization
    const nameMap = {};
    const deptMap = {};
    if (aiResult?.normalized_names) {
      for (const item of aiResult.normalized_names) {
        nameMap[item.original] = item.normalized;
      }
    }
    if (aiResult?.normalized_departments) {
      for (const item of aiResult.normalized_departments) {
        deptMap[item.original] = item.normalized;
      }
    }

    // Apply normalization to rows
    for (const row of rows) {
      if (!row.valid) continue;
      const origName = row.name;
      row.name = nameMap[row.name] || localNormalizeName(row.name);
      if (row.department) {
        row.department = deptMap[row.department] || localNormalizeDept(row.department);
      }
      row.normalizedName = row.name !== origName;
    }

    const validCount = rows.filter(r => r.valid).length;
    const invalidCount = rows.filter(r => !r.valid).length;
    const normalizedCount = rows.filter(r => r.valid && r.normalizedName).length;

    // Clean up uploaded file
    try { require('fs').unlinkSync(req.file.path); } catch (_) {}

    res.json({
      success: true,
      preview: rows,
      summary: {
        totalRows: rows.length,
        validRows: validCount,
        invalidRows: invalidCount,
        normalizedNames: normalizedCount,
        duplicateEmailsInFile: errors.filter(e => e.errors.some(x => x.includes('Duplicate email'))).length,
        existingEmails: errors.filter(e => e.errors.some(x => x.includes('already exists'))).length,
      },
      errors,
    });
  } catch (e) {
    console.error('validateAndPreview:', e.message);
    res.status(500).json({ error: 'Failed to validate file: ' + e.message });
  }
}

// ─── Execute Import ────────────────────────────────────────────────────────

async function executeImport(req, res) {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(422).json({ error: 'No valid rows to import' });
    }

    const validRows = rows.filter(r => r.valid);
    if (validRows.length === 0) {
      return res.status(422).json({ error: 'No valid rows to import' });
    }

    const year = new Date().getFullYear();
    const results = [];
    const credentials = [];
    const failures = [];

    // Get the max existing ID to avoid conflicts
    const lastUser = await User.findOne({
      where: { role: 'PARTICIPANT' },
      order: [['id', 'DESC']],
      attributes: ['id'],
    });
    let startSeq = (lastUser?.id || 0) + 1;

    // Check existing emails one more time
    const emailsToCheck = validRows.map(r => r.email);
    const existingUsers = await User.findAll({
      where: { email: { [Op.in]: emailsToCheck } },
      attributes: ['email'],
    });
    const existingEmailSet = new Set(existingUsers.map(u => u.email));

    for (const row of validRows) {
      try {
        if (existingEmailSet.has(row.email)) {
          failures.push({
            row: row.row,
            name: row.name,
            email: row.email,
            reason: 'Email already exists in the system',
          });
          continue;
        }

        const participantId = generateParticipantId(startSeq++, year);
        const plainPassword = generateSecurePassword();
        const hashedPassword = await bcrypt.hash(plainPassword, BCRYPT_COST);
        const username = generateUsername(row.email);

        const user = await User.create({
          name: row.name,
          email: row.email,
          password: hashedPassword,
          phone: row.phone || null,
          username,
          role: 'PARTICIPANT',
          status: 'APPROVED',
          passwordVersion: 2,
        });

        credentials.push({
          participantId: `WI${user.id}`,
          name: row.name,
          email: row.email,
          password: plainPassword,
          department: row.department || '',
          batch: row.batch || '',
          status: 'Created',
        });

        results.push({ row: row.row, email: row.email, userId: user.id, success: true });
      } catch (e) {
        console.error(`Failed to create participant (${row.email}):`, e.message);
        failures.push({
          row: row.row,
          name: row.name,
          email: row.email,
          reason: e.message || 'Database error',
        });
        results.push({ row: row.row, email: row.email, success: false, error: e.message });
      }
    }

    // Generate credential Excel
    let credentialBuffer = null;
    if (credentials.length > 0) {
      const credWorkbook = new ExcelJS.Workbook();
      const credSheet = credWorkbook.addWorksheet('Credentials');
      const credHeaders = ['Participant ID', 'Full Name', 'Email', 'Password', 'Department', 'Batch', 'Status'];
      const hRow = credSheet.addRow(credHeaders);
      hRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });
      hRow.height = 28;

      for (const c of credentials) {
        const r = credSheet.addRow([c.participantId, c.name, c.email, c.password, c.department, c.batch, c.status]);
        r.eachCell((cell) => {
          cell.alignment = { vertical: 'middle' };
        });
      }

      credSheet.getColumn(1).width = 18;
      credSheet.getColumn(2).width = 24;
      credSheet.getColumn(3).width = 30;
      credSheet.getColumn(4).width = 18;
      credSheet.getColumn(5).width = 18;
      credSheet.getColumn(6).width = 20;
      credSheet.getColumn(7).width = 14;

      credentialBuffer = await credWorkbook.xlsx.writeBuffer();
    }

    // Generate error report Excel
    let errorBuffer = null;
    if (failures.length > 0) {
      const errWorkbook = new ExcelJS.Workbook();
      const errSheet = errWorkbook.addWorksheet('Failed Participants');
      const errHeaders = ['Row Number', 'Full Name', 'Email', 'Reason'];
      const eRow = errSheet.addRow(errHeaders);
      eRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });
      eRow.height = 28;

      for (const f of failures) {
        errSheet.addRow([f.row, f.name, f.email, f.reason]);
      }

      errSheet.getColumn(1).width = 14;
      errSheet.getColumn(2).width = 24;
      errSheet.getColumn(3).width = 30;
      errSheet.getColumn(4).width = 45;

      errorBuffer = await errWorkbook.xlsx.writeBuffer();
    }

    res.json({
      success: true,
      summary: {
        totalProcessed: validRows.length,
        imported: credentials.length,
        failed: failures.length,
      },
      credentials,
      failures,
      credentialExcel: credentialBuffer ? credentialBuffer.toString('base64') : null,
      errorExcel: errorBuffer ? errorBuffer.toString('base64') : null,
    });
  } catch (e) {
    console.error('executeImport:', e.message);
    res.status(500).json({ error: 'Failed to execute import: ' + e.message });
  }
}

module.exports = {
  downloadTemplate,
  validateAndPreview,
  executeImport,
};
