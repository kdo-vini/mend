export const playbackScenes = [
  "signal",
  "context",
  "investigate",
  "verify",
] as const;

export type PlaybackSceneId = (typeof playbackScenes)[number];

export function nextPlaybackScene(scene: PlaybackSceneId): PlaybackSceneId {
  const index = playbackScenes.indexOf(scene);
  return playbackScenes[(index + 1) % playbackScenes.length];
}
