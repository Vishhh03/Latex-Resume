import json
import os
import boto3
import subprocess
import base64
import uuid

s3 = boto3.client('s3')
BUCKET_NAME = os.environ.get('PDF_BUCKET')

def handler(event, context):
    try:
        # 1. Parse Input
        body = json.loads(event.get('body', '{}'))
        latex_content = body.get('latex')
        
        if not latex_content:
            return {"statusCode": 400, "body": "Missing 'latex' in body"}

        # 2. Write to /tmp
        job_id = str(uuid.uuid4())
        tex_file = f"/tmp/{job_id}.tex"
        pdf_file = f"/tmp/{job_id}.pdf"
        
        with open(tex_file, 'w') as f:
            f.write(latex_content)
            
        # 3. Compile with Tectonic
        # Tectonic is installed in /usr/local/bin by Dockerfile
        cmd = ["tectonic", tex_file]
        subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        
        # 4. Upload to S3
        key = f"previews/{job_id}.pdf"
        s3.upload_file(pdf_file, BUCKET_NAME, key)
        
        # 5. Generate Presigned URL
        url = s3.generate_presigned_url(
            'get_object',
            Params={'Bucket': BUCKET_NAME, 'Key': key},
            ExpiresIn=3600
        )
        
        return {
            "statusCode": 200,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Content-Type": "application/json"
            },
            "body": json.dumps({"url": url})
        }
            
    except subprocess.CalledProcessError as e:
        return {
            "statusCode": 500,
            "body": json.dumps({
                "error": "Compilation Failed",
                "details": e.stderr.decode('utf-8')
            })
        }
    except Exception as e:
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)})
        }
