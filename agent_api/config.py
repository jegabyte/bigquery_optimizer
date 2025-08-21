"""
Centralized configuration for Agent API
All environment variables and configuration should be defined here
"""

import os
from typing import Optional

class Config:
    """Centralized configuration for Agent API"""
    
    # Google Cloud Project Configuration
    GCP_PROJECT_ID: str = os.getenv('GCP_PROJECT_ID', '')
    BQ_PROJECT_ID: str = os.getenv('BQ_PROJECT_ID', GCP_PROJECT_ID)
    
    # BigQuery Configuration
    BQ_DATASET: str = os.getenv('BQ_DATASET', 'bq_optimizer')
    BQ_LOCATION: str = os.getenv('BQ_LOCATION', 'US')
    
    # Application Configuration
    APP_ENV: str = os.getenv('APP_ENV', 'development')
    DEBUG: bool = os.getenv('DEBUG', 'false').lower() == 'true'
    
    # API Configuration
    API_HOST: str = os.getenv('API_HOST', '0.0.0.0')
    API_PORT: int = int(os.getenv('API_PORT', '8000'))
    
    # CORS Configuration
    CORS_ORIGINS: list = os.getenv('CORS_ORIGINS', 'http://localhost:3000,http://localhost:5173').split(',')
    
    # Google Cloud Credentials (optional - uses Application Default Credentials if not set)
    GOOGLE_APPLICATION_CREDENTIALS: Optional[str] = os.getenv('GOOGLE_APPLICATION_CREDENTIALS')
    
    # Vertex AI Configuration (for ADK)
    VERTEX_AI_LOCATION: str = os.getenv('VERTEX_AI_LOCATION', 'us-central1')
    VERTEX_AI_PROJECT: str = os.getenv('VERTEX_AI_PROJECT', GCP_PROJECT_ID)
    
    @classmethod
    def get_full_table_id(cls, table_name: str) -> str:
        """Get fully qualified BigQuery table ID"""
        return f"{cls.BQ_PROJECT_ID}.{cls.BQ_DATASET}.{table_name}"
    
    @classmethod
    def get_information_schema_table(cls, table_name: str, region: str = 'us') -> str:
        """Get fully qualified INFORMATION_SCHEMA table ID"""
        return f"{cls.BQ_PROJECT_ID}.region-{region}.INFORMATION_SCHEMA.{table_name}"
    
    @classmethod
    def validate_config(cls) -> bool:
        """Validate required configuration"""
        required = ['GCP_PROJECT_ID', 'BQ_DATASET']
        missing = []
        
        for var in required:
            if not getattr(cls, var, None):
                missing.append(var)
        
        if missing:
            raise ValueError(f"Missing required configuration: {', '.join(missing)}")
        
        return True
    
    @classmethod
    def print_config(cls):
        """Print current configuration (for debugging)"""
        print("=== Agent API Configuration ===")
        print(f"GCP Project ID: {cls.GCP_PROJECT_ID}")
        print(f"BQ Project ID: {cls.BQ_PROJECT_ID}")
        print(f"BQ Dataset: {cls.BQ_DATASET}")
        print(f"Vertex AI Project: {cls.VERTEX_AI_PROJECT}")
        print(f"Environment: {cls.APP_ENV}")
        print(f"API URL: http://{cls.API_HOST}:{cls.API_PORT}")
        print("===============================")

# Create a singleton instance
config = Config()