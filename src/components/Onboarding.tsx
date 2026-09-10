"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AppContext } from "./WorkspaceApp";

const steps = [
  {
    target: ".activity-ribbon",
    title: "Your way around Studyspace",
    text: "The far-left sidebar takes you to Collections, Search, Bookmarks, Journal, Review, and Discover. Collections reopens your files; the chevron above these buttons expands or hides their labels.",
  },
  {
    target: ".explorer",
    title: "A home for your collections",
    text: "Organize subjects into collections, then add folders and notes inside them. The left explorer also holds Quick note, Import notes, and Find a note. Use the plus buttons to grow your collection.",
  },
  {
    target: ".tree-scroll",
    title: "Focus on one collection",
    text: "Use the arrow beside a collection to open its dedicated view. The explorer shows just that collection’s files, with its Dictionary and Sources below. Choose All Collections to return. Expanding a collection with its chevron lets you browse without focusing it.",
  },
  {
    target: ".document-scroll, .workspace-empty, .main-workspace",
    title: "Make room for your ideas",
    text: "This is your main writing area. Open or create a note to start writing; changes save automatically. Import any Markdown (.md) file with Import notes in the left explorer, including notes from other apps. Use Live, Source, or Reading to choose how Markdown appears.",
  },
  {
    target: ".inspector-tabs",
    title: "Tools beside your notes",
    text: "Try a tab in Notes & Sources for definitions, research, headings, backlinks, annotations, or AI study help. The description below the tabs explains the selected tool. Reopen this panel from the top bar whenever you need it.",
  },
];
type Rect = { x: number; y: number; width: number; height: number };
type Layout = { focus: Rect | null; x: number; y: number; side: string };

export default function Onboarding({
  ctx,
  step,
  onStep,
  onClose,
}: {
  ctx: AppContext;
  step: number;
  onStep: (step: number) => void;
  onClose: () => void;
}) {
  const card = useRef<HTMLElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  const [layout, setLayout] = useState<Layout>({
    focus: null,
    x: 12,
    y: 12,
    side: "none",
  });
  const current = steps[step];
  const finish = () => {
    ctx.mutate((w) => {
      w.settings.onboardingComplete = true;
    });
    onClose();
  };
  useLayoutEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    next.current?.focus({ preventScroll: true });
    return () => {
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  useLayoutEffect(() => {
    let frame = 0;
    const measure = () => {
      const panel = card.current;
      if (!panel) return;
      const width = innerWidth,
        height = innerHeight,
        gap = 16,
        margin = 12;
      const c = panel.getBoundingClientRect();
      const target = current.target
        .split(",")
        .flatMap((selector) =>
          Array.from(document.querySelectorAll(selector.trim())),
        )
        .find((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        });
      const bounds = target?.getBoundingClientRect();
      const clamp = (value: number, max: number) =>
        Math.max(margin, Math.min(value, max));
      let focus: Rect | null = bounds
        ? {
            x: Math.max(0, bounds.left),
            y: Math.max(0, bounds.top),
            width: Math.max(
              0,
              Math.min(width, bounds.right) - Math.max(0, bounds.left),
            ),
            height: Math.max(
              0,
              Math.min(height, bounds.bottom) - Math.max(0, bounds.top),
            ),
          }
        : null;
      let x = (width - c.width) / 2,
        y = (height - c.height) / 2,
        side = "none";
      if (focus && focus.width && focus.height) {
        const right = focus.x + focus.width,
          bottom = focus.y + focus.height;
        if (right + gap + c.width <= width - margin) {
          x = right + gap;
          y = focus.y + (focus.height - c.height) / 2;
          side = "right";
        } else if (focus.x - gap - c.width >= margin) {
          x = focus.x - gap - c.width;
          y = focus.y + (focus.height - c.height) / 2;
          side = "left";
        } else if (bottom + gap + c.height <= height - margin) {
          x = focus.x;
          y = bottom + gap;
          side = "below";
        } else if (focus.y - gap - c.height >= margin) {
          x = focus.x;
          y = focus.y - gap - c.height;
          side = "above";
        } else {
          // On small screens, spotlight the visible upper portion so the card never covers it.
          y = height - c.height - margin;
          x = focus.x;
          side = "below";
          focus = { ...focus, height: Math.max(0, y - gap - focus.y) };
          if (!focus.height) focus = null;
        }
      } else focus = null;
      const result = {
        focus,
        x: clamp(x, width - c.width - margin),
        y: clamp(y, height - c.height - margin),
        side,
      };
      setLayout((old) =>
        JSON.stringify(old) === JSON.stringify(result) ? old : result,
      );
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(document.documentElement);
    if (card.current) observer.observe(card.current);
    document
      .querySelectorAll(current.target)
      .forEach((el) => observer.observe(el));
    const mutations = new MutationObserver(schedule);
    const shell = document.querySelector(".app-shell");
    if (shell)
      mutations.observe(shell, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "style"],
      });
    addEventListener("resize", schedule);
    document.addEventListener("scroll", schedule, true);
    measure();
    return () => {
      observer.disconnect();
      mutations.disconnect();
      cancelAnimationFrame(frame);
      removeEventListener("resize", schedule);
      document.removeEventListener("scroll", schedule, true);
    };
  }, [current]);
  const f = layout.focus;
  const shades = f
    ? [
        { left: 0, top: 0, width: "100%", height: f.y },
        { left: 0, top: f.y, width: f.x, height: f.height },
        { left: f.x + f.width, right: 0, top: f.y, height: f.height },
        { left: 0, top: f.y + f.height, bottom: 0, width: "100%" },
      ]
    : [{ inset: 0 }];
  return createPortal(
    <div className="onboarding-layer">
      {shades.map((style, i) => (
        <div
          key={i}
          className="onboarding-shade"
          style={style}
          aria-hidden="true"
        />
      ))}
      {f && (
        <div
          className="onboarding-focus"
          aria-hidden="true"
          style={{ left: f.x, top: f.y, width: f.width, height: f.height }}
        />
      )}
      <section
        ref={card}
        className="onboarding-card"
        role="region"
        aria-label="Studyspace walkthrough"
        data-placement={layout.side}
        style={{ left: layout.x, top: layout.y }}
      >
        <div aria-live="polite" aria-atomic="true">
          <span className="eyebrow">
            WELCOME TO STUDYSPACE · {step + 1} / {steps.length}
          </span>
          <h3>{current.title}</h3>
          <p>{current.text}</p>
        </div>
        {step === 3 && (
          <>
            <p className="onboarding-key-hint">Ctrl on Windows / Cmd on Mac:</p>
            <dl className="onboarding-shortcuts">
              {[
                ["Mod+B", "Bold"],
                ["Mod+I", "Italic"],
                ["Mod+K", "Insert link"],
                ["Mod+F", "Find in note"],
                [ctx.w.settings.shortcuts.switcher, "Switch notes"],
                [ctx.w.settings.shortcuts.quick, "Quick note"],
              ].map(([key, label]) => (
                <div key={label}>
                  <dt>
                    <kbd>{key.replace("Mod", "Ctrl / Cmd")}</kbd>
                  </dt>
                  <dd>{label}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
        <footer>
          <button className="text-button" onClick={finish}>
            Skip walkthrough
          </button>
          {step > 0 && (
            <button className="secondary" onClick={() => onStep(step - 1)}>
              Back
            </button>
          )}
          <button
            ref={next}
            className="primary"
            onClick={() =>
              step === steps.length - 1 ? finish() : onStep(step + 1)
            }
          >
            {step === steps.length - 1 ? "Finish" : "Next"}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
