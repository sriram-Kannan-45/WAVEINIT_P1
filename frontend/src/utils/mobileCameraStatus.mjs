// Transport loss and poor framing are different states: only transport loss
// offers QR reconnection. Detector results never count as received video.
export function mobileCameraStatus({ connected, evidence, now = Date.now(), hireFraming = false }) {
  if (!connected) return { kind: 'disconnected', title: 'Mobile camera disconnected',
    message: 'Keep the phone page open to reconnect automatically, or scan the reconnect QR code. Your test continues.' };
  if (!evidence || now - Number(evidence.receivedAt) > 5000) return { kind: 'checking', title: 'Mobile camera connected',
    message: hireFraming || evidence?.framing_mode === 'HIRE_WORKSPACE'
      ? 'Video is live. Waiting for hand and laptop detection.'
      : 'Video is live. Waiting for person and laptop detection.' };
  if (hireFraming || evidence.framing_mode === 'HIRE_WORKSPACE') {
    if (!evidence.laptop_detected) return { kind: 'reposition', title: 'Laptop not detected', message: 'Please adjust the phone so your laptop is visible.' };
    if (!evidence.hands_detected) return { kind: 'reposition', title: 'Hand not detected', message: 'Please keep a hand visible beside your laptop.' };
    if (evidence.other_violation) return { kind: 'reposition', title: 'Object detected', message: 'Remove unauthorized objects from the workspace.' };
    if (!evidence.eligible) return { kind: 'checking', title: 'Checking hand and laptop', message: 'Keep your hand and laptop in view while verification finishes.' };
    return { kind: 'ready', title: 'Hand and laptop verified', message: 'Hand and laptop visible.' };
  }
  if (!evidence.person_detected || !evidence.laptop_detected) {
    const missing = !evidence.person_detected && !evidence.laptop_detected ? 'Person and laptop' : !evidence.person_detected ? 'Person' : 'Laptop';
    return { kind: 'reposition', title: `${missing} not detected`,
      message: 'Reposition your phone so both you and your laptop are visible. Keep the camera page open; no QR scan is needed.' };
  }
  return { kind: 'ready', title: 'Mobile camera connected', message: 'Person and laptop visible.' };
}
