"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { APP_SCREEN_SIZE, type AppScreen } from "@/lib/download/app-screens";

interface ScreenshotRailProps {
  screens: readonly AppScreen[];
}

interface RailEdges {
  isAtStart: boolean;
  isAtEnd: boolean;
}

/** One press moves most of a screen, keeping a sliver of context. */
const SCROLL_STEP_RATIO = 0.85;
const EDGE_TOLERANCE_PX = 4;
/** Lines the first screenshot up with the page's 72rem content column. */
const RAIL_GUTTER = "max(1.25rem, calc((100vw - 72rem) / 2 + 1.25rem))";

function readEdges(rail: HTMLElement): RailEdges {
  return {
    isAtStart: rail.scrollLeft <= EDGE_TOLERANCE_PX,
    isAtEnd: rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - EDGE_TOLERANCE_PX,
  };
}

function ArrowButton({
  direction,
  isDisabled,
  onPress,
}: {
  direction: "previous" | "next";
  isDisabled: boolean;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={isDisabled}
      aria-label={direction === "previous" ? "Previous screenshots" : "Next screenshots"}
      className="grid h-10 w-10 place-items-center rounded-full border border-white/15 text-white transition hover:bg-white/10 disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dl-amber)]"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
        <path d={direction === "previous" ? "M15 18l-6-6 6-6" : "M9 6l6 6-6 6"} />
      </svg>
    </button>
  );
}

/**
 * App Store–style Preview: a swipeable row of the listing's screenshots.
 * Swiping and scroll-snap work without JavaScript; the arrows are an extra
 * for mouse users.
 */
export function ScreenshotRail({ screens }: ScreenshotRailProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState<RailEdges>({ isAtStart: true, isAtEnd: false });

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;

    const sync = () => setEdges(readEdges(rail));
    sync();
    rail.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    return () => {
      rail.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
    };
  }, []);

  const scrollByStep = (sign: 1 | -1) => {
    const rail = railRef.current;
    if (!rail) return;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    rail.scrollBy({
      left: sign * rail.clientWidth * SCROLL_STEP_RATIO,
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  };

  return (
    <section aria-labelledby="preview-heading" className="pt-16 sm:pt-20">
      <div className="mx-auto flex max-w-6xl items-end justify-between px-5">
        <div>
          <h2 id="preview-heading" className="font-[family-name:var(--font-landing-display)] text-3xl font-bold tracking-tight text-white">
            Preview
          </h2>
          <p className="mt-1 text-sm text-white/50">Swipe through what the app does.</p>
        </div>
        <div className="hidden gap-2 sm:flex">
          <ArrowButton direction="previous" isDisabled={edges.isAtStart} onPress={() => scrollByStep(-1)} />
          <ArrowButton direction="next" isDisabled={edges.isAtEnd} onPress={() => scrollByStep(1)} />
        </div>
      </div>

      <div
        ref={railRef}
        role="region"
        aria-label="App screenshots"
        tabIndex={0}
        className="mt-6 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 [scrollbar-width:none] focus-visible:outline-none [&::-webkit-scrollbar]:hidden"
        style={{ paddingInline: RAIL_GUTTER, scrollPaddingInline: RAIL_GUTTER }}
      >
        {screens.map((screen, index) => (
          <figure key={screen.src} className="w-[66vw] max-w-[264px] shrink-0 snap-start">
            <Image
              src={screen.src}
              alt={screen.alt}
              width={APP_SCREEN_SIZE.width}
              height={APP_SCREEN_SIZE.height}
              sizes="(min-width: 640px) 264px, 66vw"
              priority={index < 2}
              className="h-auto w-full rounded-[28px] ring-1 ring-white/10"
            />
          </figure>
        ))}
      </div>
    </section>
  );
}
