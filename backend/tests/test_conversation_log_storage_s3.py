import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock

from botocore.exceptions import ClientError

from backend.conversation_log_storage import S3ConversationLogStorage
from backend.conversation_logs import (
    append_message,
    clear_conversation,
    load_conversation,
)
from backend.conversation_log_storage import reset_storage_for_tests


class _FakeBody:
    def __init__(self, text: str):
        self._text = text

    def read(self):
        return self._text.encode("utf-8")


class TestS3ConversationLogStorage(unittest.TestCase):
    def setUp(self):
        self.client = MagicMock()
        self.client.exceptions.NoSuchKey = type("NoSuchKey", (Exception,), {})
        self.objects: dict[str, str] = {}

        def get_object(*, Bucket, Key):
            if Key not in self.objects:
                raise self.client.exceptions.NoSuchKey()
            return {"Body": _FakeBody(self.objects[Key])}

        def put_object(*, Bucket, Key, Body, ContentType=None):
            self.objects[Key] = Body.decode("utf-8")

        def head_object(*, Bucket, Key):
            if Key not in self.objects:
                raise ClientError(
                    {"Error": {"Code": "404", "Message": "Not Found"}},
                    "HeadObject",
                )
            return {}

        def delete_object(*, Bucket, Key):
            self.objects.pop(Key, None)

        def delete_objects(*, Bucket, Delete):
            for item in Delete["Objects"]:
                self.objects.pop(item["Key"], None)
            return {}

        def list_objects_v2(**kwargs):
            prefix = kwargs.get("Prefix", "")
            contents = [
                {"Key": key}
                for key in sorted(self.objects)
                if key.startswith(prefix)
            ]
            return {"Contents": contents}

        self.client.get_object.side_effect = get_object
        self.client.put_object.side_effect = put_object
        self.client.head_object.side_effect = head_object
        self.client.delete_object.side_effect = delete_object
        self.client.delete_objects.side_effect = delete_objects
        self.client.get_paginator.return_value.paginate.side_effect = (
            lambda **kwargs: [list_objects_v2(**kwargs)]
        )

        self.storage = S3ConversationLogStorage(
            bucket="test-bucket",
            client=self.client,
        )
        reset_storage_for_tests(self.storage)
        self.addCleanup(reset_storage_for_tests)

    def test_append_load_and_clear_via_s3_backend(self):
        append_message("user-1", "teacher-wang", "user", "你好")
        append_message("user-1", "teacher-wang", "assistant", "你好！")

        self.assertEqual(
            load_conversation("user-1", "teacher-wang"),
            [
                {"role": "user", "content": "你好"},
                {"role": "assistant", "content": "你好！"},
            ],
        )
        self.assertEqual(
            self.objects["users/user-1/teacher-wang.txt"],
            "me: 你好\nagent: 你好！\n",
        )

        clear_conversation("user-1", "teacher-wang")
        self.assertEqual(load_conversation("user-1", "teacher-wang"), [])
        self.assertNotIn("users/user-1/teacher-wang.txt", self.objects)


if __name__ == "__main__":
    unittest.main()
