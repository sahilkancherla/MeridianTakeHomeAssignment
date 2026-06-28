import type { ComponentType, SVGProps } from 'react';
import type { PrimitiveType } from '@meridian/spec';

/**
 * Minimal stroke icons, one per primitive. They inherit `currentColor` so a card
 * can paint its icon in the primitive's hue.
 */
type IconProps = SVGProps<SVGSVGElement>;

const base = (props: IconProps) => ({
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  ...props,
});

const Trigger = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
  </svg>
);

const Input = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
    <path d="M14 3v5h5M9 13h6M9 17h6" />
  </svg>
);

const System = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="4" width="18" height="6" rx="1.5" />
    <rect x="3" y="14" width="18" height="6" rx="1.5" />
    <path d="M7 7h.01M7 17h.01" />
  </svg>
);

const Action = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M10 8.5 15.5 12 10 15.5v-7Z" />
  </svg>
);

const Rule = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 2.5 4 6v5.5c0 4.5 3.3 7.6 8 9 4.7-1.4 8-4.5 8-9V6l-8-3.5Z" />
    <path d="m9 12 2 2 4-4.5" />
  </svg>
);

// The diamond — the classic "the path splits here" symbol a non-technical user recognizes.
const Branch = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3 21 12l-9 9-9-9 9-9Z" />
    <path d="M12 8v4m0 0H9m3 0h3" />
  </svg>
);

const Exception = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M10.3 3.2 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.2a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4m0 4h.01" />
  </svg>
);

const Outcome = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M5 21V4M5 4h11l-1.5 3.5L16 11H5" />
  </svg>
);

export const PRIMITIVE_ICONS: Record<PrimitiveType, ComponentType<IconProps>> = {
  trigger: Trigger,
  input: Input,
  system: System,
  action: Action,
  rule: Rule,
  branch: Branch,
  exception: Exception,
  outcome: Outcome,
};
