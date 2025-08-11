"""
Fetch BigQuery anti-pattern rules from Firestore
"""
import logging
import yaml

logger = logging.getLogger(__name__)

def fetch_rules_from_firestore(project_id='aiva-e74f3'):
    """
    Fetch anti-pattern rules from Firestore and convert to YAML format
    for compatibility with existing agents
    """
    try:
        # Try to import firestore
        try:
            from google.cloud import firestore
        except ImportError as e:
            logger.warning(f"Could not import firestore: {e}")
            raise ImportError("google-cloud-firestore is not installed or configured")
        
        # Initialize Firestore client
        db = firestore.Client(project=project_id)
        
        # Get all rules from the collection
        rules_collection = db.collection('bq_anti_pattern_rules')
        
        # Get metadata
        metadata_doc = rules_collection.document('_metadata').get()
        version = 2  # Default version
        if metadata_doc.exists:
            version = metadata_doc.to_dict().get('version', 2)
        
        # Get all rules
        rules = []
        for doc in rules_collection.stream():
            if doc.id != '_metadata':
                rule_data = doc.to_dict()
                # Convert to expected format
                rule = {
                    'id': rule_data.get('id'),
                    'title': rule_data.get('title'),
                    'severity': rule_data.get('severity'),
                    'enabled': rule_data.get('enabled', True),
                    'detect': rule_data.get('detect'),
                    'fix': rule_data.get('fix')
                }
                
                # Add examples if they exist
                if rule_data.get('examples'):
                    rule['examples'] = rule_data['examples']
                
                rules.append(rule)
        
        # Sort rules by order if it exists, otherwise by ID
        rules.sort(key=lambda x: (x.get('order', 999), x['id']))
        
        # Convert to YAML format
        rules_dict = {
            'version': version,
            'rules': rules
        }
        
        yaml_content = yaml.dump(rules_dict, default_flow_style=False, sort_keys=False)
        
        logger.info(f"✅ Loaded {len(rules)} rules from Firestore")
        return yaml_content
        
    except ImportError:
        # Re-raise import errors to be handled by caller
        raise
    except Exception as e:
        logger.error(f"❌ Failed to load rules from Firestore: {e}")
        # Return minimal fallback rules
        return """
version: 2
rules:
  - id: NO_SELECT_STAR
    title: "Avoid SELECT *"
    severity: warning
    enabled: true
    detect: "Flag wildcard projection (* or t.*) except COUNT(*), * EXCEPT(...), or * REPLACE(...)."
    fix: "Select only required columns."
  - id: MISSING_PARTITION_FILTER
    title: "Missing partition filter"
    severity: error
    enabled: true
    detect: "Partitioned table read without a WHERE on its partition column."
    fix: "Add a constant/param range filter on the partition column."
"""