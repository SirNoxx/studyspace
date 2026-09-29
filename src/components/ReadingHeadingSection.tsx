"use client";
import { Children, isValidElement, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

function plainText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (isValidElement<{ children?: ReactNode }>(node))
    return plainText(node.props.children);
  return Array.isArray(node) ? node.map(plainText).join("") : "";
}

export default function ReadingHeadingSection({
  children,
}: {
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [heading, content] = Children.toArray(children);
  if (!isValidElement<{ children?: ReactNode }>(heading))
    return <section>{children}</section>;
  const title = plainText(heading.props.children) || "Untitled section";
  const Arrow = collapsed ? ChevronRight : ChevronDown;
  const button = (
    <button
      type="button"
      className="reading-heading-arrow"
      aria-label={`${collapsed ? "Expand" : "Collapse"} ${title}`}
      aria-expanded={!collapsed}
      title={`${collapsed ? "Expand" : "Collapse"} section`}
      onClick={() => setCollapsed((value) => !value)}
    >
      <Arrow size={16} />
    </button>
  );
  return (
    <section className="reading-heading-section">
      <div className="reading-heading-row">
        {button}
        {heading}
      </div>
      <div className="reading-heading-content" hidden={collapsed}>
        {content}
      </div>
    </section>
  );
}
