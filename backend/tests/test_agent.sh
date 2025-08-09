#!/bin/bash

# BigQuery Optimizer Agent Test Script
SERVICE_URL="https://bigquery-optimizer-backend-puql6kbaxq-uc.a.run.app"

echo "Testing BigQuery Optimizer Agent..."
echo "=================================="

# Test with sample BigQuery metadata
curl -X POST "$SERVICE_URL/run" \
  -H "Content-Type: application/json" \
  -d '{
    "appName": ".",
    "userId": "test-user",
    "sessionId": "test-session-123",
    "newMessage": {
      "parts": [
        {
          "text": "Analyze these BigQuery tables: analytics.user_events (5M rows, 2GB, partitioned by event_date, clustered by user_id and event_type) and analytics.daily_aggregates (365K rows, 512MB, no partitioning)"
        }
      ]
    },
    "streaming": true
  }'

echo ""
echo "=================================="
echo "Test complete!"