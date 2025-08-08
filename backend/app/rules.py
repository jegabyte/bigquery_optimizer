import yaml
import json
from pathlib import Path
from typing import List, Dict, Any
from app.models import Rule, RulesetConfig
import aiofiles

class RulesetManager:
    def __init__(self):
        self.rules: List[Rule] = []
        self.version: int = 1
        self.rules_path = Path(__file__).parent / "config" / "rules.yaml"
        
    async def load_rules(self):
        try:
            if not self.rules_path.exists():
                await self._create_default_rules()
            
            async with aiofiles.open(self.rules_path, 'r') as f:
                content = await f.read()
                data = yaml.safe_load(content)
                config = RulesetConfig(**data)
                self.rules = config.rules
                self.version = config.version
        except Exception as e:
            print(f"Error loading rules: {e}")
            await self._create_default_rules()
            await self.load_rules()
    
    async def _create_default_rules(self):
        default_rules = {
            "version": 1,
            "rules": [
                {
                    "id": "NO_SELECT_STAR",
                    "name": "Avoid SELECT *",
                    "severity": "warning",
                    "enabled": True,
                    "requires_metadata": False,
                    "detection_instructions": "Flag if any SELECT list contains '*' except COUNT(*), SELECT * EXCEPT(...), or SELECT * REPLACE(...).",
                    "remediation_instructions": "Replace '*' with specific columns from the table schema.",
                    "bad_examples": ["SELECT * FROM `project.dataset.table`"],
                    "good_examples": ["SELECT id, name, created_at FROM `project.dataset.table`"]
                },
                {
                    "id": "MISSING_PARTITION_FILTER",
                    "name": "Missing Partition Filter",
                    "severity": "error",
                    "enabled": True,
                    "requires_metadata": True,
                    "detection_instructions": "For partitioned tables, check if WHERE clause filters on the partition column.",
                    "remediation_instructions": "Add a WHERE clause filtering on the partition column to reduce data scanned.",
                    "bad_examples": ["SELECT * FROM partitioned_table"],
                    "good_examples": ["SELECT * FROM partitioned_table WHERE date >= '2024-01-01'"]
                },
                {
                    "id": "INEFFICIENT_JOIN_ORDER",
                    "name": "Inefficient Join Order",
                    "severity": "warning",
                    "enabled": True,
                    "requires_metadata": True,
                    "detection_instructions": "Check if smaller tables are joined before larger tables.",
                    "remediation_instructions": "Reorder joins to process smaller tables first.",
                    "bad_examples": ["SELECT * FROM large_table JOIN small_table ON ..."],
                    "good_examples": ["SELECT * FROM small_table JOIN large_table ON ..."]
                },
                {
                    "id": "MISSING_LIMIT",
                    "name": "Missing LIMIT Clause",
                    "severity": "info",
                    "enabled": True,
                    "requires_metadata": False,
                    "detection_instructions": "Check if query without aggregation has a LIMIT clause.",
                    "remediation_instructions": "Add LIMIT clause to prevent scanning unnecessary rows.",
                    "bad_examples": ["SELECT * FROM table WHERE condition"],
                    "good_examples": ["SELECT * FROM table WHERE condition LIMIT 1000"]
                },
                {
                    "id": "CROSS_JOIN_WARNING",
                    "name": "Cross Join Detected",
                    "severity": "error",
                    "enabled": True,
                    "requires_metadata": False,
                    "detection_instructions": "Detect CROSS JOIN or implicit cross joins (comma-separated tables without join condition).",
                    "remediation_instructions": "Replace with proper JOIN with ON condition or ensure cross join is intentional.",
                    "bad_examples": ["SELECT * FROM table1, table2"],
                    "good_examples": ["SELECT * FROM table1 JOIN table2 ON table1.id = table2.id"]
                },
                {
                    "id": "SUBQUERY_IN_WHERE",
                    "name": "Subquery in WHERE Clause",
                    "severity": "warning",
                    "enabled": True,
                    "requires_metadata": False,
                    "detection_instructions": "Detect subqueries in WHERE clause that could be replaced with JOIN.",
                    "remediation_instructions": "Replace subquery with JOIN for better performance.",
                    "bad_examples": ["SELECT * FROM t1 WHERE id IN (SELECT id FROM t2)"],
                    "good_examples": ["SELECT t1.* FROM t1 JOIN t2 ON t1.id = t2.id"]
                },
                {
                    "id": "REGEXP_IN_WHERE",
                    "name": "Regular Expression in WHERE",
                    "severity": "warning",
                    "enabled": True,
                    "requires_metadata": False,
                    "detection_instructions": "Detect REGEXP_CONTAINS or regex patterns in WHERE clause.",
                    "remediation_instructions": "Use LIKE or equality checks when possible for better performance.",
                    "bad_examples": ["SELECT * FROM table WHERE REGEXP_CONTAINS(column, r'^prefix')"],
                    "good_examples": ["SELECT * FROM table WHERE column LIKE 'prefix%'"]
                },
                {
                    "id": "UNNECESSARY_DISTINCT",
                    "name": "Unnecessary DISTINCT",
                    "severity": "info",
                    "enabled": True,
                    "requires_metadata": False,
                    "detection_instructions": "Check for DISTINCT used with columns that are already unique (like primary keys).",
                    "remediation_instructions": "Remove DISTINCT when selecting unique columns.",
                    "bad_examples": ["SELECT DISTINCT id FROM table"],
                    "good_examples": ["SELECT id FROM table"]
                }
            ]
        }
        
        self.rules_path.parent.mkdir(parents=True, exist_ok=True)
        async with aiofiles.open(self.rules_path, 'w') as f:
            await f.write(yaml.dump(default_rules, default_flow_style=False, sort_keys=False))
    
    def get_active_rules(self) -> List[Dict[str, Any]]:
        return [rule.dict() for rule in self.rules if rule.enabled]
    
    def get_rules_for_prompt(self) -> str:
        rules_text = []
        for rule in self.rules:
            if rule.enabled:
                rules_text.append(f"""
Rule ID: {rule.id}
Name: {rule.name}
Severity: {rule.severity}
Detection: {rule.detection_instructions}
Remediation: {rule.remediation_instructions}
Bad Examples: {', '.join(rule.bad_examples)}
Good Examples: {', '.join(rule.good_examples)}
""")
        return "\n".join(rules_text)