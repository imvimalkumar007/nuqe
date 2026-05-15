FROM python:3.12-slim

WORKDIR /app

# Install build deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps first (cache layer)
COPY pyproject.toml .
COPY nuqe_engine/ ./nuqe_engine/
COPY nuqe_api/ ./nuqe_api/
COPY scripts/ ./scripts/
COPY migrations/ ./migrations/
RUN pip install --no-cache-dir -e ".[dev]"

# Non-root user
RUN useradd -u 1000 -m nuqe
USER nuqe

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"

# Entrypoint: migrate then start
CMD ["sh", "-c", "nuqe-engine migrate && exec uvicorn nuqe_api.app:create_app --factory --host 0.0.0.0 --port 8000"]
