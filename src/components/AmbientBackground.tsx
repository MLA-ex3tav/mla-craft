import { useEffect, useState } from "react";

export function useBackgroundMotion() {
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setReducedMotion(media.matches);
    const updateVisibility = () => setVisible(!document.hidden);
    media.addEventListener("change", updateMotion);
    document.addEventListener("visibilitychange", updateVisibility);
    return () => {
      media.removeEventListener("change", updateMotion);
      document.removeEventListener("visibilitychange", updateVisibility);
    };
  }, []);
  return { playing: !reducedMotion && visible };
}

export default function AmbientBackground({ playing }: { playing: boolean }) {
  return <div className={`ambient-background${playing ? " is-playing" : ""}`} aria-hidden="true"><div className="ambient-landscape" /><div className="ambient-light" /><div className="ambient-wash" /></div>;
}
