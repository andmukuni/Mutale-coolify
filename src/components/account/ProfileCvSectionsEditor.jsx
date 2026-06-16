import { Plus, Trash2 } from 'lucide-react';
import {
  emptyEducationEntry,
  emptyExperienceEntry,
  emptyReferenceEntry,
} from '../../../shared/cvProfileSections.js';

const inputClass =
  'w-full px-3 py-2 rounded-lg border border-navy-200 bg-white text-sm text-navy-900 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent';

const labelClass = 'block text-xs font-semibold text-navy-600 mb-1';

function updateList(list, id, patch) {
  return list.map((row) => (row.id === id ? { ...row, ...patch } : row));
}

function removeFromList(list, id) {
  return list.filter((row) => row.id !== id);
}

/**
 * @param {{ sections: object, onChange: (sections: object) => void }} props
 */
export default function ProfileCvSectionsEditor({ sections, onChange }) {
  const education = sections.education || [];
  const experience = sections.experience || [];
  const references = sections.references || [];

  const patch = (key, value) => onChange({ ...sections, [key]: value });

  return (
    <div className="space-y-8 pt-4 border-t border-navy-100">
      <p className="text-sm text-navy-600">
        Add work experience, education, and references for your profile and CV. Event attendance and
        certificates are added automatically from your activity.
      </p>

      <section>
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-bold text-navy-900">Experience</h3>
          <button
            type="button"
            onClick={() => patch('experience', [...experience, emptyExperienceEntry()])}
            className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-700 hover:text-cyan-800"
          >
            <Plus size={14} />
            Add role
          </button>
        </div>
        {experience.length === 0 ? (
          <p className="text-xs text-navy-500">No experience added yet.</p>
        ) : (
          <div className="space-y-4">
            {experience.map((row, index) => (
              <div key={row.id} className="rounded-xl border border-navy-200 p-4 bg-navy-50/30 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-navy-500">Role {index + 1}</span>
                  <button
                    type="button"
                    onClick={() => patch('experience', removeFromList(experience, row.id))}
                    className="text-navy-400 hover:text-red-600"
                    aria-label="Remove experience"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Job title</label>
                    <input
                      className={inputClass}
                      value={row.title}
                      onChange={(e) => patch('experience', updateList(experience, row.id, { title: e.target.value }))}
                      placeholder="Quality Systems Specialist"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Company / organization</label>
                    <input
                      className={inputClass}
                      value={row.company}
                      onChange={(e) => patch('experience', updateList(experience, row.id, { company: e.target.value }))}
                      placeholder="Ministry of Health"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Location</label>
                    <input
                      className={inputClass}
                      value={row.location}
                      onChange={(e) => patch('experience', updateList(experience, row.id, { location: e.target.value }))}
                      placeholder="Lusaka, Zambia"
                    />
                  </div>
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <label className={labelClass}>Start</label>
                      <input
                        className={inputClass}
                        value={row.startDate}
                        onChange={(e) => patch('experience', updateList(experience, row.id, { startDate: e.target.value }))}
                        placeholder="Jan 2020"
                      />
                    </div>
                    <div className="flex-1">
                      <label className={labelClass}>End</label>
                      <input
                        className={inputClass}
                        value={row.endDate}
                        disabled={row.current}
                        onChange={(e) => patch('experience', updateList(experience, row.id, { endDate: e.target.value }))}
                        placeholder="Dec 2024"
                      />
                    </div>
                  </div>
                </div>
                <label className="inline-flex items-center gap-2 text-xs text-navy-700">
                  <input
                    type="checkbox"
                    checked={row.current}
                    onChange={(e) => patch('experience', updateList(experience, row.id, {
                      current: e.target.checked,
                      endDate: e.target.checked ? '' : row.endDate,
                    }))}
                  />
                  I currently work here
                </label>
                <div>
                  <label className={labelClass}>Responsibilities (one per line)</label>
                  <textarea
                    className={`${inputClass} resize-none`}
                    rows={3}
                    value={row.description}
                    onChange={(e) => patch('experience', updateList(experience, row.id, { description: e.target.value }))}
                    placeholder="Led ISO 15189 implementation&#10;Mentored laboratory quality teams"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-bold text-navy-900">Academic / education</h3>
          <button
            type="button"
            onClick={() => patch('education', [...education, emptyEducationEntry()])}
            className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-700 hover:text-cyan-800"
          >
            <Plus size={14} />
            Add qualification
          </button>
        </div>
        {education.length === 0 ? (
          <p className="text-xs text-navy-500">No education added yet.</p>
        ) : (
          <div className="space-y-4">
            {education.map((row, index) => (
              <div key={row.id} className="rounded-xl border border-navy-200 p-4 bg-navy-50/30 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-navy-500">Qualification {index + 1}</span>
                  <button
                    type="button"
                    onClick={() => patch('education', removeFromList(education, row.id))}
                    className="text-navy-400 hover:text-red-600"
                    aria-label="Remove education"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Institution</label>
                    <input
                      className={inputClass}
                      value={row.institution}
                      onChange={(e) => patch('education', updateList(education, row.id, { institution: e.target.value }))}
                      placeholder="University of Zambia"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Degree / qualification</label>
                    <input
                      className={inputClass}
                      value={row.degree}
                      onChange={(e) => patch('education', updateList(education, row.id, { degree: e.target.value }))}
                      placeholder="Bachelor of Science"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Field of study</label>
                    <input
                      className={inputClass}
                      value={row.field}
                      onChange={(e) => patch('education', updateList(education, row.id, { field: e.target.value }))}
                      placeholder="Biomedical Sciences"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Start year</label>
                    <input
                      className={inputClass}
                      value={row.startYear}
                      onChange={(e) => patch('education', updateList(education, row.id, { startYear: e.target.value }))}
                      placeholder="2010"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>End year</label>
                    <input
                      className={inputClass}
                      value={row.endYear}
                      onChange={(e) => patch('education', updateList(education, row.id, { endYear: e.target.value }))}
                      placeholder="2014"
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Notes (optional)</label>
                  <textarea
                    className={`${inputClass} resize-none`}
                    rows={2}
                    value={row.description}
                    onChange={(e) => patch('education', updateList(education, row.id, { description: e.target.value }))}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-bold text-navy-900">References</h3>
          <button
            type="button"
            onClick={() => patch('references', [...references, emptyReferenceEntry()])}
            className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-700 hover:text-cyan-800"
          >
            <Plus size={14} />
            Add reference
          </button>
        </div>
        {references.length === 0 ? (
          <p className="text-xs text-navy-500">References are optional and shown on your profile.</p>
        ) : (
          <div className="space-y-4">
            {references.map((row, index) => (
              <div key={row.id} className="rounded-xl border border-navy-200 p-4 bg-navy-50/30 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-navy-500">Reference {index + 1}</span>
                  <button
                    type="button"
                    onClick={() => patch('references', removeFromList(references, row.id))}
                    className="text-navy-400 hover:text-red-600"
                    aria-label="Remove reference"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Name</label>
                    <input
                      className={inputClass}
                      value={row.name}
                      onChange={(e) => patch('references', updateList(references, row.id, { name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Job title</label>
                    <input
                      className={inputClass}
                      value={row.title}
                      onChange={(e) => patch('references', updateList(references, row.id, { title: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Organization</label>
                    <input
                      className={inputClass}
                      value={row.organization}
                      onChange={(e) => patch('references', updateList(references, row.id, { organization: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Relationship</label>
                    <input
                      className={inputClass}
                      value={row.relationship}
                      onChange={(e) => patch('references', updateList(references, row.id, { relationship: e.target.value }))}
                      placeholder="Former supervisor"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Email</label>
                    <input
                      type="email"
                      className={inputClass}
                      value={row.email}
                      onChange={(e) => patch('references', updateList(references, row.id, { email: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Phone</label>
                    <input
                      type="tel"
                      className={inputClass}
                      value={row.phone}
                      onChange={(e) => patch('references', updateList(references, row.id, { phone: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
