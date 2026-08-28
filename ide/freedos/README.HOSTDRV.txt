HOSTDRV.COM bundled here / 同梱している HOSTDRV.COM について
==============================================================

[English]

HOSTDRV.COM is a DOS TSR (terminate-and-stay-resident) driver from the
"NP2kai" (Neko Project II kai) project that exposes the emulator host's
"hostdrv" virtual drive as a DOS drive letter inside the guest OS. It is
unmodified from the copy found at NP2kai's `np2tool/HOSTDRV.COM`
(sha256 acafaa74c7e35c0a3517566aefc22c78250149633d8175503fe766ff7a91ef43,
1031 bytes). It is stored in this directory as `HOSTDRV.COM.bin` (not
`HOSTDRV.COM`) because this project's `.gitignore` treats `*.COM` as a
build artifact, not source; the `.bin` name keeps it a tracked, vendored
asset like `toolchain/nasm-wasm/nasm.wasm`. The embedded 8.3 name inside
the generated boot image is still `HOSTDRV.COM`, unaffected by this
filename on disk.

License: modified BSD ("Redistributions of source code..." 3-clause style),
copyright (c) 1999-2025 NP2 developer team. See LICENSE.HOSTDRV.TXT in this
directory for the exact terms (copied verbatim, in the original Shift_JIS
encoding, from NP2kai's `LICENSES/LICENSE.TXT`).

`toolchain/build-hostdrv-fd.mjs` combines this file with the bundled
FreeDOS(98) boot image (`fd98_2hd.xdf`, unmodified, see README.txt in this
directory) to produce a development boot image in which `AUTOEXEC.BAT`
resident-loads HOSTDRV.COM against drive D: automatically. This lets the IDE
hand build output to the guest via `writeHostFile()` instead of assembling a
fresh floppy image for every run; see WorkbenchNP2's top-level README for how
this "hostdrv route" runs alongside the original floppy-image route.


[日本語]

HOSTDRV.COM は、「NP2kai」(Neko Project II kai) プロジェクトのDOS用TSR
(常駐)ドライバで、エミュレータのホスト側フォルダを仮想ドライブとしてゲスト
OS内のドライブ文字へ見せます。NP2kai の `np2tool/HOSTDRV.COM` から無改変で
取得しています
(sha256 acafaa74c7e35c0a3517566aefc22c78250149633d8175503fe766ff7a91ef43、
1031バイト)。このディレクトリでは `HOSTDRV.COM` ではなく `HOSTDRV.COM.bin` と
いう名前で保存しています。このプロジェクトの `.gitignore` は `*.COM` を
ビルド成果物(ソースではない)として除外するため、`toolchain/nasm-wasm/nasm.wasm`
などと同様に追跡対象の同梱資産として残すには拡張子を変える必要があるためです。
生成する起動イメージへ埋め込む8.3名は引き続き `HOSTDRV.COM` で、ディスク上の
このファイル名には影響されません。

ライセンス: 修正BSDライセンス(「ソースコードの再配布は...」の3条項形式)、
Copyright (c) 1999-2025 NP2 developer team。正確な条文は同ディレクトリの
LICENSE.HOSTDRV.TXT を参照(NP2kai の `LICENSES/LICENSE.TXT` から元の
Shift_JISエンコーディングのまま複製)。

`toolchain/build-hostdrv-fd.mjs` は、このファイルと同梱のFreeDOS(98)起動
イメージ(`fd98_2hd.xdf`、無改変。このディレクトリのREADME.txtを参照)を
組み合わせ、`AUTOEXEC.BAT` が起動直後に HOSTDRV.COM をドライブD:向けに
自動常駐させる開発用起動イメージを生成します。これによりIDEは毎回フロッピー
イメージを組み立て直す代わりに `writeHostFile()` でビルド成果物をゲストへ
渡せます。従来のフロッピーイメージ経由の経路と並走させる方式については、
このプロジェクトのトップレベルREADMEを参照してください。
