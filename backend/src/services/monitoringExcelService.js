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
      'Participant ID',
      'Test Start Time',
      'Test End Time',
      'Actual Test Duration',
      'Violation Direction',
      'Violation Start Time',
      'Violation End Time',
      'Validated Violation Duration',
      'Eye + Head Score',
      'Final Monitoring Score',
      'Recorded Webcam Video URL',
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
    headerRow.height = 28;

    const pId = metrics.participantId || metrics.participant_id || 'Candidate';
    const sTime = metrics.startTime ? (typeof metrics.startTime === 'string' && metrics.startTime.includes('T') ? new Date(metrics.startTime).toLocaleTimeString() : String(metrics.startTime)) : '00:00:00';
    const eTime = metrics.endTime ? (typeof metrics.endTime === 'string' && metrics.endTime.includes('T') ? new Date(metrics.endTime).toLocaleTimeString() : String(metrics.endTime)) : '—';
    const actDurSec = Number(metrics.actualTestDurationSeconds ?? metrics.actualTestDuration ?? metrics.actual_test_duration ?? metrics.testDuration ?? metrics.test_duration ?? 0);
    const actDurStr = `${Math.floor(actDurSec / 60)}m ${Math.round(actDurSec % 60)}s (${actDurSec.toFixed(1)}s)`;
    const vidUrl = metrics.videoUrl || metrics.video_url || '—';

    if (events.length === 0) {
      // Add clean session row
      const row = ws1.addRow([
        pId,
        sTime,
        eTime,
        actDurStr,
        'None (Clean Session)',
        '—',
        '—',
        '0.0s',
        `${(metrics.monitoringScore || metrics.eyeHeadScore || 0).toFixed(2)} / 60`,
        `${(metrics.finalScore || 0).toFixed(2)} / 100`,
        vidUrl,
      ]);
      row.alignment = { horizontal: 'center', vertical: 'middle' };
    } else {
      events.forEach((ev) => {
        let evDur = 0;
        if (typeof ev.duration === 'number') {
          evDur = ev.duration;
        } else if (ev.durationMs) {
          evDur = ev.durationMs / 1000;
        } else if (ev['Actual Duration (sec)'] || ev['Duration (sec)']) {
          evDur = parseFloat(ev['Actual Duration (sec)'] || ev['Duration (sec)']) || 0;
        } else {
          evDur = 0;
        }

        let vStart = '0.0s';
        let vEnd = '0.0s';
        const intervalStart = ev.metadata?.violationStartTime || ev.startTime;
        const intervalEnd = ev.metadata?.violationEndTime || ev.endTime;
        if (intervalStart && intervalEnd) {
          vStart = typeof intervalStart === 'number' ? `${intervalStart.toFixed(1)}s` : new Date(intervalStart).toLocaleTimeString();
          vEnd = typeof intervalEnd === 'number' ? `${intervalEnd.toFixed(1)}s` : new Date(intervalEnd).toLocaleTimeString();
        } else if (typeof ev.time === 'number') {
          vStart = `${ev.time.toFixed(1)}s`;
          vEnd = `${(ev.time + evDur).toFixed(1)}s`;
        } else if (typeof ev.time === 'string' && ev.time.length > 0) {
          vStart = ev.time;
          vEnd = ev.time;
        } else if (ev.occurredAt || ev.timestamp) {
          const t = new Date(ev.occurredAt || ev.timestamp).toLocaleTimeString();
          vStart = new Date(new Date(ev.occurredAt || ev.timestamp).getTime() - evDur * 1000).toLocaleTimeString();
          vEnd = t;
        }

        const evType = ev.eventType || ev.event || ev['Event Type'] || 'Monitoring Event';
        const evDir = ev.metadata?.direction || ev.direction || ev.Direction || '';
        const dir = evDir ? `${evType} (${evDir})` : evType;

        const row = ws1.addRow([
          pId,
          sTime,
          eTime,
          actDurStr,
          dir,
          vStart,
          vEnd,
          `${evDur.toFixed(1)}s`,
          ev.eyeHeadScore || ev['Eye + Head Score'] || `${(metrics.monitoringScore || metrics.eyeHeadScore || 0).toFixed(2)} / 60`,
          ev.finalScore || ev['Final Score'] || `${(metrics.finalScore || 0).toFixed(2)} / 100`,
          vidUrl,
        ]);
        row.alignment = { horizontal: 'center', vertical: 'middle' };
      });
    }

    ws1.columns.forEach((column) => {
      let maxLength = 14;
      column.eachCell({ includeEmpty: false }, (cell) => {
        const len = cell.value ? String(cell.value).length : 0;
        if (len > maxLength) maxLength = len;
      });
      ws1.getColumn(column.number).width = Math.min(maxLength + 4, 38);
    });

    // ── SHEET 2: Summary ────────────────────────────────────────────────────
    const ws2 = workbook.addWorksheet('Summary');

    const cfgDur = Number(metrics.configuredDuration ?? metrics.configured_duration ?? metrics.testDuration ?? metrics.test_duration ?? 0);
    const actDur = Number(metrics.actualTestDurationSeconds ?? metrics.actualTestDuration ?? metrics.actual_test_duration ?? metrics.testDuration ?? metrics.test_duration ?? 0);
    const vSec = Number(metrics.violationSeconds ?? metrics.violation_seconds ?? 0);
    const vPct = Number(metrics.violationPercentage ?? metrics.violation_percentage ?? 0);
    const mScore = Number(metrics.monitoringScore ?? metrics.monitoring_score ?? metrics.eyeHeadScore ?? 0);
    const mobCnt = Number(metrics.mobileCount || metrics.mobile_count || 0);
    const mobScore = Number(metrics.mobileScore || metrics.mobile_score || (mobCnt > 0 ? 10.0 : 0.0));
    const mfCnt = Number(metrics.multipleFaceCount || metrics.multiple_face_count || 0);
    const mfScore = Number(metrics.multipleFaceScore || metrics.multiple_face_score || (mfCnt > 0 ? 10.0 : 0.0));
    const npDet = Boolean(metrics.noPersonDetected || metrics.no_person_detected);
    const npScore = Number(metrics.noPersonScore || metrics.no_person_score || (npDet ? 10.0 : 0.0));
    const tsCnt = Number(metrics.tabSwitchCount || metrics.tab_switch_count || 0);
    const tsScore = Number(metrics.tabSwitchScore || metrics.tab_switch_score || (tsCnt > 3 ? 10.0 : 0.0));
    const finalScore = Number(metrics.finalScore ?? metrics.final_score ?? 0);
    const finalPct = finalScore;

    const summaryRows = [
      ['LMS MONITORING SUMMARY', ''],
      ['--------------------------------', '--------------------------------'],
      ['SESSION INFORMATION', ''],
      ['  Participant ID', String(pId)],
      ['  Participant Name', String(metrics.participantName || metrics.name || 'Participant')],
      ['  Configured Duration', `${cfgDur.toFixed(2)} sec`],
      ['  Actual Test Duration', `${actDur.toFixed(2)} sec`],
      ['', ''],
      ['SCORING SUMMARY (5-PART MARKS)', ''],
      ['  Component', 'Violation / Count | Percentage | Score | Maximum'],
      ['  1. Eye + Head Tracking', `${vSec.toFixed(2)} sec | ${vPct.toFixed(2)}% | ${mScore.toFixed(2)} | 60`],
      ['  2. Mobile Phone Violation', `${mobCnt} Detected | ${(mobScore / 10 * 100).toFixed(1)}% | ${mobScore.toFixed(2)} | 10`],
      ['  3. Multiple Faces / Persons', `${mfCnt} Detected | ${(mfScore / 10 * 100).toFixed(1)}% | ${mfScore.toFixed(2)} | 10`],
      ['  4. No Person / Face Absent', `${npDet ? 'Detected' : 'Not Detected'} | ${(npScore / 10 * 100).toFixed(1)}% | ${npScore.toFixed(2)} | 10`],
      ['  5. Tab Switch / Fullscreen (>3)', `${tsCnt} switches | ${(tsScore / 10 * 100).toFixed(1)}% | ${tsScore.toFixed(2)} | 10`],
      ['', ''],
      ['FINAL SCORE', ''],
      ['  Eye + Head Score', `${mScore.toFixed(2)} / 60`],
      ['  Mobile Score', `${mobScore.toFixed(2)} / 10`],
      ['  Multiple Face Score', `${mfScore.toFixed(2)} / 10`],
      ['  No Person Score', `${npScore.toFixed(2)} / 10`],
      ['  Tab Switch Score', `${tsScore.toFixed(2)} / 10`],
      ['  Total Proctoring Mark', `${finalScore.toFixed(2)} / 100`],
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

  /**
   * Generates a multi-participant assessment marks spreadsheet buffer
   * where each participant is represented in a single row with their 5-component breakdown marks.
   */
  static async generateAssessmentParticipantsBuffer(participants = [], assessmentMeta = {}) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'LMS AI Monitoring Engine';
    workbook.created = new Date();

    const ws = workbook.addWorksheet('Participant Marks & Proctoring');

    // Title Banner
    ws.mergeCells('A1:P1');
    const titleCell = ws.getCell('A1');
    titleCell.value = `${assessmentMeta.title || 'Assessment'} - Participant Proctoring & Marks Report`;
    titleCell.font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 32;

    // Assessment Info Row
    ws.mergeCells('A2:P2');
    const infoCell = ws.getCell('A2');
    infoCell.value = `Exported: ${new Date().toLocaleString()} | Total Candidates: ${participants.length} | Configured Duration: ${assessmentMeta.configuredDuration || '—'}`;
    infoCell.font = { name: 'Segoe UI', size: 10, italic: true, color: { argb: 'FF334155' } };
    infoCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    infoCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(2).height = 20;

    // Headers Row (Row 3)
    const headers = [
      '#',
      'Participant Name',
      'Email Address',
      'Attempt ID',
      'Submission Status',
      'Submitted At',
      'Actual Test Duration',
      'Quiz Score (%)',
      'Eye + Head Score (/60)',
      'Face Absence Score (/10)',
      'Multi Persons Score (/10)',
      'Tab Switches Score (/10)',
      'Mobile Phone Score (/10)',
      'Total Audit Risk Score (/100)',
      'Risk Level',
      'Recorded Video Link',
    ];

    ws.addRow(headers);
    const headerRow = ws.getRow(3);
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
      cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });
    headerRow.height = 28;

    participants.forEach((p, idx) => {
      const row = ws.addRow([
        idx + 1,
        p.name || 'Unknown',
        p.email || '—',
        p.attemptId || p.id || '—',
        p.status || 'SUBMITTED',
        p.submittedAt ? new Date(p.submittedAt).toLocaleString() : '—',
        p.actualDuration || `${Math.floor((p.actualDurationSeconds || 0) / 60)}m ${(p.actualDurationSeconds || 0) % 60}s`,
        p.quizScore != null ? `${p.quizScore}%` : (p.percentage != null ? `${p.percentage}%` : '—'),
        `${(p.eyeHeadScore || 0).toFixed(2)} / 60`,
        `${(p.noPersonScore || 0).toFixed(1)} / 10`,
        `${(p.multiFaceScore || 0).toFixed(1)} / 10`,
        `${(p.tabSwitchScore || 0).toFixed(1)} / 10 (${p.tabSwitchCount || 0} switches)`,
        `${(p.mobileScore || 0).toFixed(1)} / 10 (${p.mobileCount || 0} phones)`,
        `${(p.finalScore || 0).toFixed(2)} / 100`,
        p.riskLevel || 'LOW',
        p.videoUrl ? { text: 'View Video', hyperlink: p.videoUrl } : 'No Video',
      ]);

      const isCritical = p.riskLevel === 'CRITICAL';
      const isHigh = p.riskLevel === 'HIGH';
      const isMedium = p.riskLevel === 'MEDIUM';

      row.alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' };
      row.getCell(3).alignment = { horizontal: 'left', vertical: 'middle' };

      const riskCell = row.getCell(15);
      if (isCritical) {
        riskCell.font = { bold: true, color: { argb: 'FFDC2626' } };
      } else if (isHigh) {
        riskCell.font = { bold: true, color: { argb: 'FFEA580C' } };
      } else if (isMedium) {
        riskCell.font = { bold: true, color: { argb: 'FFD97706' } };
      } else {
        riskCell.font = { bold: true, color: { argb: 'FF059669' } };
      }
      row.height = 22;
    });

    ws.columns = [
      { width: 5 },   // #
      { width: 24 },  // Name
      { width: 28 },  // Email
      { width: 12 },  // Attempt ID
      { width: 18 },  // Status
      { width: 22 },  // Submitted At
      { width: 20 },  // Actual Duration
      { width: 16 },  // Quiz Score
      { width: 22 },  // Eye+Head (/60)
      { width: 22 },  // Face Absence (/10)
      { width: 22 },  // Multi Persons (/10)
      { width: 25 },  // Tab Switches (/10)
      { width: 24 },  // Mobile (/10)
      { width: 26 },  // Total Risk (/100)
      { width: 15 },  // Risk Level
      { width: 20 },  // Video Link
    ];

    return await workbook.xlsx.writeBuffer();
  }
}

module.exports = MonitoringExcelService;
