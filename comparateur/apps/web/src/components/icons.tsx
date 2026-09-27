/** Icônes SVG minimalistes (aucune dépendance, aucune ressource externe). */
type P = { className?: string; title?: string };

const base = (title?: string) =>
  title ? { role: 'img' as const, 'aria-label': title } : { 'aria-hidden': true as const, focusable: false as const };

export const LogoMark = ({ className = 'h-7 w-7' }: P) => (
  <svg viewBox="0 0 32 32" className={className} {...base()}>
    <rect x="1" y="1" width="30" height="30" rx="9" fill="var(--primary)" />
    <path d="M9 13h14l-1.6 10.2a2 2 0 0 1-2 1.8h-6.8a2 2 0 0 1-2-1.8L9 13Z" fill="var(--on-primary)" />
    <path d="M12.5 13c0-3 1.6-5 3.5-5s3.5 2 3.5 5" fill="none" stroke="var(--on-primary)" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export const IconStore = ({ className = 'h-6 w-6', title }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base(title)}>
    <path {...stroke} d="M4 9.5 5.5 4h13L20 9.5M4 9.5V20h16V9.5M4 9.5c0 1.4 1.1 2.5 2.7 2.5s2.6-1.1 2.6-2.5c0 1.4 1.2 2.5 2.7 2.5s2.7-1.1 2.7-2.5c0 1.4 1 2.5 2.6 2.5S20 10.9 20 9.5M9.5 20v-5h5v5" />
  </svg>
);
export const IconBasket = ({ className = 'h-6 w-6', title }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base(title)}>
    <path {...stroke} d="M3.5 9h17l-1.7 9.3a2 2 0 0 1-2 1.7H7.2a2 2 0 0 1-2-1.7L3.5 9Zm4.5 0 3-5m5 5-3-5M9 13v3m6-3v3" />
  </svg>
);
export const IconScale = ({ className = 'h-6 w-6', title }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base(title)}>
    <path {...stroke} d="M12 4v16M7 20h10M5 7h14M5 7l-2.5 6a3 3 0 0 0 5 0L5 7Zm14 0-2.5 6a3 3 0 0 0 5 0L19 7Z" />
  </svg>
);
export const IconList = ({ className = 'h-6 w-6', title }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base(title)}>
    <path {...stroke} d="M9 6h11M9 12h11M9 18h11M4 6l.8.8L6.5 5M4 12l.8.8 1.7-1.8M4 18l.8.8 1.7-1.8" />
  </svg>
);
export const IconPin = ({ className = 'h-5 w-5', title }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base(title)}>
    <path {...stroke} d="M12 21s-6.5-6.2-6.5-11.2a6.5 6.5 0 1 1 13 0C18.5 14.8 12 21 12 21Z" />
    <circle cx="12" cy="9.8" r="2.3" {...stroke} />
  </svg>
);
export const IconLocate = ({ className = 'h-5 w-5', title }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base(title)}>
    <circle cx="12" cy="12" r="6" {...stroke} />
    <path {...stroke} d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    <circle cx="12" cy="12" r="1.6" fill="currentColor" />
  </svg>
);
export const IconSearch = ({ className = 'h-5 w-5', title }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base(title)}>
    <circle cx="11" cy="11" r="6.5" {...stroke} />
    <path {...stroke} d="m20 20-4.2-4.2" />
  </svg>
);
export const IconPlus = ({ className = 'h-5 w-5', title }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base(title)}>
    <path {...stroke} strokeWidth={2.2} d="M12 5v14M5 12h14" />
  </svg>
);
export const IconMinus = ({ className = 'h-5 w-5', title }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base(title)}>
    <path {...stroke} strokeWidth={2.2} d="M5 12h14" />
  </svg>
);
export const IconTrash = ({ className = 'h-5 w-5', title }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base(title)}>
    <path {...stroke} d="M4 7h16M9.5 7V4.5h5V7M6.5 7l.9 12.1a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4L17.5 7" />
  </svg>
);
export const IconStar = ({ className = 'h-5 w-5', title, filled }: P & { filled?: boolean }) => (
  <svg viewBox="0 0 24 24" className={className} {...base(title)}>
    <path
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinejoin="round"
      d="m12 3.5 2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8L12 3.5Z"
    />
  </svg>
);
export const IconCheck = ({ className = 'h-5 w-5', title }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base(title)}>
    <path {...stroke} strokeWidth={2.4} d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);
export const IconRoute = ({ className = 'h-5 w-5', title }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base(title)}>
    <circle cx="6" cy="18" r="2.3" {...stroke} />
    <circle cx="18" cy="6" r="2.3" {...stroke} />
    <path {...stroke} d="M8.3 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.7" />
  </svg>
);
export const IconShare = ({ className = 'h-5 w-5', title }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base(title)}>
    <path {...stroke} d="M12 15V3.5M7.5 8 12 3.5 16.5 8M5 12.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-6.5" />
  </svg>
);
export const IconPrint = ({ className = 'h-5 w-5', title }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base(title)}>
    <path {...stroke} d="M7 9V3.5h10V9M7 17H5a1.5 1.5 0 0 1-1.5-1.5v-5A1.5 1.5 0 0 1 5 9h14a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 19 17h-2M7 14h10v6.5H7z" />
  </svg>
);
export const IconInfo = ({ className = 'h-4 w-4', title }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base(title)}>
    <circle cx="12" cy="12" r="9" {...stroke} />
    <path {...stroke} d="M12 11v5.5M12 7.6v.2" />
  </svg>
);
export const IconChevron = ({ className = 'h-4 w-4', title }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base(title)}>
    <path {...stroke} d="m9 5 7 7-7 7" />
  </svg>
);
export const IconClock = ({ className = 'h-4 w-4', title }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base(title)}>
    <circle cx="12" cy="12" r="8.5" {...stroke} />
    <path {...stroke} d="M12 7.5V12l3 2" />
  </svg>
);
