/**
 * Monitoring Excel Report Generator (2-Sheet: Monitoring Report + Summary)
 * ─────────────────────────────────────────────────────────────────────────────
 * Matches the openpyxl template:
 * - Sheet 1: Monitoring Report (Time, Event Type, Direction, Count Number, Duration, Score Added, etc.)
 * - Sheet 2: Summary (Session Info, Scoring Summary with 60/20/10/10 components, Final Score)
 */

const ExcelJS = require('exceljs');

const MONITORING_SCORE_MAX = 60.0;
const MULTIPLE_FACE_SCORE_MAX = 10.0;
const NO_PERSON_SCORE_MAX = 10.0;
const MOBILE_SCORE_MAX = 20.0;

class MonitoringExcelService {
  /**
   * Generates a 2-sheet Excel workbook buffer
   * @param {Array} events - Array of timestamped malpractice events
   * @param {Object} metrics - Session summary metrics
   * @returns {Promise<Buffer>}
   */
  static async generateReportBuffer(events = [], metrics = {}) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'LMS AI Monitoring Engine';
    workbook.created = new Date();

    // ── SHEET 1: Monitoring Report ──────────────────────────────────────────
    const ws1 = workbook.addWorksheet('Monitoring Report');

    const headers = [
      'Time (sec)',
      'Event Type',
      'Direction',
      'Validation Status',
      'Actual Duration (sec)',
      'Unique Violation Time (sec)',
      'Eye + Head Score',
      'Final Score',
    ];

    ws1.addRow(headers);

    const headerRow = ws1.getRow(1);
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1F4E78' },
      };
      cell.font = {
        name: 'Segoe UI',
        size: 11,
        bold: true,
        color: { argb: 'FFFFFFFF' },
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    headerRow.height = 25;

    events.forEach((ev) => {
      const row = ws1.addRow([
        typeof ev.time === 'number' ? ev.time : (typeof ev.Time === 'number' ? ev.Time : 0),
        ev.eventType || ev['Event Type'] || 'Head',
        ev.direction || ev.Direction || 'Left',
        ev.validationStatus || ev['Validation Status'] || 'VALID VIOLATION (>= 3.0s)',
        ev.duration || ev['Actual Duration (sec)'] || ev['Duration (sec)'] || '3.0 sec',
        ev.uniqueViolationTime || ev['Unique Violation Time (sec)'] || `${(metrics.violationSeconds || 0).toFixed(2)} sec`,
        ev.eyeHeadScore || ev['Eye + Head Score'] || `${(metrics.monitoringScore || metrics.eyeHeadScore || 0).toFixed(2)} / 60`,
        ev.finalScore || ev['Final Score'] || `${(metrics.finalScore || 0).toFixed(2)} / 100`,
      ]);
      row.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    ws1.columns.forEach((column) => {
      let maxLength = 14;
      column.eachCell({ includeEmpty: false }, (cell) => {
        const len = cell.value ? String(cell.value).length : 0;
        if (len > maxLength) maxLength = len;
      });
      ws1.getColumn(column.number).width = Math.min(maxLength + 4, 35);
    });

    // ── SHEET 2: Summary ────────────────────────────────────────────────────
    const ws2 = workbook.addWorksheet('Summary');

    const cfgDur = Number(metrics.configuredDuration || metrics.configured_duration || metrics.testDuration || metrics.test_duration || 60.0);
    const actDur = Number(metrics.actualTestDuration || metrics.actual_test_duration || metrics.testDuration || metrics.test_duration || 60.0);
    const vSec = Number(metrics.violationSeconds || metrics.violation_seconds || 0.0);
    const vPct = Number(metrics.violationPercentage || metrics.violation_percentage || (actDur > 0 ? (vSec / actDur) * 100 : 0.0));
    const mScore = Number(metrics.monitoringScore || metrics.monitoring_score || metrics.eyeHeadScore || (actDur > 0 ? Math.min(60, (vSec / actDur) * 60) : 0.0));
    const mobCnt = Number(metrics.mobileCount || metrics.mobile_count || 0);
    const mobScore = Number(metrics.mobileScore || metrics.mobile_score || 0.0);
    const mobPct = (mobScore / MOBILE_SCORE_MAX) * 100.0;
    const mfCnt = Number(metrics.multipleFaceCount || metrics.multiple_face_count || 0);
    const mfScore = Number(metrics.multipleFaceScore || metrics.multiple_face_score || 0.0);
    const mfPct = (mfScore / MULTIPLE_FACE_SCORE_MAX) * 100.0;
    const npDet = Boolean(metrics.noPersonDetected || metrics.no_person_detected);
    const npScore = Number(metrics.noPersonScore || metrics.no_person_score || 0.0);
    const npPct = (npScore / NO_PERSON_SCORE_MAX) * 100.0;
    const finalScore = Number(metrics.finalScore || metrics.final_score || Math.min(100, mScore + mobScore + mfScore + npScore));
    const finalPct = finalScore;

    const summaryRows = [
      ['LMS MONITORING SUMMARY', ''],
      ['--------------------------------', '--------------------------------'],
      ['SESSION INFORMATION', ''],
      ['  Configured Duration', `${cfgDur.toFixed(2)} sec`],
      ['  Actual Test Duration', `${actDur.toFixed(2)} sec`],
      ['', ''],
      ['SCORING SUMMARY', ''],
      ['  Component', 'Violation / Count | Percentage | Score | Maximum'],
      ['  Eye + Head', `${vSec.toFixed(2)} sec | ${vPct.toFixed(2)}% | ${mScore.toFixed(2)} | 60`],
      ['  Mobile', `${mobCnt} | ${mobPct.toFixed(2)}% | ${mobScore.toFixed(2)} | 20`],
      ['  Multiple Face', `${mfCnt} | ${mfPct.toFixed(2)}% | ${mfScore.toFixed(2)} | 10`],
      ['  No Person', `${npDet ? 'Detected' : 'Not Detected'} | ${npPct.toFixed(2)}% | ${npScore.toFixed(2)} | 10`],
      ['', ''],
      ['FINAL SCORE', ''],
      ['  Eye + Head Score', `${mScore.toFixed(2)} / 60`],
      ['  Mobile Score', `${mobScore.toFixed(2)} / 20`],
      ['  Multiple Face Score', `${mfScore.toFixed(2)} / 10`],
      ['  No Person Score', `${npScore.toFixed(2)} / 10`],
      ['  Final Score', `${finalScore.toFixed(2)} / 100`],
      ['  Final Percentage', `${finalPct.toFixed(2)}%`],
      ['--------------------------------', '--------------------------------'],
      ['Calculation Formula', 'EyeHeadScore = (TotalUniqueValidViolationSeconds / ActualTestDurationSeconds) * 60'],
    ];

    summaryRows.forEach(([col1, col2]) => {
      const row = ws2.addRow([col1, col2]);
      if (col1.toUpperCase() === col1 && col1.trim().length > 0 && !col1.includes('-')) {
        row.font = { name: 'Segoe UI', size: 11, bold: true };
      }
    });

    ws2.columns = [
      { width: 35 },
      { width: 55 },
    ];

    return await workbook.xlsx.writeBuffer();
  }
}

module.exports = MonitoringExcelService;
