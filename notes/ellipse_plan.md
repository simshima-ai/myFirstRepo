## Ellipse Support Plan

### 方針
- UI は円ツール内の `Mode` で `Circle / Ellipse` を切り替える
- 内部 shape は既存 `circle` を流用せず、新規 `ellipse` を追加する
- 最初は最小実装に切り、既存の `circle` / `arc` 前提コードは壊さない

### 推奨 shape schema
```js
{
  type: "ellipse",
  cx, cy,
  rx, ry,
  rotationDeg,
  lineWidthMm,
  lineType,
  color,
  layerId,
  groupId
}
```

### 最初に触るファイル
- `cad/app_tools_misc.js`
  - `createCircle(...)` の隣に `createEllipse(...)` を追加
- `cad/app_input_pointer_draw.js`
  - 円ツールの確定処理で `circle` / `ellipse` を mode 分岐
- `cad/app_input_setup.js`
  - 円ツールのプレビュー生成に楕円プレビューを追加
- `cad/render.js`
  - `shape.type === "ellipse"` 描画を追加
- `cad/state.js`
  - `circleSettings` に `shapeMode` と楕円用パラメータを追加
- `cad/ui_i18n.js`
  - 円ツール mode 文言に `Ellipse` を追加
- `cad/ui_refresh_tool_panels.js`
  - 円ツールの mode 表示切替
- `cad/ui_init_tail_events.js`
  - mode 変更イベント反映

### 最小実装で追加確認が必要な箇所
- `cad/app_selection.js`
  - 選択、移動で `ellipse` を扱う
- `cad/ui_group_context.js`
  - shape type 名表示
- 保存/読込系
  - `ellipse` shape がそのまま保持されるか確認

### 最初の実装目標
- 円ツールで楕円を作れる
- 楕円をプレビューできる
- 楕円を描画できる
- 楕円を選択して移動できる
- 保存/読込で壊れない

### 後回しにするもの
- フィレット
- トリム
- 楕円弧
- 寸法
- object snap の完全対応
- hatch boundary の完全対応
- DXF の完全対応

### 実装順
1. `ellipse` shape を追加
2. 円ツール `Mode` に `Circle / Ellipse` を追加
3. 楕円のプレビューと確定
4. 描画
5. 選択、移動、グループ移動
6. 保存/読込確認

### 補足
- 最初から `ellipse` と `ellipticArc` を同時にやると範囲が大きすぎる
- `circle` は既存資産として維持し、`ellipse` を別 shape として段階導入する方が安全
