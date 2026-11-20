import logging
import os
from pathlib import Path

import boto3
from botocore.client import Config
from botocore.exceptions import BotoCoreError, ClientError

logger = logging.getLogger("kinepitch.storage")


class ObjectStorageClient:
    """Cliente compatível com AWS S3 / MinIO para vídeos 4K, overlays 3D e PDFs."""

    def __init__(self) -> None:
        raw_endpoint = os.getenv("S3_ENDPOINT_URL", "").strip()
        self.s3_configured = bool(
            raw_endpoint
            and not ("localhost" in raw_endpoint and os.getenv("RENDER", "").strip())
        )
        self.endpoint_url = raw_endpoint or "http://localhost:9000"
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
            config=Config(
                signature_version="s3v4",
                s3={"addressing_style": "path"},
                connect_timeout=2,
                read_timeout=3,
                retries={"max_attempts": 1},
            ),
        )

    def ensure_bucket_exists(self, bucket_name: str) -> bool:
        if not self.s3_configured:
            return False
        try:
            self.client.head_bucket(Bucket=bucket_name)
            return True
        except ClientError as exc:
            error_code = str(exc.response.get("Error", {}).get("Code", ""))
            if error_code in ("404", "NoSuchBucket", "NotFound"):
                try:
                    self.client.create_bucket(Bucket=bucket_name)
                    return True
                except (ClientError, BotoCoreError, OSError) as create_exc:
                    logger.warning("Falha ao criar bucket S3 %s: %s", bucket_name, create_exc)
                    return False
            logger.warning("S3 head_bucket retornou erro para %s: %s", bucket_name, exc)
            return False
        except (BotoCoreError, OSError, Exception) as exc:
            logger.warning("Storage S3/MinIO indisponível (%s): %s", self.endpoint_url, exc)
            return False

    def generate_presigned_upload_url(
        self,
        object_key: str,
        content_type: str = "video/mp4",
        bucket_name: str | None = None,
        expires_in: int = 900,
    ) -> str:
        target_bucket = bucket_name or self.bucket_raw
        if not self.s3_configured:
            return (
                f"{self.endpoint_url.rstrip('/')}/{target_bucket}/{object_key}"
                f"?mode=inline-no-s3&expires={expires_in}"
            )
        try:
            return self.client.generate_presigned_url(
                ClientMethod="put_object",
                Params={
                    "Bucket": target_bucket,
                    "Key": object_key,
                    "ContentType": content_type,
                },
                ExpiresIn=expires_in,
            )
        except (ClientError, BotoCoreError, Exception) as exc:
            logger.warning("Falha ao assinar URL S3 para %s: %s", object_key, exc)
            return (
                f"{self.endpoint_url.rstrip('/')}/{target_bucket}/{object_key}"
                f"?mode=fallback-no-s3&expires={expires_in}"
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
