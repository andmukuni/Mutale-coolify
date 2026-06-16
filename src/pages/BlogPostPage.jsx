import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Calendar, Clock, Tag } from 'lucide-react';
import DOMPurify from 'dompurify';
import BlogCard from '../components/BlogCard';
import { useData } from '../context/DataContext';
import { formatDate } from '../utils/helpers';
import { BLOG_SANITIZE_OPTIONS, looksLikeHtml } from '../utils/blogContent';

export default function BlogPostPage() {
  const { slug } = useParams();
  const { blogPosts, isDataLoaded } = useData();
  const post = blogPosts.find(p => p.slug === slug);

  if (!isDataLoaded) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center bg-navy-50">
        <div className="w-8 h-8 rounded-full border-4 border-navy-100 border-t-navy-900 animate-spin" />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center bg-navy-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-navy-900 mb-2">Article Not Found</h1>
          <p className="text-navy-500 mb-6">The article you are looking for does not exist.</p>
          <Link
            to="/blog"
            className="inline-flex items-center gap-2 text-cyan-600 hover:text-cyan-700 font-medium"
          >
            <ArrowLeft size={16} /> Back to Blog
          </Link>
        </div>
      </div>
    );
  }

  const related = blogPosts
    .filter(p => p.id !== post.id && p.category === post.category)
    .slice(0, 3);

  // Simple markdown-like rendering for the content
  const renderContent = (content) => {
    if (!content) return null;
    return content.split('\n').map((line, i) => {
      const trimmed = line.trim();
      if (!trimmed) return <br key={i} />;
      if (trimmed.startsWith('## ')) {
        return <h2 key={i} className="text-2xl font-bold text-navy-900 mt-8 mb-4">{trimmed.slice(3)}</h2>;
      }
      if (trimmed.startsWith('### ')) {
        return <h3 key={i} className="text-xl font-semibold text-navy-800 mt-6 mb-3">{trimmed.slice(4)}</h3>;
      }
      if (trimmed.startsWith('- **')) {
        const boldEnd = trimmed.indexOf('**', 4);
        const boldText = trimmed.slice(4, boldEnd);
        const rest = trimmed.slice(boldEnd + 2);
        return (
          <li key={i} className="flex gap-2 text-navy-600 leading-relaxed ml-4 mb-2">
            <span className="mt-2 w-1.5 h-1.5 rounded-full bg-cyan-500 shrink-0" />
            <span><strong className="text-navy-800">{boldText}</strong>{rest}</span>
          </li>
        );
      }
      if (trimmed.startsWith('- ')) {
        return (
          <li key={i} className="flex gap-2 text-navy-600 leading-relaxed ml-4 mb-2">
            <span className="mt-2 w-1.5 h-1.5 rounded-full bg-cyan-500 shrink-0" />
            <span>{trimmed.slice(2)}</span>
          </li>
        );
      }
      if (/^\d+\.\s\*\*/.test(trimmed)) {
        const match = trimmed.match(/^\d+\.\s\*\*(.+?)\*\*(.*)/);
        if (match) {
          return (
            <li key={i} className="flex gap-2 text-navy-600 leading-relaxed ml-4 mb-2">
              <span className="mt-2 w-1.5 h-1.5 rounded-full bg-cyan-500 shrink-0" />
              <span><strong className="text-navy-800">{match[1]}</strong>{match[2]}</span>
            </li>
          );
        }
      }
      // Bold text inline
      const parts = trimmed.split(/\*\*(.+?)\*\*/g);
      return (
        <p key={i} className="text-navy-600 leading-relaxed mb-3">
          {parts.map((part, j) =>
            j % 2 === 1 ? <strong key={j} className="text-navy-800">{part}</strong> : part
          )}
        </p>
      );
    });
  };

  return (
    <div>
      {/* Header */}
      <section className="bg-gradient-to-br from-navy-950 via-navy-900 to-navy-800 text-white py-16 sm:py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link
            to="/blog"
            className="inline-flex items-center gap-1 text-sm text-navy-400 hover:text-cyan-400 transition-colors mb-6"
          >
            <ArrowLeft size={14} /> Back to Blog
          </Link>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <span className="inline-flex items-center gap-1 text-xs font-semibold bg-cyan-600/20 text-cyan-300 px-2.5 py-1 rounded-full">
              <Tag size={12} />
              {post.category}
            </span>
            <span className="flex items-center gap-1 text-xs text-navy-400">
              <Calendar size={12} />
              {formatDate(post.date)}
            </span>
            <span className="flex items-center gap-1 text-xs text-navy-400">
              <Clock size={12} />
              {post.readTime}
            </span>
          </div>
          <h1 className="text-2xl sm:text-4xl lg:text-5xl font-bold leading-tight break-words">{post.title}</h1>
        </div>
      </section>

      {post.image && (
        <section className="bg-white pt-8 sm:pt-10">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="rounded-2xl overflow-hidden border border-navy-100 shadow-sm">
              <img
                src={post.image}
                alt={post.title}
                className="w-full max-h-[460px] object-cover"
              />
            </div>
          </div>
        </section>
      )}

      {/* Content */}
      <section className="py-12 sm:py-16 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          {looksLikeHtml(post.content) ? (
            <div
              className="blog-prose prose prose-sm sm:prose-lg max-w-none break-words"
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(post.content, BLOG_SANITIZE_OPTIONS),
              }}
            />
          ) : (
            <div className="prose prose-sm sm:prose-lg max-w-none break-words">
              {renderContent(post.content)}
            </div>
          )}
        </div>
      </section>

      {/* Related Posts */}
      {related.length > 0 && (
        <section className="py-12 sm:py-16 bg-navy-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold text-navy-900 mb-8 text-center">Related Articles</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {related.map(p => (
                <BlogCard key={p.id} post={p} />
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
