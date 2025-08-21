import React, { createContext, useContext, useState, useEffect } from 'react';

const IAPAuthContext = createContext();

export const useIAPAuth = () => {
  const context = useContext(IAPAuthContext);
  if (!context) {
    throw new Error('useIAPAuth must be used within IAPAuthProvider');
  }
  return context;
};

export const IAPAuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Check if user is authenticated via IAP
    checkIAPAuth();
  }, []);

  const checkIAPAuth = async () => {
    try {
      // When behind IAP, user info is passed in headers
      // The backend validates the IAP JWT token
      const response = await fetch(`${import.meta.env.VITE_BACKEND_API_URL}/api/auth/me`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      } else if (response.status === 401) {
        // User not authenticated, IAP will handle redirect
        console.log('User not authenticated via IAP');
        setUser(null);
      }
    } catch (err) {
      console.error('IAP auth check failed:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    // IAP logout URL
    const logoutUrl = '/_gcp_iap/clear_login_cookie';
    window.location.href = logoutUrl;
  };

  const value = {
    user,
    loading,
    error,
    logout,
    isAuthenticated: !!user,
  };

  return (
    <IAPAuthContext.Provider value={value}>
      {children}
    </IAPAuthContext.Provider>
  );
};