import boto3
import os
import datetime
import json

# Set this to match your backend's spend logic
SPEND_LIMIT = 0.50 

def create_response(status_code, body):
    """Helper to return JSON responses."""
    return {
        "statusCode": status_code,
        "headers": { "Content-Type": "application/json" },
        "body": json.dumps(body)
    }

def handler(event, context):
    ecs = boto3.client('ecs')
    ec2 = boto3.client('ec2')
    dynamodb = boto3.client('dynamodb')
    
    cluster = os.environ['CLUSTER_NAME']
    task_def = os.environ['TASK_DEFINITION']
    subnets = os.environ['SUBNETS'].split(',')
    security_group = os.environ['SECURITY_GROUP']

    # 1. Budget Guard (Fail Fast)
    today = datetime.date.today().isoformat()
    try:
        current = dynamodb.get_item(TableName="DailySpend", Key={'date': {'S': today}})
        total_str = current.get('Item', {}).get('total', {}).get('N', "0")
        if float(total_str) >= SPEND_LIMIT:
             return create_response(402, {"status": "error", "message": "Daily Budget Exceeded."})
    except Exception as e:
        print(f"Spend Check Error: {e}")
        return create_response(500, {"status": "error", "message": "Spend Guard Failure."})
    
    # 2. Check for PENDING or RUNNING tasks
    # This prevents duplicate launches if the user double-clicks the wake button
    active = ecs.list_tasks(cluster=cluster, desiredStatus='RUNNING')
    pending = ecs.list_tasks(cluster=cluster, desiredStatus='PENDING')
    task_arns = active.get('taskArns', []) + pending.get('taskArns', [])

    if not task_arns:
        print("Starting new Fargate Spot task...")
        try:
            ecs.run_task(
                cluster=cluster,
                taskDefinition=task_def,
                platformVersion='1.4.0', # Explicitly required for SOCI lazy-loading
                capacityProviderStrategy=[{'capacityProvider': 'FARGATE_SPOT', 'weight': 1}],
                networkConfiguration={
                    'awsvpcConfiguration': {
                        'subnets': subnets,
                        'securityGroups': [security_group],
                        'assignPublicIp': 'ENABLED'
                    }
                }
            )
            return create_response(202, {"status": "booting", "message": "Igniting Resume Engine..."})
        except Exception as e:
            return create_response(500, {"status": "error", "message": str(e)})

    # 3. Task Status Investigation
    desc_tasks = ecs.describe_tasks(cluster=cluster, tasks=[task_arns[0]])
    task = desc_tasks['tasks'][0]
    last_status = task.get('lastStatus')
    
    # 4. Extract the Elastic Network Interface (ENI) ID
    eni_id = next((d['value'] for att in task.get('attachments', []) 
                   for d in att['details'] if d['name'] == 'networkInterfaceId'), None)
    
    # If the task isn't 'RUNNING' yet, the ENI or Public IP might not be ready
    if not eni_id or last_status != 'RUNNING':
        return create_response(200, {"status": "booting", "message": f"Task is {last_status}..."})

    # 5. Extract the Public IP from the EC2 Network Interface
    try:
        eni_desc = ec2.describe_network_interfaces(NetworkInterfaceIds=[eni_id])
        public_ip = eni_desc['NetworkInterfaces'][0].get('Association', {}).get('PublicIp')
        
        if public_ip:
            return create_response(200, {
                "status": "ready",
                "ip": public_ip,
                "url": f"http://{public_ip}:8000"
            })
    except Exception as e:
        print(f"IP Discovery Error: {e}")

    return create_response(200, {"status": "booting", "message": "Finalizing network..."})