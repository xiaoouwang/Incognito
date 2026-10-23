/**
 * Open eye = original kept visible; slashed eye = will be anonymized.
 */
export function VisibilityIcon({ shown, size = 15 }) {
  if (shown) {
    return (
      <svg
        className="visibility-toggle-icon"
        viewBox="0 0 24 24"
        width={size}
        height={size}
        aria-hidden="true"
        focusable="false"
      >
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"
        />
        <circle
          cx="12"
          cy="12"
          r="3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
        />
      </svg>
    );
  }

  return (
    <svg
      className="visibility-toggle-icon"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.5 3.5l17 17M9.9 9.9A3 3 0 0 0 9 12a3 3 0 0 0 4.1.9M6.1 6.2C4.2 7.5 2.8 9.4 2.5 12c0 0 3.5 6.5 9.5 6.5 1.7 0 3.2-.4 4.5-1.1M10.5 5.6C11 5.5 11.5 5.5 12 5.5c6 0 9.5 6.5 9.5 6.5a11.4 11.4 0 0 1-2.2 3.1"
      />
    </svg>
  );
}

export function VisibilityToggleButton({
  shown,
  title,
  onClick,
  className = "",
  size = 15,
}) {
  return (
    <button
      type="button"
      className={`visibility-toggle${shown ? " is-shown" : " is-anonymized"}${
        className ? ` ${className}` : ""
      }`}
      onClick={onClick}
      title={title}
      aria-pressed={shown}
      aria-label={title}
    >
      <VisibilityIcon shown={shown} size={size} />
    </button>
  );
}
