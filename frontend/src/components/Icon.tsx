import type { ReactNode } from "react";

export type IconName = "up" | "down" | "eye" | "eye-off" | "flag" | "text" | "pencil" | "close";

// Small line drawings in the color of the text, so every theme of the browser
// keeps them readable. Drawn here, so nothing is loaded from elsewhere.
const SHAPES: Record<IconName, ReactNode> = {
  up: <polyline points="6 15 12 9 18 15" />,
  down: <polyline points="6 9 12 15 18 9" />,
  eye: (
    <>
      <ellipse cx="12" cy="12" rx="10" ry="6" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  "eye-off": (
    <>
      <ellipse cx="12" cy="12" rx="10" ry="6" />
      <line x1="3" y1="3" x2="21" y2="21" />
    </>
  ),
  flag: <path d="M6 21V4h11l-2 4 2 4H6" />,
  text: <path d="M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6" />,
  pencil: <path d="M4 20l1-4L16 5l3 3L8 19z" />,
  close: (
    <>
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </>
  ),
};

export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {SHAPES[name]}
    </svg>
  );
}

interface IconButtonProps {
  icon: IconName;
  // The name the button has for a screen reader and in the tests.
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  className?: string;
  onClick: () => void;
}

export function IconButton({ icon, label, pressed, disabled, className, onClick }: IconButtonProps) {
  return (
    <button
      type="button"
      className={className === undefined ? "icon-button" : `icon-button ${className}`}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon name={icon} />
    </button>
  );
}
