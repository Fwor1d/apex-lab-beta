import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import CometDial from "./react-bits/CometDial.jsx";
import SpotlightCard from "./react-bits/SpotlightCard.jsx";

// esbuild extracts component CSS. Keep its request as lazy as React itself.
const sheet = document.createElement("link");
sheet.rel = "stylesheet";
sheet.href = new URL("./islands.css", import.meta.url).href;
await new Promise((resolve, reject) => {
  sheet.onload = resolve;
  sheet.onerror = reject;
  document.head.append(sheet);
});

function LoadingDial({ progress, motion }) {
  const [sweep, setSweep] = useState(18);
  const unknown = !Number.isFinite(progress);
  useEffect(() => {
    if (!unknown || motion !== "full") return;
    setSweep(82);
    // Visual sweep only; there is deliberately no numeric progress in this mode.
    const timer = setInterval(
      () => setSweep((v) => (v === 18 ? 82 : 18)),
      1200,
    );
    return () => clearInterval(timer);
  }, [unknown, motion]);
  return (
    <CometDial
      loader
      indeterminate={unknown}
      motionOff={motion !== "full"}
      value={unknown ? sweep : progress}
      defaultValue={unknown ? 18 : progress}
      unit={unknown ? "" : "%"}
      size={176}
      accent="#c9fc60"
      ink="#f2f5ee"
    />
  );
}

export function mountDial(element, props) {
  const root = createRoot(element);
  root.render(<LoadingDial {...props} />);
  return {
    update: (next) => root.render(<LoadingDial {...next} />),
    destroy: () => root.unmount(),
  };
}

export function mountSpotlights(elements) {
  const roots = elements.map((element) => {
    const root = createRoot(element);
    root.render(
      <SpotlightCard
        spotlightColor="#c9fc60"
        intensity={0.07}
        borderGlow={0.2}
        ambient={false}
        grain={0}
        flare={false}
        className="apex-spotlight"
      />,
    );
    return root;
  });
  return () => roots.forEach((root) => root.unmount());
}
