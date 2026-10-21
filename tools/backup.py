#!/usr/bin/env python3
"""
脚本棚のバックアップ（テーブル全部・ユーザー一覧・PDF）

    python3 tools/backup.py            # backups/日時/ に保存
    python3 tools/backup.py --no-pdf   # データだけ

tools/.env に SUPABASE_URL と SUPABASE_SECRET_KEY を書いておく（.env.example を参照）。
標準ライブラリだけで動く。
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TABLES = ["profiles", "scripts", "likes", "comments", "comment_authors", "app_secrets"]
BUCKET = "scripts"
PAGE = 1000


def load_env() -> tuple[str, str]:
    env_file = Path(__file__).resolve().parent / ".env"
    values = dict(os.environ)
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            values.setdefault(key.strip(), value.strip().strip('"').strip("'"))
    url = values.get("SUPABASE_URL", "").rstrip("/")
    key = values.get("SUPABASE_SECRET_KEY", "")
    if not url or not key:
        sys.exit("SUPABASE_URL と SUPABASE_SECRET_KEY を tools/.env か環境変数に設定してください。")
    if key.startswith("sb_publishable_"):
        sys.exit("Publishable key ではなく Secret key（sb_secret_ で始まるもの）を設定してください。")
    return url, key


class Client:
    def __init__(self, url: str, key: str):
        self.url = url
        self.headers = {"apikey": key, "Authorization": f"Bearer {key}"}

    def request(self, method: str, path: str, *, body=None, headers=None) -> tuple[bytes, dict]:
        data = json.dumps(body).encode() if body is not None else None
        h = {**self.headers, **(headers or {})}
        if data is not None:
            h["Content-Type"] = "application/json"
        req = urllib.request.Request(self.url + path, data=data, method=method, headers=h)
        try:
            with urllib.request.urlopen(req, timeout=120) as res:
                return res.read(), dict(res.headers)
        except urllib.error.HTTPError as e:
            detail = e.read().decode(errors="replace")[:500]
            raise RuntimeError(f"{method} {path} が失敗しました（{e.code}）: {detail}") from None

    def json(self, method: str, path: str, **kw):
        raw, _ = self.request(method, path, **kw)
        return json.loads(raw) if raw else None


def dump_table(c: Client, table: str) -> list:
    rows, offset = [], 0
    while True:
        batch = c.json("GET", f"/rest/v1/{table}?select=*&limit={PAGE}&offset={offset}")
        rows.extend(batch)
        if len(batch) < PAGE:
            return rows
        offset += PAGE


def dump_users(c: Client) -> list:
    users, page = [], 1
    while True:
        res = c.json("GET", f"/auth/v1/admin/users?page={page}&per_page=100")
        batch = res.get("users", []) if isinstance(res, dict) else res
        users.extend(
            {k: u.get(k) for k in ("id", "email", "created_at", "last_sign_in_at", "email_confirmed_at")}
            for u in batch
        )
        if len(batch) < 100:
            return users
        page += 1


def list_objects(c: Client, prefix: str = "") -> list[str]:
    found, offset = [], 0
    while True:
        items = c.json("POST", f"/storage/v1/object/list/{BUCKET}",
                       body={"prefix": prefix, "limit": PAGE, "offset": offset})
        for item in items:
            path = f"{prefix}/{item['name']}" if prefix else item["name"]
            if item.get("id") is None:  # id がないのはフォルダ
                found.extend(list_objects(c, path))
            else:
                found.append(path)
        if len(items) < PAGE:
            return found
        offset += PAGE


def download(c: Client, path: str, dest: Path) -> int:
    quoted = "/".join(urllib.parse.quote(part) for part in path.split("/"))
    raw, _ = c.request("GET", f"/storage/v1/object/{BUCKET}/{quoted}")
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(raw)
    return len(raw)


def main() -> None:
    parser = argparse.ArgumentParser(description="脚本棚のデータとPDFをバックアップする")
    parser.add_argument("--no-pdf", action="store_true", help="PDFをダウンロードしない")
    parser.add_argument("--out", default=str(ROOT / "backups"), help="保存先フォルダ")
    args = parser.parse_args()

    url, key = load_env()
    c = Client(url, key)
    out = Path(args.out) / datetime.now().strftime("%Y%m%d-%H%M%S")
    out.mkdir(parents=True, exist_ok=True)
    print(f"保存先: {out}")

    summary = {"created_at": datetime.now().isoformat(timespec="seconds"), "supabase_url": url, "tables": {}}
    for table in TABLES:
        rows = dump_table(c, table)
        (out / f"{table}.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
        summary["tables"][table] = len(rows)
        print(f"  {table}: {len(rows)}件")

    users = dump_users(c)
    (out / "auth_users.json").write_text(json.dumps(users, ensure_ascii=False, indent=2), encoding="utf-8")
    summary["auth_users"] = len(users)
    print(f"  ユーザー: {len(users)}人")

    scripts = json.loads((out / "scripts.json").read_text(encoding="utf-8"))
    referenced = {s["pdf_path"] for s in scripts}

    if not args.no_pdf:
        total, failed = 0, []
        for i, s in enumerate(scripts, 1):
            try:
                total += download(c, s["pdf_path"], out / "pdfs" / s["pdf_path"])
            except RuntimeError as e:
                failed.append({"script_id": s["id"], "title": s["title"], "error": str(e)})
            print(f"\r  PDF: {i}/{len(scripts)}", end="", flush=True)
        print()
        summary["pdfs"] = {"downloaded": len(scripts) - len(failed), "bytes": total, "failed": failed}
        for f in failed:
            print(f"  ! PDFを保存できませんでした: {f['title']}（{f['error']}）")

    # 投稿の途中で失敗したりして残った PDF。一覧にするだけで消さない
    try:
        orphans = sorted(set(list_objects(c)) - referenced)
        summary["unreferenced_pdfs"] = orphans
        if orphans:
            print(f"  どの脚本にも使われていないPDFが {len(orphans)} 件あります（summary.json に一覧）")
    except RuntimeError as e:
        summary["unreferenced_pdfs_error"] = str(e)

    (out / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print("完了。招待コードやメールアドレスも入っているので、GitHub などには置かないこと")


if __name__ == "__main__":
    main()
