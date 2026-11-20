import os
from pathlib import Path

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError


class ObjectStorageClient:
    """Cliente compatível com AWS S3 / MinIO para vídeos 4K, overlays 3D e PDFs."""

    def __init__(self) -> None:
        self.endpoint_url = os.getenv("S3_ENDPOINT_URL", "http://localhost:9000")
        self.access_key = os.getenv("MINIO_ROOT_USER", "kinepitch_s3_admin")
        self.secret_key = os.getenv("MINIO_ROOT_PASSWORD", "changeme_minio_dev")
        self.region = os.getenv("S3_REGION", "us-east-1")
        self.bucket_raw = os.getenv("S3_BUCKET_RAW", "kinepitch-videos-raw")
        self.bucket_overlay = os.getenv("S3_BUCKET_OVERLAY", "kinepitch-videos-overlay")

        self.client = boto3.client(
            "s3",
            endpoint_url=self.endpoint_url,
            aws_access_key_id=self.access_key,
            aws_secret_access_key=self.secret_key,
            region_name=self.region,
            config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
        )

    def ensure_bucket_exists(self, bucket_name: str) -> None:
        try:
            self.client.head_bucket(Bucket=bucket_name)
        except ClientError:
            self.client.create_bucket(Bucket=bucket_name)

    def generate_presigned_upload_url(
        self,
        object_key: str,
        content_type: str = "video/mp4",
        bucket_name: str | None = None,
        expires_in: int = 900,
    ) -> str:
        target_bucket = bucket_name or self.bucket_raw
        return self.client.generate_presigned_url(
            ClientMethod="put_object",
            Params={
                "Bucket": target_bucket,
                "Key": object_key,
                "ContentType": content_type,
            },
            ExpiresIn=expires_in,
        )

    def download_to_temp(self, bucket_name: str, object_key: str, dest_path: Path) -> Path:
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        self.client.download_file(bucket_name, object_key, str(dest_path))
        return dest_path

    def upload_file(self, src_path: Path, bucket_name: str, object_key: str, content_type: str) -> None:
        self.client.upload_file(
            str(src_path),
            bucket_name,
            object_key,
            ExtraArgs={"ContentType": content_type},
        )
