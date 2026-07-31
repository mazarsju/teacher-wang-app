"""Local filesystem and S3 backends for conversation log objects."""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Protocol

# #region agent log
_DEBUG_LOG_PATH = (
    Path(__file__).resolve().parent.parent / ".cursor" / "debug-045eba.log"
)


def _agent_debug_log(
    hypothesis_id: str,
    location: str,
    message: str,
    data: dict | None = None,
) -> None:
    try:
        payload = {
            "sessionId": "045eba",
            "runId": "pre-fix",
            "hypothesisId": hypothesis_id,
            "location": location,
            "message": message,
            "data": data or {},
            "timestamp": int(time.time() * 1000),
        }
        with _DEBUG_LOG_PATH.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(payload, ensure_ascii=False) + "\n")
    except Exception:
        pass


# #endregion

CONVERSATION_LOGS_DIR = Path(
    os.environ.get(
        "CONVERSATION_LOGS_DIR",
        Path(__file__).resolve().parent.parent / "conversation_logs",
    )
)


def conversation_logs_backend() -> str:
    return os.environ.get("CONVERSATION_LOGS_BACKEND", "local").strip().lower() or "local"


def object_key(user_id: str, relative_path: str) -> str:
    if not user_id or not isinstance(user_id, str):
        raise ValueError("Invalid user_id")

    prefix = os.environ.get("CONVERSATION_LOGS_S3_PREFIX", "").strip().strip("/")
    relative = f"users/{user_id}/{relative_path.lstrip('/')}"
    if prefix:
        return f"{prefix}/{relative}"
    return relative


class ConversationLogStorage(Protocol):
    def read_text(self, key: str) -> str | None: ...

    def write_text(self, key: str, content: str) -> None: ...

    def exists(self, key: str) -> bool: ...

    def delete(self, key: str) -> None: ...

    def delete_prefix(self, prefix: str) -> None: ...

    def list_keys(self, prefix: str) -> list[str]: ...


class LocalConversationLogStorage:
    def __init__(self, root: Path | None = None) -> None:
        self._root = root or CONVERSATION_LOGS_DIR

    def _path(self, key: str) -> Path:
        return self._root / key

    def read_text(self, key: str) -> str | None:
        path = self._path(key)
        if not path.is_file():
            return None
        return path.read_text(encoding="utf-8")

    def write_text(self, key: str, content: str) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")

    def exists(self, key: str) -> bool:
        return self._path(key).is_file()

    def delete(self, key: str) -> None:
        path = self._path(key)
        if path.is_file():
            path.unlink()

    def list_keys(self, prefix: str) -> list[str]:
        root = self._path(prefix)
        if not root.exists():
            return []

        keys: list[str] = []
        if root.is_file():
            return [prefix.rstrip("/")]

        for path in root.rglob("*"):
            if path.is_file():
                keys.append(path.relative_to(self._root).as_posix())
        return sorted(keys)

    def delete_prefix(self, prefix: str) -> None:
        for key in self.list_keys(prefix):
            self.delete(key)

        directory = self._path(prefix)
        if directory.is_dir():
            for path in sorted(directory.rglob("*"), reverse=True):
                if path.is_file():
                    path.unlink(missing_ok=True)
                elif path.is_dir():
                    path.rmdir()
            try:
                directory.rmdir()
            except OSError:
                pass


class S3ConversationLogStorage:
    def __init__(
        self,
        *,
        bucket: str | None = None,
        region: str | None = None,
        client=None,
    ) -> None:
        self._bucket = bucket or os.environ.get("CONVERSATION_LOGS_S3_BUCKET", "").strip()
        if not self._bucket:
            raise ValueError("CONVERSATION_LOGS_S3_BUCKET is required for S3 backend")

        if client is not None:
            self._client = client
            return

        import boto3

        kwargs = {}
        resolved_region = (
            region
            or os.environ.get("CONVERSATION_LOGS_S3_REGION", "").strip()
            or os.environ.get("AWS_REGION", "").strip()
            or os.environ.get("COGNITO_REGION", "").strip()
            or None
        )
        if resolved_region:
            kwargs["region_name"] = resolved_region
        self._client = boto3.client("s3", **kwargs)
        # #region agent log
        caller_arn = None
        caller_error = None
        try:
            sts = boto3.client("sts", **kwargs)
            caller_arn = sts.get_caller_identity().get("Arn")
        except Exception as identity_error:
            caller_error = type(identity_error).__name__
        _agent_debug_log(
            "A",
            "conversation_log_storage.py:S3ConversationLogStorage.__init__",
            "S3 storage initialized",
            {
                "bucket": self._bucket,
                "region": resolved_region,
                "callerArn": caller_arn,
                "callerError": caller_error,
                "backendEnv": os.environ.get("CONVERSATION_LOGS_BACKEND"),
            },
        )
        # #endregion

    def read_text(self, key: str) -> str | None:
        # #region agent log
        _agent_debug_log(
            "C",
            "conversation_log_storage.py:S3ConversationLogStorage.read_text",
            "GetObject attempt",
            {"bucket": self._bucket, "key": key},
        )
        # #endregion
        try:
            response = self._client.get_object(Bucket=self._bucket, Key=key)
        except self._client.exceptions.NoSuchKey:
            # #region agent log
            _agent_debug_log(
                "B",
                "conversation_log_storage.py:S3ConversationLogStorage.read_text",
                "GetObject NoSuchKey",
                {"bucket": self._bucket, "key": key},
            )
            # #endregion
            return None
        except Exception as error:
            error_code = getattr(error, "response", {}).get("Error", {}).get("Code")
            # #region agent log
            _agent_debug_log(
                "A",
                "conversation_log_storage.py:S3ConversationLogStorage.read_text",
                "GetObject failed",
                {
                    "bucket": self._bucket,
                    "key": key,
                    "errorCode": error_code,
                    "errorType": type(error).__name__,
                    "errorMessage": str(error)[:300],
                },
            )
            # #endregion
            if error_code in {"NoSuchKey", "404", "NotFound"}:
                return None
            if error_code in {"AccessDenied", "403"}:
                raise PermissionError(
                    "S3 AccessDenied for conversation logs. Local AWS credentials "
                    f"cannot read bucket '{self._bucket}'. Use "
                    "CONVERSATION_LOGS_BACKEND=local for local dev, or switch to "
                    "credentials for the AWS account that owns this bucket "
                    "(and ensure that identity has s3:GetObject on users/*)."
                ) from error
            raise
        body = response["Body"].read()
        # #region agent log
        _agent_debug_log(
            "D",
            "conversation_log_storage.py:S3ConversationLogStorage.read_text",
            "GetObject succeeded",
            {"bucket": self._bucket, "key": key, "bytes": len(body)},
        )
        # #endregion
        return body.decode("utf-8")

    def write_text(self, key: str, content: str) -> None:
        self._client.put_object(
            Bucket=self._bucket,
            Key=key,
            Body=content.encode("utf-8"),
            ContentType="text/plain; charset=utf-8",
        )

    def exists(self, key: str) -> bool:
        try:
            self._client.head_object(Bucket=self._bucket, Key=key)
            return True
        except Exception as error:
            error_code = getattr(error, "response", {}).get("Error", {}).get("Code")
            if error_code in {"404", "NoSuchKey", "NotFound"}:
                return False
            # botocore ClientError often uses HTTP status in response metadata
            status = getattr(error, "response", {}).get("ResponseMetadata", {}).get(
                "HTTPStatusCode"
            )
            if status == 404:
                return False
            raise

    def delete(self, key: str) -> None:
        self._client.delete_object(Bucket=self._bucket, Key=key)

    def list_keys(self, prefix: str) -> list[str]:
        keys: list[str] = []
        paginator = self._client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=self._bucket, Prefix=prefix):
            for item in page.get("Contents", []) or []:
                key = item.get("Key")
                if isinstance(key, str) and key:
                    keys.append(key)
        return keys

    def delete_prefix(self, prefix: str) -> None:
        keys = self.list_keys(prefix)
        if not keys:
            return

        for index in range(0, len(keys), 1000):
            chunk = keys[index : index + 1000]
            self._client.delete_objects(
                Bucket=self._bucket,
                Delete={"Objects": [{"Key": key} for key in chunk], "Quiet": True},
            )


_storage: ConversationLogStorage | None = None


def get_storage() -> ConversationLogStorage:
    global _storage
    if _storage is not None:
        return _storage

    backend = conversation_logs_backend()
    # #region agent log
    _agent_debug_log(
        "E",
        "conversation_log_storage.py:get_storage",
        "Selecting conversation log backend",
        {
            "backend": backend,
            "rawBackendEnv": os.environ.get("CONVERSATION_LOGS_BACKEND"),
            "bucketEnvSet": bool(
                os.environ.get("CONVERSATION_LOGS_S3_BUCKET", "").strip()
            ),
        },
    )
    # #endregion
    if backend == "s3":
        _storage = S3ConversationLogStorage()
    elif backend == "local":
        _storage = LocalConversationLogStorage()
    else:
        raise ValueError(f"Unsupported CONVERSATION_LOGS_BACKEND: {backend}")
    return _storage


def reset_storage_for_tests(storage: ConversationLogStorage | None = None) -> None:
    """Replace or clear the cached storage instance (tests only)."""
    global _storage
    _storage = storage
