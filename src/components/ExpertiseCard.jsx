export default function ExpertiseCard({ icon, title, description }) {
  const Icon = icon;
  return (
    <div className="group bg-white border border-navy-100 rounded-2xl p-6 hover:shadow-xl hover:border-cyan-200 transition-all duration-300 hover:-translate-y-1">
      <div className="w-12 h-12 rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center mb-4 group-hover:bg-cyan-600 group-hover:text-white transition-colors duration-300">
        <Icon size={22} />
      </div>
      <h3 className="text-lg font-semibold text-navy-900 mb-2">{title}</h3>
      <p className="text-sm text-navy-500 leading-relaxed">{description}</p>
    </div>
  );
}
