FROM python:3.10-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Set environment variables for Firestore
ENV GOOGLE_CLOUD_PROJECT="aiva-e74f3"
ENV BQ_PROJECT_ID="aiva-e74f3"

# Expose port
EXPOSE 8001

# Run the Firestore-based application
CMD ["uvicorn", "main_firestore:app", "--host", "0.0.0.0", "--port", "8001"]