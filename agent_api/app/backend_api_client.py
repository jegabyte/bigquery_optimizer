"""
Backend API Client for Agent API
Fetches rules and other data from the backend API instead of direct database access
"""

import os
import logging
import requests
from typing import Optional, List, Dict, Any
import yaml
import sys
import os

# Add parent directory to path to import config
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import Config

logger = logging.getLogger(__name__)

class BackendAPIClient:
    """Client for communicating with the Backend API"""
    
    def __init__(self, base_url: Optional[str] = None):
        """
        Initialize the Backend API client
        
        Args:
            base_url: Base URL of the backend API (e.g., http://localhost:8001)
        """
        self.base_url = base_url or Config.BACKEND_API_URL
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        })
        logger.info(f"Backend API client initialized with URL: {self.base_url}")
    
    def fetch_rules(self) -> str:
        """
        Fetch anti-pattern rules from the backend API
        
        Returns:
            YAML string with rules in the format expected by the agent
        """
        try:
            logger.info(f"Fetching rules from backend API: {self.base_url}/api/rules")
            response = self.session.get(f"{self.base_url}/api/rules")
            response.raise_for_status()
            
            rules_data = response.json()
            
            # Convert backend API response to YAML format expected by agent
            rules_dict = {
                'version': 2,
                'rules': []
            }
            
            for rule in rules_data:
                # Map backend API fields to agent format
                agent_rule = {
                    'id': rule.get('id') or rule.get('docId'),
                    'title': rule.get('title'),
                    'severity': rule.get('severity', 'medium'),
                    'enabled': rule.get('enabled', True),
                    'detect': rule.get('detect') or rule.get('description', ''),
                    'fix': rule.get('fix') or rule.get('fix_suggestion', 'Review and optimize query')
                }
                
                # Add optional fields if they exist
                if rule.get('category'):
                    agent_rule['category'] = rule['category']
                if rule.get('impact'):
                    agent_rule['impact'] = rule['impact']
                if rule.get('tags'):
                    if isinstance(rule['tags'], list):
                        agent_rule['tags'] = rule['tags']
                    elif isinstance(rule['tags'], str):
                        agent_rule['tags'] = rule['tags'].split(',')
                
                rules_dict['rules'].append(agent_rule)
            
            # Convert to YAML string
            yaml_content = yaml.dump(rules_dict, default_flow_style=False, sort_keys=False)
            logger.info(f"✅ Successfully fetched {len(rules_data)} rules from backend API")
            return yaml_content
            
        except requests.exceptions.ConnectionError:
            logger.error(f"❌ Could not connect to backend API at {self.base_url}")
            logger.info("Falling back to default rules")
            return self._get_default_rules()
        except requests.exceptions.HTTPError as e:
            logger.error(f"❌ Backend API returned error: {e}")
            logger.info("Falling back to default rules")
            return self._get_default_rules()
        except Exception as e:
            logger.error(f"❌ Unexpected error fetching rules from backend API: {e}")
            logger.info("Falling back to default rules")
            return self._get_default_rules()
    
    def _get_default_rules(self) -> str:
        """Return default rules in YAML format as fallback"""
        return """version: 2
rules:
  - id: NO_SELECT_STAR
    title: "Avoid SELECT *"
    severity: high
    enabled: true
    detect: "Flag wildcard projection (* or t.*) except COUNT(*), * EXCEPT(...), or * REPLACE(...)."
    fix: "Select only required columns."
    category: Performance
    impact: "Reduces data scanned and costs"
    
  - id: MISSING_PARTITION_FILTER
    title: "Missing partition filter"
    severity: critical
    enabled: true
    detect: "Partitioned table read without a WHERE on its partition column."
    fix: "Add a constant/param range filter on the partition column."
    category: Performance
    impact: "Can reduce data scanned by 90%+"
    
  - id: MISSING_CLUSTER_FILTER
    title: "Missing clustering filter"
    severity: medium
    enabled: true
    detect: "Clustered table without WHERE clause on clustering columns."
    fix: "Filter by clustering columns for better performance."
    category: Performance
    
  - id: LARGE_SORT_WITHOUT_LIMIT
    title: "Large sort without LIMIT"
    severity: medium
    enabled: true
    detect: "ORDER BY without LIMIT on large tables."
    fix: "Add LIMIT clause or use approximate algorithms."
    category: Performance
    
  - id: CROSS_JOIN_WITHOUT_WHERE
    title: "Cross join without WHERE"
    severity: critical
    enabled: true
    detect: "CROSS JOIN or implicit cross join without WHERE clause."
    fix: "Add WHERE conditions or use proper JOIN."
    category: Performance
"""
    
    def get_project_config(self, project_id: str) -> Optional[Dict[str, Any]]:
        """
        Get project configuration from backend API
        
        Args:
            project_id: Project ID to fetch configuration for
            
        Returns:
            Project configuration dict or None
        """
        try:
            response = self.session.get(f"{self.base_url}/api/projects/{project_id}")
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Failed to get project config for {project_id}: {e}")
            return None
    
    def save_analysis(self, analysis_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Save analysis results to backend API
        
        Args:
            analysis_data: Analysis data to save
            
        Returns:
            Saved analysis data with ID or None
        """
        try:
            response = self.session.post(
                f"{self.base_url}/api/analyses",
                json=analysis_data
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Failed to save analysis: {e}")
            return None

# Global instance
backend_client = BackendAPIClient()