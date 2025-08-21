"""
Firestore management for query templates and analysis results
"""
from google.cloud import firestore
from datetime import datetime
import hashlib
import json
from typing import Dict, List, Optional, Any

class TemplateFirestoreManager:
    def __init__(self, project_id: str = None):
        if not project_id:
            import os
            project_id = os.getenv('GCP_PROJECT_ID', os.getenv('GOOGLE_CLOUD_PROJECT'))
        self.db = firestore.Client(project=project_id)
        self.templates_collection = "templates"  # Use existing collection
        self.analysis_collection = "template_analysis_results"
    
    def _generate_template_id(self, project_id: str, sql_pattern: str) -> str:
        """Generate a unique ID for a template based on project and SQL pattern"""
        content = f"{project_id}:{sql_pattern}"
        return hashlib.md5(content.encode()).hexdigest()
    
    def save_template(self, project_id: str, template_data: Dict) -> str:
        """Save or update a query template"""
        # Use sqlSnippet or sql_pattern for ID generation (whichever is available)
        sql_for_id = template_data.get('sqlSnippet') or template_data.get('sql_pattern', '')
        template_id = self._generate_template_id(project_id, sql_for_id)
        
        doc_ref = self.db.collection(self.templates_collection).document(template_id)
        
        # Add metadata
        template_data['project_id'] = project_id
        template_data['template_id'] = template_id
        template_data['last_updated'] = datetime.utcnow().isoformat()
        
        # Check if template exists
        doc = doc_ref.get()
        if doc.exists:
            # Merge with existing data to preserve analysis results reference
            existing_data = doc.to_dict()
            template_data['created_at'] = existing_data.get('created_at', datetime.utcnow().isoformat())
            template_data['analysis_result_id'] = existing_data.get('analysis_result_id')
            template_data['analysis_status'] = existing_data.get('analysis_status', 'new')
            template_data['compliance_score'] = existing_data.get('compliance_score')
        else:
            template_data['created_at'] = datetime.utcnow().isoformat()
            template_data['analysis_status'] = 'new'
        
        doc_ref.set(template_data, merge=True)
        return template_id
    
    def get_project_templates(self, project_id: str) -> List[Dict]:
        """Get all templates for a project with optimized batch loading"""
        templates = []
        analysis_ids = []
        template_docs = []
        
        # First, get all templates for the project
        docs = self.db.collection(self.templates_collection)\
            .where('project_id', '==', project_id)\
            .stream()
        
        for doc in docs:
            template = doc.to_dict()
            template['id'] = doc.id
            template_docs.append(template)
            
            # Collect analysis IDs for batch loading
            if template.get('analysis_result_id'):
                analysis_ids.append(template['analysis_result_id'])
        
        # Batch load all analysis results at once if there are any
        analysis_map = {}
        if analysis_ids:
            # Use getAll for batch fetching (much faster than individual gets)
            from concurrent.futures import ThreadPoolExecutor, as_completed
            
            def fetch_analysis(aid):
                try:
                    doc = self.db.collection(self.analysis_collection).document(aid).get()
                    if doc.exists:
                        return (doc.id, doc.to_dict())
                except Exception as e:
                    print(f"Error fetching analysis {aid}: {e}")
                    return None
            
            # Fetch all analysis documents in parallel
            with ThreadPoolExecutor(max_workers=10) as executor:
                futures = [executor.submit(fetch_analysis, aid) for aid in analysis_ids]
                for future in as_completed(futures):
                    result = future.result()
                    if result:
                        analysis_map[result[0]] = result[1]
        
        # Now combine templates with their analysis results
        for template in template_docs:
            if template.get('analysis_result_id') and template['analysis_result_id'] in analysis_map:
                template['has_analysis'] = True
                template['analysis_timestamp'] = analysis_map[template['analysis_result_id']].get('timestamp')
                # Include the full analysis result for frontend
                template['analysis_result'] = analysis_map[template['analysis_result_id']].get('result')
            
            templates.append(template)
        
        return templates
    
    def save_analysis_result(self, project_id: str, template_id: str, result: Dict) -> str:
        """Save analysis result for a template"""
        # If template_id is not the hash format, we might need to look it up
        # But for now, we'll assume it's already the correct format
        
        # Create analysis document
        analysis_id = f"{template_id}_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
        analysis_ref = self.db.collection(self.analysis_collection).document(analysis_id)
        
        analysis_data = {
            'template_id': template_id,
            'project_id': project_id,
            'result': result,
            'timestamp': datetime.utcnow().isoformat(),
            'version': '1.0'
        }
        
        analysis_ref.set(analysis_data)
        
        # Update template with analysis reference
        # First check if the template exists
        template_ref = self.db.collection(self.templates_collection).document(template_id)
        if not template_ref.get().exists:
            # Try to find template by project_id and template_id combo
            templates = self.db.collection(self.templates_collection)\
                .where('project_id', '==', project_id)\
                .where('template_id', '==', template_id)\
                .limit(1)\
                .stream()
            
            for doc in templates:
                template_ref = self.db.collection(self.templates_collection).document(doc.id)
                break
        
        template_ref.update({
            'analysis_result_id': analysis_id,
            'analysis_status': 'completed',
            'compliance_score': result.get('metadata', {}).get('optimizationScore'),
            'last_analysis': datetime.utcnow().isoformat()
        })
        
        return analysis_id
    
    def get_analysis_result(self, analysis_id: str) -> Optional[Dict]:
        """Get analysis result by ID"""
        doc = self.db.collection(self.analysis_collection).document(analysis_id).get()
        if doc.exists:
            return doc.to_dict()
        return None
    
    def get_template_analysis(self, template_id: str) -> Optional[Dict]:
        """Get the latest analysis result for a template"""
        # Get template to find analysis ID
        template_doc = self.db.collection(self.templates_collection).document(template_id).get()
        if template_doc.exists:
            template = template_doc.to_dict()
            if template.get('analysis_result_id'):
                return self.get_analysis_result(template['analysis_result_id'])
        return None
    
    def batch_save_templates(self, project_id: str, templates: List[Dict]) -> List[str]:
        """Save multiple templates efficiently"""
        batch = self.db.batch()
        template_ids = []
        
        for template_data in templates:
            # Use sqlSnippet or sql_pattern for ID generation (whichever is available)
            sql_for_id = template_data.get('sqlSnippet') or template_data.get('sql_pattern', '')
            template_id = self._generate_template_id(project_id, sql_for_id)
            template_ids.append(template_id)
            
            doc_ref = self.db.collection(self.templates_collection).document(template_id)
            
            # Check if exists to preserve analysis data
            existing_doc = doc_ref.get()
            if existing_doc.exists:
                existing_data = existing_doc.to_dict()
                template_data['analysis_result_id'] = existing_data.get('analysis_result_id')
                template_data['analysis_status'] = existing_data.get('analysis_status', 'new')
                template_data['compliance_score'] = existing_data.get('compliance_score')
                template_data['created_at'] = existing_data.get('created_at')
            else:
                template_data['created_at'] = datetime.utcnow().isoformat()
                template_data['analysis_status'] = 'new'
            
            template_data['project_id'] = project_id
            template_data['template_id'] = template_id
            template_data['last_updated'] = datetime.utcnow().isoformat()
            
            batch.set(doc_ref, template_data, merge=True)
        
        batch.commit()
        return template_ids
    
    def update_template_metrics(self, template_id: str, metrics: Dict) -> bool:
        """Update template metrics from latest INFORMATION_SCHEMA data"""
        try:
            doc_ref = self.db.collection(self.templates_collection).document(template_id)
            doc_ref.update({
                'runs': metrics.get('runs'),
                'avgBytesProcessed': metrics.get('avgBytesProcessed'),
                'bytesProcessedP90': metrics.get('bytesProcessedP90'),
                'avgRuntime': metrics.get('avgRuntime'),
                'runtimeP50': metrics.get('runtimeP50'),
                'avgCostPerRun': metrics.get('avgCostPerRun'),
                'totalCost': metrics.get('totalCost'),
                'last_metrics_update': datetime.utcnow().isoformat()
            })
            return True
        except Exception as e:
            print(f"Error updating template metrics: {e}")
            return False