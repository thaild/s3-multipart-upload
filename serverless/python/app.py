import os
import boto3
from flask_cors import CORS
from flask import Flask, jsonify, request

app = Flask(__name__)
cors = CORS(app)


FOLDER_UPLOAD = os.environ.get('FOLDER_UPLOAD', 'upload_part')
ENDPOINT_URL = os.environ.get('ENDPOINT_URL', 'http://10.1.38.246:9000')
AWS_ACCESS_ID = os.environ.get('AWS_ACCESS_ID', 'tcg')
AWS_SECRET_KEY = os.environ.get('AWS_SECRET_KEY', '3e6eMbz7NRBPfjYf')
BUCKET_NAME = os.environ.get('BUCKET_NAME', 'tcg-bucket')


s3 = boto3.client(
    's3',
    endpoint_url=ENDPOINT_URL,
    aws_access_key_id=AWS_ACCESS_ID,
    aws_secret_access_key=AWS_SECRET_KEY,
    aws_session_token=None,
    config=boto3.session.Config(signature_version='s3v4'),
    verify=False
)


@app.route("/", methods=["GET"])
def start_app():
    return jsonify({
        'result': True
    })


@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'POST')
    return response


@app.route("/start-upload", methods=["GET"])
def start_upload():
    file_name = request.args.get('file_name')
    response = s3.create_multipart_upload(
        Bucket=BUCKET_NAME,
        Key=FOLDER_UPLOAD + "/" + file_name
    )

    return jsonify({
        'upload_id': response['UploadId']
    })


@app.route("/get-upload-url", methods=["GET"])
def get_upload_url():
    file_name = request.args.get('file_name')
    upload_id = request.args.get('upload_id')
    part_no = request.args.get('part_no')
    signed_url = s3.generate_presigned_url(
        ClientMethod='upload_part',
        Params={
            'Bucket': BUCKET_NAME,
            'Key': FOLDER_UPLOAD + "/" + file_name,
            'UploadId': upload_id,
            'PartNumber': int(part_no)
        }
    )

    return jsonify({
        'upload_signed_url': signed_url
    })


@app.route("/complete-upload", methods=["POST"])
def complete_upload():
    file_name = request.json.get('file_name')
    upload_id = request.json.get('upload_id')
    print(request.json)
    parts = request.json.get('parts')
    response = s3.complete_multipart_upload(
        Bucket=BUCKET_NAME,
        Key=FOLDER_UPLOAD + "/" + file_name,
        MultipartUpload={'Parts': parts},
        UploadId=upload_id
    )

    return jsonify({
        'data': response
    })


if __name__ == "__main__":
    app.run()
