"use client";

import { useLayoutEffect, useRef } from "react";

const percent = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

// Interpolate only the visual percentage; financial values keep their exact integers.
export function AnimatedPercentage({ value }: { value: number }) {
  const label = useRef<HTMLSpanElement>(null);
  const displayed = useRef(value);
  useLayoutEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    const write = (next: number) => {
      displayed.current = next;
      if (label.current) label.current.textContent = `${percent.format(next)}%`;
    };
    const finish = () => { cancelAnimationFrame(frame); write(value); };
    if (media.matches) { finish(); return; }
    const from = displayed.current;
    write(from);
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / 280);
      write(from + (value - from) * progress);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    media.addEventListener("change", finish);
    return () => { cancelAnimationFrame(frame); media.removeEventListener("change", finish); };
  }, [value]);
  return <><span aria-hidden="true" ref={label}>{percent.format(value)}%</span><span className="sr-only">{percent.format(value)}%</span></>;
}
