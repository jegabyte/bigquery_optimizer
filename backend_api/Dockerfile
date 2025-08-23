FROM python:3.10-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Set environment variables (can be overridden at runtime)
# These should be provided at deployment time
ENV GCP_PROJECT_ID=""
ENV BQ_PROJECT_ID=""
ENV BQ_DATASET="bq_optimizer"
ENV APP_ENV="production"

# Expose port
EXPOSE 8001

# Default to Firestore backend (can be overridden with BACKEND_TYPE env var)
ENV BACKEND_TYPE="firestore"

# Create a startup script that selects the right main file based on BACKEND_TYPE
RUN echo '#!/bin/sh\n\
if [ "$BACKEND_TYPE" = "firestore" ]; then\n\
    echo "Starting Firestore backend (main_firestore.py)..."\n\
    exec uvicorn main_firestore:app --host 0.0.0.0 --port 8001\n\
else\n\
    echo "Starting BigQuery backend (main.py)..."\n\
    exec uvicorn main:app --host 0.0.0.0 --port 8001\n\
fi' > /app/start.sh && chmod +x /app/start.sh

# Run the startup script
CMD ["/app/start.sh"]