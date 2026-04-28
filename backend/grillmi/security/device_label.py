def parse_device_label(user_agent: str | None) -> str:
    if not user_agent:
        return "Unknown"
    try:
        from ua_parser import user_agent_parser

        parsed = user_agent_parser.Parse(user_agent)
        os_family = (parsed.get("os") or {}).get("family") or ""
        browser_family = (parsed.get("user_agent") or {}).get("family") or ""
        device_family = (parsed.get("device") or {}).get("family") or ""

        # Normalize OS family to a friendly device label.
        os_label = _friendly_os(os_family, device_family)
        if os_label and browser_family:
            return f"{os_label}, {browser_family}"
        if os_label:
            return os_label
        if browser_family:
            return browser_family
    except Exception:
        pass
    return user_agent[:60]


def _friendly_os(os_family: str, device_family: str) -> str:
    of = (os_family or "").lower()
    df = (device_family or "").lower()
    if of in ("ios", "iphone os"):
        if "ipad" in df:
            return "iPad"
        return "iPhone"
    if of == "mac os x":
        return "Mac"
    if of == "android":
        return "Android"
    if of == "windows":
        return "Windows"
    if of == "linux":
        return "Linux"
    return os_family or device_family or ""
