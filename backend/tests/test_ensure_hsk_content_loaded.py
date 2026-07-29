import bootstrap  # noqa: F401
import unittest
from unittest.mock import patch

from backend.database import _ensure_hsk_content_loaded, _ensure_settings
from backend.extensions import db
from backend.models import HskWord, Setting
from backend.settings import SETTING_LEVEL, set_setting
from postgres_test_case import PostgresTestCase


class TestEnsureHskContentLoaded(PostgresTestCase):
    def test_loads_when_table_is_empty(self):
        with patch("backend.routes.hsk_content_loader.load_hsk_content") as mock_load:
            _ensure_hsk_content_loaded()

        mock_load.assert_called_once_with()

    def test_skips_when_table_has_rows(self):
        db.session.add(HskWord(word="爱", level=1, frequency=10))
        db.session.commit()

        with patch("backend.routes.hsk_content_loader.load_hsk_content") as mock_load:
            _ensure_hsk_content_loaded()

        mock_load.assert_not_called()


class TestEnsureSettings(PostgresTestCase):
    def test_refreshes_level_when_missing(self):
        with patch("backend.hsk_level.refresh_current_hsk_level") as mock_refresh:
            _ensure_settings()

        mock_refresh.assert_called_once_with(commit=True)
        self.assertIsNotNone(db.session.get(Setting, SETTING_LEVEL))

    def test_skips_refresh_when_level_exists(self):
        set_setting(SETTING_LEVEL, "2", commit=True)

        with patch("backend.hsk_level.refresh_current_hsk_level") as mock_refresh:
            _ensure_settings()

        mock_refresh.assert_not_called()


if __name__ == "__main__":
    unittest.main()
