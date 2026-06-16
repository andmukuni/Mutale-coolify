import { Gift, ArrowRight, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useUserAuth } from '../context/UserAuthContext';

// Check localStorage for dismissal (lasts 7 days)
function getInitialDismissed() {
  const dismissedUntil = localStorage.getItem('kyc_banner_dismissed');
  return dismissedUntil && new Date(dismissedUntil) > new Date();
}

/**
 * KYC completion banner — shows when user profile is incomplete.
 * Offers a free event session reward for completing KYC.
 */
export default function KycBanner({ onCompleteClick }) {
  const { currentUser, isUserAuthenticated } = useUserAuth();
  const location = useLocation();
  const [dismissed, setDismissed] = useState(getInitialDismissed);

  const handleDismiss = () => {
    // Dismiss for 7 days
    const dismissUntil = new Date();
    dismissUntil.setDate(dismissUntil.getDate() + 7);
    localStorage.setItem('kyc_banner_dismissed', dismissUntil.toISOString());
    setDismissed(true);
  };

  // Don't show if not logged in, already completed KYC, or dismissed
  if (!isUserAuthenticated || currentUser?.kyc_completed || dismissed) {
    return null;
  }

  // Check if KYC fields are incomplete
  const isKycIncomplete = !currentUser?.occupation || !currentUser?.nrc_id || !currentUser?.address || !(currentUser?.interests?.length > 0) || !currentUser?.linkedin_handle;

  if (!isKycIncomplete) {
    return null;
  }

  const isOnProfilePage = location.pathname === '/account/profile';

  return (
    <div className="bg-gradient-to-r from-cyan-600 via-cyan-500 to-teal-500 text-white rounded-xl overflow-hidden">
      <div className="px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
            <div className="hidden sm:flex items-center justify-center w-10 h-10 rounded-xl bg-white/20 shrink-0">
              <Gift size={20} className="text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-sm sm:text-base font-semibold leading-tight">
                🎉 Complete your profile &amp; get a FREE event session!
              </p>
              <p className="text-xs sm:text-sm text-white/80 mt-0.5 truncate">
                Fill in your KYC details to unlock one complimentary event registration.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isOnProfilePage ? (
              <button
                onClick={onCompleteClick}
                className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg bg-white text-cyan-700 text-xs sm:text-sm font-semibold hover:bg-cyan-50 transition-colors"
              >
                Complete Now
                <ArrowRight size={14} />
              </button>
            ) : (
              <Link
                to="/account/profile"
                className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg bg-white text-cyan-700 text-xs sm:text-sm font-semibold hover:bg-cyan-50 transition-colors"
              >
                Complete Now
                <ArrowRight size={14} />
              </Link>
            )}
            <button
              onClick={handleDismiss}
              className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
              title="Dismiss"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
