import boto3
from datetime import datetime

# DynamoDB table 'DailySpend' with Partition Key 'date' (String)
LIMIT = 1.00 # $1.00 Max per day

def handler(event, context):
    db = boto3.resource('dynamodb')
    table = db.Table('DailySpend')
    today = datetime.now().strftime('%Y-%m-%d')
    
    # 1. Check current spend
    res = table.get_item(Key={'date': today})
    current_spend = float(res.get('Item', {}).get('total', 0))
    
    if current_spend > LIMIT:
        return {"statusCode": 402, "body": "Daily AI budget exhausted."}

    # 2. Proxy request to Bedrock
    bedrock = boto3.client('bedrock-runtime')
    response = bedrock.invoke_model(...) # Your normal Bedrock call
    
    # 3. Update spend based on token count (Estimate)
    # Price per 1k tokens for Llama 3 varies; update 'total' here
    table.update_item(...) 
    
    return response