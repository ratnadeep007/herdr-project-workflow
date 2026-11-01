#!/usr/bin/python3
"""Fetch subscription limits without writing or displaying authentication tokens."""
import json
import os
import shutil
import selectors
import subprocess
import time
import urllib.request
from pathlib import Path


def codex():
    binary = shutil.which("codex")
    if not binary:
        return {"error": "Codex CLI is not on PATH"}
    env = os.environ.copy()
    env["PATH"] = str(Path(binary).parent) + os.pathsep + env.get("PATH", "")
    p = subprocess.Popen([binary, "app-server"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, env=env)
    try:
        def send(message):
            p.stdin.write(json.dumps(message) + "\n")
            p.stdin.flush()
        selector = selectors.DefaultSelector()
        selector.register(p.stdout, selectors.EVENT_READ)
        def receive(request_id):
            deadline = time.monotonic() + 20
            while time.monotonic() < deadline:
                if not selector.select(deadline - time.monotonic()):
                    break
                line = p.stdout.readline()
                if not line:
                    break
                message = json.loads(line)
                if message.get("id") == request_id:
                    return message
            raise RuntimeError("Codex app-server did not respond")
        send({"id": 1, "method": "initialize", "params": {"clientInfo": {"name": "herdr_usage", "title": "Herdr Usage", "version": "1.0"}}})
        receive(1)
        send({"method": "initialized", "params": {}})
        send({"id": 2, "method": "account/rateLimits/read"})
        response = receive(2)
        if "error" in response:
            return {"error": "Codex usage unavailable; check sign-in"}
        result = response.get("result", {})
        bucket = (result.get("rateLimitsByLimitId") or {}).get("codex") or result.get("rateLimits") or {}
        windows = [bucket.get("primary"), bucket.get("secondary")]
        def find(minutes):
            w = next((w for w in windows if w and w.get("windowDurationMins") == minutes), None)
            return {"used": w["usedPercent"], "reset": w.get("resetsAt")} if w and isinstance(w.get("usedPercent"), (int, float)) else None
        return {"five": find(300), "week": find(10080), "updated": time.time()}
    finally:
        if p.poll() is None:
            p.kill()
            p.wait()


def claude():
    path = Path.home() / ".claude/.credentials.json"
    if path.exists():
        credentials = json.loads(path.read_text())
    else:
        raw = subprocess.run(["/usr/bin/security", "find-generic-password", "-s", "Claude Code-credentials", "-w"], capture_output=True, text=True, timeout=10, check=True).stdout
        credentials = json.loads(raw)
    token = credentials.get("claudeAiOauth", {}).get("accessToken")
    if not token:
        return {"error": "Claude subscription login unavailable"}
    req = urllib.request.Request("https://api.anthropic.com/api/oauth/usage", headers={"Authorization": "Bearer " + token, "anthropic-beta": "oauth-2025-04-20", "User-Agent": "herdr-usage-pill/1.0"})
    with urllib.request.urlopen(req, timeout=15) as response:
        data = json.load(response)
    from datetime import datetime
    def window(key):
        value = data.get(key)
        if not value or not isinstance(value.get("utilization"), (int, float)):
            return None
        reset = value.get("resets_at")
        return {"used": value["utilization"], "reset": datetime.fromisoformat(reset.replace("Z", "+00:00")).timestamp() if reset else None}
    return {"five": window("five_hour"), "week": window("seven_day"), "updated": time.time(), "note": "Claude OAuth usage endpoint"}


if __name__ == "__main__":
    result = {}
    for name, fn in (("codex", codex), ("claude", claude)):
        try:
            result[name] = fn()
        except Exception:
            result[name] = {"error": "Usage unavailable; check login or network"}
    print(json.dumps(result))
