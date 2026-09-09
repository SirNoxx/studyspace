"use client";
import * as Dialog from "@radix-ui/react-dialog";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import {
  X,
  BookOpen,
  Code2,
  GraduationCap,
  PenTool,
  Gamepad2,
  Inbox,
  Sigma,
  Folder,
  Sparkles,
  Library,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
export const icons: Record<string, LucideIcon> = {
  book: BookOpen,
  code: Code2,
  graduation: GraduationCap,
  pen: PenTool,
  game: Gamepad2,
  inbox: Inbox,
  sigma: Sigma,
  folder: Folder,
  sparkles: Sparkles,
  library: Library,
};
export function SymbolIcon({
  name,
  size = 16,
  ...props
}: {
  name: string;
  size?: number;
  style?: React.CSSProperties;
}) {
  const Icon = icons[name] ?? BookOpen;
  return <Icon size={size} {...props} />;
}
export function IconButton({
  label,
  children,
  active,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={
        "icon-button " + (active ? "active " : "") + (props.className ?? "")
      }
      {...props}
    >
      {children}
    </button>
  );
}
export function Modal({
  title,
  description,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className={"dialog " + (wide ? "dialog-wide" : "")}
          onCloseAutoFocus={(e) => {
            if (document.activeElement === document.body) e.preventDefault();
          }}
        >
          <div className="dialog-heading">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close asChild>
              <IconButton label="Close dialog">
                <X size={18} />
              </IconButton>
            </Dialog.Close>
          </div>
          <Dialog.Description
            className={description ? "dialog-description" : "sr-only"}
          >
            {description ?? title}
          </Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Menu({
  trigger,
  items,
}: {
  trigger: ReactNode;
  items: (
    | {
        label: string;
        icon?: LucideIcon;
        action: () => void;
        danger?: boolean;
        disabled?: boolean;
      }
    | "separator"
  )[];
}) {
  return (
    <Dropdown.Root>
      <Dropdown.Trigger asChild>{trigger}</Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content className="context-menu" sideOffset={5} align="start">
          {items.map((item, i) =>
            item === "separator" ? (
              <Dropdown.Separator className="menu-separator" key={i} />
            ) : (
              <Dropdown.Item
                className={"menu-item " + (item.danger ? "danger" : "")}
                disabled={item.disabled}
                key={i}
                onSelect={item.action}
              >
                {item.icon && <item.icon size={15} />}
                <span>{item.label}</span>
              </Dropdown.Item>
            ),
          )}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
export function Empty({
  icon: Icon = BookOpen,
  title,
  children,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <Icon size={30} strokeWidth={1.3} />
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
