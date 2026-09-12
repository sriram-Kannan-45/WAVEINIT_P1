const MESSAGES = {
  'en-IN': { neutral: 'Look directly at the camera.', TURN_LEFT: 'Slowly turn your head to the left.', TURN_RIGHT: 'Slowly turn your head to the right.', BLINK: 'Blink once, then look at the camera.', room: 'Slowly rotate the phone around the room. Capture every direction.', mismatch: 'Identity mismatch detected. Return to the camera immediately.', warning: 'Suspicious activity detected. Please follow the assessment rules.' },
  'hi-IN': { neutral: 'सीधे कैमरे की ओर देखें।', TURN_LEFT: 'धीरे से अपना सिर बाईं ओर घुमाएँ।', TURN_RIGHT: 'धीरे से अपना सिर दाईं ओर घुमाएँ।', BLINK: 'एक बार पलक झपकाएँ, फिर कैमरे की ओर देखें।', room: 'फ़ोन को कमरे में धीरे-धीरे चारों ओर घुमाएँ। हर दिशा कैप्चर करें।', mismatch: 'पहचान मेल नहीं खाती। तुरंत कैमरे के सामने लौटें।', warning: 'संदिग्ध गतिविधि मिली है। कृपया परीक्षा नियमों का पालन करें।' },
  'ta-IN': { neutral: 'கேமராவை நேராகப் பாருங்கள்.', TURN_LEFT: 'உங்கள் தலையை மெதுவாக இடப்புறம் திருப்புங்கள்.', TURN_RIGHT: 'உங்கள் தலையை மெதுவாக வலப்புறம் திருப்புங்கள்.', BLINK: 'ஒருமுறை கண் சிமிட்டி கேமராவைப் பாருங்கள்.', room: 'அறையைச் சுற்றி தொலைபேசியை மெதுவாக நகர்த்துங்கள்.', mismatch: 'அடையாளம் பொருந்தவில்லை. உடனே கேமராவிற்குத் திரும்புங்கள்.', warning: 'சந்தேகமான செயல் கண்டறியப்பட்டது. விதிகளைப் பின்பற்றுங்கள்.' },
  'te-IN': { neutral: 'కెమెరా వైపు నేరుగా చూడండి.', TURN_LEFT: 'మీ తలను నెమ్మదిగా ఎడమవైపు తిప్పండి.', TURN_RIGHT: 'మీ తలను నెమ్మదిగా కుడివైపు తిప్పండి.', BLINK: 'ఒకసారి రెప్పవేసి కెమెరా వైపు చూడండి.', room: 'గది చుట్టూ ఫోన్‌ను నెమ్మదిగా తిప్పండి.', mismatch: 'గుర్తింపు సరిపోలలేదు. వెంటనే కెమెరా ముందుకు రండి.', warning: 'అనుమానాస్పద చర్య గుర్తించబడింది. నియమాలను పాటించండి.' },
  'kn-IN': { neutral: 'ಕ್ಯಾಮೆರಾವನ್ನು ನೇರವಾಗಿ ನೋಡಿ.', TURN_LEFT: 'ನಿಮ್ಮ ತಲೆಯನ್ನು ನಿಧಾನವಾಗಿ ಎಡಕ್ಕೆ ತಿರುಗಿಸಿ.', TURN_RIGHT: 'ನಿಮ್ಮ ತಲೆಯನ್ನು ನಿಧಾನವಾಗಿ ಬಲಕ್ಕೆ ತಿರುಗಿಸಿ.', BLINK: 'ಒಮ್ಮೆ ಕಣ್ಣು ಮಿಟುಕಿಸಿ, ನಂತರ ಕ್ಯಾಮೆರಾವನ್ನು ನೋಡಿ.', room: 'ಫೋನ್ ಅನ್ನು ಕೋಣೆಯ ಸುತ್ತ ನಿಧಾನವಾಗಿ ತಿರುಗಿಸಿ. ಪ್ರತಿಯೊಂದು ದಿಕ್ಕನ್ನೂ ಸೆರೆಹಿಡಿಯಿರಿ.', mismatch: 'ಗುರುತು ಹೊಂದಿಕೆಯಾಗಲಿಲ್ಲ. ತಕ್ಷಣ ಕ್ಯಾಮೆರಾ ಮುಂದೆ ಬನ್ನಿ.', warning: 'ಅನುಮಾನಾಸ್ಪದ ಚಟುವಟಿಕೆ ಪತ್ತೆಯಾಗಿದೆ. ದಯವಿಟ್ಟು ಪರೀಕ್ಷೆಯ ನಿಯಮಗಳನ್ನು ಪಾಲಿಸಿ.' },
  'ml-IN': { neutral: 'ക്യാമറയിലേക്ക് നേരിട്ട് നോക്കുക.', TURN_LEFT: 'തല പതുക്കെ ഇടത്തേക്ക് തിരിക്കുക.', TURN_RIGHT: 'തല പതുക്കെ വലത്തേക്ക് തിരിക്കുക.', BLINK: 'ഒരിക്കൽ കണ്ണുചിമ്മിയ ശേഷം ക്യാമറയിലേക്ക് നോക്കുക.', room: 'ഫോൺ മുറിക്ക് ചുറ്റും പതുക്കെ തിരിക്കുക. എല്ലാ ദിശയും പകർത്തുക.', mismatch: 'തിരിച്ചറിയൽ പൊരുത്തപ്പെട്ടില്ല. ഉടൻ ക്യാമറയ്ക്ക് മുന്നിലേക്ക് മടങ്ങുക.', warning: 'സംശയാസ്പദമായ പ്രവർത്തനം കണ്ടെത്തി. പരീക്ഷാ നിയമങ്ങൾ പാലിക്കുക.' },
  'mr-IN': { neutral: 'कॅमेऱ्याकडे सरळ पहा.', TURN_LEFT: 'हळूच डोके डावीकडे वळवा.', TURN_RIGHT: 'हळूच डोके उजवीकडे वळवा.', BLINK: 'एकदा पापणी लवून कॅमेऱ्याकडे पहा.', room: 'फोन हळूच खोलीभोवती फिरवा. प्रत्येक दिशा टिपा.', mismatch: 'ओळख जुळली नाही. त्वरित कॅमेऱ्यासमोर या.', warning: 'संशयास्पद हालचाल आढळली. कृपया परीक्षेचे नियम पाळा.' },
  'bn-IN': { neutral: 'ক্যামেরার দিকে সোজা তাকান।', TURN_LEFT: 'ধীরে মাথা বাম দিকে ঘোরান।', TURN_RIGHT: 'ধীরে মাথা ডান দিকে ঘোরান।', BLINK: 'একবার চোখের পলক ফেলে ক্যামেরার দিকে তাকান।', room: 'ফোনটি ধীরে ঘরের চারদিকে ঘোরান। প্রতিটি দিক ধারণ করুন।', mismatch: 'পরিচয় মেলেনি। অবিলম্বে ক্যামেরার সামনে ফিরে আসুন।', warning: 'সন্দেহজনক কার্যকলাপ শনাক্ত হয়েছে। পরীক্ষার নিয়ম মেনে চলুন।' },
  'gu-IN': { neutral: 'કેમેરા તરફ સીધું જુઓ.', TURN_LEFT: 'તમારું માથું ધીમેથી ડાબી તરફ ફેરવો.', TURN_RIGHT: 'તમારું માથું ધીમેથી જમણી તરફ ફેરવો.', BLINK: 'એક વાર આંખ મીંચીને કેમેરા તરફ જુઓ.', room: 'ફોનને ધીમેથી રૂમની આસપાસ ફેરવો. દરેક દિશા કૅપ્ચર કરો.', mismatch: 'ઓળખ મેળ ખાતી નથી. તરત કેમેરા સામે પાછા આવો.', warning: 'શંકાસ્પદ પ્રવૃત્તિ મળી છે. કૃપા કરીને પરીક્ષાના નિયમોનું પાલન કરો.' },
  'pa-IN': { neutral: 'ਕੈਮਰੇ ਵੱਲ ਸਿੱਧਾ ਦੇਖੋ।', TURN_LEFT: 'ਆਪਣਾ ਸਿਰ ਹੌਲੀ-ਹੌਲੀ ਖੱਬੇ ਪਾਸੇ ਮੋੜੋ।', TURN_RIGHT: 'ਆਪਣਾ ਸਿਰ ਹੌਲੀ-ਹੌਲੀ ਸੱਜੇ ਪਾਸੇ ਮੋੜੋ।', BLINK: 'ਇੱਕ ਵਾਰ ਅੱਖ ਝਪਕਾਓ, ਫਿਰ ਕੈਮਰੇ ਵੱਲ ਦੇਖੋ।', room: 'ਫੋਨ ਨੂੰ ਹੌਲੀ-ਹੌਲੀ ਕਮਰੇ ਦੇ ਚਾਰੇ ਪਾਸੇ ਘੁਮਾਓ। ਹਰ ਦਿਸ਼ਾ ਕੈਪਚਰ ਕਰੋ।', mismatch: 'ਪਛਾਣ ਮੇਲ ਨਹੀਂ ਖਾਂਦੀ। ਤੁਰੰਤ ਕੈਮਰੇ ਸਾਹਮਣੇ ਵਾਪਸ ਆਓ।', warning: 'ਸ਼ੱਕੀ ਗਤੀਵਿਧੀ ਮਿਲੀ ਹੈ। ਕਿਰਪਾ ਕਰਕੇ ਪ੍ਰੀਖਿਆ ਦੇ ਨਿਯਮਾਂ ਦੀ ਪਾਲਣਾ ਕਰੋ।' },
};

export const hireVoiceMessage = (language, key) => (MESSAGES[language] || MESSAGES['en-IN'])[key] || MESSAGES['en-IN'][key] || key;

export function speakHireWarning({ language = 'en-IN', key = 'warning', text, rate = .95, volume = 1 } = {}) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return false;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text || hireVoiceMessage(language, key));
  utterance.lang = language;
  utterance.rate = rate;
  utterance.volume = volume;
  const voices = window.speechSynthesis.getVoices();
  utterance.voice = voices.find(voice => voice.lang === language) || voices.find(voice => voice.lang?.startsWith(language.split('-')[0])) || null;
  window.speechSynthesis.speak(utterance);
  return true;
}
