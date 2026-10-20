# 脚本棚（Qbrick 制作班）

熊本大学 映画研究サークル Qbrick 制作班の脚本を集めておくサイトです。
採用されなかった脚本も含めて、PDF で投稿・閲覧し、いいねやコメントで感想を伝えられます。

- 画面：HTML / CSS / JavaScript（ビルド不要。GitHub Pages にそのまま置ける）
- データ・ログイン・PDF 保存：[Supabase](https://supabase.com)（無料プラン）
- バックアップ：Python スクリプト（標準ライブラリのみ）

仕様の詳細は [docs/SPEC.md](docs/SPEC.md)、管理者の引き継ぎは [docs/HANDOVER.md](docs/HANDOVER.md) を見てください。

---

## ファイル構成

```
index.html            入口（これ1枚のページの中で画面を切り替える）
css/style.css         見た目
js/config.js          設定（Supabase の接続先、ジャンル、長さの目安など）← 主に触るのはここ
js/app.js             画面の切り替え・ログイン状態
js/lib/               共通の部品（Supabase 接続、表示用ヘルパー、PDF表示）
js/views/             各画面（一覧・詳細・投稿・ログイン・アカウント・管理・使い方）
supabase/schema.sql   データベースの定義（テーブル・権限・関数・PDF置き場）
tools/backup.py       バックアップ用スクリプト
vendor/               同梱している外部ライブラリ（supabase-js, pdf.js）
docs/                 仕様書と引き継ぎ手順
```

---

## はじめてのセットアップ

所要時間の目安は30分〜1時間です。Supabase と GitHub の画面の名前は、サービス側の変更で少し変わることがあります。

### 1. サークル用のアカウントを用意する

個人のアカウントで作ると、その人が卒業したときに引き継げなくなります。
サークル用の Google アカウント（例: qbrick.seisaku@gmail.com）を1つ作り、Supabase と GitHub はそれで登録するか、GitHub は Organization（組織）を作ってそこにリポジトリを置くのがおすすめです。

### 2. Supabase のプロジェクトを作る

1. https://supabase.com にサークル用アカウントでログインし、新しいプロジェクトを作る
   - Region は Northeast Asia (Tokyo) を選ぶと速いです
   - Database Password は控えておく（サイトでは使いませんが、引き継ぎ資料として保管）
2. 左メニューの **SQL Editor** を開き、`supabase/schema.sql` の中身を全部貼り付けて **Run**
3. 続けて、同じ SQL Editor で招待コードを設定する（8文字以上・推測されにくいもの）

   ```sql
   insert into public.app_secrets (key, value) values ('invite_code', 'ここに招待コード');
   ```

   あとから管理ページで変更できます。

### 3. ログインの設定（Supabase）

**Authentication > URL Configuration**

- **Site URL**：サイトの公開URL（例 `https://qbrick-xxx.github.io/script-shelf/`）
- **Redirect URLs**：同じURLを追加。手元で試すなら `http://localhost:8000/` も追加

**確認メールについて（大事）**

Supabase 標準のメール送信は、1時間に送れる数がとても少なく制限されています（2026年時点の情報では1時間に2通程度。最新の値はダッシュボードの Authentication > Rate Limits で確認してください）。
新入生がまとめて登録すると、確認メールが届かなくなります。次のどちらかにしてください。

- **A. 確認メールをオフにする（手軽）**：Authentication の Email プロバイダ設定で「Confirm email」をオフ。登録するとすぐログインできます。メンバーになるには招待コードが必要なので、知らない人が入ってくることはありません。ただし、パスワード再設定メールは引き続き同じ制限を受けます。
- **B. 外部のメール送信サービスをつなぐ**：Authentication の SMTP Settings で、Resend や Brevo などの SMTP を設定すると制限が大きく緩みます。

### 4. サイトの設定

`js/config.js` を開き、次の2つを書き換えます（Supabase の **Project Settings > API Keys** にあります）。

```js
export const SUPABASE_URL = 'https://xxxxxxxx.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_xxxxxxxx';
```

- **Publishable key**（`sb_publishable_` で始まる）は公開されても大丈夫な鍵です。データの守りはデータベース側の権限ルール（RLS）で行っています。
- **Secret key**（`sb_secret_` で始まる）は**絶対にここに書かない**でください。すべてのデータを読み書きできる鍵です。古いプロジェクトでは anon key / service_role key という名前になっています（anon が公開用、service_role が秘密）。

### 5. GitHub Pages で公開する

1. GitHub にリポジトリを作り、このフォルダの中身を push する
   - 無料プランの GitHub Pages は **Public（公開）リポジトリ** でしか使えません。コードに秘密の情報は入っていないので公開で問題ありません（`tools/.env` と `backups/` は .gitignore 済み）
2. リポジトリの **Settings > Pages** で、Source を「Deploy from a branch」、Branch を `main` / `/(root)` にして保存
3. 数分後に表示されるURLを開いて確認。そのURLを手順3の Site URL / Redirect URLs に入れる

### 6. 最初の管理者を決める

1. サイトの「アカウント登録」から自分のアカウントを作る（招待コードも入れる）
2. Supabase の SQL Editor で、自分を管理者にする

   ```sql
   update public.profiles
      set is_admin = true, is_member = true
    where id = (select id from auth.users where email = 'あなたのメールアドレス');
   ```

3. サイトを再読み込みすると、メニューに「管理」が出ます。2人目以降の管理者は管理ページから指定できます。

---

## 手元で動かす

ビルドは不要です。ローカルサーバーを立てて開くだけです（`file://` で直接開くと動きません）。

```bash
python3 -m http.server 8000
# → http://localhost:8000/ を開く
```

`http://localhost:8000/` を Supabase の Redirect URLs に入れておくと、ログインまわりも試せます。

---

## よく触る設定

`js/config.js` で変えられます。

| 項目 | 内容 |
|---|---|
| `GENRES` | ジャンルの選択肢。名前を変えると、古い名前の脚本は絞り込みに出なくなる |
| `LENGTHS` | 短編・中編・長編の表示名と目安（目安の分数はサークルで決めて書き換えてください） |
| `PERMISSIONS` / `VISIBILITIES` | 使用許可・公開範囲の説明文 |
| `MAX_PDF_MB` | PDF の上限。変えるときは `schema.sql` のバケット設定（`file_size_limit`）も合わせて変える |

---

## 無料プランで気をつけること

2026年10月時点の Supabase 公式の料金ページによると、無料プランには次の制限があります。変わることがあるので、https://supabase.com/pricing で最新の内容を確認してください。

- **1週間アクセスがないとプロジェクトが一時停止する**。長期休暇明けなどにサイトが動かないときは、Supabase のダッシュボードを開いて再開（Restore）してください
- ファイル保存は合計 1GB、1ファイル 50MB まで（このサイトでは 20MB に制限）
- データベースは 500MB まで
- **自動バックアップがない** → `tools/backup.py` で定期的にバックアップを取ってください（[docs/HANDOVER.md](docs/HANDOVER.md)）

---

## ライセンス表記

`vendor/` に次のライブラリを同梱しています。

- supabase-js 2.118.0（MIT License）`vendor/supabase/LICENSE`
- pdf.js（pdfjs-dist 6.4.299 の legacy ビルド、Apache License 2.0）`vendor/pdfjs/LICENSE`

フォント：Shippori Mincho（Google Fonts, SIL Open Font License）
