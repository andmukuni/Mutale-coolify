import { Navigate, useLocation } from 'react-router-dom';
import { useUserAuth } from '../context/UserAuthContext';

export default function RequireUserAuth({ children }) {
  const { isUserAuthenticated } = useUserAuth();
  const location = useLocation();

  if (!isUserAuthenticated) {
    return (
      <Navigate
        to="/account/login"
        state={{ from: location }}
        replace
      />
    );
  }

  return children;
}
