# HackMD Author Colors

HackMD の共同編集時に表示される編集者ごとの色を、より見分けやすい色に置き換える userscript です。

HackMD では共同編集者ごとに色が自動で割り当てられますが、場合によっては非常に近い色が割り当てられ、誰が編集した箇所なのか判別しづらくなることがあります。

この userscript を導入すると、共同編集者の色をあらかじめ用意した見分けやすいパレットから割り当てるようになります。

また、各 HackMD ノートの YAML front matter で、ユーザー名ごとに色を指定することもできます。

## 機能

* HackMD の共同編集者の色を、見分けやすい色に置き換えます
* 以下の表示に同じ色を使用します

  * 編集箇所の authorship 表示
  * 左端の authorship gutter
  * 他の共同編集者のリアルタイムカーソル
* HackMD 上の表示名ごとに色を明示的に指定できます
* 色の指定は YAML front matter に記述できます
* 色が指定されていないユーザーには自動で色を割り当てます
* YAML front matter の設定を変更すると、自動的に表示へ反映されます

## インストール

Tampermonkey や Violentmonkey などの userscript manager をインストールしてください。

* [Tampermonkey](https://www.tampermonkey.net/)
* [Violentmonkey](https://violentmonkey.github.io/)

その後、このリポジトリの `hackmd_author_colors.user.js` をインストールしてください。

インストール後、HackMD のページを開くか再読み込みすると有効になります。

## 使い方

特に設定しなくても動作します。

色が指定されていない共同編集者には、あらかじめ定義されたパレットから自動的に色が割り当てられます。

### ユーザーごとに色を指定する

HackMD ノートの先頭にある YAML front matter に `author-colors` を追加します。

```yaml
---
tags:
  - contest
  - meeting

author-colors:
  Alice: "#E41A1C"
  Bob: "#377EB8"
  Carol: "#4DAF4A"
---
```

`author-colors` のキーには、HackMD 上で表示されているユーザー名を指定します。

上の例では、

* `Alice` は `#E41A1C`
* `Bob` は `#377EB8`
* `Carol` は `#4DAF4A`

で表示されます。

`author-colors` に指定されていないユーザーには、自動で色が割り当てられます。

例えば、

```yaml
---
author-colors:
  Alice: "#E41A1C"
  Bob: "#377EB8"
---
```

とした場合、`Alice` と `Bob` は指定した色になり、それ以外の共同編集者には自動で色が割り当てられます。

### 空白や記号を含むユーザー名

必要に応じてユーザー名を引用符で囲むことができます。

```yaml
---
author-colors:
  "Alice Smith": "#E41A1C"
  "foo: bar": "#377EB8"
---
```

シングルクォートとダブルクォートの両方に対応しています。

### コメント

色の後ろにコメントを書くこともできます。

```yaml
---
author-colors:
  Alice: "#E41A1C"  # red
  Bob: "#377EB8"    # blue
---
```

## 自動で割り当てる色について

userscript 内には、互いに見分けやすい色を集めたパレットが定義されています。

色が明示的に指定されていないユーザーには、現在使われている色からできるだけ離れたパレット色を割り当てます。

YAML front matter で明示的に指定された色も考慮されます。

## YAML front matter との共存

この userscript が読むのは `author-colors` の部分だけです。

そのため、`tags` など他の項目と一緒に使用できます。

```yaml
---
tags:
  - example

title: Example

author-colors:
  Alice: "#E41A1C"
---
```

なお、この userscript は YAML 全体を解析する汎用 parser を持っているわけではなく、`author-colors` を読み取るために必要な範囲のみを簡易的に解析しています。

## 制限事項

### ユーザーの識別には表示名を使用しています

色の割り当てには HackMD 上の表示名を使用しています。

そのため、まったく同じ表示名の共同編集者が複数いる場合、それらを区別することはできません。

### HackMD の内部実装に依存しています

この userscript は、HackMD の authorship 表示や共同編集カーソルの DOM 構造を利用しています。

HackMD 側の実装が変更された場合、userscript が正常に動作しなくなる可能性があります。

HackMD の更新後に動作しなくなった場合は、Issue で報告してください。

### 色の変更はローカル表示のみです

この userscript が変更するのは、自分のブラウザ上での表示だけです。

HackMD が保持している元の共同編集者色そのものは変更しません。

そのため、他の共同編集者にも同じ色で表示してもらうには、その人もこの userscript をインストールする必要があります。

一方で、YAML front matter の `author-colors` 設定自体はノートに保存されるため、同じ userscript を使用している人同士では同じ設定を共有できます。

## デバッグ

ブラウザの開発者コンソールから、現在の割り当てを確認できます。

```js
hackmdAuthorColors.configured
hackmdAuthorColors.automatic
hackmdAuthorColors.seen
```

設定を再読み込みし、すべての色を再適用するには次を実行します。

```js
hackmdAuthorColors.refresh()
```

## License

[LICENSE](LICENSE) を参照してください。

## Disclaimer

このプロジェクトは HackMD の公式プロジェクトではなく、HackMD による提供・承認を受けたものではありません。
