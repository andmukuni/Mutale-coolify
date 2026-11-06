/**
 * One area of expertise. It isn't a link, so on hover it doesn't lift like a
 * card you can open: the icon fills and a teal line draws across the top.
 */
export default function ExpertiseCard({ icon, title, description }) {
  const Icon = icon;
  return (
    <div className="group relative h-full overflow-hidden rounded-2xl border border-navy-100 bg-white p-6 transition-colors duration-300 hover:border-cyan-200">
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-1 origin-left scale-x-0 bg-gradient-to-r from-cyan-700 to-[#00A79D] transition-transform duration-500 ease-out group-hover:scale-x-100 motion-reduce:transition-none"
      />
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 transition-colors duration-300 group-hover:bg-cyan-700 group-hover:text-white dark:bg-cyan-500/10 dark:text-cyan-300">
        <Icon size={22} aria-hidden="true" />
      </div>
      <h3 className="mb-2 text-lg font-semibold text-navy-900">{title}</h3>
      <p className="text-sm leading-relaxed text-navy-600">{description}</p>
    </div>
  );
}
