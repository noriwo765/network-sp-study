// TLS 1.3：ハンドシェイク、証明書の検証、前方秘匿性【6-2】【6-3】
(() => {
  SCENARIOS.push({
    id: 'tls',
    chapter: 17,
    title: 'TLS 1.3',
    subtitle: 'HTTPS の暗号化が始まるまで。鍵交換・証明書検証は誰がどの鍵で行うか',
    nodes: {
      pc:  { x: 110, y: 125, name: 'ブラウザ', kind: 'pc' },
      net: { x: 405, y: 125, name: 'インターネット', kind: 'cloud' },
      sv:  { x: 700, y: 125, name: 'Web', kind: 'sv', lines: ['www.example.jp'] },
    },
    links: [{ a: 'pc', b: 'net' }, { a: 'net', b: 'sv' }],
    steps: [
      {
        title: 'はじめに',
        desc: `<p>ブラウザが https://www.example.jp に接続する。TCP の3ウェイハンドシェイクは済んでいるものとする。</p>
          <p>TLS で実現すること：</p>
          <ul>
            <li><b>機密性</b>：通信の暗号化（共通鍵暗号）</li>
            <li><b>完全性</b>：改ざんの検知</li>
            <li><b>真正性</b>：接続先が本物の www.example.jp であることの確認（サーバ証明書）</li>
          </ul>
          <p>TLS 1.3 はハンドシェイクが <b>1往復（1-RTT）</b>で終わる。</p>`,
      },
      {
        title: '① ClientHello',
        focus: 'pc', pkt: 'ctl', label: 'ClientHello', noCompare: true,
        desc: `<p>ブラウザが、使える暗号方式の候補と、<b>鍵交換用の一時的な公開値</b>（ECDHE の key_share）を送る。</p>
          <p>TLS 1.2 までは「まず方式を決めてから鍵交換」だったが、TLS 1.3 は<b>最初から鍵交換の材料を送ってしまう</b>ので1往復減った。</p>
          <p><b>SNI</b>（接続したいサーバ名）は平文で見える。1台のサーバで複数ドメインの証明書を使い分けるために必要。</p>`,
        phases: [[['pc', 'net']], [['net', 'sv']]],
        frame: [['ClientHello（平文）', [
          ['supported_versions', 'TLS 1.3'],
          ['暗号スイート候補', 'TLS_AES_128_GCM_SHA256 / TLS_AES_256_GCM_SHA384 / TLS_CHACHA20_POLY1305_SHA256'],
          ['key_share', 'x25519 の公開値（クライアントの一時鍵）'],
          ['server_name（SNI）', 'www.example.jp'],
        ], 'plain']],
        side: {
          title: '鍵を持っているのは？',
          head: ['', 'ブラウザ', 'Web サーバ'],
          rows: [['一時鍵（ECDHE）', '秘密値・公開値を生成', '-'], ['サーバ証明書の秘密鍵', '-', '保持（長期間使う）']],
        },
      },
      {
        title: '② ServerHello〜Finished',
        focus: 'sv', pkt: 'ctl', label: 'ServerHello…', noCompare: true,
        desc: `<p>サーバは暗号スイートを1つ選び、自分の<b>一時的な公開値</b>を返す。この時点で両者は相手の公開値と自分の秘密値から<b>同じ共有秘密</b>を計算でき（ECDHE）、そこから暗号鍵を作る。</p>
          <p>だから ServerHello より後は<b>もう暗号化されている</b>。TLS 1.2 では平文だったサーバ証明書も、TLS 1.3 では暗号化される。</p>
          <ul>
            <li><b>Certificate</b>：サーバ証明書＋中間 CA 証明書</li>
            <li><b>CertificateVerify</b>：ここまでのやり取りに<b>サーバ証明書の秘密鍵で署名</b>したもの</li>
            <li><b>Finished</b>：ハンドシェイク全体の改ざんがないことの確認</li>
          </ul>`,
        phases: [[['sv', 'net']], [['net', 'pc']]],
        frame: [
          ['ServerHello（平文）', [
            ['選択した暗号スイート', 'TLS_AES_128_GCM_SHA256'],
            ['key_share', 'x25519 の公開値（サーバの一時鍵）'],
          ], 'plain'],
          ['EncryptedExtensions', [['内容', 'ALPN（h2）など']], 'enc'],
          ['Certificate', [['内容', 'www.example.jp の証明書 ＋ 中間 CA 証明書']], 'enc'],
          ['CertificateVerify', [['内容', 'サーバ秘密鍵による署名']], 'enc'],
          ['Finished', [['内容', 'ハンドシェイクの MAC 値']], 'enc'],
        ],
        side: {
          title: '鍵を持っているのは？',
          head: ['', 'ブラウザ', 'Web サーバ'],
          rows: [
            ['一時鍵（ECDHE）', '秘密値・公開値', '秘密値・公開値'],
            ['共有秘密 → 暗号鍵', '<b>計算できた</b>', '<b>計算できた</b>'],
            ['サーバ証明書の秘密鍵', '-', '署名に使用'],
          ],
          hit: 1,
        },
      },
      {
        title: '③ 証明書の検証',
        focus: 'pc',
        desc: `<p>ブラウザはサーバ証明書を検証する。ここで失敗すると<b>証明書エラー</b>の警告が出る。</p>
          <p>最後の CertificateVerify の検証が重要：証明書は誰でも入手できるが、<b>対応する秘密鍵で署名できるのは本物のサーバだけ</b>。これでなりすましを見破れる。</p>`,
        side: {
          title: 'ブラウザの検証項目',
          head: ['確認すること', '方法'],
          rows: [
            ['信頼できる CA が発行したか', '中間 CA → ルート CA まで署名をたどる。ルート CA はブラウザ / OS に登録済み'],
            ['有効期限内か', '証明書の有効期間'],
            ['失効していないか', 'CRL / OCSP（OCSP ステープリングならサーバが応答を同封）'],
            ['接続先と一致するか', 'SAN（サブジェクト代替名）に www.example.jp があるか'],
            ['相手が秘密鍵を持っているか', 'CertificateVerify の署名を証明書の公開鍵で検証'],
          ],
          hit: 4,
        },
      },
      {
        title: '④ Finished と HTTP',
        focus: 'pc', pkt: 'esp', label: 'Finished + GET', noCompare: true,
        desc: `<p>ブラウザが Finished を返してハンドシェイク完了。続けて<b>暗号化された HTTP リクエスト</b>を送る。</p>
          <p>ClientHello から数えて<b>1往復</b>でアプリケーションデータを送れた。再接続時は前回の情報を使って、最初のパケットからデータを送る <b>0-RTT</b> も可能（リプレイ攻撃のリスクがあるので用途は限定）。</p>`,
        phases: [[['pc', 'net']], [['net', 'sv']]],
        frame: [
          ['TLS レコードヘッダ', [['タイプ', 'application_data'], ['長さ', '（暗号化後の長さ）']], 'plain'],
          ['Finished', [['内容', 'ハンドシェイクの MAC 値']], 'enc'],
          ['HTTP リクエスト', [['内容', 'GET / HTTP/1.1  Host: www.example.jp ...']], 'enc'],
        ],
      },
      {
        title: '⑤ 前方秘匿性',
        focus: 'sv',
        desc: `<p>もし将来、<b>サーバ証明書の秘密鍵が漏えい</b>したら、過去に録音しておいた通信は解読されるか？</p>
          <ul>
            <li><b>RSA 鍵交換</b>（TLS 1.2 まで使えた）：クライアントが鍵の素を<b>サーバの公開鍵で暗号化</b>して送るので、秘密鍵が漏れると<b>過去の通信も全部解読</b>される</li>
            <li><b>ECDHE</b>：鍵は通信ごとの<b>使い捨ての一時鍵</b>から作り、終われば捨てる。サーバ秘密鍵は署名に使うだけなので、漏れても過去の通信は解読できない</li>
          </ul>
          <p>この性質を<b>前方秘匿性（PFS）</b>という。TLS 1.3 は鍵交換を (EC)DHE だけにして、PFS を必須にした。</p>`,
      },
      {
        title: 'まとめ',
        desc: `<p>午後では、SSL/TLS インスペクション（プロキシで復号して検査する）で<b>端末にプロキシの CA 証明書を配布する</b>必要がある理由もよく問われる。</p>`,
        side: {
          title: 'TLS 1.2 と TLS 1.3',
          head: ['', 'TLS 1.2', 'TLS 1.3'],
          rows: [
            ['ハンドシェイク', '2-RTT', '1-RTT（再接続は 0-RTT も可）'],
            ['鍵交換', 'RSA / DHE / ECDHE', '(EC)DHE のみ → PFS 必須'],
            ['サーバ証明書', '平文で送る', '暗号化して送る'],
            ['暗号スイート', '古い方式（CBC、RC4 など）も残る', 'AEAD（AES-GCM、ChaCha20-Poly1305）のみ'],
          ],
        },
      },
    ],
  });
})();
