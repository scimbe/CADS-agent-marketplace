# Built by the installer with `build.network: none` (guardrail rule F.8): no package index is
# reachable at build time, so this image is the pinned base plus one stdlib-only file. Nothing
# is installed. Refresh the digest with: docker buildx imagetools inspect python:3.12-slim
FROM python:3.12-slim@sha256:78387bc3881b8273120a12ebe6c1ab22b018ccc2c9adf565ae1ac9b536e184ea
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
WORKDIR /app
COPY app.py .
# Unprivileged, non-existent uid/gid: the process needs no identity, no home, no shell.
USER 65532:65532
EXPOSE 8080
CMD ["python", "app.py"]
