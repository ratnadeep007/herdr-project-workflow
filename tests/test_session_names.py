import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("session_names", ROOT / "project-agent-launch/session_names.py")
names = importlib.util.module_from_spec(spec)
spec.loader.exec_module(names)


class SessionNameTests(unittest.TestCase):
    def test_replace_option_preserves_other_arguments(self):
        self.assertEqual(names.replace_option(["claude", "--model", "example", "-n", "old"],
                         ["--name", "-n"], "--name", "API Planner"),
                         ["claude", "--model", "example", "--name", "API Planner"])

    def test_native_flag_requires_session_semantics(self):
        with patch.object(names.subprocess, "run") as run:
            run.return_value.stdout = "  --name <name>  Set the session display name\n  --model <model> Model\n"
            run.return_value.stderr = ""
            result = names.prepare({"key": "claude"}, ["claude"], "API Planner", "/repo")
            self.assertTrue(result["native"])
            self.assertEqual(result["argv"], ["claude", "--name", "API Planner"])
            run.return_value.stdout = "  --name <name>  Workspace name\n  --resume <id>  Resume a session\n"
            result = names.prepare({"key": "other", "name": "Other"}, ["other"], "API Planner", "/repo")
            self.assertFalse(result["native"])
            self.assertEqual(result["argv"], ["other"])

    def test_opencode_envelope_and_exact_title(self):
        with patch.object(names.subprocess, "run") as run:
            run.return_value.returncode = 0
            run.return_value.stdout = '{"data":{"id":"session-123"}}'
            run.return_value.stderr = ""
            title = "O'Reilly $(literal) Reviewer"
            result = names.prepare({"key": "opencode"}, ["opencode"], title, "/repo")
            self.assertEqual(result["argv"], ["opencode", "--session", "session-123"])
            self.assertEqual(json.loads(run.call_args.args[0][-1])["title"], title)

    def test_existing_session_is_not_silently_replaced(self):
        for backend, argv in [("codex", ["codex", "resume", "existing"]),
                              ("opencode", ["opencode", "--session", "existing"])]:
            result = names.prepare({"key": backend}, argv, "New name", "/repo")
            self.assertFalse(result["native"])
            self.assertEqual(result["argv"], argv)

    def test_codex_protocol_names_new_thread_without_inference(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            binary = root / "codex"
            log = root / "protocol.jsonl"
            binary.write_text('''#!/usr/bin/env python3
import sys,json,os
for line in sys.stdin:
 request=json.loads(line)
 with open(os.environ['HERDR_NAME_TEST_LOG'],'a') as out:out.write(json.dumps(request)+'\\n')
 if 'id' not in request:continue
 method=request['method']
 if method=='initialize':result={}
 elif method=='thread/start':result={'thread':{'id':'thread-exact'}}
 elif method=='thread/name/set':result={}
 else:raise RuntimeError('Unexpected method: '+method)
 print(json.dumps({'id':request['id'],'result':result}),flush=True)
''')
            binary.chmod(0o755)
            with patch.dict(os.environ, {"HERDR_NAME_TEST_LOG": str(log)}):
                identifier = names.codex_session(str(binary), "API Planner", temporary)
            self.assertEqual(identifier, "thread-exact")
            requests = [json.loads(line) for line in log.read_text().splitlines()]
            self.assertEqual([r["method"] for r in requests], ["initialize", "initialized", "thread/start", "thread/name/set"])
            self.assertEqual(requests[-1]["params"], {"threadId": "thread-exact", "name": "API Planner"})


if __name__ == "__main__":
    unittest.main()
