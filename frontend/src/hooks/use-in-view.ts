import { useEffect, useRef, useState } from "react";

/**
 * Returns a ref and a boolean `inView`.
 * `inView` becomes true once the element intersects the viewport and stays true
 * (one-shot — useful for enter animations).
 */
export function useInView(threshold = 0.1) {
  const ref    = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, inView } as const;
}
