"""
nuqe_api — REST API layer for the Nuqe obligation engine.

Use create_app() to construct the FastAPI application.

Uvicorn entrypoint (factory mode):
    uvicorn nuqe_api.app:create_app --factory --host 0.0.0.0 --port 8000

For tests, import create_app and pass a Settings fixture to avoid reading
real env vars.
"""

from nuqe_api.app import create_app

__all__ = ["create_app"]
__version__ = "0.2.0"
