#!/usr/bin/python3
"""Fetch subscription limits without writing or displaying authentication tokens."""
import json
import os
import shutil
import queue
import subprocess
import threading
import time
import urllib.request
import urllib.error
from pathlib import Path


def codex():
    binary = shutil.which("codex")
    if not binary:
        try:
            shell = os.environ.get("SHELL", "/bin/sh")
            result = subprocess.run([shell, "-lic", 'printf "\\nHERDR_PATH=%s\\n" "$PATH"'], capture_output=True, text=True, timeout=8)
            paths = [line.removeprefix("HERDR_PATH=") for line in result.stdout.splitlines() if line.startswith("HERDR_PATH=")]
            if paths:
                binary = shutil.which("codex", path=paths[-1])
                if binary:
                    os.environ["PATH"] = paths[-1]
        except (OSError, subprocess.SubprocessError):
            pass
    if not binary:
        return {"error": "Codex CLI is not on PATH"}
    env = os.environ.copy()
    env["PATH"] = str(Path(binary).parent) + os.pathsep + env.get("PATH", "")
    p = subprocess.Popen([binary, "app-server"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, env=env)
    try:
        def send(message):
            p.stdin.write(json.dumps(message) + "\n")
            p.stdin.flush()
        messages = queue.Queue()
        def read_lines():
            for line in p.stdout:
                messages.put(line)
            messages.put(None)
        threading.Thread(target=read_lines, daemon=True).start()
        def receive(request_id):
            deadline = time.monotonic() + 20
            while time.monotonic() < deadline:
                try:
                    line = messages.get(timeout=max(0, deadline - time.monotonic()))
                except queue.Empty:
                    break
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
    config = Path(os.environ.get("CLAUDE_CONFIG_DIR", "~/.claude")).expanduser()
    path = config / ".credentials.json"
    if path.exists():
        try:
            credentials = json.loads(path.read_text())
        except (OSError, ValueError):
            return {"error": "Claude credentials file cannot be read"}
    else:
        if config != Path.home() / ".claude":
            return {"error": "Claude credentials file missing for CLAUDE_CONFIG_DIR"}
        try:
            raw = subprocess.run(["/usr/bin/security", "find-generic-password", "-s", "Claude Code-credentials", "-w"], capture_output=True, text=True, timeout=10, check=True).stdout
            credentials = json.loads(raw)
        except (OSError, ValueError, subprocess.SubprocessError):
            return {"error": "Claude Keychain login unavailable; check sign-in and Keychain access"}
    token = credentials.get("claudeAiOauth", {}).get("accessToken")
    if not token:
        return {"error": "Claude subscription login unavailable"}
    req = urllib.request.Request("https://api.anthropic.com/api/oauth/usage", headers={"Authorization": "Bearer " + token, "anthropic-beta": "oauth-2025-04-20", "User-Agent": "herdr-usage-pill/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            data = json.load(response)
    except urllib.error.HTTPError as error:
        if error.code in (401, 403):
            return {"error": "Claude login expired or cannot access usage; sign in again"}
        return {"error": f"Claude usage service returned HTTP {error.code}"}
    except (urllib.error.URLError, TimeoutError, OSError):
        return {"error": "Claude usage service unavailable; check network"}
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
