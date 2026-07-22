import { useState } from 'react';
import { motion } from 'framer-motion';
import { Settings, Bell, Video, Shield, CheckCircle } from 'lucide-react';

function Toggle({ label, description, checked, onChange }) {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex-1 min-w-0 mr-4">
        <p className="text-xs font-semibold text-slate-900">{label}</p>
        {description && <p className="text-[11px] text-slate-500 mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${
          checked ? 'bg-emerald-600' : 'bg-slate-200'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-[18px]' : 'translate-x-[3px]'
          }`}
        />
      </button>
    </div>
  );
}

export default function InterviewSettings({ user }) {
  const [saved, setSaved] = useState(false);

  const [features, setFeatures] = useState({
    recordingEnabled: true,
    screenShareEnabled: true,
    whiteboardEnabled: false,
    chatEnabled: true,
    resumeViewerEnabled: false,
    notesEnabled: false,
    mobileCameraEnabled: false,
    qrVerificationEnabled: false,
    aiSummaryEnabled: false,
  });

  const [notifications, setNotifications] = useState({
    emailOnScheduled: true,
    emailOnReminder: true,
    emailOnCompleted: true,
    smsOnScheduled: false,
    smsOnReminder: true,
    smsOnCompleted: false,
  });

  const [room, setRoom] = useState({
    timeoutMinutes: '60',
    autoEndOnLastLeave: true,
    waitingRoom: false,
  });

  const [recording, setRecording] = useState({
    autoRecord: false,
  });

  const [security, setSecurity] = useState({
    requirePassword: false,
    qrVerificationRequired: false,
    maxFailedAttempts: '3',
  });

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
        >
          <div>
            <h1 className="text-lg font-bold text-slate-900">Interview Settings</h1>
            <p className="text-xs text-slate-500 mt-0.5">Configure default interview preferences</p>
          </div>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl transition-colors flex items-center gap-2"
          >
            {saved ? <CheckCircle size={14} /> : <Settings size={14} />}
            {saved ? 'Settings saved' : 'Save Settings'}
          </button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-white rounded-2xl border border-slate-100 p-5"
        >
          <div className="flex items-center gap-2 mb-4">
            <Video size={14} className="text-emerald-600" />
            <h2 className="text-sm font-semibold text-slate-900">Default Features</h2>
          </div>
          <div className="divide-y divide-slate-50">
            <Toggle
              label="Recording"
              description="Automatically enable recording for new interviews"
              checked={features.recordingEnabled}
              onChange={(v) => setFeatures(p => ({ ...p, recordingEnabled: v }))}
            />
            <Toggle
              label="Screen Share"
              description="Allow participants to share their screen"
              checked={features.screenShareEnabled}
              onChange={(v) => setFeatures(p => ({ ...p, screenShareEnabled: v }))}
            />
            <Toggle
              label="Whiteboard"
              description="Enable collaborative whiteboard"
              checked={features.whiteboardEnabled}
              onChange={(v) => setFeatures(p => ({ ...p, whiteboardEnabled: v }))}
            />
            <Toggle
              label="Chat"
              description="Enable in-room chat messaging"
              checked={features.chatEnabled}
              onChange={(v) => setFeatures(p => ({ ...p, chatEnabled: v }))}
            />
            <Toggle
              label="Resume Viewer"
              description="Show candidate resume in the room"
              checked={features.resumeViewerEnabled}
              onChange={(v) => setFeatures(p => ({ ...p, resumeViewerEnabled: v }))}
            />
            <Toggle
              label="Notes"
              description="Enable trainer notes during interview"
              checked={features.notesEnabled}
              onChange={(v) => setFeatures(p => ({ ...p, notesEnabled: v }))}
            />
            <Toggle
              label="Mobile Camera"
              description="Allow secondary camera from mobile device"
              checked={features.mobileCameraEnabled}
              onChange={(v) => setFeatures(p => ({ ...p, mobileCameraEnabled: v }))}
            />
            <Toggle
              label="QR Verification"
              description="Require QR code verification for participants"
              checked={features.qrVerificationEnabled}
              onChange={(v) => setFeatures(p => ({ ...p, qrVerificationEnabled: v }))}
            />
            <Toggle
              label="AI Summary"
              description="Generate AI-powered interview summary"
              checked={features.aiSummaryEnabled}
              onChange={(v) => setFeatures(p => ({ ...p, aiSummaryEnabled: v }))}
            />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl border border-slate-100 p-5"
        >
          <div className="flex items-center gap-2 mb-4">
            <Bell size={14} className="text-emerald-600" />
            <h2 className="text-sm font-semibold text-slate-900">Notification Preferences</h2>
          </div>
          <div className="divide-y divide-slate-50">
            <Toggle
              label="Email on Interview Scheduled"
              description="Send email when a new interview is created"
              checked={notifications.emailOnScheduled}
              onChange={(v) => setNotifications(p => ({ ...p, emailOnScheduled: v }))}
            />
            <Toggle
              label="Email Reminder"
              description="Send reminder email before interview starts"
              checked={notifications.emailOnReminder}
              onChange={(v) => setNotifications(p => ({ ...p, emailOnReminder: v }))}
            />
            <Toggle
              label="Email on Completed"
              description="Send email when interview is completed"
              checked={notifications.emailOnCompleted}
              onChange={(v) => setNotifications(p => ({ ...p, emailOnCompleted: v }))}
            />
            <Toggle
              label="SMS on Interview Scheduled"
              description="Send SMS when a new interview is created"
              checked={notifications.smsOnScheduled}
              onChange={(v) => setNotifications(p => ({ ...p, smsOnScheduled: v }))}
            />
            <Toggle
              label="SMS Reminder"
              description="Send SMS reminder before interview starts"
              checked={notifications.smsOnReminder}
              onChange={(v) => setNotifications(p => ({ ...p, smsOnReminder: v }))}
            />
            <Toggle
              label="SMS on Completed"
              description="Send SMS when interview is completed"
              checked={notifications.smsOnCompleted}
              onChange={(v) => setNotifications(p => ({ ...p, smsOnCompleted: v }))}
            />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-white rounded-2xl border border-slate-100 p-5"
        >
          <div className="flex items-center gap-2 mb-4">
            <Video size={14} className="text-emerald-600" />
            <h2 className="text-sm font-semibold text-slate-900">Room Settings</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-900 block mb-1.5">Default Room Timeout</label>
              <select
                value={room.timeoutMinutes}
                onChange={(e) => setRoom(p => ({ ...p, timeoutMinutes: e.target.value }))}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              >
                <option value="30">30 minutes</option>
                <option value="45">45 minutes</option>
                <option value="60">60 minutes</option>
                <option value="90">90 minutes</option>
                <option value="120">120 minutes</option>
              </select>
            </div>
            <div className="divide-y divide-slate-50">
              <Toggle
                label="Auto-end on Last Participant Leave"
                description="Automatically end the interview when all participants leave"
                checked={room.autoEndOnLastLeave}
                onChange={(v) => setRoom(p => ({ ...p, autoEndOnLastLeave: v }))}
              />
              <Toggle
                label="Waiting Room"
                description="Participants wait in a lobby before being admitted"
                checked={room.waitingRoom}
                onChange={(v) => setRoom(p => ({ ...p, waitingRoom: v }))}
              />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-2xl border border-slate-100 p-5"
        >
          <div className="flex items-center gap-2 mb-4">
            <Video size={14} className="text-emerald-600" />
            <h2 className="text-sm font-semibold text-slate-900">Recording Settings</h2>
          </div>
          <div className="divide-y divide-slate-50">
            <Toggle
              label="Auto-Record"
              description="Automatically start recording when interview begins"
              checked={recording.autoRecord}
              onChange={(v) => setRecording(p => ({ ...p, autoRecord: v }))}
            />
          </div>
          <div className="mt-3 p-3 bg-slate-50 rounded-xl">
            <p className="text-xs text-slate-500">Recording Storage</p>
            <p className="text-xs font-medium text-slate-700 mt-0.5">Cloud storage (default)</p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="bg-white rounded-2xl border border-slate-100 p-5"
        >
          <div className="flex items-center gap-2 mb-4">
            <Shield size={14} className="text-emerald-600" />
            <h2 className="text-sm font-semibold text-slate-900">Security</h2>
          </div>
          <div className="divide-y divide-slate-50">
            <Toggle
              label="Require Password"
              description="Require a password for all interviews"
              checked={security.requirePassword}
              onChange={(v) => setSecurity(p => ({ ...p, requirePassword: v }))}
            />
            <Toggle
              label="QR Verification Required"
              description="Require QR code verification for participant identity"
              checked={security.qrVerificationRequired}
              onChange={(v) => setSecurity(p => ({ ...p, qrVerificationRequired: v }))}
            />
          </div>
          <div className="mt-4">
            <label className="text-xs font-semibold text-slate-900 block mb-1.5">Max Failed Verification Attempts</label>
            <input
              type="number"
              min="1"
              max="10"
              value={security.maxFailedAttempts}
              onChange={(e) => setSecurity(p => ({ ...p, maxFailedAttempts: e.target.value }))}
              className="w-24 px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="flex justify-end"
        >
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl transition-colors flex items-center gap-2"
          >
            {saved ? <CheckCircle size={14} /> : <Settings size={14} />}
            {saved ? 'Settings saved' : 'Save Settings'}
          </button>
        </motion.div>
      </div>
    </div>
  );
}
