"""
Tests for Sentry initialization and the before_send filter.
"""

from __future__ import annotations

from unittest.mock import MagicMock, call, patch

import pytest

from nuqe_api.sentry import init_sentry


class TestInitSentry:
    def test_none_dsn_does_not_call_sentry_init(self) -> None:
        """With None DSN, init_sentry returns before importing sentry_sdk."""
        called = []

        import builtins
        real_import = builtins.__import__

        def guarded_import(name: str, *args: object, **kwargs: object) -> object:
            if name == "sentry_sdk":
                called.append(name)
            return real_import(name, *args, **kwargs)

        with patch("builtins.__import__", side_effect=guarded_import):
            init_sentry(None)
        assert "sentry_sdk" not in called

    def test_empty_dsn_does_not_call_sentry_init(self) -> None:
        """Empty string DSN is treated as falsy — no init."""
        called = []

        import builtins
        real_import = builtins.__import__

        def guarded_import(name: str, *args: object, **kwargs: object) -> object:
            if name == "sentry_sdk":
                called.append(name)
            return real_import(name, *args, **kwargs)

        with patch("builtins.__import__", side_effect=guarded_import):
            init_sentry("")
        assert "sentry_sdk" not in called

    def test_non_empty_dsn_calls_sentry_init(self) -> None:
        mock_sentry = MagicMock()
        mock_integration = MagicMock()
        mock_sentry.integrations.fastapi.FastApiIntegration.return_value = mock_integration

        with patch.dict("sys.modules", {"sentry_sdk": mock_sentry, "sentry_sdk.integrations.fastapi": mock_sentry.integrations.fastapi}):
            init_sentry("https://abc@sentry.io/123")
        mock_sentry.init.assert_called_once()


class TestBeforeSendFilter:
    def _make_event_with_auth(self, auth_value: str = "Bearer secret-token") -> dict:
        return {
            "request": {
                "headers": {
                    "authorization": auth_value,
                    "content-type": "application/json",
                }
            }
        }

    def _extract_before_send(self) -> object:
        """
        Call init_sentry with a mock and capture the before_send hook passed to sentry_sdk.init.
        """
        captured: list[object] = []
        mock_sentry = MagicMock()

        def fake_init(**kwargs: object) -> None:
            captured.append(kwargs.get("before_send"))

        mock_sentry.init.side_effect = fake_init
        mock_sentry.integrations.fastapi.FastApiIntegration.return_value = MagicMock()

        with patch.dict(
            "sys.modules",
            {
                "sentry_sdk": mock_sentry,
                "sentry_sdk.integrations.fastapi": mock_sentry.integrations.fastapi,
            },
        ):
            init_sentry("https://abc@sentry.io/123")

        assert len(captured) == 1
        return captured[0]

    def test_before_send_filters_authorization_header(self) -> None:
        before_send = self._extract_before_send()
        assert callable(before_send)

        event = self._make_event_with_auth()
        result = before_send(event, {})  # type: ignore[operator]

        headers = result["request"]["headers"]  # type: ignore[index]
        assert headers["authorization"] == "[FILTERED]"
        assert headers["content-type"] == "application/json"

    def test_before_send_returns_event(self) -> None:
        before_send = self._extract_before_send()
        assert callable(before_send)

        event = self._make_event_with_auth()
        result = before_send(event, {})  # type: ignore[operator]
        assert result is not None
