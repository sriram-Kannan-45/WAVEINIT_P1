const STORAGE_KEY = 'hireProctorLang';

const PRIORITIES = { CRITICAL: 0, CURRENT_STEP: 1, RETRY: 2, SUCCESS: 3, GENERAL: 4 };

const CATALOG = {
  step_front: { en: 'Face the front of the room. Keep the camera steady.', ta: 'அறையின் முன்பக்கமாக நிற்கவும். கேமராவை நிலையாக வைத்திருங்கள்.' },
  step_left: { en: 'Now turn slowly to your left.', ta: 'இப்போது மெதுவாக இடது பக்கம் திரும்புங்கள்.' },
  step_back: { en: 'Face the back of the room.', ta: 'அறையின் பின்பக்கமாக நிற்கவும்.' },
  step_right: { en: 'Now turn slowly to your right.', ta: 'இப்போது மெதுவாக வலது பக்கம் திரும்புங்கள்.' },
  step_desk: { en: 'Show the desk or table where you will work.', ta: 'நீங்கள் வேலை செய்யும் மேசையைக் காட்டுங்கள்.' },
  step_floor: { en: 'Show the floor and the space around you.', ta: 'தரை மற்றும் உங்களைச் சுற்றியுள்ள இடத்தைக் காட்டுங்கள்.' },
  front_ok: { en: 'Front view captured.', ta: 'முன்பக்கக் காட்சி பதிவானது.' },
  left_ok: { en: 'Left view captured.', ta: 'இடது காட்சி பதிவானது.' },
  back_ok: { en: 'Back view captured.', ta: 'பின்பக்கக் காட்சி பதிவானது.' },
  right_ok: { en: 'Right view captured.', ta: 'வலது காட்சி பதிவானது.' },
  desk_ok: { en: 'Desk view captured.', ta: 'மேசைக் காட்சி பதிவானது.' },
  floor_ok: { en: 'Floor view captured.', ta: 'தரைக் காட்சி பதிவானது.' },
  front_poor: { en: 'Not enough detail yet. Face the front of the room and hold still.', ta: 'இன்னும் போதுமான விவரம் இல்லை. முன்பக்கம் நின்று அசையாமல் இருங்கள்.' },
  left_poor: { en: 'Turn a little more towards the left.', ta: 'இடது பக்கம் இன்னும் கொஞ்சம் திரும்புங்கள்.' },
  back_poor: { en: 'Turn a little more towards the back.', ta: 'பின்பக்கம் இன்னும் கொஞ்சம் திரும்புங்கள்.' },
  right_poor: { en: 'Turn a little more towards the right.', ta: 'வலது பக்கம் இன்னும் கொஞ்சம் திரும்புங்கள்.' },
  desk_poor: { en: 'Show the desk area clearly, avoid glare.', ta: 'மேசைப் பகுதியை தெளிவாகக் காட்டுங்கள்.' },
  floor_poor: { en: 'Show the floor area clearly.', ta: 'தரைப் பகுதியை தெளிவாகக் காட்டுங்கள்.' },
  blurred: { en: 'The image is blurry. Hold the phone steady and try again.', ta: 'படம் மங்கலாக உள்ளது. போனை நிலையாகப் பிடித்து மீண்டும் முயற்சிக்கவும்.' },
  too_dark: { en: 'The image is too dark. Please turn on a light.', ta: 'படம் மிகவும் இருட்டாக உள்ளது. விளக்கை இயக்கவும்.' },
  observed: { en: 'You are doing well. Keep going.', ta: 'நன்றாகச் செய்கிறீர்கள். தொடருங்கள்.' },
  start_360: { en: '360 degree scan starting. Slowly turn in a full circle.', ta: '360 டிகிரி ஸ்கேன் தொடங்குகிறது. மெதுவாக முழு வட்டமாக திரும்புங்கள்.' },
  continue_left: { en: 'Keep moving left.', ta: 'இடது பக்கம் தொடர்ந்து நகரவும்.' },
  slow_down: { en: 'A little slower please.', ta: 'இன்னும் கொஞ்சம் மெதுவாக.' },
  show_behind: { en: 'Raise the camera to show the area behind you.', ta: 'உங்களுக்குப் பின்னால் உள்ள இடத்தைக் காட்ட கேமராவை உயர்த்தவும்.' },
  show_desk: { en: 'Lower the camera to show the desk area.', ta: 'மேசைப் பகுதியைக் காட்ட கேமராவைத் தாழ்த்தவும்.' },
  move_up: { en: 'Raise the camera a little.', ta: 'கேமராவை கொஞ்சம் உயர்த்துங்கள்.' },
  coverage_pending: { en: 'Almost there. Keep scanning the remaining area.', ta: 'கிட்டத்தட்ட முடிந்தது. மீதமுள்ள பகுதியை ஸ்கேன் செய்யுங்கள்.' },
  coverage_incomplete: { en: 'Some areas were not covered. Please continue scanning.', ta: 'சில பகுதிகள் மறைக்கப்படவில்லை. தொடர்ந்து ஸ்கேன் செய்யுங்கள்.' },
  scan_complete: { en: 'Great. 360 degree scan is complete.', ta: 'நன்று. 360 டிகிரி ஸ்கேன் முடிந்தது.' },
  all_done: { en: 'Room verification complete. Please continue.', ta: 'அறை சரிபார்ப்பு முடிந்தது. தொடருங்கள்.' },
  redo_step: { en: 'Retaking this step. Show the area clearly.', ta: 'இந்தப் படியை மீண்டும் செய்கிறோம். அந்தப் பகுதியை தெளிவாகக் காட்டுங்கள்.' },
};
export { PRIORITIES };

const toLangBit = language => (String(language).length >= 2 ? String(language).slice(0, 2).toLowerCase() : 'en');

export function hireRoomMessage(language, key) {
  const entry = CATALOG[key];
  if (!entry) return null;
  const lang = toLangBit(language);
  return entry[lang] || entry.en;
}

export function getHireRoomLanguage() {
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  return stored === 'ta-IN' ? 'ta-IN' : 'en-IN';
}

export function setHireRoomLanguage(language) {
  const value = language === 'ta-IN' ? 'ta-IN' : 'en-IN';
  if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, value);
  return value;
}

const DEDUP_WINDOW_MS = 9000;
const spokenCache = new Map();
let pending = [];
let activeId = null;
let seq = 0;
let activePriority = Infinity;

function pickVoice(language) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices() || [];
  const exact = voices.find(voice => voice.lang === language);
  if (exact) return exact;
  return voices.find(voice => voice.lang && String(voice.lang).toLowerCase().startsWith(toLangBit(language))) || null;
}

function speakUtterance(item) {
  const id = ++seq;
  activeId = id;
  activePriority = item.priority;
  const utterance = new SpeechSynthesisUtterance(item.text);
  utterance.lang = item.language;
  const voice = pickVoice(item.language);
  if (voice) utterance.voice = voice;
  utterance.rate = item.rate;
  utterance.volume = item.volume;
  const finish = () => { if (activeId === id) { activeId = null; activePriority = Infinity; processQueue(); } };
  utterance.onend = finish;
  utterance.onerror = finish;
  window.speechSynthesis.speak(utterance);
}

function processQueue() {
  if (typeof window === 'undefined' || !window.speechSynthesis || activeId !== null || !pending.length) return;
  pending.sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt);
  const next = pending.shift();
  try { speakUtterance(next); } catch (error) { activeId = null; activePriority = Infinity; }
}

function cancelActive() {
  if (activeId !== null) {
    activeId = null;
    activePriority = Infinity;
    try { window.speechSynthesis.cancel(); } catch (error) { /* noop */ }
  }
}

export function speakHireRoomVoice({ priority = 'GENERAL', language, key, message, taMessage, rate = 0.95, volume = 1 }) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  const lang = language || getHireRoomLanguage();
  const text = (lang === 'ta-IN' && taMessage) ? taMessage
    : (message || hireRoomMessage(lang, key) || key);
  const p = PRIORITIES[priority] ?? PRIORITIES.GENERAL;
  const speechKey = key || text;
  const now = Date.now();
  const cached = spokenCache.get(speechKey);
  const isMoreUrgent = p < (cached ? cached.priority : Infinity);
  if (cached && now - cached.last < DEDUP_WINDOW_MS && !isMoreUrgent) return;
  spokenCache.set(speechKey, { last: now, priority: p });
  if (spokenCache.size > 24) {
    for (const [cacheKey, value] of spokenCache) {
      if (now - value.last > 60000) spokenCache.delete(cacheKey);
    }
  }
  pending.push({ priority: p, createdAt: now, text, language: lang, rate, volume });
  if (p <= activePriority) cancelActive();
  processQueue();
}

export function stopHireRoomVoice() {
  cancelActive();
  pending = [];
}

export function primeHireRoomVoice() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  window.speechSynthesis.getVoices();
}