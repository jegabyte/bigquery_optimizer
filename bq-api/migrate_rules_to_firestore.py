#!/usr/bin/env python3
"""
Script to migrate BigQuery anti-pattern rules from YAML to Firestore
"""
import yaml
import json
from datetime import datetime
from google.cloud import firestore

# Initialize Firestore client
db = firestore.Client(project='aiva-e74f3')

def load_rules_from_yaml(file_path):
    """Load rules from YAML file"""
    with open(file_path, 'r') as file:
        data = yaml.safe_load(file)
    return data

def migrate_rules_to_firestore(rules_data):
    """Migrate rules to Firestore"""
    rules_collection = db.collection('bq_anti_pattern_rules')
    
    # Store version info
    version_doc = {
        'version': rules_data.get('version', 1),
        'updated_at': datetime.now(),
        'migrated_from': 'bq_anti_patterns.yaml'
    }
    rules_collection.document('_metadata').set(version_doc)
    
    # Store each rule
    for rule in rules_data.get('rules', []):
        rule_id = rule['id']
        rule_doc = {
            'id': rule_id,
            'title': rule['title'],
            'severity': rule['severity'],
            'enabled': rule.get('enabled', True),
            'detect': rule['detect'],
            'fix': rule['fix'],
            'examples': rule.get('examples', {}),
            'created_at': datetime.now(),
            'updated_at': datetime.now(),
            'category': categorize_rule(rule_id),
            'order': rules_data['rules'].index(rule)
        }
        
        # Set the document with the rule ID as the document name
        rules_collection.document(rule_id).set(rule_doc)
        print(f"Migrated rule: {rule_id} - {rule['title']}")
    
    print(f"\nSuccessfully migrated {len(rules_data['rules'])} rules to Firestore")

def categorize_rule(rule_id):
    """Categorize rules based on their ID patterns"""
    if 'PARTITION' in rule_id:
        return 'Partitioning'
    elif 'JOIN' in rule_id:
        return 'Joins'
    elif 'WILDCARD' in rule_id or 'TABLE' in rule_id:
        return 'Table Access'
    elif 'SELECT' in rule_id or 'WHERE' in rule_id or 'FILTER' in rule_id:
        return 'Query Structure'
    elif 'ORDER' in rule_id or 'LIMIT' in rule_id:
        return 'Result Sets'
    elif 'CTE' in rule_id or 'SUBQUERY' in rule_id:
        return 'Subqueries & CTEs'
    elif 'DISTINCT' in rule_id or 'REGEX' in rule_id:
        return 'Performance'
    else:
        return 'General'

def verify_migration():
    """Verify the migration by reading back from Firestore"""
    rules_collection = db.collection('bq_anti_pattern_rules')
    
    # Get metadata
    metadata = rules_collection.document('_metadata').get()
    if metadata.exists:
        print(f"\nMetadata: Version {metadata.to_dict()['version']}")
    
    # Count rules
    rules = rules_collection.stream()
    rule_count = 0
    for rule in rules:
        if rule.id != '_metadata':
            rule_count += 1
    
    print(f"Total rules in Firestore: {rule_count}")
    return rule_count

if __name__ == "__main__":
    # Load rules from YAML
    yaml_path = "../backend/app/bq_anti_patterns.yaml"
    print(f"Loading rules from {yaml_path}...")
    rules_data = load_rules_from_yaml(yaml_path)
    
    # Migrate to Firestore
    print(f"Migrating {len(rules_data['rules'])} rules to Firestore...")
    migrate_rules_to_firestore(rules_data)
    
    # Verify migration
    verify_migration()