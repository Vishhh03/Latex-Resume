import boto3
import os
import json
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def handler(event, context):
    logger.info("💰 Budget Kill Switch Triggered! 💰")
    logger.info(json.dumps(event))

    ecs = boto3.client('ecs')
    lmb = boto3.client('lambda')
    
    cluster = os.environ['CLUSTER_NAME']
    wakeup_function_name = os.environ['WAKEUP_FUNCTION_NAME']
    
    results = {
        "tasks_stopped": 0,
        "lambda_disabled": False,
        "errors": []
    }

    # 1. Stop all ECS Tasks
    try:
        # List all running and pending tasks
        running = ecs.list_tasks(cluster=cluster, desiredStatus='RUNNING')
        pending = ecs.list_tasks(cluster=cluster, desiredStatus='PENDING')
        task_arns = running.get('taskArns', []) + pending.get('taskArns', [])

        if task_arns:
            logger.info(f"Stopping {len(task_arns)} tasks...")
            for task_arn in task_arns:
                ecs.stop_task(
                    cluster=cluster,
                    task=task_arn,
                    reason='Stopped by Budget Kill Switch'
                )
                results["tasks_stopped"] += 1
        else:
            logger.info("No ECS tasks running.")

    except Exception as e:
        logger.error(f"Error stopping tasks: {e}")
        results["errors"].append(f"ECS Stop Error: {str(e)}")

    # 2. Disable Wakeup Lambda (Set Concurrency to 0)
    try:
        logger.info(f"Disabling Wakeup Lambda: {wakeup_function_name}")
        lmb.put_function_concurrency(
            FunctionName=wakeup_function_name,
            ReservedConcurrentExecutions=0
        )
        results["lambda_disabled"] = True
        logger.info("Wakeup Lambda disabled (Concurrency set to 0).")
        
    except Exception as e:
        logger.error(f"Error disabling lambda: {e}")
        results["errors"].append(f"Lambda Disable Error: {str(e)}")

    return {
        "statusCode": 200,
        "body": json.dumps(results)
    }
