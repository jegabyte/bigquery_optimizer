import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

// Hardcoded credentials - will be replaced with Google OAuth later
const HARDCODED_CREDENTIALS = {
  username: 'admin',
  password: 'bigquery123'
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is already logged in from localStorage
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    // Simple hardcoded authentication
    // Using email field as username for compatibility with existing Login component
    if (email === HARDCODED_CREDENTIALS.username && password === HARDCODED_CREDENTIALS.password) {
      const userData = { 
        email: 'admin@bigquery-optimizer.com', 
        name: 'Admin User',
        username: HARDCODED_CREDENTIALS.username
      };
      
      // Store user in localStorage
      localStorage.setItem('user', JSON.stringify(userData));
      setUser(userData);
      
      return { success: true };
    } else {
      return { 
        success: false, 
        error: 'Invalid credentials' 
      };
    }
  };

  const logout = () => {
    localStorage.removeItem('user');
    setUser(null);
  };

  const value = {
    user,
    login,
    logout,
    isAuthenticated: !!user,
    loading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};