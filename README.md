# AETHERFALL — build r5 (Stage 2: 主人公)

Three.js r160(CDN固定: cdn.jsdelivr.net)。ビルド不要。**フォルダなし(全ファイルをリポジトリ直下)**構成です。

## 更新方法(重要)
ZIPを展開し、**全ファイルを選んで**リポジトリ直下にアップロード(同名は上書き)。
一部だけ上げると古いファイルが混ざります。混在した場合は画面下に「古いファイルが残っています: …」と出ます。
正しく更新されると、Safariのタブ名と左上の表示に `r5` と出ます。

## 操作
- ドラッグ: 回転 / ピンチ: ズーム / 右上: 視点(正面・側面・背面・斜め)、回転、品質、露出
- キー 1〜4: 品質 Low〜Ultra

## ファイル
index.html / style.css / main.js / renderer.js / quality.js / loop.js / input.js / save.js / eventbus.js /
env.js(環境マップ) / testScene.js(地形・ライト・展示台) / debugPanel.js / hero.js(主人公)

## 主人公(hero.js)
関節ごとのグループ階層(pelvis, spine, chest, neck, head, 腕, 脚, ponytail, cape, weapon)に、
素材別に結合したメッシュを載せたリジッド・リグ。スキニングはしていません(関節は球で覆っています)。
後からGLBに差し替える場合は `buildHero()` の戻り値(root / joints / update)を保ってください。

## 既知の制限(r5時点)
- 描画・動作は私の環境では未確認(Node構文チェックのみ)。実機確認が必要です。
- スカートは剛体パネルのため、脚を大きく動かす第3段階で干渉する可能性があります。
- 指は簡略化(握り手なし)。表情の変化は未実装。
