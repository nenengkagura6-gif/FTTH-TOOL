import os
from celery import Celery
from dotenv import load_dotenv
import sentry_sdk
from sentry_sdk.integrations.celery import CeleryIntegration

load_dotenv()

sentry_dsn = os.environ.get("SENTRY_DSN_PYTHON")
if sentry_dsn:
    sentry_sdk.init(
        dsn=sentry_dsn,
        integrations=[CeleryIntegration()],
        traces_sample_rate=1.0,
        profiles_sample_rate=1.0,
    )
    print("Sentry initialized for Celery Worker")

# Use Redis as the broker and result backend. 
# Defaults to localhost if not specified in .env
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "worker",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["tasks"]
)

# Optional configuration
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    worker_prefetch_multiplier=1, # Good for long-running tasks
)

# Celery Beat Schedule
from celery.schedules import crontab

celery_app.conf.beat_schedule = {
    'cleanup-expired-jobs-every-midnight': {
        'task': 'cleanup_expired_jobs_task',
        'schedule': crontab(minute=0, hour=0), # Every midnight UTC
    },
}
