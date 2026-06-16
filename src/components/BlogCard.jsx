import { Link } from 'react-router-dom';
import { Calendar, Clock, Tag, ArrowRight } from 'lucide-react';
import { formatDate } from '../utils/helpers';

export default function BlogCard({ post }) {
  return (
    <div className="bg-white rounded-2xl border border-navy-100 overflow-hidden hover:shadow-xl hover:border-cyan-200 transition-all duration-300 group flex flex-col">
      {post.image ? (
        <img
          src={post.image}
          alt={post.title}
          className="h-48 w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="h-48 bg-gradient-to-br from-navy-800 to-navy-950 flex items-center justify-center">
          <div className="text-center">
            <div className="w-14 h-14 rounded-2xl bg-cyan-600/20 flex items-center justify-center mx-auto mb-2">
              <Tag size={24} className="text-cyan-400" />
            </div>
            <span className="text-xs text-navy-400 font-medium">{post.category}</span>
          </div>
        </div>
      )}

      <div className="p-6 flex flex-col flex-1">
        <div className="flex items-center gap-3 text-xs text-navy-400 mb-3">
          <span className="inline-flex items-center gap-1 bg-cyan-50 text-cyan-700 px-2 py-0.5 rounded-full font-medium">
            {post.category}
          </span>
          <span className="flex items-center gap-1">
            <Calendar size={12} />
            {formatDate(post.date)}
          </span>
        </div>

        <h3 className="text-lg font-bold text-navy-900 mb-2 group-hover:text-cyan-700 transition-colors line-clamp-2">
          {post.title}
        </h3>

        <p className="text-sm text-navy-500 leading-relaxed mb-4 line-clamp-3 flex-1">
          {post.excerpt}
        </p>

        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1 text-xs text-navy-400">
            <Clock size={12} />
            {post.readTime}
          </span>
          <Link
            to={`/blog/${post.slug}`}
            className="inline-flex items-center gap-1 text-sm font-medium text-cyan-600 hover:text-cyan-700 transition-colors"
          >
            Read More <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </div>
  );
}
