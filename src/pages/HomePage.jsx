import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, Shield, Globe, Briefcase,
  CheckCircle, Mail, MapPin, Quote, ChevronLeft, ChevronRight,
} from 'lucide-react';
import SectionHeader from '../components/SectionHeader';
import ExpertiseCard from '../components/ExpertiseCard';
import EventCard from '../components/EventCard';
import BlogCard from '../components/BlogCard';
import { useData } from '../context/DataContext';
import { selectHomeFeaturedEvents } from '../utils/eventServices';
import heroPortrait from '../assets/mutale-navy-suit-and-tie.png';
import { defaultWebsitePages, expertiseIconMap } from '../data/websitePages';
import TrustedBySection from '../components/TrustedBySection';
import HomeAboutPreview from '../components/HomeAboutPreview';
import NextSpeakingEngagement from '../components/speaking/NextSpeakingEngagement';
import { fetchPartnerLogos } from '../utils/partnerLogosApi';
import { resolveMediaUrl } from '../utils/mediaUrl';

const CTA_BG_FALLBACK = 'https://images.unsplash.com/photo-1581093588401-fbb62a02f120?auto=format&fit=crop&w=1920&q=80';
const HERO_PILL_ICONS = [MapPin, Briefcase, Globe];

// Shared hover and focus styles, so every control on the page responds the same way.
// Movement only plays for visitors who haven't asked for reduced motion.
const PRIMARY_BUTTON = 'group inline-flex items-center gap-2 rounded-xl bg-cyan-700 px-7 py-3.5 font-medium text-white shadow-lg shadow-cyan-900/20 transition duration-300 ease-out hover:bg-cyan-800 hover:shadow-xl hover:shadow-cyan-900/30 motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-navy-900';
const GHOST_BUTTON = 'inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-7 py-3.5 font-medium text-white backdrop-blur-sm transition duration-300 ease-out hover:border-white/40 hover:bg-white/20 motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-navy-900';
const ARROW_NUDGE = 'motion-safe:transition-transform motion-safe:duration-300 motion-safe:group-hover:translate-x-1';
const CAROUSEL_ARROW = 'flex h-10 w-10 items-center justify-center rounded-full border border-navy-200 bg-white text-navy-700 shadow-sm transition duration-200 hover:border-cyan-700 hover:bg-cyan-700 hover:text-white hover:shadow-md motion-safe:active:scale-95 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-700 focus-visible:ring-offset-2';
const carouselDot = (active) => `h-2.5 rounded-full transition-all duration-300 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-700 focus-visible:ring-offset-2 ${
  active ? 'w-7 bg-cyan-700' : 'w-2.5 bg-navy-200 hover:bg-cyan-600/60'
}`;

export default function HomePage() {
  const { profile, events, blogPosts } = useData();
  const page = profile.websitePages?.home || defaultWebsitePages.home;
  const visibility = profile.websitePages?.sectionVisibility || {};
  const isVisible = (id) => visibility[id] !== false;
  const heroPortraitSrc = heroPortrait;
  const ctaBackground = resolveMediaUrl(page.ctaBackgroundImage) || CTA_BG_FALLBACK;
  const heroPills = (Array.isArray(page.heroPills) && page.heroPills.length > 0)
    ? page.heroPills
    : defaultWebsitePages.home.heroPills;
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

  const featuredEvents = selectHomeFeaturedEvents(events);

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
    if (testimonials.length <= 1) return undefined;
    const timer = window.setInterval(() => {
      setActiveTestimonial((prev) => (prev + 1) % testimonials.length);
    }, 10000);

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
      <section className="relative flex items-center overflow-hidden min-h-[32rem] sm:min-h-[36rem] lg:min-h-[42rem]">
        {/* Portrait as full-bleed hero background, anchored to the right */}
        <div className="absolute inset-0 bg-navy-950">
          <img
            src={heroPortraitSrc}
            alt={`${profile.name} portrait`}
            className="absolute inset-y-0 right-0 h-full w-[82%] sm:w-[68%] lg:w-[56%] object-cover object-top [mask-image:linear-gradient(to_right,transparent_0%,black_32%,black_100%)] [-webkit-mask-image:linear-gradient(to_right,transparent_0%,black_32%,black_100%)]"
            loading="eager"
          />
          {/* Navy wash from the left, fading onto the portrait */}
          <div className="absolute inset-0 bg-gradient-to-r from-navy-950 from-[10%] via-navy-950/88 via-[44%] to-transparent to-[70%]" />
          <div className="absolute inset-0 bg-gradient-to-t from-navy-950/55 via-transparent to-navy-950/20" />
        </div>

        {/* Content */}
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 w-full">
          <div className="max-w-xl lg:max-w-2xl">
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
                <Link to="/contact" className={PRIMARY_BUTTON}>
                  Get in Touch <ArrowRight size={16} aria-hidden="true" className={ARROW_NUDGE} />
                </Link>
                <Link to="/about" className={GHOST_BUTTON}>
                  Read More
                </Link>
              </div>

              {/* Quick info pills */}
              <div className="flex flex-wrap gap-4 text-sm text-navy-400">
                {heroPills.map((pill, i) => {
                  const PillIcon = HERO_PILL_ICONS[i] || CheckCircle;
                  return (
                    <span key={`${pill}-${i}`} className="flex items-center gap-1.5">
                      <PillIcon size={14} className="text-cyan-500" />
                      {pill}
                    </span>
                  );
                })}
              </div>
          </div>
        </div>

      </section>

      <div className="h-1.5 w-full bg-coral shrink-0" aria-hidden />

      {/* ═══════════════════════ TRUSTED BY ═══════════════════════ */}
      {isVisible('home.trusted-by') && (
        <TrustedBySection
          label={page.trustedByLabel || defaultWebsitePages.home.trustedByLabel}
          partners={partnerLogos}
          legacyNames={Array.isArray(page.trustedBy) ? page.trustedBy : defaultWebsitePages.home.trustedBy}
        />
      )}

      {/* ═══════════════════════ ABOUT PREVIEW ═══════════════════════ */}
      {isVisible('home.about-preview') && <HomeAboutPreview page={page} summary={profile.summary} />}

      {/* ═══════════════════════ EXPERTISE ═══════════════════════ */}
      {isVisible('home.expertise') && (
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
      )}

      {/* ═══════════════════════ FEATURED EVENTS ═══════════════════════ */}
      {isVisible('home.featured-events') && featuredSlides.length > 0 && (
        <section className="py-20 sm:py-24 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <SectionHeader
              label={page.featuredEventsLabel || defaultWebsitePages.home.featuredEventsLabel}
              title={page.featuredEventsTitle || defaultWebsitePages.home.featuredEventsTitle}
              description={page.featuredEventsDescription || defaultWebsitePages.home.featuredEventsDescription}
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
                    className={`absolute -left-3 sm:-left-5 top-1/2 z-10 -translate-y-1/2 ${CAROUSEL_ARROW}`}
                  >
                    <ChevronLeft size={18} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveFeaturedSlide((prev) => (prev + 1) % featuredSlides.length)}
                    aria-label="Next featured events"
                    className={`absolute -right-3 sm:-right-5 top-1/2 z-10 -translate-y-1/2 ${CAROUSEL_ARROW}`}
                  >
                    <ChevronRight size={18} aria-hidden="true" />
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
                    aria-current={index === activeFeaturedSlide ? 'true' : undefined}
                    className={carouselDot(index === activeFeaturedSlide)}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ═══════════════════ NEXT SPEAKING ENGAGEMENT ═══════════════════ */}
      {/* Renders nothing until a confirmed engagement is published and upcoming. */}
      {isVisible('home.next-speaking') && (
        <NextSpeakingEngagement
          eyebrow={page.nextSpeakingLabel || defaultWebsitePages.home.nextSpeakingLabel}
          title={page.nextSpeakingTitle || defaultWebsitePages.home.nextSpeakingTitle}
          linkLabel={page.nextSpeakingLinkLabel || defaultWebsitePages.home.nextSpeakingLinkLabel}
        />
      )}

      {/* ═══════════════════════ FEATURED BLOG ═══════════════════════ */}
      {isVisible('home.featured-blog') && featuredBlogSlides.length > 0 && (
        <section className="py-20 sm:py-24 bg-navy-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <SectionHeader
              label={page.featuredBlogLabel || defaultWebsitePages.home.featuredBlogLabel}
              title={page.featuredBlogTitle || defaultWebsitePages.home.featuredBlogTitle}
              description={page.featuredBlogDescription || defaultWebsitePages.home.featuredBlogDescription}
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
                    className={`absolute -left-3 sm:-left-5 top-1/2 z-10 -translate-y-1/2 ${CAROUSEL_ARROW}`}
                  >
                    <ChevronLeft size={18} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveFeaturedBlogSlide((prev) => (prev + 1) % featuredBlogSlides.length)}
                    aria-label="Next featured blog posts"
                    className={`absolute -right-3 sm:-right-5 top-1/2 z-10 -translate-y-1/2 ${CAROUSEL_ARROW}`}
                  >
                    <ChevronRight size={18} aria-hidden="true" />
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
                    aria-current={index === activeFeaturedBlogSlide ? 'true' : undefined}
                    className={carouselDot(index === activeFeaturedBlogSlide)}
                  />
                ))}
              </div>
            )}

            <div className="mt-8 text-center">
              <Link
                to="/blog"
                className="group inline-flex items-center gap-2 rounded-sm text-sm font-semibold text-cyan-800 transition-colors hover:text-cyan-900 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-700 focus-visible:ring-offset-2 dark:text-cyan-300 dark:hover:text-cyan-200"
              >
                View all articles
                <ArrowRight size={14} aria-hidden="true" className={ARROW_NUDGE} />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ═══════════════════════ TESTIMONIALS ═══════════════════════ */}
      {isVisible('home.testimonials') && (
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
                // Side padding keeps the quote clear of the arrows.
                <article key={item.id} className="min-w-full px-14 py-8 sm:px-16 sm:py-10">
                  <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-cyan-50 text-cyan-600 mb-5">
                    <Quote size={18} />
                  </div>
                  <p className="text-lg sm:text-xl leading-relaxed text-navy-700 mb-6">“{item.quote}”</p>
                  <div>
                    {item.name ? (
                      <p className="text-base font-semibold text-navy-900">{item.name}</p>
                    ) : (
                      item.jobTitle && <p className="text-base font-semibold text-navy-900">{item.jobTitle}</p>
                    )}
                    {item.name && item.jobTitle && (
                      <p className="text-sm text-navy-600">{item.jobTitle}</p>
                    )}
                    {item.org && <p className="text-sm text-navy-500">{item.org}</p>}
                  </div>
                </article>
              ))}
            </div>

            <button
              type="button"
              onClick={goToPrevTestimonial}
              aria-label="Previous testimonial"
              className={`absolute left-3 top-1/2 -translate-y-1/2 ${CAROUSEL_ARROW}`}
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={goToNextTestimonial}
              aria-label="Next testimonial"
              className={`absolute right-3 top-1/2 -translate-y-1/2 ${CAROUSEL_ARROW}`}
            >
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>

          <div className="mt-5 flex items-center justify-center gap-2">
            {testimonials.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTestimonial(index)}
                aria-label={`Show testimonial ${index + 1}`}
                aria-current={index === activeTestimonial ? 'true' : undefined}
                className={carouselDot(index === activeTestimonial)}
              />
            ))}
          </div>
        </div>
      </section>
      )}

      {/* ═══════════════════════ CTA ═══════════════════════ */}
      {isVisible('home.cta') && (
      <section className="relative py-20 sm:py-24 overflow-hidden">
        {/* Background image */}
        <div className="absolute inset-0">
          <img
            src={ctaBackground}
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
            <Link to="/contact" className={PRIMARY_BUTTON}>
              Get in Touch <ArrowRight size={16} aria-hidden="true" className={ARROW_NUDGE} />
            </Link>
          </div>
        </div>
      </section>
      )}
    </div>
  );
}
