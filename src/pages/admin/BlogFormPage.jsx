import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Save } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { PageHeader, Card, FormField, Spinner } from '../../components/ui';
import BlogRichTextEditor from '../../components/admin/blog/BlogRichTextEditor';
import { calculateReadTime } from '../../utils/helpers';

const blogCategories = [
  'Quality Systems',
  'Laboratory Science',
  'Health Policy',
  'Diagnostics',
  'Professional Development',
  'Global Health',
  'Mentorship',
  'Other',
];

const emptyPost = {
  title: '',
  category: 'Quality Systems',
  date: new Date().toISOString().split('T')[0],
  excerpt: '',
  content: '',
  featured: false,
  readTime: '1 min read',
  image: null,
};

function getInitialForm(blogPosts, id) {
  if (!id) return emptyPost;
  const post = blogPosts.find((p) => p.id === id);
  return post ? { ...post } : null;
}

export default function BlogFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { blogPosts, addBlogPost, updateBlogPost } = useData();
  const toast = useToast();
  const isEditing = Boolean(id);

  const initialForm = getInitialForm(blogPosts, id);
  const [form, setForm] = useState(() => initialForm || emptyPost);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageLoadError, setImageLoadError] = useState('');
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    if (isEditing && !initialForm) {
      navigate('/admin/blog');
    }
  }, [isEditing, initialForm, navigate]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const textOnly = form.content?.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
    if (!textOnly) {
      setError('Content is required.');
      toast.error('Please add article content.');
      return;
    }

    setSaving(true);
    setError('');

    const data = { ...form, readTime: calculateReadTime(form.content) };

    try {
      if (isEditing) {
        await updateBlogPost(id, data);
      } else {
        await addBlogPost(data);
      }

      setSaved(true);
      toast.success(isEditing ? 'Blog post updated.' : 'Blog post published.');
      setTimeout(() => navigate('/admin/blog'), 1000);
    } catch (err) {
      const msg = err?.message || 'Failed to save blog post.';
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    setError('');
    const reader = new FileReader();
    reader.onload = () => {
      const imageValue = String(reader.result || '');
      setForm((prev) => ({ ...prev, image: imageValue }));
      setUploadingImage(false);
      setImageLoadError('');
      setImageLoaded(false);
      e.target.value = '';
    };
    reader.onerror = () => {
      setUploadingImage(false);
      setError('Failed to read image file. Please try another image.');
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setForm((prev) => ({ ...prev, image: null }));
    setImageLoadError('');
    setImageLoaded(false);
  };

  return (
    <div>
      <PageHeader
        title={isEditing ? 'Edit Blog Post' : 'Create Blog Post'}
        subtitle={
          isEditing
            ? `Editing: ${form.title}`
            : 'Write a new article for your blog'
        }
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Blog Posts', to: '/admin/blog' },
          { label: isEditing ? 'Edit' : 'New' },
        ]}
      />

      {saved && (
        <div role="status" aria-live="polite" className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
          Post {isEditing ? 'updated' : 'created'} successfully! Redirecting...
        </div>
      )}

      {error && (
        <div role="alert" aria-live="assertive" className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          {error}
        </div>
      )}

      <Card className="w-full">
        <form onSubmit={handleSubmit} className="space-y-5 pb-24 sm:pb-0">
          <FormField
            label="Title"
            name="title"
            value={form.title}
            onChange={handleChange}
            required
            placeholder="e.g., The Future of Quality Assurance in Healthcare"
          />

          <div className="grid sm:grid-cols-2 gap-4">
            <FormField
              label="Category"
              name="category"
              type="select"
              value={form.category}
              onChange={handleChange}
              options={blogCategories}
              required
            />
            <FormField
              label="Date"
              name="date"
              type="date"
              value={form.date}
              onChange={handleChange}
              required
            />
          </div>

          <FormField
            label="Excerpt"
            name="excerpt"
            value={form.excerpt}
            onChange={handleChange}
            textarea
            rows={3}
            required
            placeholder="A brief summary that appears in blog listings..."
            helpText="Keep it concise — 1-2 sentences work best"
          />

          <div>
            <label className="block text-sm font-medium text-navy-700 mb-1.5">
              Featured Image
            </label>

            {form.image ? (
              <div className="mb-3 rounded-xl border border-navy-200 overflow-hidden bg-navy-50">
                <img
                  src={form.image}
                  alt="Blog post preview"
                  className="w-full h-52 object-cover"
                  onLoad={() => {
                    setImageLoaded(true);
                    setImageLoadError('');
                  }}
                  onError={() => {
                    setImageLoaded(false);
                    setImageLoadError('Unable to preview this image. Try another file or image URL.');
                  }}
                />
              </div>
            ) : (
              <div className="mb-3 rounded-xl border border-dashed border-navy-200 bg-navy-50 h-40 flex items-center justify-center text-navy-400 text-sm">
                No image selected
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <label className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${uploadingImage ? 'bg-navy-200 text-navy-500 cursor-not-allowed' : 'bg-navy-100 text-navy-700 hover:bg-navy-200 cursor-pointer'}`}>
                {uploadingImage ? <Spinner size={14} /> : null}
                {uploadingImage ? 'Uploading...' : 'Upload Image'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploadingImage || saving}
                  onChange={handleImageUpload}
                />
              </label>

              {form.image && (
                <button
                  type="button"
                  onClick={removeImage}
                  disabled={uploadingImage || saving}
                  className="inline-flex items-center px-4 py-2 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                >
                  Remove Image
                </button>
              )}
            </div>
            {form.image && imageLoaded && !imageLoadError && (
              <p className="mt-1 text-xs text-green-600">Image loaded successfully.</p>
            )}
            {imageLoadError && (
              <p className="mt-1 text-xs text-red-600">{imageLoadError}</p>
            )}
            <p className="mt-1 text-xs text-navy-400">Shown on blog cards and article page header.</p>
          </div>

          <BlogRichTextEditor
            label="Content"
            required
            value={form.content}
            onChange={(html) => setForm((prev) => ({ ...prev, content: html }))}
            disabled={saving || uploadingImage}
          />

          <div className="pt-1">
            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                name="featured"
                checked={form.featured}
                onChange={handleChange}
                className="h-4 w-4 rounded border-navy-300 text-cyan-600 focus:ring-cyan-500"
              />
              <div>
                <span className="text-sm font-medium text-navy-700 group-hover:text-navy-900">
                  Featured post
                </span>
                <p className="text-xs text-navy-400">
                  Featured posts are highlighted on the homepage
                </p>
              </div>
            </label>
          </div>

          <div className="sticky bottom-3 z-20 bg-white/95 backdrop-blur rounded-2xl border border-navy-100 p-3 flex flex-col-reverse gap-3 sm:static sm:bg-transparent sm:backdrop-blur-none sm:border-0 sm:p-0 sm:rounded-none sm:flex-row sm:items-center sm:gap-3 pt-4 sm:pt-4 sm:border-t sm:border-navy-100">
            <button
              type="submit"
              disabled={saving || uploadingImage}
              className="inline-flex items-center justify-center gap-2 w-full sm:w-auto bg-cyan-600 hover:bg-cyan-500 disabled:opacity-70 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
            >
              {saving ? <Spinner size={16} /> : <Save size={16} />}
              {saving ? 'Saving...' : uploadingImage ? 'Waiting for image...' : isEditing ? 'Update Post' : 'Publish Post'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/admin/blog')}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-sm font-medium text-navy-500 hover:bg-navy-100 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
