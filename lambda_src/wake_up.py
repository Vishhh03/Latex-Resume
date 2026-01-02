import boto3
import os
import datetime
import json

SPEND_LIMIT = 0.50 

def handler(event, context):
    ecs = boto3.client('ecs')
    ec2 = boto3.client('ec2')
    dynamodb = boto3.client('dynamodb')
    
    cluster = os.environ['CLUSTER_NAME']
    task_def = os.environ['TASK_DEFINITION']
    subnets = os.environ['SUBNETS'].split(',')

    # 1. Budget Check
    today = datetime.date.today().isoformat()
    try:
        current = dynamodb.get_item(TableName="DailySpend", Key={'date': {'S': today}})
        total_str = current.get('Item', {}).get('total', {}).get('N', "0")
        if float(total_str) >= SPEND_LIMIT:
             return {"status": "error", "message": "Daily Budget Exceeded."}
    except Exception as e:
        print(f"Budget check failed: {e}")
        return {"status": "error", "message": "Cost Guard Error."}
    
    # 2. Check for PENDING or RUNNING tasks (Fixes the duplicate task bug)
    # We check for all non-stopped tasks
    active = ecs.list_tasks(cluster=cluster, desiredStatus='RUNNING')
    pending = ecs.list_tasks(cluster=cluster, desiredStatus='PENDING')
    task_arns = active.get('taskArns', []) + pending.get('taskArns', [])

    if not task_arns:
        print("Starting new task...")
        try:
            ecs.run_task(
                cluster=cluster,
                taskDefinition=task_def,
                platformVersion='1.4.0', # Required for SOCI
                capacityProviderStrategy=[{'capacityProvider': 'FARGATE_SPOT', 'weight': 1}],
                networkConfiguration={
                    'awsvpcConfiguration': {
                        'subnets': subnets,
                        'assignPublicIp': 'ENABLED'
                    }
                }
            )
            return {"status": "booting", "message": "Igniting Resume Engine... Check back in 15s."}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    # 3. Get Network Info
    desc_tasks = ecs.describe_tasks(cluster=cluster, tasks=[task_arns[0]])
    task = desc_tasks['tasks'][0]
    last_status = task.get('lastStatus')
    
    # Find ENI
    eni_id = next((d['value'] for att in task.get('attachments', []) 
                   for d in att['details'] if d['name'] == 'networkInterfaceId'), None)
    
    if not eni_id or last_status != 'RUNNING':
        return {"status": "booting", "message": f"Task is {last_status}..."}

    # 4. Extract Public IP
    try:
        eni_desc = ec2.describe_network_interfaces(NetworkInterfaceIds=[eni_id])
        public_ip = eni_desc['NetworkInterfaces'][0].get('Association', {}).get('PublicIp')
        
        if public_ip:
            return {
                "status": "ready",
                "ip": public_ip,
                "url": f"http://{public_ip}:8000"
            }
    except Exception as e:
        print(f"Network interface not ready: {e}")

    return {"status": "booting", "message": "Finalizing network routes..."}