/**
 * Public surface of the proctoring module.
 *
 *   import {
 *     ProctorProvider, useProctor,
 *     ProctoredExamPage,
 *     TrainerProctoringDashboard,
 *     proctorApi,
 *   } from '@/proctoring';
 */
export { ProctorProvider, useProctor } from './ProctorContext';
export { proctorApi } from './api';

export { default as ExamGate } from './components/ExamGate';
export { default as ProctoredExamShell } from './components/ProctoredExamShell';
export { default as ProctoredExamPage } from './components/ProctoredExamPage';
export { default as ViolationOverlay } from './components/ViolationOverlay';
export { default as TerminatedScreen } from './components/TerminatedScreen';
export { default as TrainerProctoringDashboard } from './components/TrainerProctoringDashboard';
export { default as TrainerMonitoringReport } from './components/TrainerMonitoringReport';
export { default as ParticipantMonitorCard } from './components/ParticipantMonitorCard';
export { default as SecurityBanner } from './components/SecurityBanner';

export { default as useDeviceFingerprint } from './hooks/useDeviceFingerprint';
export { default as useFullscreen } from './hooks/useFullscreen';
export { default as useTabVisibility } from './hooks/useTabVisibility';
export { default as useAntiCheat } from './hooks/useAntiCheat';
export { default as useScreenShare } from './hooks/useScreenShare';
export { default as useNetworkStatus } from './hooks/useNetworkStatus';
export { default as useExamTimer, formatRemaining } from './hooks/useExamTimer';
export { default as useProctorMonitor } from './hooks/useProctorMonitor';
export { default as useProctoringMedia } from './hooks/useProctoringMedia';

export * from './constants';
