import { useEffect, useRef, type CSSProperties } from "react";

type Props = {
  src: string;
  poster?: string;
  crossfadeDuration?: number;
  className?: string;
};

export function SeamlessBackgroundVideo({
  src,
  poster,
  crossfadeDuration = 1.2,
  className = "",
}: Props) {
  const first = useRef<HTMLVideoElement>(null);
  const second = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const videos = [first.current, second.current];
    if (!videos[0] || !videos[1]) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let active = 0;
    let crossing = false;
    let finishTimer: number | undefined;

    const play = (video: HTMLVideoElement) => video.play().then(() => true).catch(() => false);
    const show = (index: number) => {
      videos[index]!.style.opacity = "1";
      videos[1 - index]!.style.opacity = "0";
    };
    const crossfade = () => {
      if (crossing || document.hidden) return;
      crossing = true;
      const previous = videos[active]!;
      const nextIndex = 1 - active;
      const next = videos[nextIndex]!;
      next.currentTime = 0;
      void play(next).then((started) => {
        if (!started) { crossing = false; return; }
        next.style.opacity = "1";
        previous.style.opacity = "0";
        finishTimer = window.setTimeout(() => {
          previous.pause();
          previous.currentTime = 0;
          active = nextIndex;
          crossing = false;
          show(active);
        }, crossfadeDuration * 1000);
      });
    };
    const onTimeUpdate = () => {
      const current = videos[active]!;
      if (Number.isFinite(current.duration) && current.duration - current.currentTime <= crossfadeDuration + 0.2) crossfade();
    };
    const onVisibility = () => {
      videos.forEach((video) => video!.pause());
      if (!document.hidden && !reduced) void play(videos[active]!);
    };

    videos.forEach((video) => { video!.addEventListener("timeupdate", onTimeUpdate); video!.addEventListener("ended", crossfade); });
    document.addEventListener("visibilitychange", onVisibility);
    show(0);
    videos[1]!.pause();
    videos[1]!.currentTime = 0;
    if (reduced) {
      videos[0]!.currentTime = 0;
      videos[0]!.pause();
    } else {
      void play(videos[0]!);
    }
    return () => {
      if (finishTimer) clearTimeout(finishTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      videos.forEach((video) => {
        video!.removeEventListener("timeupdate", onTimeUpdate);
        video!.removeEventListener("ended", crossfade);
        video!.pause();
        video!.removeAttribute("src");
        video!.load();
      });
    };
  }, [crossfadeDuration, src]);

  const videoProps = { muted: true, playsInline: true, preload: "auto" as const, poster, src };
  return (
    <div className={`seamless-video ${className}`} aria-hidden="true" style={{"--crossfade-duration":`${crossfadeDuration}s`} as CSSProperties}>
      <video ref={first} {...videoProps} autoPlay />
      <video ref={second} {...videoProps} autoPlay />
    </div>
  );
}
