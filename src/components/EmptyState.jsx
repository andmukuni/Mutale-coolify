import { FileText } from 'lucide-react';

export default function EmptyState({ icon = FileText, title, description, action }) {
  const Icon = icon;
  return (
    <div className="text-center py-16 px-6">
      <div className="w-16 h-16 rounded-2xl bg-navy-100 text-navy-400 flex items-center justify-center mx-auto mb-4">
        <Icon size={28} />
      </div>
      <h3 className="text-lg font-semibold text-navy-700 mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-navy-500 max-w-sm mx-auto mb-4">{description}</p>
      )}
      {action}
    </div>
  );
}
