# Multi-stage: bouwt eerst de frontend, dan het Python-image.
# Context = repo-root (zie compose.yml).

FROM node:24-slim AS frontend
WORKDIR /build
RUN corepack enable
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend/ ./
RUN pnpm build

FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS backend
WORKDIR /srv/app
ENV UV_COMPILE_BYTECODE=1 UV_NO_CACHE=1
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY backend/app ./app
COPY backend/alembic ./alembic
COPY backend/alembic.ini ./
COPY --from=frontend /build/dist ./static
ENV PATH="/srv/app/.venv/bin:$PATH"
EXPOSE 8000
CMD ["uvicorn", "app.main_api:app", "--host", "0.0.0.0", "--port", "8000"]
