import { useState } from 'react';
import {
  LayoutDashboard, CalendarDays, FileEdit, Settings,
  Plus, Pencil, Trash2, X, Save, RotateCcw, ChevronRight, Menu
} from 'lucide-react';
import EmptyState from '../components/EmptyState';
import { useData } from '../context/DataContext';
import { formatDate, calculateReadTime } from '../utils/helpers';

const tabs = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'events', label: 'Events', icon: CalendarDays },
  { id: 'blog', label: 'Blog Posts', icon: FileEdit },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-[calc(100vh-64px)] bg-navy-50">
      <div className="flex">
        {/* Sidebar */}
        <aside className={`fixed inset-y-16 left-0 z-40 w-64 bg-white border-r border-navy-100 transform transition-transform duration-200 lg:translate-x-0 lg:static lg:inset-auto ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="p-6 border-b border-navy-100">
            <h2 className="text-lg font-bold text-navy-900">Admin Portal</h2>
            <p className="text-xs text-navy-400 mt-0.5">Manage your portfolio content</p>
          </div>
          <nav className="p-4 space-y-1">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-cyan-50 text-cyan-700'
                    : 'text-navy-500 hover:bg-navy-50 hover:text-navy-700'
                }`}
              >
                <tab.icon size={18} />
                {tab.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Overlay */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-30 bg-black/20 lg:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Mobile toggle */}
          <div className="lg:hidden p-4 border-b border-navy-100 bg-white">
            <button onClick={() => setSidebarOpen(true)} className="flex items-center gap-2 text-sm text-navy-600">
              <Menu size={18} />
              Menu
            </button>
          </div>

          <div className="p-6 sm:p-8">
            {activeTab === 'dashboard' && <DashboardTab />}
            {activeTab === 'events' && <EventsTab />}
            {activeTab === 'blog' && <BlogTab />}
            {activeTab === 'settings' && <SettingsTab />}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────────── Dashboard Tab ───────────── */
function DashboardTab() {
  const { events, blogPosts } = useData();
  return (
    <div>
      <h1 className="text-2xl font-bold text-navy-900 mb-6">Dashboard</h1>
      <div className="grid sm:grid-cols-3 gap-6 mb-8">
        {[
          { label: 'Total Events', value: events.length, color: 'bg-cyan-50 text-cyan-700' },
          { label: 'Blog Posts', value: blogPosts.length, color: 'bg-blue-50 text-blue-700' },
          { label: 'Featured Events', value: events.filter(e => e.featured).length, color: 'bg-amber-50 text-amber-700' },
        ].map((s, i) => (
          <div key={i} className={`rounded-2xl p-6 ${s.color}`}>
            <div className="text-3xl font-bold">{s.value}</div>
            <div className="text-sm mt-1 opacity-75">{s.label}</div>
          </div>
        ))}
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-navy-100 p-6">
          <h3 className="text-sm font-semibold text-navy-900 mb-4">Recent Events</h3>
          {events.slice(0, 5).map(e => (
            <div key={e.id} className="flex items-center justify-between py-2 border-b border-navy-50 last:border-0">
              <span className="text-sm text-navy-700 truncate mr-4">{e.title}</span>
              <span className="text-xs text-navy-400 shrink-0">{formatDate(e.date)}</span>
            </div>
          ))}
        </div>
        <div className="bg-white rounded-2xl border border-navy-100 p-6">
          <h3 className="text-sm font-semibold text-navy-900 mb-4">Recent Blog Posts</h3>
          {blogPosts.slice(0, 5).map(p => (
            <div key={p.id} className="flex items-center justify-between py-2 border-b border-navy-50 last:border-0">
              <span className="text-sm text-navy-700 truncate mr-4">{p.title}</span>
              <span className="text-xs text-navy-400 shrink-0">{p.category}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ───────────── Events Tab ───────────── */
function EventsTab() {
  const { events, addEvent, updateEvent, deleteEvent } = useData();
  const [editing, setEditing] = useState(null); // null = list, 'new' = create, id = edit
  const [confirmDelete, setConfirmDelete] = useState(null);

  const emptyEvent = {
    title: '', date: '', time: '', endTime: '', location: '',
    category: 'Workshop', description: '', registrationLink: '', featured: false
  };

  const [form, setForm] = useState(emptyEvent);

  const startEdit = (event) => {
    setForm({ ...event });
    setEditing(event.id);
  };

  const startNew = () => {
    setForm(emptyEvent);
    setEditing('new');
  };

  const handleSave = (e) => {
    e.preventDefault();
    if (editing === 'new') {
      addEvent(form);
    } else {
      updateEvent(editing, form);
    }
    setEditing(null);
  };

  const handleDelete = (id) => {
    deleteEvent(id);
    setConfirmDelete(null);
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  if (editing !== null) {
    return (
      <div>
        <button onClick={() => setEditing(null)} className="flex items-center gap-1 text-sm text-navy-500 hover:text-navy-700 mb-4">
          <ChevronRight size={14} className="rotate-180" /> Back to Events
        </button>
        <h2 className="text-xl font-bold text-navy-900 mb-6">
          {editing === 'new' ? 'Create Event' : 'Edit Event'}
        </h2>
        <form onSubmit={handleSave} className="bg-white rounded-2xl border border-navy-100 p-6 space-y-5 max-w-2xl">
          <FormField label="Title" name="title" value={form.title} onChange={handleChange} required />
          <div className="grid sm:grid-cols-2 gap-4">
            <FormField label="Date" name="date" type="date" value={form.date} onChange={handleChange} required />
            <FormField label="Category" name="category" value={form.category} onChange={handleChange} required />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <FormField label="Start Time" name="time" type="time" value={form.time} onChange={handleChange} />
            <FormField label="End Time" name="endTime" type="time" value={form.endTime} onChange={handleChange} />
          </div>
          <FormField label="Location" name="location" value={form.location} onChange={handleChange} required />
          <FormField label="Description" name="description" value={form.description} onChange={handleChange} textarea required />
          <FormField label="Registration Link" name="registrationLink" value={form.registrationLink} onChange={handleChange} placeholder="https://..." />
          <label className="flex items-center gap-2 text-sm text-navy-700 cursor-pointer">
            <input type="checkbox" name="featured" checked={form.featured} onChange={handleChange} className="rounded" />
            Featured event
          </label>
          <div className="flex gap-3 pt-2">
            <button type="submit" className="inline-flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors">
              <Save size={16} /> Save Event
            </button>
            <button type="button" onClick={() => setEditing(null)} className="px-5 py-2.5 rounded-xl text-sm font-medium text-navy-500 hover:bg-navy-100 transition-colors">
              Cancel
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-navy-900">Manage Events</h1>
        <button onClick={startNew} className="inline-flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
          <Plus size={16} /> New Event
        </button>
      </div>
      {events.length === 0 ? (
        <EmptyState title="No events yet" description="Create your first event to get started." action={
          <button onClick={startNew} className="inline-flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
            <Plus size={16} /> Create Event
          </button>
        } />
      ) : (
        <div className="bg-white rounded-2xl border border-navy-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-navy-100 bg-navy-50">
                  <th className="text-left px-4 py-3 font-semibold text-navy-700">Title</th>
                  <th className="text-left px-4 py-3 font-semibold text-navy-700">Date</th>
                  <th className="text-left px-4 py-3 font-semibold text-navy-700">Category</th>
                  <th className="text-right px-4 py-3 font-semibold text-navy-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {events.map(event => (
                  <tr key={event.id} className="border-b border-navy-50 hover:bg-navy-50/50">
                    <td className="px-4 py-3 text-navy-800 font-medium">{event.title}</td>
                    <td className="px-4 py-3 text-navy-500">{formatDate(event.date)}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-cyan-50 text-cyan-700 px-2 py-0.5 rounded-full font-medium">{event.category}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => startEdit(event)} className="p-1.5 rounded-lg hover:bg-navy-100 text-navy-400 hover:text-navy-700 transition-colors" aria-label="Edit event">
                          <Pencil size={15} />
                        </button>
                        {confirmDelete === event.id ? (
                          <div className="flex items-center gap-1">
                            <button onClick={() => handleDelete(event.id)} className="text-xs bg-red-600 text-white px-2 py-1 rounded-lg hover:bg-red-700">Delete</button>
                            <button onClick={() => setConfirmDelete(null)} className="text-xs text-navy-500 px-2 py-1 rounded-lg hover:bg-navy-100">Cancel</button>
                          </div>
                        ) : (
                          <button onClick={() => setConfirmDelete(event.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-navy-400 hover:text-red-600 transition-colors" aria-label="Delete event">
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────── Blog Tab ───────────── */
function BlogTab() {
  const { blogPosts, addBlogPost, updateBlogPost, deleteBlogPost } = useData();
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const emptyPost = {
    title: '', category: 'Quality Systems', date: new Date().toISOString().split('T')[0],
    excerpt: '', content: '', featured: false, readTime: '5 min read', image: null
  };

  const [form, setForm] = useState(emptyPost);

  const startEdit = (post) => {
    setForm({ ...post });
    setEditing(post.id);
  };

  const startNew = () => {
    setForm(emptyPost);
    setEditing('new');
  };

  const handleSave = (e) => {
    e.preventDefault();
    const data = { ...form, readTime: calculateReadTime(form.content) };
    if (editing === 'new') {
      addBlogPost(data);
    } else {
      updateBlogPost(editing, data);
    }
    setEditing(null);
  };

  const handleDelete = (id) => {
    deleteBlogPost(id);
    setConfirmDelete(null);
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  if (editing !== null) {
    return (
      <div>
        <button onClick={() => setEditing(null)} className="flex items-center gap-1 text-sm text-navy-500 hover:text-navy-700 mb-4">
          <ChevronRight size={14} className="rotate-180" /> Back to Blog Posts
        </button>
        <h2 className="text-xl font-bold text-navy-900 mb-6">
          {editing === 'new' ? 'Create Blog Post' : 'Edit Blog Post'}
        </h2>
        <form onSubmit={handleSave} className="bg-white rounded-2xl border border-navy-100 p-6 space-y-5 max-w-3xl">
          <FormField label="Title" name="title" value={form.title} onChange={handleChange} required />
          <div className="grid sm:grid-cols-2 gap-4">
            <FormField label="Category" name="category" value={form.category} onChange={handleChange} required />
            <FormField label="Date" name="date" type="date" value={form.date} onChange={handleChange} required />
          </div>
          <FormField label="Excerpt" name="excerpt" value={form.excerpt} onChange={handleChange} textarea required />
          <FormField label="Content (Markdown supported)" name="content" value={form.content} onChange={handleChange} textarea rows={12} required />
          <label className="flex items-center gap-2 text-sm text-navy-700 cursor-pointer">
            <input type="checkbox" name="featured" checked={form.featured} onChange={handleChange} className="rounded" />
            Featured post
          </label>
          <div className="flex gap-3 pt-2">
            <button type="submit" className="inline-flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors">
              <Save size={16} /> Save Post
            </button>
            <button type="button" onClick={() => setEditing(null)} className="px-5 py-2.5 rounded-xl text-sm font-medium text-navy-500 hover:bg-navy-100 transition-colors">
              Cancel
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-navy-900">Manage Blog Posts</h1>
        <button onClick={startNew} className="inline-flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
          <Plus size={16} /> New Post
        </button>
      </div>
      {blogPosts.length === 0 ? (
        <EmptyState title="No blog posts yet" description="Create your first article to get started." action={
          <button onClick={startNew} className="inline-flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
            <Plus size={16} /> Create Post
          </button>
        } />
      ) : (
        <div className="bg-white rounded-2xl border border-navy-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-navy-100 bg-navy-50">
                  <th className="text-left px-4 py-3 font-semibold text-navy-700">Title</th>
                  <th className="text-left px-4 py-3 font-semibold text-navy-700">Category</th>
                  <th className="text-left px-4 py-3 font-semibold text-navy-700">Date</th>
                  <th className="text-right px-4 py-3 font-semibold text-navy-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {blogPosts.map(post => (
                  <tr key={post.id} className="border-b border-navy-50 hover:bg-navy-50/50">
                    <td className="px-4 py-3 text-navy-800 font-medium max-w-xs truncate">{post.title}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-cyan-50 text-cyan-700 px-2 py-0.5 rounded-full font-medium">{post.category}</span>
                    </td>
                    <td className="px-4 py-3 text-navy-500">{formatDate(post.date)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => startEdit(post)} className="p-1.5 rounded-lg hover:bg-navy-100 text-navy-400 hover:text-navy-700 transition-colors" aria-label="Edit post">
                          <Pencil size={15} />
                        </button>
                        {confirmDelete === post.id ? (
                          <div className="flex items-center gap-1">
                            <button onClick={() => handleDelete(post.id)} className="text-xs bg-red-600 text-white px-2 py-1 rounded-lg hover:bg-red-700">Delete</button>
                            <button onClick={() => setConfirmDelete(null)} className="text-xs text-navy-500 px-2 py-1 rounded-lg hover:bg-navy-100">Cancel</button>
                          </div>
                        ) : (
                          <button onClick={() => setConfirmDelete(post.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-navy-400 hover:text-red-600 transition-colors" aria-label="Delete post">
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────── Settings Tab ───────────── */
function SettingsTab() {
  const { profile, updateProfile, resetToDefaults } = useData();
  const [form, setForm] = useState({
    name: profile.name,
    tagline: profile.tagline,
    heroIntro: profile.heroIntro,
    email: profile.email,
    phone: profile.phone,
    location: profile.location,
    availableFor: profile.availableFor,
  });
  const [saved, setSaved] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSave = (e) => {
    e.preventDefault();
    updateProfile(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleReset = () => {
    resetToDefaults();
    setConfirmReset(false);
    window.location.reload();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy-900 mb-6">Site Settings</h1>

      {saved && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
          Settings saved successfully!
        </div>
      )}

      <form onSubmit={handleSave} className="bg-white rounded-2xl border border-navy-100 p-6 space-y-5 max-w-2xl mb-8">
        <FormField label="Full Name" name="name" value={form.name} onChange={handleChange} required />
        <FormField label="Professional Tagline" name="tagline" value={form.tagline} onChange={handleChange} required />
        <FormField label="Hero Introduction" name="heroIntro" value={form.heroIntro} onChange={handleChange} textarea required />
        <div className="grid sm:grid-cols-2 gap-4">
          <FormField label="Email" name="email" type="email" value={form.email} onChange={handleChange} required />
          <FormField label="Phone" name="phone" value={form.phone} onChange={handleChange} required />
        </div>
        <FormField label="Location" name="location" value={form.location} onChange={handleChange} required />
        <FormField label="Available For" name="availableFor" value={form.availableFor} onChange={handleChange} textarea />
        <button type="submit" className="inline-flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors">
          <Save size={16} /> Save Settings
        </button>
      </form>

      {/* Reset */}
      <div className="bg-red-50 rounded-2xl border border-red-200 p-6 max-w-2xl">
        <h3 className="text-sm font-semibold text-red-800 mb-2">Reset to Defaults</h3>
        <p className="text-sm text-red-600 mb-4">This will reset all content (profile, events, and blog posts) to the original default data. This action cannot be undone.</p>
        {confirmReset ? (
          <div className="flex gap-3">
            <button onClick={handleReset} className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
              <RotateCcw size={14} /> Confirm Reset
            </button>
            <button onClick={() => setConfirmReset(false)} className="px-4 py-2 rounded-xl text-sm font-medium text-navy-500 hover:bg-navy-100 transition-colors">
              Cancel
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirmReset(true)} className="inline-flex items-center gap-2 border border-red-300 text-red-700 hover:bg-red-100 px-4 py-2 rounded-xl text-sm font-medium transition-colors">
            <RotateCcw size={14} /> Reset All Data
          </button>
        )}
      </div>
    </div>
  );
}

/* ───────────── Reusable Form Field ───────────── */
function FormField({ label, name, value, onChange, type = 'text', required = false, textarea = false, rows = 4, placeholder = '' }) {
  const baseClass = "w-full px-4 py-2.5 rounded-xl border border-navy-200 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent bg-navy-50";

  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-navy-700 mb-1.5">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      {textarea ? (
        <textarea
          id={name}
          name={name}
          value={value}
          onChange={onChange}
          required={required}
          rows={rows}
          placeholder={placeholder}
          className={`${baseClass} resize-none`}
        />
      ) : (
        <input
          id={name}
          name={name}
          type={type}
          value={value}
          onChange={onChange}
          required={required}
          placeholder={placeholder}
          className={baseClass}
        />
      )}
    </div>
  );
}
