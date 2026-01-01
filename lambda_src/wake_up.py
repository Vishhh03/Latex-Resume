import boto3
import os
import datetime
import time

SPEND_LIMIT = 0.50 # $0.50 USD

def handler(event, context):
    ecs = boto3.client('ecs')
    ec2 = boto3.client('ec2')
    dynamodb = boto3.client('dynamodb')
    cluster = os.environ['CLUSTER_NAME']

    # 1. Budget Check (Fail Fast)
    today = datetime.date.today().isoformat()
    try:
        current = dynamodb.get_item(
            TableName="DailySpend",
            Key={'date': {'S': today}}
        )
        total_str = current.get('Item', {}).get('total', {}).get('N', "0")
        if float(total_str) >= SPEND_LIMIT:
             return {
                 "status": "error", 
                 "message": "Daily Budget ($0.50) Exceeded. System is dormant."
             }
    except Exception as e:
        print(f"Budget check failed: {e}")
        # Fail safe - allow boot if DB error, or fail? Failing safe for cost = don't boot.
        return {"status": "error", "message": "Cost Guard Error. System Locked."}
    
    # 2. Check for running tasks
    active = ecs.list_tasks(cluster=cluster, desiredStatus='RUNNING')
    task_arns = active.get('taskArns', [])

    if not task_arns:
        # Start the task if not running
        print("Starting new task...")
        try:
            run_resp = ecs.run_task(
                cluster=cluster,
                taskDefinition=os.environ['TASK_DEFINITION'],
                launchType='FARGATE',
                capacityProviderStrategy=[{'capacityProvider': 'FARGATE_SPOT', 'weight': 1}],
                networkConfiguration={
                    'awsvpcConfiguration': {
                        'subnets': os.environ['SUBNETS'].split(','),
                        'assignPublicIp': 'ENABLED'
                    }
                }
            )
            return {"status": "booting", "message": "Resume Backend is waking up... Poll again in 10s"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    # 3. Get Public IP of the first running task
    print(f"Task found: {task_arns[0]}")
    desc_tasks = ecs.describe_tasks(cluster=cluster, tasks=[task_arns[0]])
    task = desc_tasks['tasks'][0]
    
    # Check if ENI is attached
    eni_id = None
    for att in task.get('attachments', []):
        if att['type'] == 'ElasticNetworkInterface':
            for d in att['details']:
                if d['name'] == 'networkInterfaceId':
                    eni_id = d['value']
                    break
    
    if not eni_id:
        # Task is likely PROVISIONING or PENDING
        return {"status": "booting", "message": "Task provisioning network..."}

    # 4. Get Public IP from ENI
    eni_desc = ec2.describe_network_interfaces(NetworkInterfaceIds=[eni_id])
    public_ip = eni_desc['NetworkInterfaces'][0].get('Association', {}).get('PublicIp')

    if public_ip:
         return {
             "status": "ready",
             "message": "Backend is active",
             "ip": public_ip,
             "url": f"http://{public_ip}:8000"
         }
    
    return {"status": "booting", "message": "Waiting for Public IP..."}