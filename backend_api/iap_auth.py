"""
IAP (Identity-Aware Proxy) Authentication Module
Validates IAP JWT tokens for secure access
"""

import os
import logging
from typing import Optional, Dict
import requests
from jose import jwt
from fastapi import HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

logger = logging.getLogger(__name__)

# IAP configuration
IAP_ISSUER = "https://cloud.google.com/iap"
IAP_AUDIENCE = os.getenv("IAP_AUDIENCE", "")  # Set this to your OAuth client ID

security = HTTPBearer(auto_error=False)


class IAPAuth:
    """Identity-Aware Proxy authentication handler"""
    
    def __init__(self, audience: str = None):
        self.audience = audience or IAP_AUDIENCE
        self.issuer = IAP_ISSUER
        self._public_keys_cache = None
        
    def get_public_keys(self) -> Dict:
        """Fetch Google's public keys for JWT verification"""
        if self._public_keys_cache:
            return self._public_keys_cache
            
        response = requests.get(
            "https://www.gstatic.com/iap/verify/public_key-jwk"
        )
        if response.status_code != 200:
            raise HTTPException(
                status_code=500,
                detail="Failed to fetch IAP public keys"
            )
        
        self._public_keys_cache = response.json()
        return self._public_keys_cache
    
    def verify_token(self, token: str) -> Dict:
        """Verify IAP JWT token"""
        try:
            # Get public keys
            keys = self.get_public_keys()
            
            # Decode and verify JWT
            claims = jwt.decode(
                token,
                keys,
                algorithms=["ES256", "RS256"],
                audience=self.audience,
                issuer=self.issuer
            )
            
            # Validate claims
            if not claims.get("email"):
                raise HTTPException(
                    status_code=401,
                    detail="Invalid token: missing email claim"
                )
                
            return claims
            
        except jwt.ExpiredSignatureError:
            raise HTTPException(
                status_code=401,
                detail="Token has expired"
            )
        except jwt.JWTClaimsError:
            raise HTTPException(
                status_code=401,
                detail="Invalid token claims"
            )
        except Exception as e:
            logger.error(f"Token verification failed: {e}")
            raise HTTPException(
                status_code=401,
                detail="Invalid authentication token"
            )
    
    def get_current_user(
        self,
        credentials: Optional[HTTPAuthorizationCredentials] = Security(security)
    ) -> Dict:
        """Extract and verify user from IAP token"""
        if not credentials:
            # Check for IAP header
            from fastapi import Request
            request = Request
            iap_jwt = request.headers.get("X-Goog-IAP-JWT-Assertion")
            if not iap_jwt:
                raise HTTPException(
                    status_code=401,
                    detail="Missing IAP authentication"
                )
            token = iap_jwt
        else:
            token = credentials.credentials
            
        # Verify token and return user info
        claims = self.verify_token(token)
        return {
            "email": claims.get("email"),
            "sub": claims.get("sub"),
            "name": claims.get("name", claims.get("email"))
        }


# Initialize IAP auth
iap_auth = IAPAuth()


def get_current_user_email(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security)
) -> str:
    """Simple dependency to get current user's email"""
    user = iap_auth.get_current_user(credentials)
    return user["email"]