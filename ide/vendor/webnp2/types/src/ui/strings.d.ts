export type Lang = 'ja' | 'en';
interface Dict {
    title(): string;
    /** ページフッターの著作権表示ラベル（urara-works.jpへのリンク）。 */
    footerCopyright(): string;
    /** ページフッターの本リポジトリGitHubリンクのラベル。 */
    footerGithubLabel(): string;
    /** ページフッターの「WebNP2について」リンクのラベル（about.htmlへの導線）。 */
    footerAboutLabel(): string;
    /** ツールバーの「使い方」ボタン。help.htmlを別タブで開く。 */
    toolbarHelp(): string;
    /** ツールバーの「…」オーバーフローボタンのツールチップ/メニュー見出し。 */
    toolbarMore(): string;
    toolbarGroupInput(): string;
    toolbarGroupDisk(): string;
    toolbarGroupState(): string;
    overlayNote1(): string;
    overlayNote2(): string;
    startBtn(): string;
    startBtnPlain(): string;
    /** 起動前にディスクをセット済みのときの起動ボタン。 */
    startBtnPending(): string;
    startBtnFreeDos(): string;
    toolbarReset(): string;
    toolbarFullscreen(): string;
    toolbarMachineReset(): string;
    toolbarScreenshot(): string;
    statusScreenshotSaved(): string;
    toolbarMouse(): string;
    statusMouseCaptured(): string;
    statusMouseReleased(): string;
    /** ツールバーの「マウス追従」ボタン。 */
    toolbarMouseResync(): string;
    statusMouseResynced(): string;
    toolbarSaveState(): string;
    toolbarLoadState(): string;
    /** 「…」メニュー内の言語設定行。 */
    toolbarLanguage(): string;
    resetConfirm(): string;
    fdSlotLabel(args: {
        drive: number;
    }): string;
    hddSlotLabel(): string;
    fdEmpty(): string;
    fdInsert(): string;
    hddInsertSet(): string;
    hddEject(): string;
    /** HDDスロットの「ライブラリからセット」ボタン(起動前のみ)。 */
    hddSetFromLibrary(): string;
    /** 「ライブラリからセット」メニューの見出し。 */
    hddSetFromLibraryTitle(): string;
    /** HDDスロットの「ブランクHDD作成」ボタン(起動前のみ)。 */
    hddCreateBlank(): string;
    fdInsertFreeDos(): string;
    /** ドライブアクセスランプのスクリーンリーダー向けラベル。 */
    diskLampLabel(args: {
        drive: string;
    }): string;
    /** FDDスロットの「ライブラリから挿入」ボタン(ツールチップ)。 */
    fdInsertFromLibrary(): string;
    /** 「ライブラリから挿入」メニューの見出し。 */
    fdInsertFromLibraryTitle(args: {
        drive: number;
    }): string;
    fdEject(): string;
    fdCreateBlank(): string;
    slotDownload(): string;
    /** 起動前にFDスロット行へディスクイメージをドロップしたときの案内。 */
    statusMachineReset(): string;
    statusStateSaved(): string;
    statusStateLoaded(): string;
    statusFdInserted(args: {
        drive: number;
        name: string;
    }): string;
    statusFdEjected(args: {
        drive: number;
    }): string;
    statusFreeDosInserted(args: {
        drive: number;
    }): string;
    dropUnsupported(): string;
    dropConfirm(args: {
        count: number;
        names: string;
    }): string;
    diskReplaceUnsupported(): string;
    /** ドロップされたファイル(圧縮ファイル含む)にディスクイメージが1つも無かった場合。 */
    dropNoDiskImage(): string;
    /** 圧縮ファイルの展開に失敗した場合。 */
    statusArchiveFailed(args: {
        name: string;
        message: string;
    }): string;
    /** 展開してライブラリへ追加したときの状態表示。 */
    statusLibraryAdded(args: {
        count: number;
    }): string;
    /** URLパラメータ由来の圧縮ファイルを、前回展開済みのライブラリ内容から復元したときの状態表示。 */
    statusArchiveResumed(args: {
        label: string;
        count: number;
    }): string;
    /** URLパラメータ由来の圧縮ファイルにディスクイメージが1つも無かった場合。 */
    statusArchiveNoDiskImage(args: {
        label: string;
    }): string;
    /** URLパラメータ由来の圧縮ファイルに、指定スロットに合う種別のディスクが1つも無かった場合。 */
    statusArchiveKindMismatch(args: {
        label: string;
        kind: 'hdd' | 'fd';
    }): string;
    /** URLパラメータ由来の圧縮ファイルが複数枚のディスクを含むため、起動を中止してライブラリから選ばせるときの状態表示。 */
    statusArchiveNeedsSelection(): string;
    /** 起動せずスロットへセットしたときの状態表示。 */
    statusDiskSet(args: {
        name: string;
    }): string;
    /** セット済みディスクを外したときの状態表示。 */
    statusDiskUnset(args: {
        name: string;
    }): string;
    /** ブランクHDDを作ってセットしたときの状態表示。 */
    statusHddBlankCreated(args: {
        name: string;
    }): string;
    noMountedImage(): string;
    pickSlotPrompt(args: {
        action: string;
        slots: string;
    }): string;
    pickSlotActionReset(): string;
    statusPreparing(): string;
    statusNoImage(): string;
    statusCoreBooting(): string;
    statusBootSuccess(): string;
    statusBootFailed(args: {
        message: string;
    }): string;
    statusResumed(args: {
        label: string;
        name: string;
    }): string;
    /** ?lib=<url> (複数指定可)の取得中/復元時のラベルで使う、何本目のlibか示す表示名(fd1/fd2/hddのラベル相当のlib版)。 */
    urlLibSlotLabel(args: {
        index: number;
    }): string;
    statusFetching(args: {
        label: string;
        name: string;
    }): string;
    statusFetchingProgress(args: {
        label: string;
        name: string;
        loaded: string;
        total: string | null;
    }): string;
    fetchFailedNetwork(args: {
        url: string;
    }): string;
    fetchFailedHttp(args: {
        url: string;
        status: number;
    }): string;
    /** 配信元がOneDrive(1drv.ms/onedrive.live.com/sharepoint.com)だった場合の案内(中継しても取得できないため即座に案内する)。 */
    fetchFailedOneDrive(args: {
        url: string;
    }): string;
    /**
     * 配信元がGoogle Drive/Dropboxで、かつ中継(VITE_DISK_PROXY)が未設定だった場合の案内。
     * Dropboxは通常ホスト名置換(rewriteDropboxUrl)で直接取得できるため、ここへ来るのは
     * 置換で救えない共有リンク(旧/s/形式・フォルダ共有・パスワード付き)の場合のみ。
     */
    fetchFailedNeedsProxy(args: {
        url: string;
    }): string;
    /** 中継サーバ経由の取得が失敗した場合のエラーメッセージ本文(中継側のエラーコードを反映)。 */
    fetchFailedProxy(args: {
        url: string;
        reason: string;
    }): string;
    /** 取得結果がディスクイメージではなくHTML/XMLページだった場合の案内(共有ページURLの誤指定など)。 */
    fetchFailedHtmlPage(args: {
        url: string;
    }): string;
    proxyReasonBadUrl(): string;
    proxyReasonOriginNotAllowed(): string;
    proxyReasonHostNotAllowed(): string;
    proxyReasonTooLarge(): string;
    proxyReasonRateLimited(): string;
    proxyReasonUpstreamFailed(): string;
    proxyReasonRedirectNotAllowed(): string;
    proxyReasonUnknown(args: {
        status: number;
    }): string;
    /** WebMSX方式自動起動(run=1)時、AudioContextがsuspendedのままの間に表示するバナー文言。 */
    audioMuted(): string;
    toolbarRomManager(): string;
    romDialogTitle(): string;
    romDialogDescription(): string;
    romDialogSelectFiles(): string;
    romDialogDropHint(): string;
    romDialogListEmpty(): string;
    romDialogDelete(): string;
    romDialogReloadNote(): string;
    romDialogReloadBtn(): string;
    romDialogClose(): string;
    romDialogSaved(args: {
        saved: number;
        skipped: number;
    }): string;
    romDialogSkippedNote(args: {
        names: string;
    }): string;
    /** リズム波形WAVがfmgenの受け入れ条件を満たさず登録できなかった場合の一覧文言。 */
    romDialogRejectedNote(args: {
        items: string;
    }): string;
    rhythmRejectReasonNotRiffWave(): string;
    rhythmRejectReasonNoFmtChunk(): string;
    rhythmRejectReasonNotPcm(): string;
    rhythmRejectReasonNotMono(): string;
    rhythmRejectReasonNoDataChunk(): string;
    rhythmRejectReasonTooManySamples(): string;
    rhythmRejectReasonNot16Bit(): string;
    /** オーバーレイの「保存済みディスクから起動」ボタン。 */
    overlayLibraryBtn(): string;
    toolbarDiskLibrary(): string;
    libraryDialogTitle(): string;
    libraryDialogDescription(): string;
    /** ディスクライブラリダイアログの説明文(D&D取り込み直後、特定グループに注目させる場合)。 */
    libraryGroupFocusHint(): string;
    libraryDialogListEmpty(): string;
    libraryKindHdd(): string;
    libraryKindFd(): string;
    libraryActionBoot(): string;
    /** 起動せずHDDスロットへセットするボタン(起動前のみ)。 */
    libraryActionSetHdd(): string;
    libraryActionInsertFd1(): string;
    libraryActionInsertFd2(): string;
    libraryActionDelete(): string;
    libraryActionNeedsRestart(): string;
    libraryDeleteConfirm(args: {
        name: string;
    }): string;
    /** ライブラリの表示名変更ボタン。 */
    libraryActionRename(): string;
    /** 表示名変更プロンプト(元のファイル名を併記する)。 */
    libraryRenamePrompt(args: {
        name: string;
    }): string;
    /** フォルダ(圧縮ファイル由来グループ)の名前変更プロンプト。 */
    libraryRenameGroupPrompt(): string;
    /** フォルダ行に出す枚数表示。 */
    libraryGroupCount(args: {
        count: number;
    }): string;
    /** フォルダごと削除の確認。 */
    libraryDeleteGroupConfirm(args: {
        name: string;
        count: number;
    }): string;
    /** 「ライブラリから挿入」サブメニューの戻る行。 */
    libraryMenuBack(): string;
    libraryDialogClose(): string;
    /** ツールバーの「テキスト送信」ボタン。全角対応のホスト側テキスト送信バーを開く。 */
    toolbarPasteText(): string;
    /** ツールバーの「ソフトキーボード」ボタン。PC-98配列の仮想キーボードパネルを開閉する。 */
    toolbarVirtualKbd(): string;
    /** テキスト送信バーの入力欄プレースホルダ。 */
    pasteBarPlaceholder(): string;
    pasteBarSetupBtn(): string;
    pasteBarSetupNote(): string;
    statusPasteHelperSetup(): string;
    statusPasteHelperOk(): string;
    statusPasteHelperFailed(args: {
        message: string;
    }): string;
    /** テキスト送信バーの「Enter付き」チェックボックスのラベル。 */
    pasteBarEnterLabel(): string;
    /** テキスト送信バーの送信ボタン。 */
    pasteBarSend(): string;
    /** テキスト送信バーの閉じるボタン。 */
    pasteBarClose(): string;
    /** テキスト送信完了後、変換できず送れなかった文字があったときのステータス表示。 */
    statusPasteSkipped(args: {
        count: number;
        chars: string;
    }): string;
    toolbarDebugger(): string;
    debuggerTitle(): string;
    debuggerPause(): string;
    debuggerResume(): string;
    debuggerStep(): string;
    debuggerStep10(): string;
    debuggerRunToBp(): string;
    debuggerClose(): string;
    debuggerRegisters(): string;
    debuggerDisassembly(): string;
    debuggerMemory(): string;
    debuggerMemoryAddress(): string;
    debuggerMemoryRead(): string;
    debuggerMemoryInvalid(): string;
    debuggerPaused(): string;
    debuggerResumed(): string;
    debuggerStepped(args: {
        count: number;
    }): string;
    debuggerAddBreakpoint(): string;
    debuggerRemoveBreakpoint(): string;
    debuggerBreakpointAdded(args: {
        index: number;
        seg: string;
        off: string;
    }): string;
    debuggerBreakpointRemoved(args: {
        seg: string;
        off: string;
    }): string;
    debuggerBreakpointLimit(): string;
    debuggerBreakpointHit(args: {
        index: number;
    }): string;
    debuggerBreakpointMiss(): string;
    /** ツールバーの「ファイル転送」ボタン。 */
    toolbarFileManager(): string;
    fmDialogTitle(): string;
    /** ゲストがフロッピーへアクセス中の転送を避けるよう促す注意書き。 */
    fmDialogNote(): string;
    fmHostPaneTitle(): string;
    fmDiskPaneTitle(): string;
    fmSelectFilesBtn(): string;
    fmDropHint(): string;
    fmStagedEmpty(): string;
    fmArchiveError(args: {
        name: string;
        message: string;
    }): string;
    /** ステージング一覧の1件削除ボタン。 */
    fmRemoveBtn(): string;
    fmTransferToDiskBtn(): string;
    fmTransferToHostBtn(): string;
    fmUnmountedLabel(): string;
    fmMountedBadge(): string;
    fmNotEditableNote(): string;
    fmPathRoot(): string;
    fmUpDir(): string;
    /** ディレクトリ行の[DIR]表記。 */
    fmDirMarker(): string;
    fmDeleteSelectedBtn(): string;
    fmMakeDirBtn(): string;
    fmMakeDirPrompt(): string;
    fmMakeDirInvalidName(args: {
        name: string;
    }): string;
    fmCreateTransferFdBtn(): string;
    fmTransferFdCreated(args: {
        name: string;
    }): string;
    fmFreeSpaceLabel(args: {
        free: string;
        total: string;
    }): string;
    fmSelectEditableTarget(): string;
    fmEmptyDir(): string;
    /** 転送前の8.3名変換確認ダイアログ(元名 → 変換後名の一覧)。 */
    fmRenameConfirm(args: {
        list: string;
    }): string;
    fmOverwriteConfirm(args: {
        names: string;
    }): string;
    fmInsufficientSpace(args: {
        needed: string;
        free: string;
    }): string;
    fmTransferring(args: {
        current: number;
        total: number;
    }): string;
    fmTransferDone(args: {
        succeeded: number;
        failed: number;
    }): string;
    fmTransferFailedDetail(args: {
        names: string;
    }): string;
    fmDeleteConfirm(args: {
        names: string;
    }): string;
    fmCloseBtn(): string;
    fmListLoadFailed(args: {
        message: string;
    }): string;
    /** ツールバーの「ゲームパッド設定」ボタン。 */
    toolbarGamepad(): string;
    gamepadDialogTitle(): string;
    gamepadDialogDescription(): string;
    gamepadDialogClose(): string;
    /** パッド未接続時の案内(Chromeは入力があるまでgetGamepads()に列挙しないため)。 */
    gamepadNoPads(): string;
    gamepadConnectedTitle(): string;
    /** ライブ表示の各パッド見出し(パッド名)。Gamepad API index(0始まり)の生値は出さない。 */
    gamepadLiveTitle(args: {
        name: string;
    }): string;
    gamepadPhysicalTitle(): string;
    /** ライブ表示右カラム(現在コアへ送っているPC-98キー)の見出し。 */
    gamepadKeysTitle(): string;
    gamepadEditingPadLabel(): string;
    gamepadBindingsTitle(): string;
    /** 割当が1件もないときの一覧表示。 */
    gamepadBindingsEmpty(): string;
    /** 割当済み行の未割当キー表示(検出直後、キーをまだ選んでいない状態)。 */
    gamepadUnassignedKeyLabel(): string;
    /** 行の[クリア]ボタン(そのバインディングを解除)。 */
    gamepadClearBtn(): string;
    gamepadClearBtnTitle(): string;
    /** 行の[再検出]ボタン(割り当てるキーは変えず、物理入力だけ検出し直す)。 */
    gamepadRedetectBtn(): string;
    gamepadRedetectBtnTitle(): string;
    /** 新規の物理入力を検出して行を追加するボタン。 */
    gamepadAddBtn(): string;
    gamepadAddBtnTitle(): string;
    gamepadCancelBtn(): string;
    gamepadCancelBtnTitle(): string;
    gamepadDetectWaiting(): string;
    /** 新規検出が成功し、下のキーボードでキーを選ぶ番になったときの案内。 */
    gamepadPendingPickKey(): string;
    /** 行を選択中、下のキーボードでキーを押すと割り当たることを案内する文言。 */
    gamepadRowSelectedHint(): string;
    /** キーピッカーが無効(押しても意味が無い)状態のときにピッカーの近くへ出す案内。行未選択・検出未開始の初期状態用。 */
    gamepadPickerIdleHint(): string;
    gamepadDeadzoneLabel(): string;
    gamepadKeyPickerTitle(): string;
    /** プリセット適用: カーソルキー+z/x。 */
    gamepadPresetCursorZxBtn(): string;
    gamepadPresetCursorZxBtnTitle(): string;
    /** プリセット適用: テンキー方向+SPACE/ENTER。 */
    gamepadPresetTenkeySpaceBtn(): string;
    gamepadPresetTenkeySpaceBtnTitle(): string;
    gamepadButtonLabel(args: {
        index: number;
    }): string;
    gamepadAxisLabel(args: {
        index: number;
        dir: string;
    }): string;
    gamepadAxisInvalidSuffix(): string;
    /** 未較正の軸(観測開始してから一度も動かされていない)。一度動かせば較正され使えるようになることを短く案内する。 */
    gamepadAxisUncalibratedSuffix(): string;
    /** 較正中(一度動かされて静止値の確定待ち)。押しっぱなしの最中に「使えるようになった」と誤解されないようにする。 */
    gamepadAxisCalibratingSuffix(): string;
    gamepadPositionalButtonLabel(args: {
        index: number;
        position: string;
    }): string;
    gamepadPosDown(): string;
    gamepadPosRight(): string;
    gamepadPosLeft(): string;
    gamepadPosUp(): string;
    gamepadPosL(): string;
    gamepadPosR(): string;
    gamepadPosL2(): string;
    gamepadPosR2(): string;
    gamepadPosSelect(): string;
    gamepadPosStart(): string;
    gamepadPosL3(): string;
    gamepadPosR3(): string;
    gamepadPosDpadUp(): string;
    gamepadPosDpadDown(): string;
    gamepadPosDpadLeft(): string;
    gamepadPosDpadRight(): string;
    gamepadPosHome(): string;
    /** ダイアログ見出し・ツールバーボタンとも、ゲームパッド設定からホストキー再割り当てを含む「入力設定」へ格上げ。 */
    inputSettingsDialogTitle(): string;
    inputTabGamepad(): string;
    inputTabHostkey(): string;
    inputTabVpad(): string;
    inputPanelSwitchKeyboard(): string;
    inputPanelSwitchPad(): string;
    inputPanelSwitchTrackpad(): string;
    /** ソフトキーボード内、テンキーブロックの表示/非表示を切り替えるトグルキーのラベル。 */
    kbdToggleTenkey(): string;
    vpadEditAssignmentsMenuItem(): string;
    vpadDialogDescription(): string;
    vpadProfileLabel(): string;
    vpadProfileCursorZx(): string;
    vpadProfileTenkey(): string;
    vpadNewProfileBtn(): string;
    vpadNewProfilePrompt(): string;
    vpadDuplicateProfileBtn(): string;
    vpadDuplicateProfilePrompt(): string;
    vpadDuplicateDefaultName(args: {
        name: string;
    }): string;
    vpadRenameProfileBtn(): string;
    vpadRenameProfilePrompt(): string;
    vpadDeleteProfileBtn(): string;
    vpadDeleteProfileConfirm(args: {
        name: string;
    }): string;
    vpadBuiltinReadonlyNote(): string;
    vpadSourceUp(): string;
    vpadSourceDown(): string;
    vpadSourceLeft(): string;
    vpadSourceRight(): string;
    vpadSourceButton(args: {
        name: string;
    }): string;
    vpadSourceOption(args: {
        n: number;
    }): string;
    vpadUnassigned(): string;
    vpadClearBindingBtn(): string;
    vpadPickerIdleHint(): string;
    vpadPendingPickKey(): string;
    hostkeyDialogDescription(): string;
    /** ON/OFFスイッチのラベル。 */
    hostkeyEnableLabel(): string;
    /** 組み込みプロファイル「テンキー移動」の表示名。localStorageには入れず表示時にここから引く。 */
    hostkeyBuiltinTenkeyLabel(): string;
    hostkeyProfileLabel(): string;
    hostkeyNewProfileBtn(): string;
    hostkeyNewProfilePrompt(): string;
    hostkeyDuplicateProfileBtn(): string;
    hostkeyDuplicateProfilePrompt(args: {
        name: string;
    }): string;
    hostkeyDuplicateDefaultName(args: {
        name: string;
    }): string;
    hostkeyRenameProfileBtn(): string;
    hostkeyRenameProfilePrompt(): string;
    hostkeyDeleteProfileBtn(): string;
    hostkeyDeleteProfileConfirm(args: {
        name: string;
    }): string;
    profileNameInputLabel(): string;
    profileNameOk(): string;
    profileNameCancel(): string;
    profileNameRequired(): string;
    /** 組み込みプロファイルは読み取り専用であることの案内(編集・削除ボタンの近くに出す)。 */
    hostkeyBuiltinReadonlyNote(): string;
    hostkeyBindingsEmpty(): string;
    hostkeyAddBtn(): string;
    hostkeyAddBtnTitle(): string;
    /** 物理キーの入力待ち中の案内。 */
    hostkeyDetectWaiting(): string;
    /** 物理キーを検出したので、下のキーボードで割り当て先を選ぶ番になったときの案内。 */
    hostkeyPendingPickKey(): string;
    /** キーピッカーが無効(押しても意味が無い)状態のときにピッカーの近くへ出す案内。検出未開始の初期状態用。 */
    hostkeyPickerIdleHint(): string;
    hostkeyClearBtn(): string;
    hostkeyClearBtnTitle(): string;
    hostkeyCancelBtn(): string;
    /** 割り当て一覧などのテキスト表示で、割り当て先がテンキーブロックのキーであることを明示する表記。通常キーの'2'等と区別するため。ソフトキーボード/キーピッカーのボタン表記には使わない(視覚的に分離済みのため)。 */
    tenkeyKeyLabel(args: {
        key: string;
    }): string;
    errD88NotEditable(): string;
    errHddInvalidHeader(args: {
        format: string;
    }): string;
    errHddNoFatPartition(): string;
    errMountedUseSlotApi(): string;
    errHddEditBeforeBootOnly(): string;
    errHddSlotUnsupported(): string;
    errInvalidShortName(args: {
        name: string;
    }): string;
}
/** 優先順位: URL ?lang= ＞ localStorage ＞ navigator.language(ja判定) ＞ 既定 'en'。 */
export declare function resolveLang(): Lang;
export declare function getLang(): Lang;
/** 設定値として表示する言語名。UI言語に翻訳せず、その言語自身の名前を返す。 */
export declare function langSelfName(lang: Lang): string;
export declare function setLang(lang: Lang): void;
export type StringKey = keyof Dict;
export declare function t<K extends StringKey>(key: K, ...args: Parameters<Dict[K]>): string;
/**
 * 例外を利用者向けのメッセージへ変換する。
 * api/fat.ts の DiskError はコードを持つので現在の言語の文言へ差し替え、
 * それ以外(内部エラー)は素のメッセージをそのまま返す。
 * fat.ts を import せず、コードの有無をダックタイピングで判定して依存を作らない。
 */
export declare function describeError(err: unknown): string;
export {};
