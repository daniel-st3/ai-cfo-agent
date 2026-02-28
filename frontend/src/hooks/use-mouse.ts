"use client";
import { useEffect, useState } from "react";

interface MouseState {
  /** Normalised –1 → +1 relative to viewport center */
  x: number;
  y: number;
  /** Raw pixel position */
  clientX: number;
  clientY: number;
}

/** Tracks mouse position for parallax and cursor glow effects */
export function useMouse(): MouseState {
  const [state, setState] = useState<MouseState>({ x: 0, y: 0, clientX: 0, clientY: 0 });

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      setState({
        x:       (e.clientX / window.innerWidth  - 0.5) * 2,
        y:       (e.clientY / window.innerHeight - 0.5) * 2,
        clientX: e.clientX,
        clientY: e.clientY,
      });
    };
    window.addEventListener("mousemove", handle, { passive: true });
    return () => window.removeEventListener("mousemove", handle);
  }, []);

  return state;
}
