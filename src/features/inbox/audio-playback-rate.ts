export const AUDIO_PLAYBACK_RATES = [1, 1.5, 2] as const;
export type AudioPlaybackRate = (typeof AUDIO_PLAYBACK_RATES)[number];
export const AUDIO_PLAYBACK_RATE_STORAGE_KEY = "mend.inbox-audio-rate";

export function nextAudioPlaybackRate(
  rate: AudioPlaybackRate,
): AudioPlaybackRate {
  const index = AUDIO_PLAYBACK_RATES.indexOf(rate);
  return AUDIO_PLAYBACK_RATES[(index + 1) % AUDIO_PLAYBACK_RATES.length];
}

// The operator picks a speed once; every voice note uses it afterwards.
export function readStoredAudioPlaybackRate(): AudioPlaybackRate {
  try {
    const stored = Number(
      window.localStorage.getItem(AUDIO_PLAYBACK_RATE_STORAGE_KEY),
    );
    return AUDIO_PLAYBACK_RATES.find((rate) => rate === stored) ?? 1;
  } catch {
    return 1;
  }
}

export function storeAudioPlaybackRate(rate: AudioPlaybackRate) {
  try {
    window.localStorage.setItem(AUDIO_PLAYBACK_RATE_STORAGE_KEY, String(rate));
  } catch {
    // Private windows can refuse storage; the speed still applies here.
  }
}

// Browsers keep the voice's pitch by default, but say so explicitly: a sped
// up voice note must not sound like a chipmunk on any engine.
export function applyAudioPlaybackRate(
  audio: HTMLAudioElement,
  rate: AudioPlaybackRate,
) {
  const media = audio as HTMLAudioElement & {
    mozPreservesPitch?: boolean;
    webkitPreservesPitch?: boolean;
  };
  media.preservesPitch = true;
  media.mozPreservesPitch = true;
  media.webkitPreservesPitch = true;
  audio.playbackRate = rate;
}

export function formatAudioPlaybackRate(rate: AudioPlaybackRate) {
  return `${String(rate).replace(".", ",")}×`;
}
