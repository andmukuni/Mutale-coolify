/**
 * Full-page loading screen shown while initial data is loading.
 */
export default function PageLoader({ message = 'Loading...' }) {
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white">
      {/* Animated spinner */}
      <div className="relative w-16 h-16 mb-6">
        <div className="absolute inset-0 rounded-full border-4 border-navy-100" />
        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-navy-900 animate-spin" />
      </div>

      {/* Loading text */}
      <p className="text-navy-700 text-lg font-medium animate-pulse">{message}</p>

      {/* Subtle branding */}
      <p className="mt-2 text-sm text-navy-400">Mutale Mubanga</p>
    </div>
  );
}
