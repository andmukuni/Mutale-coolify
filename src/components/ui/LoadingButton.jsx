import Spinner from './Spinner';

export default function LoadingButton({
  loading = false,
  loadingLabel,
  icon: Icon,
  iconSize = 16,
  spinnerSize = 16,
  children,
  className = '',
  type = 'button',
  disabled = false,
  ...props
}) {
  const label = loading ? (loadingLabel ?? children) : children;

  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
      {...props}
    >
      {loading ? <Spinner size={spinnerSize} /> : Icon ? <Icon size={iconSize} /> : null}
      {label}
    </button>
  );
}
