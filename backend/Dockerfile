# Backend API image for ECS (linux/arm64).
# Build from repo root:
#   docker buildx build --platform linux/arm64 -f backend/Dockerfile -t … .

FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=5000

COPY backend/requirements.txt /app/backend/requirements.txt
RUN python3 -m pip install --no-cache-dir --upgrade pip \
    && python3 -m pip install --no-cache-dir -r /app/backend/requirements.txt

COPY alembic.ini /app/alembic.ini
COPY backend/ /app/backend/

EXPOSE 5000

# Checks Flask + Postgres (GET /health runs SELECT 1).
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD python3 -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:5000/health', timeout=4)"

CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--threads", "4", "--timeout", "120", "--access-logfile", "-", "--capture-output", "backend.app:app"]
