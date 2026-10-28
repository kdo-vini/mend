import { useEffect, useRef, useState } from "react";
import { Square, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

const BAR_COUNT = 28;

function formatRecordingTime(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * What the operator sees while recording: a live level meter, so a muted or
 * wrong microphone shows at once, and the elapsed time.
 */
export function RecordingIndicator({
  stream,
  onStop,
  onDiscard,
}: {
  stream: MediaStream | null;
  onStop: () => void;
  onDiscard: () => void;
}) {
  const { t } = useTranslation("inbox");
  const [elapsed, setElapsed] = useState(0);
  const barsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(
      () => setElapsed(Date.now() - startedAt),
      250,
    );
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const AudioContextClass =
      typeof window === "undefined" ? undefined : window.AudioContext;
    if (!stream || !AudioContextClass) return;
    let frame = 0;
    let context: AudioContext | undefined;
    try {
      context = new AudioContextClass();
      const analyser = context.createAnalyser();
      analyser.fftSize = 64;
      context.createMediaStreamSource(stream).connect(analyser);
      const levels = new Uint8Array(analyser.frequencyBinCount);
      const draw = () => {
        analyser.getByteFrequencyData(levels);
        const bars = barsRef.current?.children;
        if (bars)
          for (let index = 0; index < bars.length; index += 1) {
            const level = levels[index % levels.length] / 255;
            (bars[index] as HTMLElement).style.transform =
              `scaleY(${Math.max(0.12, level)})`;
          }
        frame = requestAnimationFrame(draw);
      };
      frame = requestAnimationFrame(draw);
    } catch {
      // No meter without Web Audio; the timer still shows it is recording.
    }
    return () => {
      cancelAnimationFrame(frame);
      void context?.close().catch(() => undefined);
    };
  }, [stream]);

  return (
    <div className="recording-indicator" role="status">
      <span className="recording-dot" aria-hidden="true" />
      <span className="recording-time" aria-label={t("ui.recordingFor")}>
        {formatRecordingTime(elapsed)}
      </span>
      <div className="recording-bars" ref={barsRef} aria-hidden="true">
        {Array.from({ length: BAR_COUNT }, (_, index) => (
          <span key={index} />
        ))}
      </div>
      <button
        className="icon-button subtle"
        type="button"
        aria-label={t("ui.discardRecording")}
        title={t("ui.discardRecording")}
        onClick={onDiscard}
      >
        <Trash2 size={14} />
      </button>
      <button
        className="icon-button"
        type="button"
        aria-label={t("ui.stopRecording")}
        title={t("ui.stopRecording")}
        onClick={onStop}
      >
        <Square size={13} />
      </button>
    </div>
  );
}
