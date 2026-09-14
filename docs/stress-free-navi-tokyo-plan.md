# やさしいナビ東京 実装計画 — 運転技術・心理的負荷の軽減（ソフト面）

## 課題の整理

- **現状:** ナビが「最短時間」優先で、短い合流・急な車線変更・複雑交差点などを通らせる
- **課題:** 判断が追いつかず焦り・パニック → 迷走・事故リスク増
- **あるべき姿:** スキルに合わせた「判断の猶予（ゆとり）」を確保し、認知負荷とストレスを最小化する

---

## 現状コードの制約

| 箇所 | 現状 | 不足点 |
|------|------|--------|
| `src/services/mapService.ts:calculateRoute` | OSRM最短1本のみ取得 | ドライバー特性・右折回避の概念なし |
| `src/types.ts:RouteResult / RouteStep` | 距離・時間のみ | ストレス要因（右折数・合流・道路種別）を持てない |
| `src/components/MapContainer.tsx` | Leaflet 2Dのみ | 高架 / 高速の立体表現なし |
| `src/components/RoutePanel.tsx` | 車・徒歩・自転車のみ | 初心者・高齢者・ゆとりモードなし |

---

## 1. 共通基盤【最初にやる】

- [ ] `src/types.ts` 拡張
  - `DriverProfile = 'beginner' | 'elderly' | 'yutori' | 'standard'`
  - `RouteStep` に追加: `turnType: 'right' | 'left' | 'straight' | 'merge' | 'ramp'`, `roadClass`, `laneCount?`
  - `RouteResult` に追加: `stressScore`, `rightTurnCount`, `alternatives?`
- [ ] `src/data/driverProfiles.ts` 新規作成
  - 各プロファイルの重み定義（右折ペナルティ、幹線優先度、合流猶予距離など）
- [ ] `App.tsx` 修正
  - `driverProfile` state 追加 + localStorage 永続化

---

## 2. ドライバータイプ設定 + 右折回避イージーアシストルート【セット推奨】

> OSRMに右折回避パラメータはないため、クライアント側スコアリングで実現する

- [ ] `mapService.ts:calculateRoute(start, end, mode, profile)` に拡張
  - `?alternatives=3&overview=full&steps=true` で3案取得
  - `scoreRoute()` 新規: 右折数 ×10 + 多車線またぎ推定 + 細街路ペナルティ − 幹線ボーナス で採点
  - `yutori / beginner` 時は最小スコア案を選択、最短案と比較用に両方返却
- [ ] `translateInstruction` 強化
  - OSRM `maneuver.modifier` から右折 / 左折を正確に判定
- [ ] `RoutePanel.tsx` UI追加
  - プロファイル選択（初心者 / 高齢者 / ゆとり / 標準）
  - 「最短 vs ゆとり」比較カード + ストレス度表示

---

## 3. 超・先回りアドバイス（ゆとり車線変更案内）

> 直前ではなく「1〜2km手前」から段階的にアシストする

- [ ] `src/services/laneGuidance.ts` 新規作成
  - `steps` → `LaneAdvice { atDistance, laneIllustration, message }` に変換
  - しきい値: 1000m / 2000m
- [ ] `src/components/LaneGuidanceCard.tsx` 新規作成
  - シンプル車線イラスト（SVG）+ 段階表示
- [ ] 音声案内
  - `speechSynthesis` で「1km先 左2車線キープ」読み上げ + ON/OFF切替
- [ ] `RoutePanel` の手順リストを距離ベースの先回りソートに変更

---

## 4. 首都高アシスト（合流タイミング・レーンナビ）

- [ ] 首都高判定ロジック追加
  - `step.name` に `首都高 | C1 | C2 | 湾岸 | 上野線` を含むかで検出
- [ ] `src/components/ShutoMergeAssist.tsx` 新規作成
  - 合流までの残距離プログレスバー + 本線イラスト + 「心の準備」メッセージ
- [ ] `MapContainer.tsx` 修正
  - 合流区間ポリラインを色変え（例: オレンジ太線）で強調

---

## 5. 2D/3D立体階層表示（高架下 vs 高速の明確化UI）

> Leafletでは真の3Dは不可のため、疑似立体で割り切る

### MVP案（推奨）

- [ ] `src/components/ElevatedBadge.tsx` 新規作成
  - 「高速走行中 / 高架下一般道」バッジ + ジャンクション簡易断面図（SVG）
- [ ] 判定ロジック
  - OSM Overpass APIで `bridge / tunnel / layer` タグ取得、なければ step名 + ズームで推定
- [ ] ルート線の二重描画
  - 高速 = 青太線 + 影、高架下 = 破線で誤認防止

### 本格3D案（後期検討）

- MapLibre GL + `extrude` 導入 = 移行コスト大のため後回し推奨

---

## 推奨実装順序（MVP）

1. 共通型 + プロファイル設定UI（0.5日）
2. 右折回避スコアリング + 代替ルート比較（コア価値・1〜2日）
3. 先回り車線案内UI + 音声（1日）
4. 首都高合流アシスト（0.5〜1日）
5. 高架判定バッジ（0.5日）→ 3Dは後期検討

---

## 次アクション

- `② + ⑤セット` から `RoutePanel + mapService` の実装着手が最短
- ブランチ: `feature/stress-free-navi-tokyo` で作業継続
