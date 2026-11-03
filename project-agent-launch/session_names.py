"""Prepare named native sessions. Never starts an inference turn or edits agent databases."""
import json
import os
import queue
import re
import subprocess
import sys
import threading


def replace_option(argv, options, flag, value):
    result = [argv[0]]
    index = 1
    while index < len(argv):
        argument = argv[index]
        if argument in options:
            index += 2
        elif any(argument.startswith(option + "=") for option in options):
            index += 1
        else:
            result.append(argument)
            index += 1
    result.extend([flag, value])
    return result


def codex_session(binary, name, cwd):
    process = subprocess.Popen([binary, "app-server"], stdin=subprocess.PIPE,
                               stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                               text=True, bufsize=1)
    messages = queue.Queue()

    def reader():
        for line in process.stdout:
            try:
                messages.put(json.loads(line))
            except ValueError:
                pass
        messages.put(None)

    reader_thread = threading.Thread(target=reader, daemon=True)
    reader_thread.start()
    sequence = 0

    def request(method, params):
        nonlocal sequence
        sequence += 1
        identifier = sequence
        process.stdin.write(json.dumps({"id": identifier, "method": method, "params": params}) + "\n")
        process.stdin.flush()
        # Notifications do not reset the request's wall-clock budget.
        import time
        deadline = time.monotonic() + 7
        while True:
            try:
                message = messages.get(timeout=max(0, deadline - time.monotonic()))
            except queue.Empty:
                raise RuntimeError("Codex session naming timed out") from None
            if message is None:
                raise RuntimeError("Codex app-server stopped before naming the session")
            if message.get("id") == identifier:
                if "error" in message:
                    raise RuntimeError(message["error"].get("message", "Codex session naming failed"))
                return message.get("result", {})

    try:
        request("initialize", {"clientInfo": {"name": "herdr_workflow", "version": "1.0"}})
        process.stdin.write('{"method":"initialized","params":{}}\n')
        process.stdin.flush()
        thread = request("thread/start", {"cwd": cwd}).get("thread", {})
        identifier = thread.get("id")
        if not identifier:
            raise RuntimeError("Codex did not return a session ID")
        request("thread/name/set", {"threadId": identifier, "name": name})
        return identifier
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=1)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        reader_thread.join(timeout=1)
        process.stdin.close()
        process.stdout.close()


def prepare(agent, argv, name, cwd):
    backend = agent.get("key", "")
    binary = argv[0]
    program = os.path.basename(binary).removesuffix(".exe")
    if backend == "codex" or program == "codex":
        if any(argument in ("resume", "fork", "exec", "review") for argument in argv[1:]):
            return {"argv": argv, "native": False, "note": "Existing Codex session commands keep their own session identity."}
        identifier = codex_session(binary, name, cwd)
        return {"argv": [*argv, "resume", identifier], "native": True, "sessionId": identifier}
    if backend == "opencode" or program == "opencode":
        if any(argument in ("--session", "-s", "--continue", "-c") or argument.startswith("--session=") for argument in argv[1:]):
            return {"argv": argv, "native": False, "note": "Existing OpenCode session commands keep their own session identity."}
        result = subprocess.run([binary, "api", "--standalone", "POST", "/api/session", "--data", json.dumps({"title": name})],
                                cwd=cwd, capture_output=True, text=True, timeout=15)
        if result.returncode:
            raise RuntimeError("OpenCode could not prepare its named session: " + result.stderr.strip()[-600:])
        session = json.loads(result.stdout)
        session = session.get("data", session)
        identifier = session.get("id")
        if not identifier:
            raise RuntimeError("OpenCode did not return a session ID")
        return {"argv": [*argv, "--session", identifier], "native": True, "sessionId": identifier}
    result = subprocess.run([binary, "--help"], cwd=cwd, capture_output=True, text=True, timeout=8)
    help_text = re.sub(r"\x1b\[[0-9;]*m", "", result.stdout + result.stderr)
    # Check option blocks: a generic --name for an unrelated object is not a chat name.
    blocks = re.split(r"(?m)(?=^\s+-\w|^\s+--)", help_text)
    for flag in ("--name", "--session-name", "--session-title", "--title"):
        if any(re.search(r"(?<![\w-])" + re.escape(flag) + r"(?=[\s=,]|$)", block)
               and re.search(r"\b(session|chat|conversation)\b", block, re.I) for block in blocks):
            options = [flag]
            if program in ("claude", "pi") and flag == "--name":
                options.append("-n")
            return {"argv": replace_option(argv, options, flag, name), "native": True}
    return {"argv": argv, "native": False,
            "note": f"{agent.get('name', program)} has no supported startup session-name interface in this installed version. Its Herdr tab is named; rename its native session manually."}


def main():
    try:
        request = json.loads(sys.argv[1])
        result = prepare(request["agent"], request["argv"], request["name"], os.getcwd())
        print(json.dumps({"ok": True, **result}))
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error)}))


if __name__ == "__main__":
    main()
