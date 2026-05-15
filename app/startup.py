"""
Startup script for local development
"""
import os
import sys
import uvicorn

if __name__ == "__main__":
    print("=" * 60)
    print("KML Processing API - Local Development Server")
    print("=" * 60)
    print("\nAvailable endpoints:")
    print("  - http://127.0.0.1:8000/          (Health check)")
    print("  - http://127.0.0.1:8000/docs      (API Documentation)")
    print("  - http://127.0.0.1:8000/kml-to-excel")
    print("  - http://127.0.0.1:8000/apd-hpdb")
    print("  - http://127.0.0.1:8000/check-duplicates")
    print("\nPress Ctrl+C to stop\n")
    
    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
        log_level="info"
    )