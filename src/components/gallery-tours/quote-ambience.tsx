import { useEffect, useRef, useState } from "react";

const AMBIENCE_URL = "/gallery-tours/quote-ambience-quiet.wav";

export function QuoteAmbience() {
  const [status, setStatus] = useState<"idle" | "loading" | "playing" | "unavailable">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  function clearPlayback(updateUi = true) {
    const audio = audioRef.current;
    audioRef.current = null;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    if (updateUi) setStatus("idle");
  }

  useEffect(() => {
    const stopOnHide = () => clearPlayback();
    const stopWhenHidden = () => {
      if (document.visibilityState !== "visible") clearPlayback();
    };
    window.addEventListener("pagehide", stopOnHide);
    document.addEventListener("visibilitychange", stopWhenHidden);
    return () => {
      window.removeEventListener("pagehide", stopOnHide);
      document.removeEventListener("visibilitychange", stopWhenHidden);
      clearPlayback(false);
    };
  }, []);

  function toggle() {
    if (audioRef.current) {
      clearPlayback();
      return;
    }

    setStatus("loading");
    const audio = new Audio(AMBIENCE_URL);
    audio.preload = "none";
    audio.volume = 0.12;
    audio.onended = () => {
      if (audioRef.current === audio) clearPlayback();
    };
    audio.onerror = () => {
      if (audioRef.current === audio) {
        clearPlayback();
        setStatus("unavailable");
      }
    };
    audioRef.current = audio;
    void audio.play().then(
      () => {
        if (audioRef.current === audio) setStatus("playing");
      },
      () => {
        if (audioRef.current === audio) {
          clearPlayback();
          setStatus("unavailable");
        }
      },
    );
  }

  return (
    <div className="quote-scene-ambience">
      <button type="button" onClick={toggle}>
        {status === "playing" || status === "loading" ? "環境音を止める" : "環境音を聴く"}
      </button>
      {status === "unavailable" ? (
        <span role="status">この端末では環境音を再生できません。</span>
      ) : null}
    </div>
  );
}
