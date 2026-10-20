// SNMP：ポーリングとトラップによる監視、トラフィック量の計算、SNMPv3【5-1 ネットワークの監視】
(() => {
  const snmp = (dport, ver, community, pdu, varbind) => [
    ['UDPヘッダ', [['宛先ポート', ...dport]]],
    ['SNMP', [
      ['バージョン', ver],
      ['コミュニティ名', ...community],
      ['PDU', pdu],
      ['OID / 値', varbind],
    ]],
  ];

  SCENARIOS.push({
    id: 'snmp',
    chapter: 19,
    title: 'SNMP',
    subtitle: '監視サーバが機器の状態をどう集めるか。ポーリング、トラップ、SNMPv3',
    viewBox: '0 0 810 275',
    nodes: {
      mgr: { x: 90,  y: 130, name: 'マネージャ', kind: 'sv', lines: ['監視サーバ', '10.0.0.10'] },
      l3:  { x: 330, y: 130, name: 'L3SW', kind: 'sw', lines: ['エージェント'] },
      rt:  { x: 560, y: 55,  name: 'RT', kind: 'rt', lines: ['エージェント'], linesAbove: true },
      srv: { x: 560, y: 205, name: 'Server', kind: 'sv', lines: ['エージェント'] },
      wan: { x: 745, y: 55,  name: 'WAN', kind: 'cloud' },
    },
    links: [
      { a: 'mgr', b: 'l3' },
      { a: 'l3', b: 'rt' },
      { a: 'l3', b: 'srv' },
      { a: 'rt', b: 'wan' },
    ],
    steps: [
      {
        title: 'はじめに',
        desc: `<p>SNMP では、監視する側を<b>マネージャ</b>、監視される機器で動くプログラムを<b>エージェント</b>と呼ぶ。</p>
          <p>機器の情報（インタフェースの状態、送受信バイト数、CPU 使用率など）は <b>MIB</b> という木構造で管理され、各項目は <b>OID</b>（1.3.6.1.2.1… のような番号）で指定する。</p>
          <ul>
            <li><b>ポーリング</b>：マネージャ → エージェントに定期的に問い合わせる（UDP <b>161</b>）</li>
            <li><b>トラップ</b>：エージェント → マネージャに異常を通知する（UDP <b>162</b>）</li>
          </ul>`,
      },
      {
        title: '① ポーリング',
        focus: 'mgr', pkt: 'ctl', noCompare: true,
        desc: `<p>マネージャが L3SW に <b>GetRequest</b> を送り、インタフェース3の受信バイト数（ifInOctets）を取得する。</p>
          <p>SNMPv1 / v2c は<b>コミュニティ名</b>（合言葉）で認証するが、<b>平文</b>で流れるので盗聴されると分かってしまう。既定値の「public」のまま運用するのは危険。</p>`,
        phases: [[['mgr', 'l3', { label: 'GetRequest' }]], [['l3', 'mgr', { label: 'Response' }]]],
        frame: snmp(['161', 'エージェント'], 'v2c', ['public', '平文！'], 'GetRequest', 'ifInOctets.3（1.3.6.1.2.1.2.2.1.10.3）'),
      },
      {
        title: '② トラフィック量の計算',
        focus: ['mgr', 'rt', 'srv'], pkt: 'ctl', noCompare: true,
        desc: `<p>マネージャは全機器を<b>5分（300秒）ごと</b>にポーリングし、受信バイト数を記録する。カウンタは累計値なので、<b>差分</b>から流量を計算する。</p>
          <p>平均ビットレート = (今回 − 前回) × 8 ÷ 間隔秒<br>
          = (1,272,067,890 − 1,234,567,890) × 8 ÷ 300<br>
          = 37,500,000 × 8 ÷ 300 = <b>1,000,000 bit/s（1 Mbit/s）</b></p>
          <p>100 Mbit/s の回線なら使用率 <b>1%</b>。午後ではこの計算がよく出る。カウンタが上限で 0 に戻る（ラップ）点にも注意（高速回線では 64 ビットカウンタ ifHCInOctets を使う）。</p>`,
        phases: [
          [['mgr', 'l3', { label: 'Get' }]],
          [['l3', 'rt', { label: 'Get' }], ['l3', 'srv', { label: 'Get' }]],
          [['rt', 'l3', { label: 'Response' }], ['srv', 'l3', { label: 'Response' }]],
          [['l3', 'mgr', { label: 'Response' }]],
        ],
        side: {
          title: 'L3SW ifInOctets.3 の記録',
          head: ['時刻', 'カウンタ値（バイト）', '差分'],
          rows: [['10:00:00', '1,234,567,890', '-'], ['10:05:00', '1,272,067,890', '<b>37,500,000</b>']],
          hit: 1,
        },
      },
      {
        title: '③ トラップ',
        focus: 'rt', pkt: 'ctl', label: 'Trap', noCompare: true,
        desc: `<p>RT の WAN 側インタフェースがダウンした。RT は次のポーリングを待たずに、<b>トラップ（linkDown）</b>をマネージャに送る。</p>
          <p>トラップは UDP で<b>確認応答がない</b>ので、途中で失われても気づけない。そのため次の組み合わせで運用する。</p>
          <ul>
            <li>確認応答のある <b>Inform</b>（v2c 以降）を使う</li>
            <li>トラップに頼らず<b>ポーリングでも</b>状態を確認する</li>
          </ul>`,
        phases: [[['rt', 'l3']], [['l3', 'mgr']]],
        links: { 'rt-wan': 'down' },
        frame: snmp(['162', 'マネージャ'], 'v2c', ['public'], 'SNMPv2-Trap', 'snmpTrapOID = linkDown / ifIndex = 2'),
      },
      {
        title: '④ SNMPv3',
        focus: 'mgr', pkt: 'ctl', label: 'GetRequest', noCompare: true,
        desc: `<p>SNMPv3 は、コミュニティ名の代わりに<b>ユーザごとの認証</b>（USM）を使い、次の機能を追加した。</p>
          <ul>
            <li><b>認証</b>：HMAC でなりすましと改ざんを防ぐ</li>
            <li><b>暗号化</b>：AES などで中身を秘匿する</li>
          </ul>
          <p>セキュリティレベルは noAuthNoPriv / authNoPriv / <b>authPriv</b>（認証＋暗号化）の3段階。</p>`,
        phases: [[['mgr', 'l3']], [['l3', 'mgr', { label: 'Response' }]]],
        frame: [
          ['UDPヘッダ', [['宛先ポート', '161']]],
          ['SNMPv3', [
            ['バージョン', 'v3'],
            ['セキュリティレベル', 'authPriv'],
            ['ユーザ名', 'monitor01'],
            ['認証パラメータ', 'HMAC-SHA の値'],
          ], 'plain'],
          ['PDU', [['内容', 'GetRequest ifInOctets.3']], 'enc'],
        ],
      },
      {
        title: 'まとめ',
        desc: `<p>SNMP 以外の監視手段：</p>
          <ul>
            <li><b>ping 監視</b>：死活監視（ICMP エコー）</li>
            <li><b>Syslog</b>（UDP 514）：機器のログをサーバに集める</li>
            <li><b>NetFlow / sFlow</b>：誰と誰が、どのプロトコルでどれだけ通信したかを集計する</li>
          </ul>`,
        side: {
          title: 'SNMP の主な PDU',
          head: ['PDU', '方向', 'ポート', '用途'],
          rows: [
            ['GetRequest', 'マネージャ → エージェント', '161', '値の取得'],
            ['GetNextRequest / GetBulkRequest', 'マネージャ → エージェント', '161', '次の OID / まとめて取得'],
            ['SetRequest', 'マネージャ → エージェント', '161', '設定の変更'],
            ['Response', 'エージェント → マネージャ', '-', '応答'],
            ['Trap', 'エージェント → マネージャ', '162', '異常の通知（応答なし）'],
            ['InformRequest', 'エージェント → マネージャ', '162', '異常の通知（応答あり）'],
          ],
        },
      },
    ],
  });
})();
