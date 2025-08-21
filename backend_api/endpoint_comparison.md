# Endpoint Comparison: main.py vs main_firestore.py

## Endpoints in main.py but NOT in main_firestore.py:
1. POST `/api/projects/check-permissions` - Check BigQuery permissions
2. POST `/api/projects/validate-access` - Validate project access
3. POST `/api/projects/scan-information-schema` - Scan using INFORMATION_SCHEMA
4. PUT `/api/analyses/{analysis_id}` - Update analysis
5. DELETE `/api/analyses/{analysis_id}` - Delete analysis
6. POST `/api/projects/analyze-tables` - Analyze table performance
7. GET `/api/projects/{project_id}/table-analysis` - Get table analysis results

## Endpoints in main_firestore.py but NOT in main.py:
1. GET `/api/templates/{project_id}/{template_id}/analysis` - Get specific template analysis

## Common endpoints (exist in both):
1. GET `/health`
2. GET `/api/dashboard/stats`
3. POST `/api/projects/scan`
4. POST `/api/projects`
5. GET `/api/projects`
6. GET `/api/projects/{project_id}/templates`
7. POST `/api/projects/{project_id}/refresh`
8. DELETE `/api/projects/{project_id}`
9. POST `/api/analyses`
10. GET `/api/analyses/{analysis_id}`
11. GET `/api/analyses`
12. POST `/api/templates/save-analysis`
13. GET `/api/templates/{project_id}`
14. GET `/api/rules`
15. GET `/api/rules/{rule_id}`
16. PUT `/api/rules/{rule_id}/toggle`
17. POST `/api/rules`
18. PUT `/api/rules/{rule_id}`
19. DELETE `/api/rules/{rule_id}`