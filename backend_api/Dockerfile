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

# Run the Firestore-based application
CMD ["uvicorn", "main_firestore:app", "--host", "0.0.0.0", "--port", "8001"]