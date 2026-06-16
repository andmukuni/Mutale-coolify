export default function StatCard({ icon, value, label, light = false }) {
  const Icon = icon;
  return (
    <div className={`text-center p-6 rounded-2xl transition-all duration-300 ${
      light
        ? 'bg-navy-800/50 hover:bg-navy-800'
        : 'bg-white hover:shadow-lg border border-navy-100'
    }`}>
      {Icon && (
        <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl mb-3 ${
          light ? 'bg-cyan-600/20 text-cyan-400' : 'bg-cyan-50 text-cyan-600'
        }`}>
          <Icon size={22} />
        </div>
      )}
      <div className={`text-3xl font-bold mb-1 ${light ? 'text-white' : 'text-navy-900'}`}>
        {value}
      </div>
      <div className={`text-sm ${light ? 'text-navy-400' : 'text-navy-500'}`}>
        {label}
      </div>
    </div>
  );
}
