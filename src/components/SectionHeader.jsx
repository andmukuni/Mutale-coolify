export default function SectionHeader({ label, title, description, light = false, center = true }) {
  return (
    <div className={`mb-10 ${center ? 'text-center' : ''}`}>
      {label && (
        <span className={`inline-block text-xs font-semibold uppercase tracking-widest mb-2 ${
          light ? 'text-cyan-300' : 'text-cyan-600'
        }`}>
          {label}
        </span>
      )}
      <h2 className={`text-3xl sm:text-4xl font-bold mb-3 ${
        light ? 'text-white' : 'text-navy-900'
      }`}>
        {title}
      </h2>
      {description && (
        <p className={`max-w-2xl text-base leading-relaxed ${
          center ? 'mx-auto' : ''
        } ${light ? 'text-navy-300' : 'text-navy-600'}`}>
          {description}
        </p>
      )}
    </div>
  );
}
