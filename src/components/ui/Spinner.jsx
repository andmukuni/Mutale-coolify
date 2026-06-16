export default function Spinner({ size = 16, className = '' }) {
  return (
    <span
      className={`inline-block rounded-full border-2 border-current border-t-transparent animate-spin ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}
