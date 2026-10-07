import { useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { useTranslation } from "react-i18next";

const WAVEFORM = [
  12, 19, 15, 27, 21, 34, 18, 24, 39, 29, 17, 31, 22, 40, 26, 18, 35, 23, 30,
  15, 37, 25, 19, 33, 22, 41, 28, 17, 31, 20, 36, 24, 14, 29, 39, 21, 32, 18,
];

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const wholeSeconds = Math.floor(seconds);
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, "0")}`;
}

export function AudioWavePlayer({
  src,
  onError,
}: {
  src: string;
  onError: () => void;
}) {
  const { t } = useTranslation("inbox");
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [ready, setReady] = useState(false);

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play().catch(onError);
    } else {
      audio.pause();
    }
  };

  const seek = (value: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;
    audio.currentTime = value;
    setCurrentTime(value);
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="audio-wave-player">
      <audio
        ref={audioRef}
        className="audio-wave-player__media"
        preload="metadata"
        src={src}
        onLoadedMetadata={(event) => {
          const loadedDuration = event.currentTarget.duration;
          if (Number.isFinite(loadedDuration)) setDuration(loadedDuration);
          setReady(true);
        }}
        onDurationChange={(event) => {
          const loadedDuration = event.currentTarget.duration;
          if (Number.isFinite(loadedDuration)) setDuration(loadedDuration);
        }}
        onTimeUpdate={(event) =>
          setCurrentTime(event.currentTarget.currentTime)
        }
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrentTime(0);
        }}
        onError={onError}
      />
      <button
        className="audio-wave-player__toggle"
        type="button"
        aria-label={t(playing ? "ui.audioPause" : "ui.audioPlay")}
        onClick={togglePlayback}
      >
        {playing ? (
          <Pause size={18} aria-hidden="true" />
        ) : (
          <Play size={18} aria-hidden="true" />
        )}
      </button>
      <div className="audio-wave-player__timeline">
        <div className="audio-wave-player__wave">
          {WAVEFORM.map((height, index) => (
            <span
              className="audio-wave-player__bar"
              aria-hidden="true"
              key={index}
              style={{
                height: `${height}px`,
                opacity: (index / WAVEFORM.length) * 100 <= progress ? 1 : 0.38,
              }}
            />
          ))}
          <input
            className="audio-wave-player__seek"
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(currentTime, duration || 0)}
            aria-label={t("ui.audioSeek")}
            aria-valuetext={`${formatTime(currentTime)} / ${formatTime(duration)}`}
            disabled={!ready || duration <= 0}
            onChange={(event) => seek(Number(event.currentTarget.value))}
          />
        </div>
        <div className="audio-wave-player__time" aria-live="off">
          <span>{formatTime(currentTime)}</span>
          <span>{ready ? formatTime(duration) : t("ui.audioLoading")}</span>
        </div>
      </div>
    </div>
  );
}
