"""
Firestore Service for BigQuery Optimizer
Handles all Firestore database operations for projects and query templates
"""

from google.cloud import firestore
from google.oauth2 import service_account
from typing import List, Dict, Any, Optional
from datetime import datetime
import os
import json
import logging
from config import config

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class FirestoreService:
    def __init__(self):
        """Initialize Firestore client"""
        try:
            # Try different authentication methods
            self.db = None
            
            # First try service account file if it exists
            service_account_path = 'service-account.json'
            if os.path.exists(service_account_path):
                try:
                    credentials = service_account.Credentials.from_service_account_file(
                        service_account_path
                    )
                    self.db = firestore.Client(
                        credentials=credentials,
                        project=config.FIRESTORE_PROJECT_ID,
                        database=config.FIRESTORE_DATABASE  # Use default if not specified
                    )
                    logger.info("✅ Firestore client initialized with service account")
                except Exception as e:
                    logger.warning(f"Failed to use service account: {e}")
            
            # If not successful, try default credentials (ADC)
            if not self.db:
                try:
                    # Don't set GOOGLE_APPLICATION_CREDENTIALS if file doesn't exist
                    if 'GOOGLE_APPLICATION_CREDENTIALS' in os.environ:
                        if not os.path.exists(os.environ['GOOGLE_APPLICATION_CREDENTIALS']):
                            del os.environ['GOOGLE_APPLICATION_CREDENTIALS']
                    
                    self.db = firestore.Client(
                        project=config.FIRESTORE_PROJECT_ID,
                        database=config.FIRESTORE_DATABASE  # Use default if not specified
                    )
                    logger.info("✅ Firestore client initialized with default credentials")
                except Exception as e:
                    logger.error(f"Failed to use default credentials: {e}")
                    # Try without specifying database (use default)
                    self.db = firestore.Client(project=config.FIRESTORE_PROJECT_ID)
                    logger.info("✅ Firestore client initialized with default database")
            
            # Collection references
            self.projects_collection = self.db.collection('projects')
            self.templates_collection = self.db.collection('query_templates')
            self.analyses_collection = self.db.collection('analyses')
            
        except Exception as e:
            logger.error(f"❌ Failed to initialize Firestore: {e}")
            raise
    
    # ==================== Projects Operations ====================
    
    def create_project(self, project_data: Dict[str, Any]) -> str:
        """Create a new project in Firestore"""
        try:
            # Check if project already exists
            existing = self.projects_collection.where(
                'project_id', '==', project_data['project_id']
            ).limit(1).get()
            
            if existing:
                # Update existing project
                doc_id = existing[0].id
                self.projects_collection.document(doc_id).update({
                    **project_data,
                    'updated_at': datetime.utcnow().isoformat()
                })
                logger.info(f"Updated existing project: {doc_id}")
                return doc_id
            
            # Create new project
            project_data['created_at'] = datetime.utcnow().isoformat()
            project_data['updated_at'] = datetime.utcnow().isoformat()
            project_data['is_active'] = True
            
            doc_ref = self.projects_collection.add(project_data)
            doc_id = doc_ref[1].id
            logger.info(f"Created new project: {doc_id}")
            return doc_id
            
        except Exception as e:
            logger.error(f"Error creating project: {e}")
            raise
    
    def get_projects(self, active_only: bool = True) -> List[Dict[str, Any]]:
        """Get all projects from Firestore"""
        try:
            query = self.projects_collection
            if active_only:
                query = query.where('is_active', '==', True)
            
            projects = []
            for doc in query.stream():
                project = doc.to_dict()
                project['id'] = doc.id
                projects.append(project)
            
            return projects
            
        except Exception as e:
            logger.error(f"Error getting projects: {e}")
            raise
    
    def get_project(self, project_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific project by ID"""
        try:
            # Try by document ID first
            doc = self.projects_collection.document(project_id).get()
            if doc.exists:
                project = doc.to_dict()
                project['id'] = doc.id
                return project
            
            # Try by project_id field
            results = self.projects_collection.where(
                'project_id', '==', project_id
            ).limit(1).get()
            
            if results:
                project = results[0].to_dict()
                project['id'] = results[0].id
                return project
            
            return None
            
        except Exception as e:
            logger.error(f"Error getting project: {e}")
            raise
    
    def update_project(self, project_id: str, update_data: Dict[str, Any]) -> bool:
        """Update a project in Firestore"""
        try:
            update_data['updated_at'] = datetime.utcnow().isoformat()
            
            # Try by document ID first
            doc_ref = self.projects_collection.document(project_id)
            if doc_ref.get().exists:
                doc_ref.update(update_data)
                return True
            
            # Try by project_id field
            results = self.projects_collection.where(
                'project_id', '==', project_id
            ).limit(1).get()
            
            if results:
                self.projects_collection.document(results[0].id).update(update_data)
                return True
            
            return False
            
        except Exception as e:
            logger.error(f"Error updating project: {e}")
            raise
    
    def delete_project(self, project_id: str, soft_delete: bool = True) -> bool:
        """Delete or deactivate a project"""
        try:
            if soft_delete:
                return self.update_project(project_id, {'is_active': False})
            
            # Hard delete
            doc_ref = self.projects_collection.document(project_id)
            if doc_ref.get().exists:
                doc_ref.delete()
                return True
            
            # Try by project_id field
            results = self.projects_collection.where(
                'project_id', '==', project_id
            ).limit(1).get()
            
            if results:
                self.projects_collection.document(results[0].id).delete()
                return True
            
            return False
            
        except Exception as e:
            logger.error(f"Error deleting project: {e}")
            raise
    
    # ==================== Templates Operations ====================
    
    def save_templates(self, templates: List[Dict[str, Any]], project_id: str) -> int:
        """Save multiple query templates to Firestore"""
        try:
            saved_count = 0
            batch = self.db.batch()
            batch_size = 0
            
            for template in templates:
                # Check if template already exists
                existing = self.templates_collection.where(
                    'template_hash', '==', template.get('template_hash')
                ).where(
                    'project_id', '==', project_id
                ).limit(1).get()
                
                if existing:
                    # Update existing template
                    doc_ref = self.templates_collection.document(existing[0].id)
                    batch.update(doc_ref, {
                        **template,
                        'updated_at': datetime.utcnow().isoformat()
                    })
                else:
                    # Create new template
                    template['created_at'] = datetime.utcnow().isoformat()
                    template['updated_at'] = datetime.utcnow().isoformat()
                    doc_ref = self.templates_collection.document()
                    batch.set(doc_ref, template)
                
                saved_count += 1
                batch_size += 1
                
                # Commit batch every 500 operations (Firestore limit)
                if batch_size >= 500:
                    batch.commit()
                    batch = self.db.batch()
                    batch_size = 0
            
            # Commit remaining operations
            if batch_size > 0:
                batch.commit()
            
            logger.info(f"Saved {saved_count} templates for project {project_id}")
            return saved_count
            
        except Exception as e:
            logger.error(f"Error saving templates: {e}")
            raise
    
    def get_templates(self, project_id: str, limit: int = None) -> List[Dict[str, Any]]:
        """Get templates for a specific project"""
        try:
            # Simple query without ordering to avoid index requirement
            query = self.templates_collection.where('project_id', '==', project_id)
            
            if limit:
                query = query.limit(limit)
            
            templates = []
            for doc in query.stream():
                template = doc.to_dict()
                template['id'] = doc.id
                templates.append(template)
            
            # Sort in memory to avoid Firestore index requirement
            templates.sort(key=lambda x: x.get('total_bytes_processed', 0), reverse=True)
            
            # Apply limit after sorting if needed
            if limit and len(templates) > limit:
                templates = templates[:limit]
            
            return templates
            
        except Exception as e:
            logger.error(f"Error getting templates: {e}")
            raise
    
    def delete_templates(self, project_id: str) -> int:
        """Delete all templates for a project"""
        try:
            templates = self.templates_collection.where('project_id', '==', project_id).stream()
            
            batch = self.db.batch()
            count = 0
            batch_size = 0
            
            for doc in templates:
                batch.delete(doc.reference)
                count += 1
                batch_size += 1
                
                if batch_size >= 500:
                    batch.commit()
                    batch = self.db.batch()
                    batch_size = 0
            
            if batch_size > 0:
                batch.commit()
            
            logger.info(f"Deleted {count} templates for project {project_id}")
            return count
            
        except Exception as e:
            logger.error(f"Error deleting templates: {e}")
            raise
    
    # ==================== Dashboard Operations ====================
    
    def get_dashboard_stats(self) -> Dict[str, Any]:
        """Get dashboard statistics from Firestore - optimized version"""
        try:
            # Get active projects count more efficiently
            projects_query = self.projects_collection.where('is_active', '==', True).limit(100)
            projects = []
            for doc in projects_query.stream():
                projects.append(doc.id)
            total_projects = len(projects)
            
            # Initialize counters
            total_templates = 0
            total_runs = 0
            total_bytes = 0
            
            # Get a smaller subset of templates for stats (limit to 100 for faster response)
            all_templates = []
            templates_query = self.templates_collection.limit(100)
            
            for template_doc in templates_query.stream():
                template = template_doc.to_dict()
                template['template_id'] = template_doc.id
                all_templates.append(template)
                total_templates += 1
                total_runs += template.get('total_runs', 0)
                total_bytes += template.get('total_bytes_processed', 0)
            
            # For recent templates, get only the most recent 10
            recent_templates = []
            if all_templates:
                # Sort by last_seen for recent templates
                templates_with_last_seen = [t for t in all_templates if t.get('last_seen')]
                templates_with_last_seen.sort(key=lambda x: x.get('last_seen', ''), reverse=True)
                recent_templates = templates_with_last_seen[:10]
            
            # For top cost drivers, sort by bytes processed
            cost_drivers = []
            if all_templates:
                # Sort by total_bytes_processed
                all_templates.sort(key=lambda x: x.get('total_bytes_processed', 0), reverse=True)
                for template in all_templates[:5]:
                    template['estimated_cost'] = (template.get('total_bytes_processed', 0) / 1e12) * 5.00
                    cost_drivers.append(template)
            
            return {
                'stats': {
                    'total_projects': total_projects,
                    'total_templates': total_templates,
                    'total_query_runs': total_runs,
                    'total_tb_processed': round(total_bytes / 1e12, 2) if total_bytes > 0 else 0,
                    'avg_runtime_seconds': 0,  # Would need to calculate from runs
                    'total_cost_estimate': round((total_bytes / 1e12) * 5.00, 2) if total_bytes > 0 else 0
                },
                'recent_templates': recent_templates,
                'top_cost_drivers': cost_drivers,
                'timestamp': datetime.utcnow().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Error getting dashboard stats: {e}")
            raise
    
    # ==================== Analysis Operations ====================
    
    def save_analysis(self, analysis_data: Dict[str, Any]) -> str:
        """Save an analysis result to Firestore"""
        try:
            analysis_data['created_at'] = datetime.utcnow().isoformat()
            doc_ref = self.analyses_collection.add(analysis_data)
            doc_id = doc_ref[1].id
            logger.info(f"Saved analysis: {doc_id}")
            return doc_id
            
        except Exception as e:
            logger.error(f"Error saving analysis: {e}")
            raise
    
    def get_analysis(self, analysis_id: str) -> Optional[Dict[str, Any]]:
        """Get an analysis by ID"""
        try:
            doc = self.analyses_collection.document(analysis_id).get()
            if doc.exists:
                analysis = doc.to_dict()
                analysis['id'] = doc.id
                return analysis
            return None
            
        except Exception as e:
            logger.error(f"Error getting analysis: {e}")
            raise
    
    def get_recent_analyses(self, project_id: Optional[str] = None, 
                           user_id: Optional[str] = None, 
                           limit: int = 10) -> List[Dict[str, Any]]:
        """Get recent analyses with optional filtering"""
        try:
            # Start with ordering by created_at
            query = self.analyses_collection.order_by('created_at', direction=firestore.Query.DESCENDING)
            
            # Apply limit
            query = query.limit(limit if not project_id and not user_id else 100)  # Get more if we need to filter
            
            analyses = []
            for doc in query.stream():
                analysis = doc.to_dict()
                
                # Filter in memory if needed (to avoid composite index requirement)
                if project_id and analysis.get('project_id') != project_id:
                    continue
                if user_id and analysis.get('user_id') != user_id:
                    continue
                    
                analysis['id'] = doc.id
                analyses.append(analysis)
                
                # Stop when we have enough results
                if len(analyses) >= limit:
                    break
            
            return analyses[:limit]  # Ensure we don't return more than requested
            
        except Exception as e:
            logger.error(f"Error getting recent analyses: {e}")
            raise

# Create a singleton instance
firestore_service = FirestoreService()