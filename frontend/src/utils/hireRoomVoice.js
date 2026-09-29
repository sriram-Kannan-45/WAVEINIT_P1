const STORAGE_KEY = 'hireProctorLang';

const PRIORITIES = { CRITICAL: 0, RETRY: 1, CURRENT_STEP: 2, SUCCESS: 3, GENERAL: 4 };

const CATALOG = {
  workspace_start: { en: 'Room verified. Point your phone at your hand and laptop together. Keep the phone steady.', ta: 'அறை சரிபார்க்கப்பட்டது. உங்கள் கையும் மடிக்கணினியும் ஒரே காட்சியில் தெரியும்படி கைப்பேசியை வைக்கவும். கைப்பேசியை அசைக்காமல் வைக்கவும்.' },
  framing_laptop: { en: 'Please adjust the phone so your laptop is visible.', ta: 'உங்கள் மடிக்கணினி தெளிவாகத் தெரியும்படி கைப்பேசியை மாற்றவும்.' },
  framing_hands: { en: 'Please keep a hand visible beside your laptop.', ta: 'உங்கள் மடிக்கணினிக்கு அருகில் ஒரு கை தெளிவாகத் தெரியும்படி வைக்கவும்.' },
  step_front: { en: 'Please show the area in front of you and take a photo.', ta: 'உங்கள் முன்புறப் பகுதியைக் காட்டி ஒரு புகைப்படம் எடுக்கவும்.' },
  step_left: { en: 'Please turn your phone to the left and take a clear photo.', ta: 'உங்கள் கைப்பேசியை இடது பக்கம் திருப்பி தெளிவான புகைப்படம் எடுக்கவும்.' },
  step_right: { en: 'Please turn your phone to the right and take a clear photo.', ta: 'உங்கள் கைப்பேசியை வலது பக்கம் திருப்பி தெளிவான புகைப்படம் எடுக்கவும்.' },
  step_bottom: { en: 'Please tilt the phone down and show the floor and lower area.', ta: 'கைப்பேசியை கீழே சாய்த்து தரை மற்றும் கீழ்ப் பகுதியைக் காட்டவும்.' },
  step_desk: { en: 'Please show your complete desk and workspace.', ta: 'உங்கள் முழு மேசை மற்றும் பணியிடத்தைக் காட்டவும்.' },
  front_ok: { en: 'Front view captured.', ta: 'முன்பக்கக் காட்சி பதிவானது.' },
  left_ok: { en: 'Left view captured.', ta: 'இடது காட்சி பதிவானது.' },
  right_ok: { en: 'Right view captured.', ta: 'வலது காட்சி பதிவானது.' },
  bottom_ok: { en: 'Bottom view captured.', ta: 'கீழ்ப்பகுதி காட்சி பதிவானது.' },
  desk_ok: { en: 'Desk view captured.', ta: 'மேசைக் காட்சி பதிவானது.' },
  front_poor: { en: 'Not enough detail yet. Face the front of the room and hold still.', ta: 'இன்னும் போதுமான விவரம் இல்லை. முன்பக்கம் நின்று அசையாமல் இருங்கள்.' },
  left_poor: { en: 'Turn a little more towards the left.', ta: 'இடது பக்கம் இன்னும் கொஞ்சம் திரும்புங்கள்.' },
  right_poor: { en: 'Turn a little more towards the right.', ta: 'வலது பக்கம் இன்னும் கொஞ்சம் திரும்புங்கள்.' },
  bottom_poor: { en: 'Tilt the phone further down and show the lower area.', ta: 'கைப்பேசியை இன்னும் கீழே சாய்த்து கீழ்ப்பகுதியைக் காட்டுங்கள்.' },
  desk_poor: { en: 'Show the desk area clearly, avoid glare.', ta: 'மேசைப் பகுதியை தெளிவாகக் காட்டுங்கள்.' },
  blurred: { en: 'The image is blurry. Hold the phone steady and try again.', ta: 'படம் மங்கலாக உள்ளது. போனை நிலையாகப் பிடித்து மீண்டும் முயற்சிக்கவும்.' },
  too_dark: { en: 'The image is too dark. Please turn on a light.', ta: 'படம் மிகவும் இருட்டாக உள்ளது. விளக்கை இயக்கவும்.' },
  observed: { en: 'You are doing well. Keep going.', ta: 'நன்றாகச் செய்கிறீர்கள். தொடருங்கள்.' },
  start_360: { en: 'Point at the saved left view. Then turn slowly through front to right for a 180 degree scan.', ta: 'சேமித்த இடது காட்சியை முதலில் காட்டுங்கள். பின்னர் முன்பக்கம் வழியாக வலதுபுறம் வரை மெதுவாக 180 டிகிரி திரும்புங்கள்.' },
  recording_started: { en: 'Recording has started. Turn slowly from left through front to right, then finish the recording.', ta: 'பதிவு தொடங்கியது. இடப்புறத்திலிருந்து முன்பக்கம் வழியாக வலப்புறம் வரை மெதுவாகத் திரும்பி, பின்னர் பதிவை முடியவும்.' },
  recording_reviewing: { en: 'Recording finished. Please wait while the room scan is reviewed.', ta: 'பதிவு முடிந்தது. அறை ஸ்கேன் ஆய்வு செய்யப்படும் வரை காத்திருங்கள்.' },
  recording_short: { en: 'The recording was too short. Start again at the saved left view, turn through front, and finish at the saved right view.', ta: 'பதிவு மிகவும் குறுகியதாக இருந்தது. சேமித்த இடது காட்சியில் மீண்டும் தொடங்கி, முன்பக்கம் வழியாகத் திரும்பி, சேமித்த வலது காட்சியில் முடியவும்.' },
  start_left: { en: 'Point at the saved left room view to begin.', ta: 'தொடங்க, சேமித்த இடது அறைக் காட்சியை காட்டுங்கள்.' },
  continue_right: { en: 'Turn slowly from left through front toward right.', ta: 'இடப்புறத்திலிருந்து முன்பக்கம் வழியாக வலப்புறம் நோக்கி மெதுவாகத் திரும்புங்கள்.' },
  orientation_required: { en: 'Allow phone motion access so the turn direction can be verified.', ta: 'திரும்பும் திசையை சரிபார்க்க கைப்பேசியின் அசைவு அனுமதியை வழங்குங்கள்.' },
  wrong_direction: { en: 'Continue from left through front toward right. Do not turn back.', ta: 'இடப்புறத்திலிருந்து முன்பக்கம் வழியாக வலப்புறம் தொடருங்கள். பின்னோக்கித் திரும்ப வேண்டாம்.' },
  room_mismatch: { en: 'This view does not match the saved room photo. Show the same area clearly and try again.', ta: 'இந்தக் காட்சி சேமித்த அறைப் புகைப்படத்துடன் பொருந்தவில்லை. அதே பகுதியை தெளிவாகக் காட்டி மீண்டும் முயற்சிக்கவும்.' },
  visual_continuity: { en: 'Keep the same room area in view while turning slowly toward the next saved view.', ta: 'அடுத்த சேமித்த காட்சியை நோக்கி மெதுவாகத் திரும்பும்போது, அதே அறைப் பகுதி தொடர்ந்து தெரியும்படி வைத்திருங்கள்.' },
  remove_object: { en: 'Remove the detected object and show the same area clearly.', ta: 'கண்டறியப்பட்ட பொருளை அகற்றி அதே பகுதியை தெளிவாகக் காட்டுங்கள்.' },
  photo_error: { en: 'Unable to analyze this photo. Please try again.', ta: 'இந்தப் புகைப்படத்தை ஆய்வு செய்ய முடியவில்லை. மீண்டும் முயற்சிக்கவும்.' },
  photo_timeout: { en: 'Photo analysis is taking too long. Please try again.', ta: 'புகைப்பட ஆய்வு அதிக நேரம் எடுக்கிறது. மீண்டும் முயற்சிக்கவும்.' },
  photo_upload_failed: { en: 'Photo could not be uploaded. Please try again.', ta: 'புகைப்படத்தை பதிவேற்ற முடியவில்லை. மீண்டும் முயற்சிக்கவும்.' },
  photo_analyzing: { en: 'This photo is already being analyzed.', ta: 'இந்தப் புகைப்படம் ஏற்கனவே ஆய்வு செய்யப்படுகிறது.' },
  photo_invalid: { en: 'Please capture a clearer photo.', ta: 'தெளிவான புகைப்படத்தை மீண்டும் எடுக்கவும்.' },
  photo_area_missing: { en: 'Please show more of the requested area and take the photo again.', ta: 'கோரப்பட்ட பகுதியை மேலும் தெளிவாகக் காட்டி மீண்டும் புகைப்படம் எடுக்கவும்.' },
  photo_move_area: { en: 'Please move the phone to the requested area and capture a new photo.', ta: 'குறிப்பிட்ட பகுதியை தெளிவாகக் காட்ட கைப்பேசியை மாற்றி மீண்டும் புகைப்படம் எடுக்கவும்.' },
  failure_duplicate_image: { en: 'This exact photo was already submitted. Capture a fresh view.', ta: 'இதே புகைப்படம் ஏற்கனவே சமர்ப்பிக்கப்பட்டது. புதிய காட்சியைப் படம் எடுக்கவும்.' },
  failure_too_similar: { en: 'This view is too similar to a previously captured view. Move to the requested area and capture again.', ta: 'இந்தக் காட்சி முன்பு எடுத்த காட்சியைப் போலவே உள்ளது. குறிப்பிட்ட பகுதிக்கு நகர்த்தி மீண்டும் படம் எடுக்கவும்.' },
  failure_wrong_direction: { en: 'The requested camera direction was not detected. Move the phone in the direction shown and capture again.', ta: 'கோரப்பட்ட கேமரா திசை கண்டறியப்படவில்லை. காட்டப்பட்ட திசையில் கைப்பேசியை நகர்த்தி மீண்டும் படம் எடுக்கவும்.' },
  failure_webcam: { en: 'The laptop camera could not validate the live action. Keep yourself visible and try again.', ta: 'நேரடி செயலை மடிக்கணினி கேமரா உறுதிப்படுத்த முடியவில்லை. நீங்கள் தெளிவாகத் தெரியும்படி வைத்து மீண்டும் முயற்சிக்கவும்.' },
  failure_participant: { en: 'Keep yourself visible in the laptop camera while moving the phone.', ta: 'கைப்பேசியை நகர்த்தும்போது மடிக்கணினி கேமராவில் நீங்கள் தெளிவாகத் தெரியும்படி வைக்கவும்.' },
  failure_multiple_people: { en: 'More than one person is visible. Ensure you are alone and try again.', ta: 'ஒன்றுக்கு மேற்பட்ட நபர்கள் தெரிகிறார்கள். நீங்கள் மட்டும் இருப்பதை உறுதி செய்து மீண்டும் முயற்சிக்கவும்.' },
  failure_movement: { en: 'Not enough live camera movement was detected. Move the phone clearly toward the requested area and try again.', ta: 'போதுமான நேரடி கேமரா அசைவு கண்டறியப்படவில்லை. கைப்பேசியை கோரப்பட்ட பகுதிக்கு தெளிவாக நகர்த்தி மீண்டும் முயற்சிக்கவும்.' },
  failure_blurry: { en: 'The image is too blurry. Hold the phone steady and capture again.', ta: 'படம் மிகவும் மங்கலாக உள்ளது. கைப்பேசியை நிலையாகப் பிடித்து மீண்டும் படம் எடுக்கவும்.' },
  failure_dark: { en: 'The image is too dark. Improve the lighting and capture again.', ta: 'படம் மிகவும் இருட்டாக உள்ளது. வெளிச்சத்தை அதிகரித்து மீண்டும் படம் எடுக்கவும்.' },
  failure_overexposed: { en: 'The image is overexposed. Avoid pointing the camera straight at a light and capture again.', ta: 'படம் அதிக ஒளியால் மிகுந்துள்ளது. கேமராவை நேராக விளக்கின் மீது வைத்திருக்காமல் மீண்டும் படம் எடுக்கவும்.' },
  failure_camera_blocked: { en: 'The camera lens appears to be covered. Uncover it and capture again.', ta: 'கேமரா லென்ஸ் மூடப்பட்டுள்ளதுபோல் தெரிகிறது. லென்ஸை மூடாமல் திறந்து மீண்டும் படம் எடுக்கவும்.' },
  failure_resolution: { en: 'The photo resolution is too low. Enable full-resolution capture and try again.', ta: 'புகைப்படத் தெளிவின் தரம் மிகவும் குறைவாக உள்ளது. முழு தெளிவில் படம் எடுக்கும் அமைப்பை இயக்கி மீண்டும் முயற்சிக்கவும்.' },
  failure_quality_low: { en: 'The photo has very little detail. Move a little closer to the area and capture again.', ta: 'புகைப்படத்தில் விவரங்கள் மிகக் குறைவாக உள்ளன. அருகில் சென்று மீண்டும் படம் எடுக்கவும்.' },
  failure_unreadable: { en: 'The photo could not be read properly. Please capture it again.', ta: 'புகைப்படத்தை சரியாகப் படிக்க முடியவில்லை. மீண்டும் படம் எடுக்கவும்.' },
  photo_captured_ok: { en: 'Room view captured successfully.', ta: 'அறைக் காட்சி வெற்றிகரமாக பதிவாகியது.' },
  failure_stale: { en: 'That capture is no longer fresh. Take a new photo now.', ta: 'அந்தப் புகைப்படம் புதியதாக இல்லை. இப்போது புதிய புகைப்படம் எடுக்கவும்.' },
  photo_step_resync: { en: 'Room verification was out of sync. Reloading the current step.', ta: 'அறை சரிபார்ப்பு வரிசை மாறியுள்ளது. தற்போதைய படி மீண்டும் ஏற்றப்படுகிறது.' },
  room_phase_invalid: { en: 'Room scanning must finish before the assessment can start.', ta: 'மதிப்பீட்டைத் தொடங்குவதற்கு முன் அறை ஸ்கேனிங் முடிய வேண்டும்.' },
  unsupported_step: { en: 'This room verification step is not part of the current flow.', ta: 'இந்த அறை சரிபார்ப்புப் படி தற்போதைய வரிசையில் இல்லை.' },
  photo_server_error: { en: 'Verification service is temporarily unavailable. Please try again.', ta: 'சரிபார்ப்பு சேவை தற்காலிகமாக கிடைக்கவில்லை. மீண்டும் முயற்சிக்கவும்.' },
  camera_error: { en: 'The camera preview is unavailable. Please check the phone camera and try again.', ta: 'கேமரா காட்சி கிடைக்கவில்லை. கைப்பேசி கேமராவைச் சரிபார்த்து மீண்டும் முயற்சிக்கவும்.' },
  continue_left: { en: 'Keep moving left.', ta: 'இடது பக்கம் தொடர்ந்து நகரவும்.' },
  slow_down: { en: 'A little slower please.', ta: 'இன்னும் கொஞ்சம் மெதுவாக.' },
  show_behind: { en: 'Please show the area behind you.', ta: 'உங்களுக்குப் பின்னால் உள்ள பகுதியைக் காட்டுங்கள்.' },
  show_desk: { en: 'Please point the camera toward the desk.', ta: 'கேமராவை மேசையை நோக்கிக் காட்டவும்.' },
  move_up: { en: 'Raise the camera a little.', ta: 'கேமராவை கொஞ்சம் உயர்த்துங்கள்.' },
  coverage_pending: { en: 'Almost there. Keep scanning the remaining area.', ta: 'கிட்டத்தட்ட முடிந்தது. மீதமுள்ள பகுதியை ஸ்கேன் செய்யுங்கள்.' },
  coverage_incomplete: { en: 'Some areas were not covered. Please continue scanning.', ta: 'சில பகுதிகள் மறைக்கப்படவில்லை. தொடர்ந்து ஸ்கேன் செய்யுங்கள்.' },
  scan_complete: { en: 'Great. 180 degree room scan is verified. Show your hand and laptop next.', ta: 'நன்று. 180 டிகிரி அறை ஸ்கேன் சரிபார்க்கப்பட்டது. அடுத்து உங்கள் கையும் மடிக்கணினியும் காட்டுங்கள்.' },
  all_done: { en: 'Room verification complete. Please continue.', ta: 'அறை சரிபார்ப்பு முடிந்தது. தொடருங்கள்.' },
  redo_step: { en: 'Retaking this step. Show the area clearly.', ta: 'இந்தப் படியை மீண்டும் செய்கிறோம். அந்தப் பகுதியை தெளிவாகக் காட்டுங்கள்.' },
  move_further: { en: 'Please move the camera further to the requested side.', ta: 'கேமராவை கேட்டுள்ள திசைக்கு இன்னும் நகர்த்தி மீண்டும் படம் எடுக்கவும்.' },
  move_left_further: { en: 'Please move further to the left. The current view is too similar to the previous view.', ta: 'இன்னும் கொஞ்சம் இடது பக்கம் நகர்த்துங்கள். தற்போதைய காட்சி முந்தைய காட்சியைப் போலவே உள்ளது.' },
  move_back_further: { en: 'Please move further to the back. The current view is too similar to the previous view.', ta: 'இன்னும் சிறிது பின்பக்கம் திருப்புங்கள். தற்போதைய காட்சி முந்தைய காட்சியைப் போலவே உள்ளது.' },
  move_right_further: { en: 'Please move further to the right. The current view is too similar to the previous view.', ta: 'இன்னும் கொஞ்சம் வலது பக்கம் நகர்த்துங்கள். தற்போதைய காட்சி முந்தைய காட்சியைப் போலவே உள்ளது.' },
  object_detected: { en: 'A prohibited object was detected. Please remove it from the room.', ta: 'அனுமதிக்கப்படாத பொருள் கண்டறியப்பட்டுள்ளது. அதை அகற்றவும்.' },
  scan_restarted: { en: 'Point at the left view again. We will restart the 180 degree scan.', ta: 'மீண்டும் இடது காட்சியை காட்டுங்கள். 180 டிகிரி ஸ்கேனை மீண்டும் தொடங்குவோம்.' },
  rotation_unconfirmed: { en: 'Camera movement could not be tracked. Keep the phone upright, point across the room, and turn slowly with overlapping views.', ta: 'கேமரா அசைவைக் கண்காணிக்க முடியவில்லை. போனை நேராகப் பிடித்து அறையைக் காட்டுங்கள். முந்தைய காட்சியின் ஒரு பகுதி தெரியும்படி மெதுவாகச் சுழற்றுங்கள்.' },
  laptop_camera_required: { en: "The laptop camera could not capture movement samples. Please allow camera access on the laptop and capture this photo again.", ta: "மடிக்கணினி கேமராவ் இயங்கும் நிகழ்வ்களைக் கைப்பறிய முடியவில்லை. மடிக்கணினியில் கேமரா அணுகலைக் கொடுங்கள் மீண்டும் படம் எடுக்கவும்." },
  laptop_motion_missing: { en: 'Stay visible in the laptop camera and move the phone slowly so your arm movement can be confirmed.', ta: 'மடிக்கணினி கேமராவில் நீங்கள் தெரியும்படி இருங்கள். கை அசைவை உறுதிப்படுத்த கைப்பேசியை மெதுவாக நகர்த்துங்கள்.' },
  laptop_participant_not_visible: { en: "You cannot be seen in the laptop camera. Step into the laptop camera's view and keep turning the phone slowly.", ta: "மடிக்கணினி கேமராவில் உங்களைக் காண முடியவில்லை. மடிக்கணினி கேமராவின் பார்வையில் சென்று கைப்பேசியை மெதுவாகச் சுழற்றுங்கள்." },
  movement_unconfirmed: { en: 'Movement could not be confirmed by the laptop camera. Please turn the phone slowly and try again.', ta: 'மடிக்கணினி கேமராவில் அசைவை உறுதிப்படுத்த முடியவில்லை. கைப்பேசியை மெதுவாகத் திருப்பி மீண்டும் முயற்சிக்கவும்.' },
  mobile_turn_further: { en: 'Please point the mobile camera further to the left.', ta: 'மொபைல் கேமராவை இன்னும் இடது பக்கம் திருப்பவும்.' },
  continue_rotating: { en: 'Continue rotating.', ta: 'தொடர்ந்து சுழற்றுங்கள்.' },
  return_to_start: { en: 'Almost complete. Return toward the starting position.', ta: 'கிட்டத்தட்ட முடிந்தது. தொடக்க நிலைக்குத் திரும்பவும்.' },
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

export function speakHireRoomVoice({ priority = 'GENERAL', language, key, message, taMessage, rate = 0.95, volume = 1, force = false }) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  const lang = language || getHireRoomLanguage();
  const text = lang.startsWith('ta')
    ? (taMessage || hireRoomMessage(lang, key) || message || key)
    : (message || hireRoomMessage(lang, key) || key);
  const p = PRIORITIES[priority] ?? PRIORITIES.GENERAL;
  const speechKey = key || text;
  const now = Date.now();
  const cached = spokenCache.get(speechKey);
  const isMoreUrgent = p < (cached ? cached.priority : Infinity);
  if (!force && cached && now - cached.last < DEDUP_WINDOW_MS && !isMoreUrgent) return;
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
