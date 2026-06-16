import { Suspense, lazy, Component } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import RequireUserAuth from './components/RequireUserAuth';
import { Modal } from './components/ui';
import TopProgressBar from './components/ui/TopProgressBar';
import { useUserAuth } from './context/UserAuthContext';
import { useAuth } from './context/AuthContext';

const MainLayout = lazy(() => import('./layouts/MainLayout'));
const AdminLayout = lazy(() => import('./layouts/AdminLayout'));

const HomePage = lazy(() => import('./pages/HomePage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));
const ExperiencePage = lazy(() => import('./pages/ExperiencePage'));
const EventsPage = lazy(() => import('./pages/EventsPage'));
const EventDetailPage = lazy(() => import('./pages/EventDetailPage'));
const EventForumPage = lazy(() => import('./pages/EventForumPage'));
const EventJoinPage = lazy(() => import('./pages/EventJoinPage'));
const BlogPage = lazy(() => import('./pages/BlogPage'));
const BlogPostPage = lazy(() => import('./pages/BlogPostPage'));
const PublicationsPage = lazy(() => import('./pages/PublicationsPage'));
const PublicationDetailPage = lazy(() => import('./pages/PublicationDetailPage'));
const ContactPage = lazy(() => import('./pages/ContactPage'));
const BookShopPage = lazy(() => import('./pages/BookShopPage'));
const BookDetailPage = lazy(() => import('./pages/BookDetailPage'));
const CartPage = lazy(() => import('./pages/CartPage'));
const CustomPage = lazy(() => import('./pages/CustomPage'));

const UserLoginPage = lazy(() => import('./pages/account/UserLoginPage'));
const RegisterPage = lazy(() => import('./pages/account/RegisterPage'));
const VerifyEmailPage = lazy(() => import('./pages/account/VerifyEmailPage'));
const ForgotPasswordPage = lazy(() => import('./pages/account/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/account/ResetPasswordPage'));
const MyEventsPage = lazy(() => import('./pages/account/MyEventsPage'));
const UserProfilePage = lazy(() => import('./pages/account/UserProfilePage'));
const MyCvPage = lazy(() => import('./pages/account/MyCvPage'));

const LoginPage = lazy(() => import('./pages/admin/LoginPage'));
const AdminDashboardPage = lazy(() => import('./pages/admin/AdminDashboardPage'));
const EventsListPage = lazy(() => import('./pages/admin/EventsListPage'));
const EventProfilePage = lazy(() => import('./pages/admin/EventProfilePage'));
const EventFormPage = lazy(() => import('./pages/admin/EventFormPage'));
const EventAttendeesPage = lazy(() => import('./pages/admin/EventAttendeesPage'));
const AttendeeProfilePage = lazy(() => import('./pages/admin/AttendeeProfilePage'));
const CouponsPage = lazy(() => import('./pages/admin/CouponsPage'));
const BlogListPage = lazy(() => import('./pages/admin/BlogListPage'));
const BlogFormPage = lazy(() => import('./pages/admin/BlogFormPage'));
const PublicationsListPage = lazy(() => import('./pages/admin/PublicationsListPage'));
const PublicationFormPage = lazy(() => import('./pages/admin/PublicationFormPage'));
const SettingsPage = lazy(() => import('./pages/admin/SettingsPage'));
const UsersListPage = lazy(() => import('./pages/admin/UsersListPage'));
const AdminUserProfilePage = lazy(() => import('./pages/admin/UserProfilePage'));
const TransactionLedgerPage = lazy(() => import('./pages/admin/TransactionLedgerPage'));
const PaymentsHistoryPage = lazy(() => import('./pages/admin/PaymentsHistoryPage'));
const ReceiptsPage = lazy(() => import('./pages/admin/ReceiptsPage'));
const CvsPage = lazy(() => import('./pages/admin/CvsPage'));
const CertificatesListPage = lazy(() => import('./pages/admin/CertificatesListPage'));
const CertificateDesignerPage = lazy(() => import('./pages/admin/CertificateDesignerPage'));
const CertificateVerifyPage = lazy(() => import('./pages/CertificateVerifyPage'));
const CollectionsPage = lazy(() => import('./pages/admin/CollectionsPage'));
const PayoutsPage = lazy(() => import('./pages/admin/PayoutsPage'));
const ContactMessagesPage = lazy(() => import('./pages/admin/ContactMessagesPage'));
const BookListPage = lazy(() => import('./pages/admin/BookListPage'));
const BookFormPage = lazy(() => import('./pages/admin/BookFormPage'));
const BookOrdersPage = lazy(() => import('./pages/admin/BookOrdersPage'));
const ProductTypesPage = lazy(() => import('./pages/admin/ProductTypesPage'));
const ShippingSettingsPage = lazy(() => import('./pages/admin/ShippingSettingsPage'));
const WebsitePagesPage = lazy(() => import('./pages/admin/WebsitePagesPage'));
const PartnerLogosPage = lazy(() => import('./pages/admin/PartnerLogosPage'));
const MenuManagementPage = lazy(() => import('./pages/admin/MenuManagementPage'));
const AccessControlPage = lazy(() => import('./pages/admin/AccessControlPage'));

function RouteLoader() {
  return (
    <div className="min-h-[40vh] flex flex-col items-center justify-center gap-3">
      <div className="w-10 h-10 rounded-full border-4 border-navy-100 border-t-navy-900 animate-spin" />
      <p className="text-navy-500 text-sm animate-pulse">Loading page...</p>
    </div>
  );
}

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mb-2">
            <span className="text-3xl">⚠</span>
          </div>
          <h2 className="text-xl font-bold text-navy-900">Something went wrong</h2>
          <p className="text-navy-500 text-sm max-w-md">An unexpected error occurred. Please refresh the page to try again.</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium transition-colors"
          >
            Refresh page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    idleLogoutPromptOpen,
    dismissIdleLogoutPrompt,
    userIdleTimeoutMinutes,
  } = useUserAuth();
  const {
    idleLogoutPromptOpen: adminIdleLogoutPromptOpen,
    dismissIdleLogoutPrompt: dismissAdminIdleLogoutPrompt,
    adminIdleTimeoutMinutes,
  } = useAuth();

  const openUserLogin = () => {
    dismissIdleLogoutPrompt();
    navigate('/account/login', { state: { from: { pathname: location.pathname } } });
  };

  const openAdminLogin = () => {
    dismissAdminIdleLogoutPrompt();
    navigate('/admin/login', { state: { from: { pathname: location.pathname } } });
  };

  return (
    <>
    <TopProgressBar />
    <ErrorBoundary>
    <Suspense fallback={<RouteLoader />}>
      <Routes>
      {/* Public portfolio routes */}
      <Route element={<MainLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/experience" element={<ExperiencePage />} />
        <Route path="/events" element={<EventsPage />} />
        <Route path="/events/:slug" element={<EventDetailPage />} />
        <Route path="/events/:slug/forum" element={<EventForumPage />} />
        <Route
          path="/events/:slug/join"
          element={(
            <RequireUserAuth>
              <EventJoinPage />
            </RequireUserAuth>
          )}
        />
        <Route path="/blog" element={<BlogPage />} />
        <Route path="/blog/:slug" element={<BlogPostPage />} />
        <Route path="/publications" element={<PublicationsPage />} />
  <Route path="/publications/:id" element={<PublicationDetailPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/books" element={<BookShopPage />} />
        <Route path="/books/cart" element={<CartPage />} />
        <Route path="/books/:slug" element={<BookDetailPage />} />
        {/* New /shop aliases — same lazy components as /books for back-compat. */}
        <Route path="/shop" element={<BookShopPage />} />
        <Route path="/shop/cart" element={<CartPage />} />
        <Route path="/shop/:slug" element={<BookDetailPage />} />
        <Route path="/pages/:slug" element={<CustomPage />} />
        <Route path="/certificates/verify/:code" element={<CertificateVerifyPage />} />

        {/* Public user account routes */}
        <Route path="/account/login" element={<UserLoginPage />} />
        <Route path="/account/register" element={<RegisterPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/account/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/account/reset-password" element={<ResetPasswordPage />} />

        {/* Protected user account routes */}
        <Route
          path="/account/my-events"
          element={
            <RequireUserAuth>
              <MyEventsPage />
            </RequireUserAuth>
          }
        />
        <Route
          path="/account/profile"
          element={
            <RequireUserAuth>
              <UserProfilePage />
            </RequireUserAuth>
          }
        />
        <Route
          path="/account/cv"
          element={
            <RequireUserAuth>
              <MyCvPage />
            </RequireUserAuth>
          }
        />
      </Route>

      {/* Admin login — public */}
      <Route path="/admin/login" element={<LoginPage />} />

      {/* Admin dashboard — protected */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<AdminDashboardPage />} />
        <Route path="events" element={<EventsListPage />} />
        <Route path="events/new" element={<EventFormPage />} />
        <Route path="events/:id" element={<EventProfilePage />} />
        <Route path="events/:eventId/certificate-designer" element={<CertificateDesignerPage />} />
        <Route path="events/:id/edit" element={<EventFormPage />} />
        <Route path="events/:id/attendees" element={<EventAttendeesPage />} />
  <Route path="events/:id/attendees/:registrationId" element={<AttendeeProfilePage />} />
        <Route path="coupons" element={<CouponsPage />} />
        <Route path="certificates" element={<CertificatesListPage />} />
        <Route path="blog" element={<BlogListPage />} />
        <Route path="blog/new" element={<BlogFormPage />} />
        <Route path="blog/:id/edit" element={<BlogFormPage />} />
  <Route path="publications" element={<PublicationsListPage />} />
  <Route path="publications/new" element={<PublicationFormPage />} />
  <Route path="publications/:id/edit" element={<PublicationFormPage />} />
        <Route path="users" element={<UsersListPage />} />
        <Route path="users/:id" element={<AdminUserProfilePage />} />
  <Route path="messages" element={<ContactMessagesPage />} />
        <Route path="books" element={<BookListPage />} />
        <Route path="books/new" element={<BookFormPage />} />
        <Route path="books/:id/edit" element={<BookFormPage />} />
        <Route path="books/orders" element={<BookOrdersPage />} />
        {/* /admin/shop* mirrors of /admin/books* — same lazy components. */}
        <Route path="shop" element={<BookListPage />} />
        <Route path="shop/new" element={<BookFormPage />} />
        <Route path="shop/:id/edit" element={<BookFormPage />} />
        <Route path="shop/orders" element={<BookOrdersPage />} />
        <Route path="shop/product-types" element={<ProductTypesPage />} />
        <Route path="books/product-types" element={<ProductTypesPage />} />
        <Route path="shipping" element={<ShippingSettingsPage />} />
        <Route path="website-pages" element={<WebsitePagesPage />} />
        <Route path="partner-logos" element={<PartnerLogosPage />} />
        <Route path="menu" element={<MenuManagementPage />} />
        <Route path="access-control" element={<AccessControlPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="finance/ledger" element={<TransactionLedgerPage />} />
        <Route path="receipts" element={<ReceiptsPage />} />
        <Route path="cv" element={<CvsPage />} />
        <Route path="finance/payments-history" element={<PaymentsHistoryPage />} />
        <Route path="finance/collections" element={<CollectionsPage />} />
        <Route path="finance/settlement-accounts" element={<PayoutsPage />} />
        <Route path="finance/payouts" element={<PayoutsPage />} />
      </Route>
      </Routes>
    </Suspense>
    </ErrorBoundary>

    <Modal
      isOpen={idleLogoutPromptOpen && !location.pathname.startsWith('/account/login')}
      onClose={dismissIdleLogoutPrompt}
      title="Session timed out"
      subtitle="You were logged out due to inactivity."
      size="sm"
      footer={(
        <>
          <button
            type="button"
            onClick={dismissIdleLogoutPrompt}
            className="px-4 py-2 rounded-lg border border-navy-200 text-navy-600 hover:bg-navy-50 text-sm font-medium"
          >
            Continue browsing
          </button>
          <button
            type="button"
            onClick={openUserLogin}
            className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium"
          >
            Log in
          </button>
        </>
      )}
    >
      <p className="text-sm text-navy-600">
        For security, we sign users out after {userIdleTimeoutMinutes} minutes of inactivity.
        Please sign in again to continue growing.
      </p>
    </Modal>

    <Modal
      isOpen={adminIdleLogoutPromptOpen && location.pathname.startsWith('/admin') && !location.pathname.startsWith('/admin/login')}
      onClose={dismissAdminIdleLogoutPrompt}
      title="Admin session timed out"
      subtitle="You were logged out due to inactivity."
      size="sm"
      footer={(
        <>
          <button
            type="button"
            onClick={dismissAdminIdleLogoutPrompt}
            className="px-4 py-2 rounded-lg border border-navy-200 text-navy-600 hover:bg-navy-50 text-sm font-medium"
          >
            Continue browsing
          </button>
          <button
            type="button"
            onClick={openAdminLogin}
            className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium"
          >
            Log in
          </button>
        </>
      )}
    >
      <p className="text-sm text-navy-600">
        For security, we sign admins out after {adminIdleTimeoutMinutes} minutes of inactivity.
        Please sign in again to continue managing the portal.
      </p>
    </Modal>
    </>
  );
}
