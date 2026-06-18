export default function SectionHeader({ label, title, description, light = false, center = true }) {
  const trimmed = String(title || '').trim();
  const spaceIdx = trimmed.indexOf(' ');
  const firstWord = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
  const restWords = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1);

  return (
    <div className={`mb-10 ${center ? 'text-center' : ''}`}>
      <h2 className="text-3xl sm:text-4xl font-bold">
        <span className={light ? 'text-white' : 'text-[#141D45]'}>{firstWord}</span>
        {restWords && <span className="text-[#00A79D]"> {restWords}</span>}
      </h2>
      <span className={`mt-3 block h-1 w-12 rounded-full bg-[#E76869] ${center ? 'mx-auto' : ''}`} />
      {description && (
        <p className={`mt-4 max-w-2xl text-base leading-relaxed ${
          center ? 'mx-auto' : ''
        } ${light ? 'text-navy-300' : 'text-navy-600'}`}>
          {description}
        </p>
      )}
    </div>
  );
}
