"use client";

import { useLayoutEffect, useRef } from "react";

// Move existing rows from their previous position while newly inserted rows enter.
export function useListArrival(newIds: string[]) {
  const root = useRef<HTMLDivElement>(null);
  const positions = useRef(new Map<string, number>());
  const animations = useRef<Animation[]>([]);

  useLayoutEffect(() => {
    const elements = root.current?.querySelectorAll<HTMLElement>("[data-transaction-id]");
    const next = new Map<string, number>();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const canAnimate = newIds.length > 0 && !reduce.matches;
    animations.current.forEach(animation => animation.cancel());
    animations.current = [];
    elements?.forEach(element => {
      if (!element.getClientRects().length) return;
      const id = element.dataset.transactionId!;
      const top = element.getBoundingClientRect().top + window.scrollY;
      next.set(id, top);
      const previous = positions.current.get(id);
      if (canAnimate && previous !== undefined && !newIds.includes(id) && previous !== top) {
        animations.current.push(element.animate([
          { transform: `translateY(${previous - top}px)` },
          { transform: "translateY(0)" },
        ], { duration: 280, easing: "cubic-bezier(0.23, 1, 0.32, 1)" }));
      }
    });
    positions.current = next;
    const stop = () => { if (reduce.matches) animations.current.forEach(animation => animation.cancel()); };
    reduce.addEventListener("change", stop);
    return () => reduce.removeEventListener("change", stop);
  });

  useLayoutEffect(() => () => animations.current.forEach(animation => animation.cancel()), []);
  return root;
}
