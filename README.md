# 脚本棚

熊大映研 Qbrick 制作班の脚本置き場。https://kirikiri-p.github.io/Qbrick_scripts/

- 画面: 素の HTML / CSS / JS（ビルドなし）。GitHub Pages で公開
- DB・ログイン・PDF: Supabase（無料プラン）
- バックアップ: `tools/backup.py`

管理と引き継ぎは [docs/HANDOVER.md](docs/HANDOVER.md)。

## 中身

```
index.html
css/style.css
js/config.js          接続先、ジャンル、長さの目安など。だいたいここだけ触ればいい
js/app.js             画面の切り替えとログイン状態
js/lib/               Supabase、表示用の小物、PDF表示
js/views/             各画面
supabase/schema.sql   テーブル・権限（RLS）・関数・PDF置き場
tools/backup.py
vendor/               supabase-js 2.118.0 / pdf.js 6.4.299（legacy ビルド）
img/                  ロゴ
```

## 手元で動かす

```
python3 -m http.server 8000
```

http://localhost:8000/ を開く。ログインまで試すなら Supabase の Redirect URLs に `http://localhost:8000/**` を足す。

## 一から作り直すとき

1. Supabase で新しいプロジェクトを作り、SQL Editor で `supabase/schema.sql` を流す
2. 招待コードを入れる
   ```sql
   insert into public.app_secrets (key, value) values ('invite_code', '8文字以上のコード');
   ```
3. Authentication > URL Configuration
   - Site URL: サイトのURL
   - Redirect URLs: サイトのURL と、その末尾に `**` を付けたもの
4. 確認メールについて: Supabase 標準のメール送信は1時間に数通しか送れない。新入生がまとめて登録すると詰まるので、Email の「Confirm email」を切るか、SMTP（Resend など）をつなぐ
5. `js/config.js` に Project URL と publishable key（`sb_publishable_…`）を書く。secret key は書かない
6. GitHub Pages: Settings > Pages で main / root。無料プランだと Public リポジトリしか使えない（秘密の情報はコードに入っていないので問題なし）
7. 自分のアカウントを登録してから、管理者にする
   ```sql
   update public.profiles set is_admin = true, is_member = true
    where id = (select id from auth.users where email = '自分のメール');
   ```

## ライセンス

- supabase-js: MIT（`vendor/supabase/LICENSE`）
- pdf.js: Apache 2.0（`vendor/pdfjs/LICENSE`）
- Klee One（Google Fonts）: SIL Open Font License
