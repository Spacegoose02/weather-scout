// Rocky's face as a small inline badge (tabs, tips, buttons).
export default function RockyFace({ className = '', label = '' }) {
  return (
    <img
      src="/rocky/rocky-face.webp"
      alt={label}
      aria-hidden={label ? undefined : true}
      className={`rocky-face ${className}`.trim()}
      width="27"
      height="22"
      decoding="async"
    />
  );
}
