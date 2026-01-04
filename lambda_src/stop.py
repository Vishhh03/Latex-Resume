import boto3
import os
import json

def create_response(status_code, body):
    """Helper to return JSON responses."""
    return {
        "statusCode": status_code,
        "headers": { "Content-Type": "application/json" },
        "body": json.dumps(body)
    }

def handler(event, context):
    ecs = boto3.client('ecs')
    cluster = os.environ['CLUSTER_NAME']

    try:
        # List all running and pending tasks
        running = ecs.list_tasks(cluster=cluster, desiredStatus='RUNNING')
        pending = ecs.list_tasks(cluster=cluster, desiredStatus='PENDING')
        task_arns = running.get('taskArns', []) + pending.get('taskArns', [])

        if not task_arns:
            return create_response(200, {
                "status": "stopped",
                "message": "No tasks running."
            })

        # Stop all tasks
        stopped_count = 0
        for task_arn in task_arns:
            ecs.stop_task(
                cluster=cluster,
                task=task_arn,
                reason='Stopped via CLI'
            )
            stopped_count += 1

        return create_response(200, {
            "status": "stopped",
            "message": f"Stopped {stopped_count} task(s)."
        })

    except Exception as e:
        return create_response(500, {
            "status": "error",
            "message": str(e)
        })
