from __future__ import annotations

from grillmi.security.device_label import parse_device_label

MAC_SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
IPAD_SAFARI = "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
ANDROID_CHROME = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36"
WINDOWS_FIREFOX = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0"
LINUX_CHROME = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"


def test_mac_safari():
    assert "Mac" in parse_device_label(MAC_SAFARI)
    assert "Safari" in parse_device_label(MAC_SAFARI)


def test_iphone_safari():
    assert "iPhone" in parse_device_label(IPHONE_SAFARI)


def test_ipad_safari():
    assert "iPad" in parse_device_label(IPAD_SAFARI)


def test_android_chrome():
    label = parse_device_label(ANDROID_CHROME)
    assert "Android" in label and "Chrome" in label


def test_windows_firefox():
    label = parse_device_label(WINDOWS_FIREFOX)
    assert "Windows" in label and "Firefox" in label


def test_linux_chrome():
    label = parse_device_label(LINUX_CHROME)
    assert "Linux" in label


def test_none_returns_unknown():
    assert parse_device_label(None) == "Unknown"
    assert parse_device_label("") == "Unknown"


def test_unparseable_falls_back_to_truncated_ua():
    weird = "x" * 200
    label = parse_device_label(weird)
    assert label == "x" * 60 or len(label) <= 60
