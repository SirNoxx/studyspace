import { wordAtPosition } from "./spelling";
export type ModuleField = HTMLInputElement | HTMLTextAreaElement;
export type ModuleTextTarget = {
  field: ModuleField;
  value: string;
  from: number;
  to: number;
  text: string;
};
export function moduleField(target: EventTarget | null): ModuleField | null {
  return target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLInputElement &&
      ["text", "search"].includes(target.type))
    ? target
    : null;
}
export function captureModuleText(
  field: ModuleField,
  word = false,
): ModuleTextTarget {
  let from = field.selectionStart ?? 0,
    to = field.selectionEnd ?? from;
  if (word && from === to) {
    const hit = wordAtPosition(field.value, from);
    if (hit) {
      from = hit.from;
      to = hit.to;
    }
  }
  return {
    field,
    value: field.value,
    from,
    to,
    text: field.value.slice(from, to),
  };
}
export function replaceModuleText(target: ModuleTextTarget, text: string) {
  const { field, value, from, to } = target;
  if (
    !field.isConnected ||
    field.disabled ||
    field.readOnly ||
    field.value !== value
  )
    return false;
  const next = value.slice(0, from) + text + value.slice(to);
  if (field.maxLength >= 0 && next.length > field.maxLength) return false;
  const prototype =
    field instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(field, next);
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.focus({ preventScroll: true });
  field.setSelectionRange(from, from + text.length);
  return true;
}

/** Textarea values are not DOM text nodes, so mirror their layout to locate the clicked word. */
export function moduleTextAtPoint(field: ModuleField, x: number, y: number) {
  const selected = captureModuleText(field);
  if (selected.text) return selected;
  const rect = field.getBoundingClientRect(),
    style = getComputedStyle(field);
  const mirror = document.createElement("div");
  for (const property of [
    "font",
    "font-size",
    "font-family",
    "font-weight",
    "font-style",
    "line-height",
    "letter-spacing",
    "padding",
    "border",
    "text-indent",
    "text-align",
    "tab-size",
    "word-break",
    "overflow-wrap",
  ]) {
    mirror.style.setProperty(property, style.getPropertyValue(property));
  }
  Object.assign(mirror.style, {
    position: "fixed",
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    boxSizing: "border-box",
    whiteSpace: field instanceof HTMLTextAreaElement ? "pre-wrap" : "pre",
    overflow: "hidden",
    opacity: "0",
    pointerEvents: "none",
  });
  const text = document.createTextNode(field.value);
  mirror.appendChild(text);
  document.body.appendChild(mirror);
  mirror.scrollTop = field.scrollTop;
  mirror.scrollLeft = field.scrollLeft;
  try {
    const range = document.createRange();
    for (const match of field.value.matchAll(/[a-zA-Z]+(?:['’][a-zA-Z]+)*/g)) {
      range.setStart(text, match.index);
      range.setEnd(text, match.index + match[0].length);
      if (
        [...range.getClientRects()].some(
          (r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom,
        )
      ) {
        return {
          ...selected,
          from: match.index,
          to: match.index + match[0].length,
          text: match[0],
        };
      }
    }
  } finally {
    mirror.remove();
  }
  return captureModuleText(field, true);
}
export type ModuleTextAction = {
  action: "definition" | "review-card" | "hyperlink" | "chat";
  text: string;
  replace: (text: string) => boolean;
};
export function requestModuleTextAction(
  target: ModuleTextTarget,
  action: ModuleTextAction["action"],
) {
  target.field.dispatchEvent(
    new CustomEvent<ModuleTextAction>("studyspace:module-text-action", {
      bubbles: true,
      detail: {
        action,
        text: target.text,
        replace: (text) => replaceModuleText(target, text),
      },
    }),
  );
}
