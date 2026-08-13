#!/usr/bin/env python3
"""Dev spike: run Architecture A agent loop against an existing Bridge session."""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.request

BRIDGE = os.environ.get("BRIDGE_URL", "http://127.0.0.1:17321").rstrip("/")
TOKEN = os.environ["BRIDGE_TOKEN"]
SESSION_ID = os.environ["SESSION_ID"]
SUPABASE_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ["NEXT_PUBLIC_SUPABASE_ANON_KEY"]
TASK = os.environ.get(
    "TASK",
    "Navigate to the Articulate site inside Squarespace and stop when you reach the blog management/editor area. Do not create, edit, save, delete or publish anything.",
)
MAX_STEPS = int(os.environ.get("MAX_STEPS", "12"))


def http_json(method: str, url: str, body: dict | None = None, headers: dict | None = None):
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Accept": "application/json",
            **({"Content-Type": "application/json"} if body is not None else {}),
            **(headers or {}),
        },
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def bridge(method: str, path: str, body: dict | None = None):
    return http_json(
        method,
        f"{BRIDGE}{path}",
        body,
        {"Authorization": f"Bearer {TOKEN}"},
    )


def agent_step(state: dict, history: list, step: int):
    return http_json(
        "POST",
        f"{SUPABASE_URL}/functions/v1/local-browser-agent",
        {"task": TASK, "state": state, "history": history, "step": step},
        {
            "Authorization": f"Bearer {SERVICE_KEY}",
            "apikey": SERVICE_KEY,
        },
    )


def main() -> int:
    history: list = []
    action_ms: list[int] = []
    llm_ms: list[int] = []
    first_action_ms = None
    loop_start = time.time()

    meta = bridge("GET", f"/v1/sessions/{SESSION_ID}")
    print("SESSION", json.dumps(meta.get("session"), indent=2))
    print("TASK:", TASK)
    print("---")

    for step in range(1, MAX_STEPS + 1):
        state_resp = bridge("GET", f"/v1/sessions/{SESSION_ID}/state")
        state = state_resp["state"]
        print(f"\n======== STEP {step} ========")
        print("URL:", state.get("url"))
        print("Title:", state.get("title"))
        els = state.get("elements") or []
        print(f"Elements: {len(els)}")
        for el in els[:20]:
            text = (el.get("text") or "")[:70]
            href = (el.get("href") or "")[:60]
            print(f"  [{el.get('index')}] {el.get('tag')} {text!r} href={href}")

        step_result = agent_step(state, history, step)
        if isinstance(step_result.get("diagnostics"), dict) and "llmMs" in step_result["diagnostics"]:
            llm_ms.append(int(step_result["diagnostics"]["llmMs"]))
        print(
            "AGENT:",
            step_result.get("status"),
            "|",
            (step_result.get("thought") or step_result.get("message") or "")[:240],
        )

        status = step_result.get("status")
        if status in ("done", "needs_user", "failed"):
            print("MESSAGE:", step_result.get("message"))
            break

        action = step_result.get("action")
        if not action:
            print("No action returned")
            break

        safe_action = dict(action)
        if safe_action.get("type") == "type":
            safe_action["text"] = f"[{len(str(action.get('text', '')))} chars]"
        print("ACTION:", json.dumps(safe_action))

        t0 = time.time()
        action_resp = bridge("POST", f"/v1/sessions/{SESSION_ID}/action", {"action": action})
        elapsed = int((time.time() - t0) * 1000)
        action_ms.append(elapsed)
        if first_action_ms is None:
            first_action_ms = int((time.time() - loop_start) * 1000)
        print(
            "AFTER:",
            action_resp.get("state", {}).get("url"),
            f"actionMs={elapsed}",
        )

        history.append(
            {
                "thought": step_result.get("thought"),
                "action": safe_action,
                "result": f"ok url={action_resp.get('state', {}).get('url')}",
            }
        )
        history = history[-12:]
        time.sleep(0.4)
    else:
        print("Reached max steps")

    print("\n=== LATENCY ===")
    print("instructionToFirstActionMs:", first_action_ms)
    print(
        "avgActionMs:",
        int(sum(action_ms) / len(action_ms)) if action_ms else None,
        "samples:",
        action_ms,
    )
    print(
        "avgLlmMs:",
        int(sum(llm_ms) / len(llm_ms)) if llm_ms else None,
        "samples:",
        llm_ms,
    )

    final = bridge("GET", f"/v1/sessions/{SESSION_ID}/state")
    print("\n=== FINAL ===")
    print(json.dumps({"url": final["state"]["url"], "title": final["state"]["title"]}, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print("ERROR:", exc, file=sys.stderr)
        raise
