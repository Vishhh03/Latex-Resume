import os, time, threading, boto3, requests, json
from fastapi import FastAPI, BackgroundTasks
from contextlib import asynccontextmanager

# Configuration
S3_BUCKET = os.environ['STATE_BUCKET']
IDLE_TIMEOUT = 600  # 10 minutes
HOSTED_ZONE_ID = os.environ['HOSTED_ZONE_ID']
DOMAIN_NAME = "api.resume.yourdomain.com"
last_activity = time.time()

def self_destruct():
    """Checks for inactivity and stops the Fargate task."""
    global last_activity
    while True:
        time.sleep(60)
        if time.time() - last_activity > IDLE_TIMEOUT:
            print("Inactivity detected. Flushing state and shutting down...")
            # 1. Flush history to S3
            # 2. Stop self via ECS API
            ecs = boto3.client('ecs', region_name='us-east-1')
            task_arn = requests.get("http://169.254.170.2/v2/metadata").json()['TaskARN']
            ecs.stop_task(cluster='resume-cluster', task=task_arn, reason='Phantom shutdown')

def update_dns():
    """Announces Public IP to Route 53."""
    public_ip = requests.get("https://checkip.amazonaws.com").text.strip()
    r53 = boto3.client('route53')
    r53.change_resource_record_sets(
        HostedZoneId=HOSTED_ZONE_ID,
        ChangeBatch={'Changes': [{'Action': 'UPSERT', 'ResourceRecordSet': {
            'Name': DOMAIN_NAME, 'Type': 'A', 'TTL': 60,
            'ResourceRecords': [{'Value': public_ip}]
        }}]}
    )

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Update DNS and start timer
    update_dns()
    threading.Thread(target=self_destruct, daemon=True).start()
    yield
    # Shutdown logic here (e.g., S3 flush)

app = FastAPI(lifespan=lifespan)

@app.middleware("http")
async def track_activity(request, call_next):
    global last_activity
    last_activity = time.time()
    return await call_next(request)