/** A heading in the homepage's style: the first word navy, the rest brand teal. */
export default function TwoToneTitle({ text, as = 'h2', className = '', ...rest }) {
  const Tag = as;
  const trimmed = String(text || '').trim();
  const space = trimmed.indexOf(' ');
  const first = space === -1 ? trimmed : trimmed.slice(0, space);
  const remainder = space === -1 ? '' : trimmed.slice(space + 1);
  return (
    <Tag className={className} {...rest}>
      <span className="text-navy-900">{first}</span>
      {/* The space stays outside the spans, so the heading's name keeps it: "Mutale has worked with". */}
      {remainder && <>{' '}<span className="text-[#00A79D]">{remainder}</span></>}
    </Tag>
  );
}
