import boto3
import time
import json
import os
from config import DYNAMODB_TABLE_NAME

# Initialize DynamoDB resource
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(DYNAMODB_TABLE_NAME)

def get_history(conversation_id):
    """
    Retrieves the conversation history for a given ID.
    Returns a list of messages: [{"role": "user", "content": "..."}, ...]
    """
    if not conversation_id:
        return []

    try:
        response = table.get_item(Key={'conversation_id': conversation_id})
        if 'Item' in response:
            return response['Item'].get('messages', [])
        else:
            return []
    except Exception as e:
        print(f"Error fetching history for {conversation_id}: {e}")
        return []

def add_turn(conversation_id, user_message, assistant_message):
    """
    Appends a new user message and assistant message (list of patches or text) to history.
    """
    if not conversation_id:
        return

    # Structure messages
    new_messages = [
        {"role": "user", "content": user_message},
        {"role": "assistant", "content": json.dumps(assistant_message)} 
    ]
    
    try:
        # We need to append to the list. 
        # If item doesn't exist, Create it.
        # This is an atomic upsert operation using update_item
        table.update_item(
            Key={'conversation_id': conversation_id},
            UpdateExpression="SET messages = list_append(if_not_exists(messages, :empty_list), :new_msgs), updated_at = :timestamp",
            ExpressionAttributeValues={
                ':new_msgs': new_messages,
                ':empty_list': [],
                ':timestamp': int(time.time())
            }
        )
    except Exception as e:
        print(f"Error adding turn to {conversation_id}: {e}")
