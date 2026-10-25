"use client";
import { useLayoutEffect, useRef, type ReactNode } from "react";

/** Keep floating playback and drawers clear as the composer grows. */
export default function CanvasDock({
  children,
  className,
  label,
  id,
}: {
  children: ReactNode;
  className: string;
  label: string;
  id?: string;
}) {
  const dock = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = dock.current;
    const workspace = element?.closest<HTMLElement>(
      ".scene-workspace, .flow-layout, .studio-layout",
    );
    if (!element || !workspace) return;
    const measure = () =>
      workspace.style.setProperty(
        "--studio-dock-height",
        element.getBoundingClientRect().height + "px",
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
      workspace.style.removeProperty("--studio-dock-height");
    };
  }, []);
  return (
    <div id={id} ref={dock} className={className} role="region" aria-label={label}>
      {children}
    </div>
  );
}
