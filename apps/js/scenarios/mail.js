// 電子メール：サブミッション、MX による配送先決定、SPF/DKIM/DMARC【ジャンル5】【6-7】
(() => {
  const MSA = '198.51.100.25';
  const MX = '203.0.113.25';
  const SPAM = '192.0.2.66';

  const smtpFrame = (src, dst, dport, smtp) => [
    ['IPv4ヘッダ', [['送信元IP', src[0], src[1]], ['宛先IP', dst[0], dst[1]]]],
    ['TCPヘッダ', [['宛先ポート', ...dport]]],
    ['SMTP', smtp],
  ];
  const auth = (spf, dkim, dmarc, hit) => ({
    title: '受信サーバ（MX）の検証結果',
    head: ['検証', '確認すること', '結果'],
    rows: [
      ['SPF', '接続元 IP が送信ドメインの SPF に載っているか', spf],
      ['DKIM', '署名を DNS の公開鍵で検証できるか', dkim],
      ['DMARC', 'SPF/DKIM が合格し、ヘッダ From のドメインと一致するか', dmarc],
    ],
    hit,
  });

  SCENARIOS.push({
    id: 'mail',
    chapter: 7,
    title: '電子メール',
    subtitle: '送信から受信まで。サブミッション、MX、送信ドメイン認証（SPF/DKIM/DMARC）',
    viewBox: '0 0 810 275',
    nodes: {
      pca:  { x: 70,  y: 125, name: 'PC-A', kind: 'pc', lines: ['a@example.jp'] },
      msa:  { x: 250, y: 125, name: 'MSA', kind: 'sv', lines: ['mail.example.jp', MSA] },
      dns:  { x: 420, y: 35,  name: 'DNS', kind: 'sv' },
      spam: { x: 420, y: 225, name: '攻撃者', kind: 'pc', lines: [SPAM] },
      mx:   { x: 590, y: 125, name: 'MX', kind: 'sv', lines: ['mx.example.com', MX] },
      pcb:  { x: 755, y: 125, name: 'PC-B', kind: 'pc', lines: ['b@example.com'] },
    },
    links: [
      { a: 'pca', b: 'msa' },
      { a: 'msa', b: 'dns' },
      { a: 'msa', b: 'mx' },
      { a: 'mx', b: 'dns' },
      { a: 'spam', b: 'mx' },
      { a: 'mx', b: 'pcb' },
    ],
    steps: [
      {
        title: 'はじめに',
        desc: `<p>example.jp の a さんが、example.com の b さんにメールを送る。</p>
          <ol>
            <li>PC-A → 自分のメールサーバ（<b>MSA</b>）へ送信（サブミッション）</li>
            <li>MSA が DNS で宛先ドメインの <b>MX</b> を調べ、SMTP で中継</li>
            <li>受信側 MX が<b>送信ドメイン認証</b>でなりすましを確認</li>
            <li>PC-B が POP3 / IMAP で受信</li>
          </ol>`,
      },
      {
        title: '① サブミッション',
        focus: 'pca', pkt: 'ip', label: 'SMTP 587', noCompare: true,
        desc: `<p>PC-A は <b>587番（サブミッションポート）</b>で MSA に接続し、<b>SMTP-AUTH</b> でユーザ認証してから送信する。STARTTLS で通信を暗号化する。</p>
          <p>25番を使わない理由：多くの ISP が <b>OP25B</b>（Outbound Port 25 Blocking）で、利用者の回線から外部の 25番への接続を遮断しているため（ボット化した PC からのスパム対策）。</p>`,
        phases: [[['pca', 'msa']]],
        frame: smtpFrame(['192.168.1.10', 'PC-A'], [MSA, 'MSA'], ['587', 'サブミッション'], [
          ['コマンド', 'EHLO → STARTTLS → AUTH PLAIN'],
          ['MAIL FROM', 'a@example.jp', 'エンベロープ From'],
          ['RCPT TO', 'b@example.com'],
          ['DATA', 'ヘッダ（From:, To:, Subject:）＋本文'],
        ]),
      },
      {
        title: '② MX を検索',
        focus: 'msa', pkt: 'ctl', noCompare: true,
        desc: `<p>MSA は宛先ドメイン example.com の <b>MX レコード</b>を DNS に問い合わせ、配送先サーバを知る。MX が複数あれば<b>優先度の値が小さい</b>ものから試す。</p>
          <p>続けて mx.example.com の A レコードも引いて IP アドレスを得る。</p>`,
        phases: [[['msa', 'dns', { label: 'MX?' }]], [['dns', 'msa', { label: 'MX 応答' }]]],
        frame: [['DNS応答', [
          ['回答', 'example.com. MX 10 mx.example.com.'],
          ['追加', `mx.example.com. A ${MX}`],
        ]]],
      },
      {
        title: '③ SMTP で中継',
        focus: 'msa', pkt: 'ip', label: 'SMTP 25', noCompare: true,
        desc: `<p>MSA は MX の <b>25番</b>に接続してメールを渡す（サーバ間の中継は 25番）。</p>
          <p>送信前に MSA は本文とヘッダから <b>DKIM 署名</b>を作り、DKIM-Signature ヘッダとして付ける（example.jp の秘密鍵で署名）。</p>
          <p><b>エンベロープ From</b>（MAIL FROM）と、メールソフトに表示される<b>ヘッダ From</b> は別物。なりすましはヘッダ From を偽ることが多い。</p>`,
        phases: [[['msa', 'mx']]],
        frame: smtpFrame([MSA, 'MSA'], [MX, 'MX'], ['25', 'SMTP'], [
          ['MAIL FROM', 'a@example.jp', 'エンベロープ From'],
          ['RCPT TO', 'b@example.com'],
          ['ヘッダ From', 'a@example.jp', '表示される差出人'],
          ['DKIM-Signature', 'd=example.jp; s=sel1; b=（署名値）'],
        ]),
      },
      {
        title: '④ 送信ドメイン認証',
        focus: 'mx', pkt: 'ctl', noCompare: true,
        desc: `<p>MX は example.jp の DNS 情報を使って検証する。</p>
          <ul>
            <li><b>SPF</b>：example.jp の TXT レコード「v=spf1 ip4:${MSA} -all」に、<b>接続元 IP</b> ${MSA} が含まれる → pass</li>
            <li><b>DKIM</b>：sel1._domainkey.example.jp の TXT から<b>公開鍵</b>を取り出し、署名を検証 → pass（改ざんもない）</li>
            <li><b>DMARC</b>：_dmarc.example.jp のポリシーを取得。SPF / DKIM の合格ドメインが<b>ヘッダ From</b> と一致（アライメント）→ pass</li>
          </ul>`,
        phases: [[['mx', 'dns', { label: 'TXT?' }]], [['dns', 'mx', { label: 'SPF/DKIM/DMARC' }]]],
        frame: [['DNS応答（example.jp）', [
          ['example.jp. TXT', `v=spf1 ip4:${MSA} -all`],
          ['sel1._domainkey.example.jp. TXT', 'v=DKIM1; k=rsa; p=（公開鍵）'],
          ['_dmarc.example.jp. TXT', 'v=DMARC1; p=reject; rua=mailto:...'],
        ]]],
        side: auth('pass', 'pass', 'pass → 受信', [0, 1, 2]),
      },
      {
        title: '⑤ PC-B が受信',
        focus: 'pcb', pkt: 'ip', noCompare: true,
        desc: `<p>PC-B はメールボックスからメールを取り出す。</p>
          <ul>
            <li><b>POP3</b>（110 / POP3S 995）：端末にダウンロードする。サーバからは通常削除</li>
            <li><b>IMAP</b>（143 / IMAPS 993）：サーバ上で管理する。複数端末で同じ状態を見られる</li>
          </ul>`,
        phases: [[['pcb', 'mx', { label: 'IMAP' }]], [['mx', 'pcb', { label: 'メール' }]]],
        frame: [['TCPヘッダ', [['宛先ポート', '993', 'IMAPS']]]],
      },
      {
        title: '⑥ なりすましメール',
        focus: 'spam', pkt: 'ip', label: 'SMTP 25', noCompare: true,
        desc: `<p>攻撃者が、ヘッダ From を <b>a@example.jp に偽って</b>自分のサーバ（${SPAM}）から送ってきた。</p>
          <ul>
            <li>SPF：接続元 ${SPAM} は example.jp の SPF に<b>ない</b> → fail</li>
            <li>DKIM：example.jp の秘密鍵を持っていないので正しい署名を付けられない → fail</li>
            <li>DMARC：どちらも合格しない → ポリシー <b>p=reject</b> に従い<b>受信拒否</b></li>
          </ul>`,
        phases: [[['spam', 'mx', { drop: true }]]],
        frame: smtpFrame([SPAM, '攻撃者'], [MX, 'MX'], ['25', 'SMTP'], [
          ['MAIL FROM', 'x@attacker.example'],
          ['RCPT TO', 'b@example.com'],
          ['ヘッダ From', 'a@example.jp', '偽装'],
          ['DKIM-Signature', '（なし）'],
        ]),
        side: auth('fail', 'fail（署名なし）', 'fail → 拒否（p=reject）', [0, 1, 2]),
      },
      {
        title: 'まとめ',
        desc: `<p>SPF は<b>転送</b>されると失敗しやすい（接続元 IP が転送サーバに変わるため）。DKIM は署名がメールに付いているので転送に強い。両方を組み合わせ、DMARC で扱いを決めるのが基本。</p>`,
        side: [
          {
            title: '送信ドメイン認証の比較',
            head: ['', 'SPF', 'DKIM', 'DMARC'],
            rows: [
              ['検証方法', '接続元 IP', 'デジタル署名', 'SPF/DKIM の結果＋ドメイン一致'],
              ['DNS に登録', '許可する IP', '公開鍵', 'ポリシー（none/quarantine/reject）'],
              ['改ざん検知', 'できない', 'できる', '-'],
              ['転送', '失敗しやすい', '強い', '-'],
            ],
          },
          {
            title: 'メール関連のポート',
            head: ['ポート', '用途'],
            rows: [
              ['25', 'SMTP（サーバ間の中継）'],
              ['587', 'サブミッション（SMTP-AUTH）'],
              ['465', 'SMTPS（TLS で暗号化したサブミッション）'],
              ['110 / 995', 'POP3 / POP3S'],
              ['143 / 993', 'IMAP / IMAPS'],
            ],
          },
        ],
      },
    ],
  });
})();
