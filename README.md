# AETHERFALL — Stage 1: レンダリング基盤

Three.js r160(CDN固定: cdn.jsdelivr.net)。ビルド不要。

## 起動
ES Modulesを使うため `file://` では動きません。HTTP経由で開いてください。
- ローカル: このフォルダで `python3 -m http.server 8000` → http://localhost:8000
- GitHub Pages: リポジトリのルートにこの中身を置き、Settings → Pages → Branch: main / root を選択

## 操作(Stage 1)
- ドラッグ: カメラ回転 / ホイール・ピンチ: ズーム
- キー 1〜4: 品質 Low / Medium / High / Ultra
- 右上: 品質、自動調整、露出

## 見るべき点
画面中央の7個の球は素材の検証用です(肌・髪・布・明るい金属・暗い装甲・石・発光結晶)。
**暗い装甲を含め、どれも真っ黒にならず質感の違いが見えること**が合格条件です。
左上の統計で、品質切替によりDPR・影・ポスト処理・粒子数が実際に変わることを確認できます。

## 構成
- src/core: eventbus, save, quality, loop, input, renderer(Composer: Render→Bloom→Vignette→Output)
- src/world/testScene.js: 起伏地形、4灯ライト、PMREM環境光、素材サンプル、浮遊粒子
- src/ui/debugPanel.js: 統計と自動品質調整の通知

## 色の扱い(黒シルエット対策)
`outputColorSpace=SRGB`、ACESFilmic、トーンマッピング/色変換はOutputPassで一度だけ実施。
RoomEnvironmentのPMREMを`scene.environment`に設定し、金属が黒くならないようにしています。
