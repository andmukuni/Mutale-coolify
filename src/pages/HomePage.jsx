import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, Shield, Award, Globe, Briefcase,
  CheckCircle, Mail, MapPin, Quote, ChevronLeft, ChevronRight,
} from 'lucide-react';
import SectionHeader from '../components/SectionHeader';
import ExpertiseCard from '../components/ExpertiseCard';
import EventCard from '../components/EventCard';
import BlogCard from '../components/BlogCard';
import { useData } from '../context/DataContext';
import { getEventDisplayStatus, isEventPubliclyVisible } from '../utils/eventServices';
import heroPortrait from '../assets/herophoto.JPG';
import { defaultWebsitePages, expertiseIconMap } from '../data/websitePages';
import TrustedBySection from '../components/TrustedBySection';
import { fetchPartnerLogos } from '../utils/partnerLogosApi';

export default function HomePage() {
  const { profile, events, blogPosts } = useData();
  const page = profile.websitePages?.home || defaultWebsitePages.home;
  const expertiseAreas = (Array.isArray(page.expertiseAreas) ? page.expertiseAreas : defaultWebsitePages.home.expertiseAreas)
    .map((area) => ({ ...area, icon: expertiseIconMap[area.icon] || Shield }));
  const testimonials = Array.isArray(page.testimonials) && page.testimonials.length > 0
    ? page.testimonials
    : defaultWebsitePages.home.testimonials;
  const [activeTestimonial, setActiveTestimonial] = useState(0);
  const [activeFeaturedSlide, setActiveFeaturedSlide] = useState(0);
  const [activeFeaturedBlogSlide, setActiveFeaturedBlogSlide] = useState(0);
  const [partnerLogos, setPartnerLogos] = useState([]);

  useEffect(() => {
    let cancelled = false;
    void fetchPartnerLogos()
      .then((data) => {
        if (!cancelled) setPartnerLogos(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setPartnerLogos([]);
      });
    return () => { cancelled = true; };
  }, []);

  const featuredEvents = events
    .filter((event) => {
      if (!isEventPubliclyVisible(event)) return false;
      const status = getEventDisplayStatus(event);
      return event.featured && status !== 'cancelled' && status !== 'closed';
    })
    .sort((a, b) => {
      const now = Date.now();
      const aTime = new Date(a.start_date || a.date || 0).getTime();
      const bTime = new Date(b.start_date || b.date || 0).getTime();
      const aUpcoming = aTime >= now;
      const bUpcoming = bTime >= now;

      // Keep upcoming featured events first.
      if (aUpcoming !== bUpcoming) {
        return aUpcoming ? -1 : 1;
      }

      // Upcoming: soonest first. Past: most recent first.
      if (aUpcoming && bUpcoming) {
        return aTime - bTime;
      }
      return bTime - aTime;
    });

  const featuredSlides = [];
  for (let i = 0; i < featuredEvents.length; i += 3) {
    featuredSlides.push(featuredEvents.slice(i, i + 3));
  }

  const featuredBlogPosts = blogPosts
    .filter((post) => Boolean(post.featured))
    .sort((a, b) => {
      const aTime = new Date(a.date || 0).getTime();
      const bTime = new Date(b.date || 0).getTime();
      return bTime - aTime;
    });

  const featuredBlogSlides = [];
  for (let i = 0; i < featuredBlogPosts.length; i += 3) {
    featuredBlogSlides.push(featuredBlogPosts.slice(i, i + 3));
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveTestimonial((prev) => (prev + 1) % testimonials.length);
    }, 5500);

    return () => window.clearInterval(timer);
  }, [testimonials.length]);

  useEffect(() => {
    if (featuredSlides.length <= 1) return undefined;
    const timer = window.setInterval(() => {
      setActiveFeaturedSlide((prev) => (prev + 1) % featuredSlides.length);
    }, 6000);
    return () => window.clearInterval(timer);
  }, [featuredSlides.length]);

  useEffect(() => {
    if (activeFeaturedSlide > 0 && activeFeaturedSlide >= featuredSlides.length) {
      setActiveFeaturedSlide(0);
    }
  }, [activeFeaturedSlide, featuredSlides.length]);

  useEffect(() => {
    if (featuredBlogSlides.length <= 1) return undefined;
    const timer = window.setInterval(() => {
      setActiveFeaturedBlogSlide((prev) => (prev + 1) % featuredBlogSlides.length);
    }, 6500);
    return () => window.clearInterval(timer);
  }, [featuredBlogSlides.length]);

  useEffect(() => {
    if (activeFeaturedBlogSlide > 0 && activeFeaturedBlogSlide >= featuredBlogSlides.length) {
      setActiveFeaturedBlogSlide(0);
    }
  }, [activeFeaturedBlogSlide, featuredBlogSlides.length]);

  const goToNextTestimonial = () => {
    setActiveTestimonial((prev) => (prev + 1) % testimonials.length);
  };

  const goToPrevTestimonial = () => {
    setActiveTestimonial((prev) => (prev - 1 + testimonials.length) % testimonials.length);
  };

  return (
    <div>
      {/* ═══════════════════════ HERO ═══════════════════════ */}
      <section className="relative flex items-center overflow-hidden">
        {/* Background image */}
        <div className="absolute inset-0">
          <img
            src="https://images.unsplash.com/photo-1579154204601-01588f351e67?auto=format&fit=crop&w=1920&q=80"
            alt="Laboratory professional at work"
            className="w-full h-full object-cover"
          />
          {/* Multi-layer gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-r from-navy-950 via-navy-950/95 to-navy-950/60" />
          <div className="absolute inset-0 bg-gradient-to-t from-navy-950 via-transparent to-navy-950/30" />
        </div>

        {/* Content */}
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 w-full">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left — text */}
            <div>
              <div className="inline-flex items-center gap-2 bg-cyan-500/10 border border-cyan-500/20 rounded-full px-4 py-1.5 mb-6">
                <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
                <span className="text-xs font-semibold text-cyan-300 uppercase tracking-wider">
                  {page.heroEyebrow}
                </span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-[1.1] mb-6">
                {profile.name.split(' ')[0]}{' '}
                <span className="text-cyan-400">{profile.name.split(' ').slice(1).join(' ')}</span>
              </h1>

              <p className="text-lg sm:text-xl text-navy-300 leading-relaxed mb-8 max-w-xl">
                {profile.heroIntro}
              </p>

              {/* CTA buttons */}
              <div className="flex flex-wrap gap-3 mb-10">
                <Link
                  to="/contact"
                  className="inline-flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white px-7 py-3.5 rounded-xl font-medium transition-all duration-300 shadow-lg shadow-cyan-600/25 hover:shadow-cyan-500/40"
                >
                  Get in Touch <ArrowRight size={16} />
                </Link>
                <Link
                  to="/experience"
                  className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm hover:bg-white/20 text-white border border-white/20 px-7 py-3.5 rounded-xl font-medium transition-all duration-300"
                >
                  View Experience
                </Link>
              </div>

              {/* Quick info pills */}
              <div className="flex flex-wrap gap-4 text-sm text-navy-400">
                <span className="flex items-center gap-1.5">
                  <MapPin size={14} className="text-cyan-500" />
                  Lusaka, Zambia
                </span>
                <span className="flex items-center gap-1.5">
                  <Briefcase size={14} className="text-cyan-500" />
                  15+ Years Experience
                </span>
                <span className="flex items-center gap-1.5">
                  <Globe size={14} className="text-cyan-500" />
                  10+ Countries
                </span>
              </div>
            </div>

            {/* Right — portrait panel */}
            <div className="hidden lg:block relative">
              <div className="relative max-w-md ml-auto">
                <div className="absolute -inset-3 rounded-[2rem] bg-cyan-500/20 blur-2xl" />
                <div className="relative overflow-hidden rounded-[2rem] border border-white/20 bg-white/10 backdrop-blur-sm shadow-2xl shadow-navy-950/40">
                  <img
                    src={heroPortrait}
                    alt={`${profile.name} portrait`}
                    className="w-full h-[34rem] object-cover object-center"
                    loading="eager"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

      </section>

      <div className="h-1.5 w-full bg-coral shrink-0" aria-hidden />

      {/* ═══════════════════════ TRUSTED BY ═══════════════════════ */}
      <TrustedBySection
        label={page.trustedByLabel || defaultWebsitePages.home.trustedByLabel}
        partners={partnerLogos}
        legacyNames={Array.isArray(page.trustedBy) ? page.trustedBy : defaultWebsitePages.home.trustedBy}
      />

      {/* ═══════════════════════ ABOUT PREVIEW ═══════════════════════ */}
      <section className="py-20 sm:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Image side */}
            <div className="relative">
              <div className="rounded-2xl overflow-hidden shadow-2xl shadow-navy-200/50">
                <img
                  src="https://images.unsplash.com/photo-1582719471384-894fbb16e074?auto=format&fit=crop&w=800&q=80"
                  alt="Laboratory quality assurance work"
                  className="w-full h-80 sm:h-96 object-cover"
                />
              </div>
              {/* Floating accent card */}
              <div className="absolute -bottom-6 -right-4 sm:-right-6 bg-white rounded-xl shadow-xl border border-navy-100 p-4 max-w-[200px]">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-cyan-50 text-cyan-600">
                    <Award size={20} />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-navy-900">ISO Expert</div>
                    <div className="text-xs text-navy-400">15189 · 9001 · 17025</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Text side */}
            <div>
              <span className="inline-block text-xs font-semibold uppercase tracking-widest text-cyan-600 mb-3">
                {page.aboutEyebrow}
              </span>
              <h2 className="text-3xl sm:text-4xl font-bold text-navy-900 mb-6">
                {page.aboutTitle}
              </h2>

              <div className="space-y-4 mb-8">
                {profile.summary.slice(0, 3).map((s, i) => (
                  <p key={i} className="text-navy-600 leading-relaxed">{s}</p>
                ))}
              </div>

              <div className="flex flex-wrap gap-3 mb-8">
                {(Array.isArray(page.aboutTags) ? page.aboutTags : defaultWebsitePages.home.aboutTags).map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 text-xs font-medium bg-navy-50 text-navy-600 border border-navy-100 px-3 py-1.5 rounded-full"
                  >
                    <CheckCircle size={12} className="text-cyan-500" />
                    {tag}
                  </span>
                ))}
              </div>

              <Link
                to="/about"
                className="inline-flex items-center gap-2 text-sm font-medium text-cyan-600 hover:text-cyan-700 transition-colors group"
              >
                Read Full Profile
                <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════ EXPERTISE ═══════════════════════ */}
      <section className="py-20 sm:py-24 bg-navy-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeader
            label={page.expertiseLabel}
            title={page.expertiseTitle}
            description={page.expertiseDescription}
          />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {expertiseAreas.map((area, i) => (
              <ExpertiseCard key={i} {...area} />
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════ FEATURED EVENTS ═══════════════════════ */}
      {featuredSlides.length > 0 && (
        <section className="py-20 sm:py-24 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <SectionHeader
              label="Featured events"
              title="Don’t miss these upcoming sessions"
              description="Handpicked events currently highlighted for the community."
            />

            <div className="relative">
              <div className="overflow-hidden">
                <div
                  className="flex transition-transform duration-500 ease-out"
                  style={{ transform: `translateX(-${activeFeaturedSlide * 100}%)` }}
                >
                  {featuredSlides.map((slide, slideIndex) => (
                    <div key={`featured-slide-${slideIndex}`} className="min-w-full">
                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {slide.map((event) => (
                          <EventCard key={event.id} event={event} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {featuredSlides.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => setActiveFeaturedSlide((prev) => (prev - 1 + featuredSlides.length) % featuredSlides.length)}
                    aria-label="Previous featured events"
                    className="absolute -left-3 sm:-left-4 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white border border-navy-200 text-navy-600 hover:text-cyan-600 transition-colors flex items-center justify-center shadow-sm"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveFeaturedSlide((prev) => (prev + 1) % featuredSlides.length)}
                    aria-label="Next featured events"
                    className="absolute -right-3 sm:-right-4 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white border border-navy-200 text-navy-600 hover:text-cyan-600 transition-colors flex items-center justify-center shadow-sm"
                  >
                    <ChevronRight size={16} />
                  </button>
                </>
              )}
            </div>

            {featuredSlides.length > 1 && (
              <div className="mt-5 flex items-center justify-center gap-2">
                {featuredSlides.map((_, index) => (
                  <button
                    key={`featured-dot-${index}`}
                    type="button"
                    onClick={() => setActiveFeaturedSlide(index)}
                    aria-label={`Show featured slide ${index + 1}`}
                    className={`h-2.5 rounded-full transition-all ${
                      index === activeFeaturedSlide ? 'w-7 bg-cyan-600' : 'w-2.5 bg-navy-200 hover:bg-navy-300'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ═══════════════════════ FEATURED BLOG ═══════════════════════ */}
      {featuredBlogSlides.length > 0 && (
        <section className="py-20 sm:py-24 bg-navy-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <SectionHeader
              label="Featured blog"
              title="Latest insights and articles"
              description="Handpicked articles highlighted from the blog."
            />

            <div className="relative">
              <div className="overflow-hidden">
                <div
                  className="flex transition-transform duration-500 ease-out"
                  style={{ transform: `translateX(-${activeFeaturedBlogSlide * 100}%)` }}
                >
                  {featuredBlogSlides.map((slide, slideIndex) => (
                    <div key={`featured-blog-slide-${slideIndex}`} className="min-w-full">
                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {slide.map((post) => (
                          <BlogCard key={post.id} post={post} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {featuredBlogSlides.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => setActiveFeaturedBlogSlide((prev) => (prev - 1 + featuredBlogSlides.length) % featuredBlogSlides.length)}
                    aria-label="Previous featured blog posts"
                    className="absolute -left-3 sm:-left-4 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white border border-navy-200 text-navy-600 hover:text-cyan-600 transition-colors flex items-center justify-center shadow-sm"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveFeaturedBlogSlide((prev) => (prev + 1) % featuredBlogSlides.length)}
                    aria-label="Next featured blog posts"
                    className="absolute -right-3 sm:-right-4 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white border border-navy-200 text-navy-600 hover:text-cyan-600 transition-colors flex items-center justify-center shadow-sm"
                  >
                    <ChevronRight size={16} />
                  </button>
                </>
              )}
            </div>

            {featuredBlogSlides.length > 1 && (
              <div className="mt-5 flex items-center justify-center gap-2">
                {featuredBlogSlides.map((_, index) => (
                  <button
                    key={`featured-blog-dot-${index}`}
                    type="button"
                    onClick={() => setActiveFeaturedBlogSlide(index)}
                    aria-label={`Show featured blog slide ${index + 1}`}
                    className={`h-2.5 rounded-full transition-all ${
                      index === activeFeaturedBlogSlide ? 'w-7 bg-cyan-600' : 'w-2.5 bg-navy-200 hover:bg-navy-300'
                    }`}
                  />
                ))}
              </div>
            )}

            <div className="mt-8 text-center">
              <Link
                to="/blog"
                className="inline-flex items-center gap-2 text-sm font-medium text-cyan-600 hover:text-cyan-700 transition-colors group"
              >
                View all articles
                <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ═══════════════════════ TESTIMONIALS ═══════════════════════ */}
      <section className="py-20 sm:py-24 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeader
            label={page.testimonialsLabel}
            title={page.testimonialsTitle}
            description={page.testimonialsDescription}
          />

          <div className="relative overflow-hidden rounded-3xl border border-navy-100 bg-navy-50">
            <div
              className="flex transition-transform duration-500 ease-out"
              style={{ transform: `translateX(-${activeTestimonial * 100}%)` }}
            >
              {testimonials.map((item) => (
                <article key={item.id} className="min-w-full p-8 sm:p-10">
                  <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-cyan-50 text-cyan-600 mb-5">
                    <Quote size={18} />
                  </div>
                  <p className="text-lg sm:text-xl leading-relaxed text-navy-700 mb-6">“{item.quote}”</p>
                  <div>
                    <p className="text-base font-semibold text-navy-900">{item.name}</p>
                    <p className="text-sm text-navy-500">{item.org}</p>
                  </div>
                </article>
              ))}
            </div>

            <button
              type="button"
              onClick={goToPrevTestimonial}
              aria-label="Previous testimonial"
              className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 border border-navy-200 text-navy-600 hover:text-cyan-600 transition-colors flex items-center justify-center"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={goToNextTestimonial}
              aria-label="Next testimonial"
              className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 border border-navy-200 text-navy-600 hover:text-cyan-600 transition-colors flex items-center justify-center"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="mt-5 flex items-center justify-center gap-2">
            {testimonials.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTestimonial(index)}
                aria-label={`Show testimonial ${index + 1}`}
                className={`h-2.5 rounded-full transition-all ${
                  index === activeTestimonial ? 'w-7 bg-cyan-600' : 'w-2.5 bg-navy-200 hover:bg-navy-300'
                }`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════ CTA ═══════════════════════ */}
      <section className="relative py-20 sm:py-24 overflow-hidden">
        {/* Background image */}
        <div className="absolute inset-0">
          <img
            src="https://images.unsplash.com/photo-1581093588401-fbb62a02f120?auto=format&fit=crop&w=1920&q=80"
            alt="Professional collaboration"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-navy-950/95 to-navy-900/90" />
        </div>

        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-cyan-500/20 text-cyan-400 mb-6">
            <Mail size={22} />
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            {page.ctaTitle}
          </h2>
          <p className="text-navy-300 mb-8 leading-relaxed max-w-xl mx-auto">
            {profile.availableFor}
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              to="/contact"
              className="inline-flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white px-8 py-3.5 rounded-xl font-medium transition-all duration-300 shadow-lg shadow-cyan-600/25 hover:shadow-cyan-500/40"
            >
              Get in Touch <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
