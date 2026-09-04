export function FullscreenWarningTitle({ warnings }) {
  return <>Security Warning ({warnings})</>
}

export function FullscreenWarningDescription() {
  return <>You left the assessment tab, window, or fullscreen mode. Please return to fullscreen to continue your assessment.
    This incident is recorded in your proctoring audit. The monitoring service applies the
    shared warning allowance and scoring rules when calculating your report.</>
}
