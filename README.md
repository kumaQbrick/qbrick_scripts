# 脚本棚

熊大映研 Qbrick 制作班の脚本置き場。

- 画面: 素の HTML / CSS / JS（ビルドなし）。GitHub Pages で公開
- DB・ログイン・PDF置き場: Supabase
- PDFの表示: pdf.js（`vendor/` に入れてる）

## 動かし方

1. Supabase でプロジェクトを作って、SQL Editor で `supabase/schema.sql` を流す
2. 招待コードを入れる
   ```sql
   insert into public.app_secrets (key, value) values ('invite_code', '8文字以上のコード');
   ```
3. `js/config.js` に Project URL と publishable key を書く
4. `python3 -m http.server 8000` で http://localhost:8000/ を開く
5. 自分を管理者にする: `update public.profiles set is_admin = true where display_name = '自分の名前';`
