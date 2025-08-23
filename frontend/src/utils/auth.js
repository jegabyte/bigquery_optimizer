/**
 * Authentication utilities for making authenticated API calls to Cloud Run services
 */

// Get the current user's ID token for Cloud Run authentication
export async function getIdToken() {
  try {
    // Try to get token using gapi (Google Sign-In)
    if (window.gapi && window.gapi.auth2) {
      const auth = window.gapi.auth2.getAuthInstance();
      if (auth && auth.isSignedIn.get()) {
        const user = auth.currentUser.get();
        const response = user.getAuthResponse();
        return response.id_token;
      }
    }

    // Try to get token using Google Identity Services (newer method)
    if (window.google && window.google.accounts) {
      // This would need to be implemented with the new Google Identity Services
      console.log('Google Identity Services detected but not implemented');
    }

    // For development, try to use gcloud auth token
    if (import.meta.env.DEV) {
      console.log('Development mode - authentication may not work without proper Google Sign-In');
    }

    return null;
  } catch (error) {
    console.error('Failed to get ID token:', error);
    return null;
  }
}

// Make an authenticated fetch request
export async function authenticatedFetch(url, options = {}) {
  const token = await getIdToken();
  
  // If no token and in production, the request will likely fail
  // In development, it might work if the APIs are public
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else {
    console.warn('No authentication token available. Request may fail if API requires authentication.');
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // If we get a 401 or 403, the user needs to sign in
  if (response.status === 401 || response.status === 403) {
    console.error('Authentication required. Please sign in.');
    // You could trigger a sign-in flow here
    throw new Error('Authentication required');
  }

  return response;
}

// Initialize Google Sign-In
export function initGoogleSignIn(clientId) {
  return new Promise((resolve, reject) => {
    if (!clientId) {
      console.warn('No Google Client ID provided. Authentication will not work.');
      resolve(false);
      return;
    }

    // Load the Google Sign-In script
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/platform.js';
    script.onload = () => {
      window.gapi.load('auth2', () => {
        window.gapi.auth2.init({
          client_id: clientId,
          scope: 'email profile openid',
        }).then(() => {
          console.log('Google Sign-In initialized');
          resolve(true);
        }).catch((error) => {
          console.error('Failed to initialize Google Sign-In:', error);
          reject(error);
        });
      });
    };
    script.onerror = () => {
      console.error('Failed to load Google Sign-In script');
      reject(new Error('Failed to load Google Sign-In'));
    };
    document.head.appendChild(script);
  });
}

// Sign in with Google
export async function signIn() {
  if (!window.gapi || !window.gapi.auth2) {
    throw new Error('Google Sign-In not initialized');
  }

  const auth = window.gapi.auth2.getAuthInstance();
  try {
    const user = await auth.signIn();
    console.log('Signed in as:', user.getBasicProfile().getEmail());
    return user;
  } catch (error) {
    console.error('Sign-in failed:', error);
    throw error;
  }
}

// Sign out
export async function signOut() {
  if (!window.gapi || !window.gapi.auth2) {
    throw new Error('Google Sign-In not initialized');
  }

  const auth = window.gapi.auth2.getAuthInstance();
  try {
    await auth.signOut();
    console.log('Signed out');
  } catch (error) {
    console.error('Sign-out failed:', error);
    throw error;
  }
}

// Check if user is signed in
export function isSignedIn() {
  if (!window.gapi || !window.gapi.auth2) {
    return false;
  }

  const auth = window.gapi.auth2.getAuthInstance();
  return auth && auth.isSignedIn.get();
}

// Get current user info
export function getCurrentUser() {
  if (!isSignedIn()) {
    return null;
  }

  const auth = window.gapi.auth2.getAuthInstance();
  const user = auth.currentUser.get();
  const profile = user.getBasicProfile();
  
  return {
    id: profile.getId(),
    name: profile.getName(),
    email: profile.getEmail(),
    imageUrl: profile.getImageUrl(),
  };
}