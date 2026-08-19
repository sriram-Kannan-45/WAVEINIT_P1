import { useMemo } from 'react';
import { assetUrl } from '../api/api';

function formatTime(totalSeconds) {
  if (totalSeconds == null || totalSeconds < 0) return '--:--';
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function statusBadge(status) {
  const map = {
    'Not Started': 'bg-slate-100 text-slate-600',
    'In Progress': 'bg-green-100 text-green-700',
    Submitted: 'bg-blue-100 text-blue-700',
    Flagged: 'bg-red-100 text-red-700',
    Disqualified: 'bg-red-100 text-red-700',
  };
  return map[status] || 'bg-slate-100 text-slate-600';
}

export default function ParticipantCard({ participant, latestScreenshot, onClick }) {
  const imageSrc = useMemo(() => {
    if (latestScreenshot?.startsWith('data:')) return latestScreenshot;
    if (latestScreenshot) return assetUrl(latestScreenshot);
    return null;
  }, [latestScreenshot]);

  const highlighted = participant.violationCount > 3;

  return (
    <div
      onClick={onClick}
      className={`relative cursor-pointer overflow-hidden rounded-2xl border bg-white p-4 shadow-sm transition hover:shadow-md ${
        highlighted ? 'border-2 border-red-500 ring-2 ring-red-100' : 'border-slate-200'
      }`}
    >
      {/* Violation count badge */}
      {participant.violationCount > 0 && (
        <div className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white">
          {participant.violationCount}
        </div>
      )}

      <div className="mb-3 flex items-center gap-3">
        {participant.avatar ? (
          <img
            src={assetUrl(participant.avatar)}
            alt={participant.name}
            className="h-10 w-10 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 text-sm font-bold text-primary-700">
            {participant.name?.charAt(0).toUpperCase() || '?'}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{participant.name}</p>
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusBadge(
              participant.status
            )}`}
          >
            {participant.status}
          </span>
        </div>
      </div>

      <div className="mb-3">
        <p className="text-xs text-slate-500">Time remaining</p>
        <p className="font-mono text-lg font-semibold text-slate-800">
          {formatTime(participant.timeRemaining)}
        </p>
      </div>

      {/* Live YOLOv8 Proctoring Status */}
      {participant.yoloMonitoring && (
        <div className="mb-3 rounded-lg border border-slate-200/80 bg-slate-50/80 p-2 text-[11px] space-y-1">
          <div className="flex items-center justify-between text-slate-700">
            <span className="flex items-center gap-1 text-[10px] font-semibold text-blue-600 uppercase tracking-wider">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-ping" />
              YOLOv8 {participant.yoloMonitoring.cameraSource === 'MOBILE_CAMERA' ? 'Mobile' : 'PC'}
            </span>
            <span className="text-[10px] text-slate-400">
              {participant.yoloMonitoring.timestamp ? new Date(participant.yoloMonitoring.timestamp).toLocaleTimeString() : 'Active'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Detection:</span>
            <span className={`font-semibold px-1.5 py-0.5 rounded text-[10px] ${
              participant.yoloMonitoring.eventType === 'PHONE_DETECTED' || participant.yoloMonitoring.eventType === 'MULTIPLE_PERSONS_DETECTED'
                ? 'bg-red-100 text-red-700'
                : participant.yoloMonitoring.eventType === 'NO_PERSON_DETECTED'
                ? 'bg-amber-100 text-amber-700'
                : 'bg-emerald-100 text-emerald-700'
            }`}>
              {participant.yoloMonitoring.eventType.replace(/_/g, ' ')}
            </span>
          </div>
          <div className="flex items-center justify-between text-slate-500">
            <span>Confidence:</span>
            <span className="font-medium text-slate-700">{(participant.yoloMonitoring.confidence * 100).toFixed(0)}%</span>
          </div>
        </div>
      )}

      <div className="aspect-video overflow-hidden rounded-lg bg-slate-100">
        {imageSrc ? (
          <img
            src={imageSrc}
            alt="Latest screenshot"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
            No screenshot yet
          </div>
        )}
      </div>
    </div>
  );
}
