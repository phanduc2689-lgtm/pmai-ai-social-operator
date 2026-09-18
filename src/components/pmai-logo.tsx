export function PmaiLogo({ className = "" }: { className?: string }) {
  return (
    <span className={`pmai-logo ${className}`}>
      <svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="#2f4a5c" />
        <path d="M8 22V10h6.2c3.4 0 5.4 1.8 5.4 4.6 0 2.8-2 4.6-5.4 4.6H11.4V22H8zm3.4-5.4h2.4c1.6 0 2.5-.8 2.5-2s-.9-2-2.5-2h-2.4v4z" fill="#fbfaf6" />
        <circle cx="24.2" cy="21.2" r="2.2" fill="#e6f0ea" />
      </svg>
      <span className="pmai-logo-word">PMAI</span>
    </span>
  );
}
