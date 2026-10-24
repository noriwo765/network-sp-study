// 重点3ジャンル診断テスト（全30問）。出典 quizzes/重点3ジャンル診断テスト.md
window.DIAGNOSTIC = [
  {
    id: 'A1',
    part: 'A',
    partName: 'IPヘッダ',
    sub: '2-1 IPv4ヘッダ構造',
    level: 1,
    q: '<p>IPv4ヘッダ（オプションなし）の長さは何バイトか。また IHL フィールドの値が <code>5</code> のとき、何を意味するか。</p>',
    a: '<ul><li><strong>20バイト</strong>。IHL は <strong>4バイト（32ビット）単位</strong>でヘッダ長を表すので、5 × 4 = 20バイト。</li><li>IHL は4ビットなので最大値15 → 最大 <strong>60バイト</strong>（オプション最大40バイト）。</li><li>似た落とし穴：「全長（Total Length）」はヘッダ＋データの長さで<strong>バイト単位</strong>、「フラグメントオフセット」は<strong>8バイト単位</strong>。単位がフィールドごとに違う。</li></ul>'
  },
  {
    id: 'A2',
    part: 'A',
    partName: 'IPヘッダ',
    sub: '2-2 TTL・ICMP',
    level: 1,
    q: '<p>TTL の役割を説明せよ。また traceroute が TTL をどう利用して経路を調べているか説明せよ。</p>',
    a: '<ul><li>ルータは転送のたびに TTL を <strong>1減算</strong>し、<strong>0になったらパケットを破棄</strong>して送信元へ <strong>ICMP Time Exceeded（タイプ11）</strong> を返す。目的はルーティングループ時にパケットが永久に回り続けるのを防ぐこと。</li><li>traceroute は TTL=1, 2, 3… と増やしながら送信し、各ホップのルータから返る Time Exceeded の<strong>送信元IPアドレス</strong>を集めて経路を表示する。</li><li>主な ICMP タイプ：0 Echo Reply／3 Destination Unreachable／5 Redirect／8 Echo Request／11 Time Exceeded</li></ul>'
  },
  {
    id: 'A3',
    part: 'A',
    partName: 'IPヘッダ',
    sub: '2-3 プロトコル番号',
    level: 1,
    q: '<p>IPヘッダのプロトコル番号について、次の値が示すプロトコルを答えよ。<br><code>1</code> / <code>6</code> / <code>17</code> / <code>50</code> / <code>89</code></p>',
    a: '<table><thead><tr><th>番号</th><th>プロトコル</th></tr></thead><tbody><tr><td>1</td><td>ICMP</td></tr><tr><td>6</td><td>TCP</td></tr><tr><td>17</td><td>UDP</td></tr><tr><td>50</td><td>ESP（IPsec）</td></tr><tr><td>89</td><td>OSPF</td></tr></tbody></table><p>ついでに覚える：47 = GRE、51 = AH、112 = VRRP。<br><strong>OSPF はTCP/UDPを使わずIPに直接乗る</strong>、という点は午後でも問われる（FWでの許可設定など）。</p>'
  },
  {
    id: 'A4',
    part: 'A',
    partName: 'IPヘッダ',
    sub: '2-4 フラグメント',
    level: 2,
    q: '<p>MTU 1500バイトのリンクに、IPヘッダ20バイト（オプションなし）＋データ3000バイト（全長3020バイト）のパケットが送出される。DFビットは0である。<br>分割後の各フラグメントについて、<strong>データ長・フラグメントオフセット値・MFフラグ</strong>を答えよ。</p>',
    a: '<p>1フラグメントに載せられるデータ = 1500 − 20 = <strong>1480バイト</strong>（8の倍数なのでそのまま使える）</p><table><thead><tr><th>#</th><th>データ長</th><th>オフセット値</th><th>MF</th></tr></thead><tbody><tr><td>1</td><td>1480</td><td>0</td><td>1</td></tr><tr><td>2</td><td>1480</td><td>185（= 1480 ÷ 8）</td><td>1</td></tr><tr><td>3</td><td>40</td><td>370（= 2960 ÷ 8）</td><td>0</td></tr></tbody></table><ul><li>オフセットは <strong>8バイト単位</strong>。だから最後以外のフラグメントのデータ長は8の倍数でなければならない。</li><li>3つのフラグメントは同じ <strong>識別子（Identification）</strong> を持ち、受信側（<strong>最終宛先ホスト</strong>）で再組立てされる。途中のルータは再組立てしない。</li><li>MF（More Fragments）=1 は「後続あり」。最後だけ0。</li></ul>'
  },
  {
    id: 'A5',
    part: 'A',
    partName: 'IPヘッダ',
    sub: '2-4 DFビット・PMTUD',
    level: 2,
    q: '<p>DFビットが1のパケットが、それより小さい MTU のリンクに転送されようとした。ルータの動作を答えよ。<br>また、その仕組みを利用する Path MTU Discovery が、FW の設定によって機能しなくなるのはどんな場合か。</p>',
    a: '<ul><li>ルータはパケットを<strong>破棄</strong>し、送信元へ <strong>ICMP Destination Unreachable（タイプ3／コード4：Fragmentation Needed and DF set）</strong> を返す。このメッセージには<strong>ネクストホップの MTU 値</strong>が含まれる。</li><li>送信元はその MTU に合わせてパケットサイズを小さくして再送する（＝PMTUD）。</li><li>FW で <strong>ICMP を一律遮断</strong>していると、この通知が送信元に届かず、大きいパケットだけが延々と捨てられる（<strong>PMTUDブラックホール</strong>）。症状は「ping や小さい通信は通るのに、Webページの表示やファイル転送が途中で止まる」。</li><li>対策：ICMP タイプ3 コード4 を許可する／ルータで <strong>TCP MSS を書き換える（MSSクランプ）</strong>。</li></ul>'
  },
  {
    id: 'A6',
    part: 'A',
    partName: 'IPヘッダ',
    sub: '2-4 MSS',
    level: 2,
    q: '<p>Ethernet（MTU 1500）で IPv4・TCP ともにオプションなしの場合の MSS はいくつか。<br>また PPPoE 回線（MTU 1492）の場合はいくつか。</p>',
    a: '<ul><li>MSS = MTU − IPヘッダ(20) − TCPヘッダ(20)</li><li>Ethernet：1500 − 40 = <strong>1460バイト</strong></li><li>PPPoE：1492 − 40 = <strong>1452バイト</strong>（PPPoEヘッダ6＋PPPヘッダ2 = 8バイト分 MTU が小さい）</li><li>MSS は TCP の <strong>SYN / SYN+ACK のオプション</strong>で互いに通知する。</li></ul>'
  },
  {
    id: 'A7',
    part: 'A',
    partName: 'IPヘッダ',
    sub: '2-5 転送時のヘッダ変化',
    level: 2,
    q: '<p>NAT を行わないルータがIPパケットを転送するとき、<strong>IPヘッダ内で書き換わるフィールド</strong>を全て答えよ（フラグメントは発生しないものとする）。<br>また、IPヘッダ以外で書き換わるものは何か。</p>',
    a: '<ul><li>IPヘッダ：<strong>TTL</strong> と <strong>ヘッダチェックサム</strong>（TTL が変わるのでチェックサムを再計算）</li><li><strong>送信元・宛先IPアドレスは変わらない</strong></li><li>IPヘッダ以外：<strong>Ethernetヘッダの送信元・宛先MACアドレス</strong>（ホップごとに付け替え）、FCS</li><li>補足：NAPT を行うとIPアドレス・ポート番号、それに伴い TCP/UDP チェックサムも変わる。DSCP をリマーキングする機器なら ToS も変わる。</li></ul>'
  },
  {
    id: 'A8',
    part: 'A',
    partName: 'IPヘッダ',
    sub: '2-3 DSCP',
    level: 2,
    q: '<p>旧 ToS フィールドは現在どのように使われているか。また VoIP の音声パケットに一般的に付与される DSCP 値（PHB名と10進値）を答えよ。</p>',
    a: '<ul><li>8ビットのうち上位6ビットが <strong>DSCP（DiffServ Code Point）</strong>、下位2ビットが <strong>ECN（明示的輻輳通知）</strong>。</li><li>音声は <strong>EF（Expedited Forwarding）= 46</strong>（2進 101110）。最優先で低遅延キューに入れる。</li><li>その他：AF（AF11〜AF43）＝帯域保証クラス、CS（Class Selector）＝旧 IP Precedence 互換、0 = ベストエフォート。</li></ul>'
  },
  {
    id: 'A9',
    part: 'A',
    partName: 'IPヘッダ',
    sub: '2-6 サブネット計算',
    level: 2,
    q: '<p><code>192.168.10.100/26</code> について、ネットワークアドレス、ブロードキャストアドレス、割り当て可能なホスト数を答えよ。</p>',
    a: '<ul><li>/26 → 第4オクテットのマスクは 255.255.255.<strong>192</strong>、ブロックサイズは 256 − 192 = <strong>64</strong></li><li>区切り：0 / 64 / 128 / 192 → 100 は 64〜127 の範囲</li><li>ネットワークアドレス：<strong>192.168.10.64</strong></li><li>ブロードキャストアドレス：<strong>192.168.10.127</strong></li><li>ホスト数：2^6 − 2 = <strong>62</strong></li></ul>'
  },
  {
    id: 'A10',
    part: 'A',
    partName: 'IPヘッダ',
    sub: '2-7 IPv6ヘッダ',
    level: 3,
    q: '<p>IPv6 の基本ヘッダについて、IPv4 ヘッダと比べて<strong>なくなった・変わった点</strong>を3つ以上挙げ、それぞれの理由を述べよ。</p>',
    a: '<table><thead><tr><th>変更点</th><th>理由・ポイント</th></tr></thead><tbody><tr><td>ヘッダ長が<strong>固定40バイト</strong>（IHLなし）</td><td>オプションは<strong>拡張ヘッダ</strong>として外出しし、ルータ処理を高速化</td></tr><tr><td><strong>ヘッダチェックサムの廃止</strong></td><td>L2（FCS）や上位層で誤り検出しているため。TTL が変わるたびの再計算が不要</td></tr><tr><td><strong>中継ルータでのフラグメント禁止</strong></td><td>分割は<strong>送信元のみ</strong>（フラグメント拡張ヘッダ）。大きすぎれば ICMPv6 Packet Too Big を返す → PMTUD 必須。最小MTUは1280</td></tr><tr><td>TTL → <strong>Hop Limit</strong></td><td>中身は同じ（ホップ数で減算）</td></tr><tr><td>Protocol → <strong>Next Header</strong></td><td>次の拡張ヘッダ or 上位プロトコルを示す</td></tr><tr><td><strong>フローラベル</strong>の追加</td><td>同一フローの識別（QoS用）</td></tr></tbody></table><p>さらに：ARP は廃止され <strong>NDP（ICMPv6）</strong> に、ブロードキャストは廃止され<strong>マルチキャスト</strong>に置き換え。</p>'
  },
  {
    id: 'B1',
    part: 'B',
    partName: 'ルーティング',
    sub: '4-1 ロンゲストマッチ',
    level: 1,
    q: '<p>ルータに次の経路がある。各宛先へのパケットはどのネクストホップへ転送されるか。</p><table><thead><tr><th>宛先ネットワーク</th><th>ネクストホップ</th></tr></thead><tbody><tr><td>0.0.0.0/0</td><td>R1</td></tr><tr><td>10.0.0.0/8</td><td>R2</td></tr><tr><td>10.1.0.0/16</td><td>R3</td></tr><tr><td>10.1.2.0/24</td><td>R4</td></tr></tbody></table><p>(1) 10.1.2.5　(2) 10.1.3.5　(3) 10.2.0.1　(4) 172.16.0.1</p>',
    a: '<p>(1) <strong>R4</strong>　(2) <strong>R3</strong>　(3) <strong>R2</strong>　(4) <strong>R1</strong></p><p><strong>ロンゲストマッチ</strong>：宛先に一致する経路のうち、<strong>プレフィックス長が最も長い（最も具体的な）経路</strong>を選ぶ。<br>これは AD やメトリックより<strong>先に</strong>適用される。デフォルトルート（/0）は全てに一致するが最も短いので最後の手段になる。</p>'
  },
  {
    id: 'B2',
    part: 'B',
    partName: 'ルーティング',
    sub: '4-1/4-2 AD・フローティングスタティック',
    level: 2,
    q: '<p>同じ宛先 <code>192.168.50.0/24</code> について、スタティックルート・OSPF・RIP でそれぞれ経路を学習した。ルーティングテーブルに採用されるのはどれか。理由とともに答えよ。<br>また「フローティングスタティックルート」とは何か。</p>',
    a: '<ul><li><strong>スタティックルート</strong>が採用される。プレフィックス長が同じなので <strong>AD（アドミニストレーティブディスタンス）</strong> が小さいものが優先される。</li><li>代表的なAD（Cisco 既定値）：直接接続 0／スタティック 1／eBGP 20／OSPF 110／RIP 120／iBGP 200</li><li><strong>AD はプロトコル間の優先度</strong>、<strong>メトリックは同一プロトコル内の優先度</strong>。混同注意。</li><li><strong>フローティングスタティック</strong>：AD を動的ルーティングより<strong>大きく</strong>設定したスタティックルート。通常は OSPF 経路が使われ、OSPF 経路が消えたとき（主回線障害）だけ浮かび上がってバックアップ経路として使われる。</li></ul>'
  },
  {
    id: 'B3',
    part: 'B',
    partName: 'ルーティング',
    sub: '4-3 経路集約',
    level: 2,
    q: '<p>次の4つの経路を1つに集約したときの集約経路を答えよ。<br><code>10.1.8.0/24</code>、<code>10.1.9.0/24</code>、<code>10.1.10.0/24</code>、<code>10.1.11.0/24</code></p>',
    a: '<p><strong>10.1.8.0/22</strong></p><p>第3オクテットを2進数にする：</p><pre><code> 8 = 0000 1000\n 9 = 0000 1001\n10 = 0000 1010\n11 = 0000 1011\n     ^^^^ ^^      ← 共通部分は上位6ビット</code></pre><p>共通ビット = 8 + 8 + 6 = 22 ビット → /22、先頭は 10.1.8.0。</p><p>注意：集約経路が実在しないネットワーク（例：8〜11 のうち1つが別拠点にある）まで含むと、誤った方向へ転送したりループの原因になる。</p>'
  },
  {
    id: 'B4',
    part: 'B',
    partName: 'ルーティング',
    sub: '4-5 OSPFコスト',
    level: 2,
    q: '<p>OSPF の基準帯域が既定値（100Mbps）のとき、10Mbps のリンクと 1Gbps のリンクのコストはそれぞれいくつか。<br>また、この既定値のままだと現代のネットワークで何が問題になるか。</p>',
    a: '<ul><li>コスト = 基準帯域 ÷ インタフェース帯域</li><li>10Mbps：100 ÷ 10 = <strong>10</strong></li><li>1Gbps：100 ÷ 1000 = 0.1 → 最小値1に切り上げ → <strong>1</strong></li><li>問題点：100Mbps も 1Gbps も 10Gbps も全部コスト1になり、<strong>帯域の違いを経路選択に反映できない</strong>。</li><li>対策：全ルータで<strong>基準帯域を揃えて引き上げる</strong>（例：100Gbps）か、インタフェースごとに手動でコストを設定する。ルータ間で基準帯域がバラバラだと意図しない経路になる。</li></ul>'
  },
  {
    id: 'B5',
    part: 'B',
    partName: 'ルーティング',
    sub: '4-5 OSPF DR/BDR',
    level: 2,
    q: '<p>OSPF のブロードキャスト型ネットワーク（Ethernet セグメント）で DR/BDR を選出する目的と、選出の基準を答えよ。<br>また、DR より優先度の高いルータを後から接続した場合、DR は交代するか。</p>',
    a: '<ul><li>目的：全ルータ同士で隣接関係（Full）を結ぶと n(n−1)/2 本になり LSA のやり取りが膨大になる。<strong>DR/BDR とだけ Full</strong> になり、DR が代表して LSA を配布することで負荷を減らす。</li><li>選出基準：① <strong>OSPFプライオリティが最大</strong> → ② 同値なら <strong>ルータIDが最大</strong>。プライオリティ <strong>0</strong> のルータは DR/BDR にならない。</li><li><strong>交代しない</strong>（プリエンプションなし）。現 DR が停止して初めて BDR が DR に昇格する。</li><li>補足：DROther 同士は <strong>2-Way</strong> 状態で止まる（Full にならない）。これは正常。</li></ul>'
  },
  {
    id: 'B6',
    part: 'B',
    partName: 'ルーティング',
    sub: '4-5 OSPFエリア・LSA',
    level: 3,
    q: '<p>OSPF における ABR と ASBR とは何か。また、<strong>スタブエリア</strong>に設定すると、そのエリア内のルータにどんなメリットがあるか。</p>',
    a: '<ul><li><strong>ABR（Area Border Router）</strong>：複数のエリア（うち1つはエリア0）に接続し、エリア間の経路情報（Type3 LSA）を中継するルータ。</li><li><strong>ASBR（AS Boundary Router）</strong>：OSPF 外部の経路（スタティック・BGP など）を OSPF に<strong>再配布</strong>するルータ。外部経路は <strong>Type5 LSA</strong> として広告される。</li><li><strong>スタブエリア</strong>：ABR が <strong>Type5（外部経路）を流さず、代わりにデフォルトルート</strong>を注入する。エリア内ルータのLSDBとルーティングテーブルが小さくなり、CPU・メモリ負荷が下がる。<ul><li>トータリースタブ：Type3 も遮断し、デフォルトルートのみにする。</li><li>NSSA：スタブだがエリア内に ASBR を置ける（Type7 LSA）。</li></ul></li><li>原則：<strong>全エリアはエリア0（バックボーン）に接続</strong>しなければならない。</li></ul>'
  },
  {
    id: 'B7',
    part: 'B',
    partName: 'ルーティング',
    sub: '4-6 iBGPフルメッシュ',
    level: 3,
    q: '<p>iBGP では、なぜ AS 内のルータを<strong>フルメッシュ</strong>でピア接続する必要があるのか。また、その負担を減らす方法を答えよ。</p>',
    a: '<ul><li>eBGP は AS_PATH に自AS番号が含まれていれば破棄することでループを防ぐ。しかし iBGP では AS_PATH が変化しないのでこの方法が使えない。</li><li>そこで <strong>「iBGPピアから学習した経路を、他のiBGPピアに広告しない」</strong>（iBGPスプリットホライズン）というルールがある。</li><li>その結果、全ての iBGP ルータに経路を行き渡らせるには<strong>フルメッシュ</strong>が必要になる（n(n−1)/2 本のセッション）。</li><li>回避策：<strong>ルートリフレクタ</strong>（RR がクライアントから受けた経路を他クライアントに反射する）、または <strong>コンフェデレーション</strong>（AS 内をサブASに分割）。</li><li>補足：BGP は <strong>TCP 179番</strong>を使う。</li></ul>'
  },
  {
    id: 'B8',
    part: 'B',
    partName: 'ルーティング',
    sub: '4-6 BGP属性による経路制御',
    level: 3,
    q: '<p>自社 AS が2つの ISP（ISP-A、ISP-B）とマルチホーム接続している。次の要件を満たすために使う BGP 属性（または手法）を答えよ。</p><p>(1) 自社から<strong>インターネットへ出ていく</strong>通信は、ISP-A を優先したい<br>(2) インターネットから<strong>自社へ入ってくる</strong>通信は、ISP-A 経由を優先させたい</p>',
    a: '<p>(1) <strong>LOCAL_PREF</strong>：ISP-A から受信した経路の LOCAL_PREF を高くする。<strong>AS 内の全ルータ</strong>（iBGPで伝わる）が ISP-A 側を出口に選ぶ。値が<strong>大きいほど優先</strong>。<br>(2) <strong>AS_PATH プリペンド</strong>：ISP-B に広告する経路の AS_PATH に自AS番号を複数回追加し、ISP-B 経由の経路を「遠く」見せる。（隣接ASが同じ相手なら <strong>MED</strong>（<strong>小さいほど優先</strong>）も使える）</p><p>覚え方：<strong>出ていく（Outbound）＝ LOCAL_PREF、入ってくる（Inbound）＝ AS_PATH / MED</strong><br>主な選択順（抜粋）：Weight（Cisco独自）→ LOCAL_PREF 大 → 自ルータ発 → AS_PATH 短 → ORIGIN → MED 小 → eBGP &gt; iBGP → IGPメトリック小</p>'
  },
  {
    id: 'B9',
    part: 'B',
    partName: 'ルーティング',
    sub: '4-7 VRRPトラッキング',
    level: 3,
    q: '<p>2台のルータ（RT1：優先度110 マスタ、RT2：優先度100 バックアップ）で VRRP を構成し、LAN 側に仮想IPを提供している。<br>RT1 の <strong>WAN 側回線だけが切断</strong>され、LAN 側は正常なままだった。このとき何が起こるか。また、その問題への対策を答えよ。</p>',
    a: '<ul><li>VRRP は <strong>LAN 側で VRRPアドバタイズメント</strong>（マルチキャスト 224.0.0.18、プロトコル番号112）をやり取りしてマスタを監視している。LAN 側が正常なら RT1 はマスタのまま。</li><li>→ 端末は引き続き RT1 にパケットを送り、<strong>WAN に出られず通信断</strong>になる（もしくは RT1 が RT2 経由で迂回できる構成なら遠回り）。</li><li>対策：<strong>インタフェーストラッキング</strong>。RT1 の WAN 側 IF（または上流への到達性）を監視し、ダウン時に優先度を下げる（例：110 → 90）。RT2（100）のほうが高くなり、<strong>プリエンプト</strong>が有効なら RT2 がマスタになる。</li><li>補足：仮想MACアドレスは <strong>00-00-5E-00-01-{VRID}</strong>。切替時に端末の ARP テーブルを更新する必要がない。</li></ul>'
  },
  {
    id: 'B10',
    part: 'B',
    partName: 'ルーティング',
    sub: '4-4 RIP',
    level: 1,
    q: '<p>RIP について、メトリックの指標と最大値、到達不能を表す値を答えよ。また、距離ベクトル型で発生する「カウントトゥインフィニティ」を防ぐ仕組みを1つ挙げよ。</p>',
    a: '<ul><li>メトリックは<strong>ホップ数</strong>、最大 <strong>15</strong>、<strong>16 = 到達不能</strong>（だから大規模網には不向き）。</li><li>帯域を考慮しないので、遅い回線でもホップ数が少なければ選ばれてしまう。</li><li>カウントトゥインフィニティ対策：<ul><li><strong>スプリットホライズン</strong>：経路を学習したインタフェースにはその経路を広告し返さない</li><li><strong>ポイズンリバース</strong>：学習したインタフェースにメトリック16（到達不能）として広告し返す</li><li><strong>トリガードアップデート</strong>：変化時に即座に通知する</li></ul></li></ul>'
  },
  {
    id: 'C1',
    part: 'C',
    partName: 'セキュリティ',
    sub: '6-1 暗号・署名',
    level: 1,
    q: '<p>A さんが B さんにメールを送る。次の目的で使う鍵は「誰の」「どちらの鍵（公開鍵／秘密鍵）」か答えよ。</p><p>(1) A がメールにデジタル署名を付ける<br>(2) B が署名を検証する<br>(3) A がメール本文を B だけが読めるように暗号化する（公開鍵暗号を使用）</p>',
    a: '<p>(1) <strong>A の秘密鍵</strong>　(2) <strong>A の公開鍵</strong>　(3) <strong>B の公開鍵</strong>（復号は B の秘密鍵）</p><ul><li>署名は「本人しか持たないもので作る」→ 送信者の秘密鍵。実際はメッセージの<strong>ハッシュ値</strong>を秘密鍵で署名する。これで<strong>改ざん検知＋なりすまし防止（否認防止）</strong>。</li><li>暗号化は「受信者だけが解けるように」→ 受信者の公開鍵。</li><li>実運用では公開鍵暗号は遅いので、<strong>本文は共通鍵で暗号化し、共通鍵を公開鍵で送る</strong>（ハイブリッド暗号）。</li></ul>'
  },
  {
    id: 'C2',
    part: 'C',
    partName: 'セキュリティ',
    sub: '6-2 証明書検証',
    level: 2,
    q: '<p>Web ブラウザがサーバ証明書を受け取ったときに確認する項目を3つ以上挙げよ。<br>また、サーバに<strong>中間CA証明書を設定し忘れる</strong>と何が起きるか。</p>',
    a: '<p>確認項目：</p><ul><li><strong>署名の検証</strong>：発行元CAの公開鍵で証明書の署名を検証し、<strong>ルートCA（ブラウザ/OSが信頼済み）までチェーンがつながる</strong>か</li><li><strong>有効期限</strong>内か</li><li><strong>失効していないか</strong>（CRL または OCSP、OCSPステープリング）</li><li>アクセスした <strong>FQDN が証明書の SAN（CN）と一致</strong>するか</li></ul><p>中間CA証明書がないと、ブラウザはサーバ証明書からルートCAまでの<strong>チェーンを構築できず、証明書エラー</strong>になる（ブラウザによっては補完して表示できてしまうため、「一部の端末だけエラー」という形で表面化しやすい）。</p>'
  },
  {
    id: 'C3',
    part: 'C',
    partName: 'セキュリティ',
    sub: '6-3 TLS・前方秘匿性',
    level: 2,
    q: '<p>「前方秘匿性（PFS: Perfect Forward Secrecy）」とは何か。また TLS 1.3 で <strong>RSA 鍵交換が廃止</strong>された理由を、前方秘匿性と関連づけて説明せよ。</p>',
    a: '<ul><li><strong>前方秘匿性</strong>：サーバの秘密鍵が<strong>将来漏えいしても、過去に記録された通信を復号できない</strong>性質。</li><li>RSA 鍵交換では、クライアントがセッション鍵の素（プリマスタシークレット）を<strong>サーバの公開鍵で暗号化して送る</strong>。通信を全部録っておけば、後でサーバ秘密鍵が漏れた時点で<strong>過去の通信がすべて復号できてしまう</strong>。</li><li><strong>(EC)DHE</strong> は通信ごとに使い捨ての鍵ペアで鍵を共有するので、サーバ秘密鍵（署名用にのみ使う）が漏れてもセッション鍵は復元できない。</li><li>TLS 1.3 は鍵交換を <strong>(EC)DHE のみ</strong>にして PFS を必須化した。他に、<strong>1-RTT ハンドシェイク</strong>（0-RTT も可）、ServerHello 以降の暗号化、弱い暗号スイートの削除なども変更点。</li></ul>'
  },
  {
    id: 'C4',
    part: 'C',
    partName: 'セキュリティ',
    sub: '6-4 IPsec・NAT-T',
    level: 3,
    q: '<p>IPsec の AH と ESP の違いを説明せよ。また、拠点ルータが NAPT 配下にある場合に IPsec VPN を張る際の問題と、その解決策を答えよ。</p>',
    a: '<table><thead><tr><th></th><th>AH（プロトコル番号51）</th><th>ESP（プロトコル番号50）</th></tr></thead><tbody><tr><td>暗号化</td><td><strong>なし</strong></td><td><strong>あり</strong></td></tr><tr><td>認証・改ざん検知</td><td>あり（<strong>IPヘッダの不変部分も含む</strong>）</td><td>あり（ESPヘッダ以降。外側IPヘッダは対象外）</td></tr><tr><td>NAT との相性</td><td><strong>NG</strong>（IPアドレス書換えで認証失敗）</td><td>ポート番号がないので NAPT 不可 → NAT-T で対応</td></tr></tbody></table><p>NAPT 配下での問題：</p><ul><li>ESP には TCP/UDP のような<strong>ポート番号がない</strong>ため、NAPT が変換対象を識別できない。</li><li><strong>解決：NATトラバーサル（NAT-T）</strong>。IKE で NAT の存在を検出し、ESP パケットを <strong>UDP 4500番</strong>でカプセル化して送る。IKE 自体は <strong>UDP 500番</strong>（NAT検出後は4500へ移行）。</li><li>補足：拠点間 VPN は通常<strong>トンネルモード</strong>（元のIPヘッダごと暗号化し新IPヘッダを付与）、端末間は<strong>トランスポートモード</strong>。</li></ul>'
  },
  {
    id: 'C5',
    part: 'C',
    partName: 'セキュリティ',
    sub: '6-5 ステートフルFW',
    level: 3,
    q: '<p>ステートフルインスペクション型 FW を2台、別々の経路上に設置した（FW1 は行き経路、FW2 は戻り経路を通る非対称ルーティング）。内部から外部への TCP 通信が確立できない理由を説明せよ。</p>',
    a: '<ul><li>ステートフルFW は、内部→外部の <strong>SYN を通した時点でセッション情報（状態テーブル）を作り</strong>、それに合致する戻りパケットだけを自動で許可する。</li><li>非対称経路だと、SYN は FW1 を通るので FW1 にだけセッションが作られる。戻りの <strong>SYN+ACK は FW2 を通るが、FW2 には対応するセッションがない</strong>ため、「いきなり来た不正なパケット」として<strong>破棄</strong>される → 3ウェイハンドシェイクが完了しない。</li><li>対策：行きと戻りが同じFWを通るよう経路を設計する（<strong>対称化</strong>）、FW 間で<strong>セッション同期</strong>する（冗長構成）、など。</li><li>静的パケットフィルタとの違い：パケットフィルタは戻りパケットも明示的に許可する必要があるが状態を持たない（その分、ポート番号を広く開ける必要がある）。</li></ul>'
  },
  {
    id: 'C6',
    part: 'C',
    partName: 'セキュリティ',
    sub: '6-5 IDS/IPS/WAF',
    level: 2,
    q: '<p>IDS・IPS・WAF の違いを、設置形態と防御対象の観点で説明せよ。また、IPS で<strong>誤検知（フォールスポジティブ）</strong>が特に問題になる理由を述べよ。</p>',
    a: '<table><thead><tr><th></th><th>設置</th><th>動作</th><th>対象</th></tr></thead><tbody><tr><td><strong>IDS</strong></td><td>ミラーポート等で<strong>通信を複製して監視</strong></td><td><strong>検知・通知のみ</strong></td><td>ネットワーク全般</td></tr><tr><td><strong>IPS</strong></td><td>通信経路上に<strong>インライン</strong>設置</td><td>検知して<strong>遮断</strong></td><td>ネットワーク全般</td></tr><tr><td><strong>WAF</strong></td><td>Webサーバの前（インライン or リバースプロキシ）</td><td>検知・遮断</td><td><strong>Webアプリへの攻撃</strong>（SQLインジェクション、XSS など、HTTP の中身）</td></tr></tbody></table><ul><li>IPS はインラインで自動遮断するため、<strong>誤検知すると正常な業務通信を止めてしまう</strong>。IDS は通知だけなので業務影響はない。</li><li>逆に<strong>フォールスネガティブ（見逃し）</strong>は攻撃を通してしまう。導入初期は<strong>検知モードで運用してチューニング</strong>してから遮断モードにする、というのが定番の答え。</li><li>インライン機器は<strong>故障時に通信断</strong>になる点もポイント（バイパス機能・冗長化）。</li></ul>'
  },
  {
    id: 'C7',
    part: 'C',
    partName: 'セキュリティ',
    sub: '6-6 802.1X',
    level: 2,
    q: '<p>IEEE 802.1X 認証の構成要素3つの名称と役割を答えよ。また EAP-TLS と PEAP の違いを、クライアント側の認証方法の観点で説明せよ。</p>',
    a: '<table><thead><tr><th>要素</th><th>役割</th><th>例</th></tr></thead><tbody><tr><td><strong>サプリカント</strong></td><td>認証を受ける端末側ソフト</td><td>PC、スマホ</td></tr><tr><td><strong>オーセンティケータ</strong></td><td>認証を仲介し、結果に従いポートを開閉</td><td>L2SW、無線AP</td></tr><tr><td><strong>認証サーバ</strong></td><td>認証の可否を判定</td><td><strong>RADIUS</strong> サーバ</td></tr></tbody></table><ul><li>サプリカント↔オーセンティケータは <strong>EAPOL</strong>、オーセンティケータ↔認証サーバは <strong>RADIUS</strong> で EAP を運ぶ。</li><li><strong>EAP-TLS</strong>：サーバ・<strong>クライアント双方が証明書</strong>で認証。安全だがクライアント証明書の配布・管理が必要。</li><li><strong>PEAP</strong>：サーバ証明書で <strong>TLS トンネル</strong>を作り、その中でクライアントは <strong>ID/パスワード</strong>（MS-CHAPv2 など）で認証。クライアント証明書は不要。</li><li>認証結果に応じて <strong>VLAN を動的に割り当てる</strong>（ダイナミックVLAN）のも午後頻出。</li></ul>'
  },
  {
    id: 'C8',
    part: 'C',
    partName: 'セキュリティ',
    sub: '6-7 メール認証',
    level: 2,
    q: '<p>送信ドメイン認証の SPF・DKIM・DMARC について、それぞれ何を検証する仕組みか説明せよ。<br>また OP25B とはどのような対策で、正規ユーザはどうやってメールを送信するか。</p>',
    a: '<ul><li><strong>SPF</strong>：送信ドメインの DNS（TXTレコード）に<strong>「このドメインのメールを送ってよいサーバのIPアドレス」</strong>を登録し、受信側は<strong>接続元IPアドレス</strong>と照合する。転送されると失敗しやすい。</li><li><strong>DKIM</strong>：送信サーバがメールに<strong>デジタル署名</strong>を付与し、受信側は DNS に公開された<strong>公開鍵</strong>で検証する。改ざん検知もでき、転送にも強い。</li><li><strong>DMARC</strong>：SPF／DKIM の結果と<strong>ヘッダFromのドメインが一致（アライメント）</strong>するかを確認し、失敗時の扱い（none / quarantine / reject）を<strong>送信ドメイン側がポリシーとして宣言</strong>する。集計レポートを受け取れる。</li><li><strong>OP25B（Outbound Port 25 Blocking）</strong>：ISP が、自社の動的IPアドレスから<strong>外部の 25番ポートへの通信を遮断</strong>し、ボット化した端末からのスパム送信を防ぐ。<ul><li>正規ユーザは <strong>サブミッションポート（587番）＋ SMTP-AUTH</strong>（または 465番 SMTPS）で自分のメールサーバに送信する。</li></ul></li></ul>'
  },
  {
    id: 'C9',
    part: 'C',
    partName: 'セキュリティ',
    sub: '6-7 DNSポイズニング',
    level: 3,
    q: '<p>DNS キャッシュポイズニング攻撃の仕組みを説明せよ。また、その対策を2つ以上挙げよ。</p>',
    a: '<ul><li>キャッシュDNSサーバ（フルリゾルバ）が権威DNSサーバに問い合わせている間に、攻撃者が<strong>偽の応答を先に送り込み</strong>、キャッシュに偽情報を記憶させる。以降、そのサーバを使う利用者が偽サイトへ誘導される。</li><li>偽応答が受理される条件は、<strong>問い合わせIDと宛先ポート番号などが一致</strong>すること。ID は16ビットしかないので総当たりされうる。</li><li><strong>カミンスキー攻撃</strong>：存在しないサブドメイン（random1.example.com …）を次々問い合わせさせ、キャッシュ済みでも攻撃を何度でも試せるようにした手法。</li><li>対策：<ul><li><strong>送信元ポート番号のランダム化</strong>（推測すべき組合せを増やす）</li><li><strong>DNSSEC</strong>（権威サーバの応答に署名し、リゾルバが検証する）</li><li>キャッシュサーバを<strong>オープンリゾルバにしない</strong>（内部からの再帰問い合わせのみ許可）</li><li>権威サーバとキャッシュサーバを<strong>分離</strong>する</li></ul></li></ul>'
  },
  {
    id: 'C10',
    part: 'C',
    partName: 'セキュリティ',
    sub: '6-8 DoS/DDoS',
    level: 2,
    q: '<p>(1) SYN フラッド攻撃の仕組みと、サーバ側の代表的な対策を答えよ。<br>(2) DNS や NTP を悪用した<strong>リフレクション（増幅）攻撃</strong>で UDP が使われる理由を2つ答えよ。</p>',
    a: '<p>(1)</p><ul><li>攻撃者が送信元を偽装した <strong>SYN を大量に送り</strong>、サーバは SYN+ACK を返して <strong>ACK を待つハーフオープン状態</strong>のセッションを大量に抱える → 接続キュー（バックログ）があふれ、正規の接続を受け付けられなくなる。</li><li>対策：<strong>SYN Cookie</strong>（SYN 受信時に状態を保持せず、SYN+ACK のシーケンス番号に情報を埋め込んで ACK 受信時に検証）、FW/IPS のしきい値制御、ハーフオープンのタイムアウト短縮。</li></ul><p>(2)</p><ul><li><strong>送信元IPアドレスを偽装しやすい</strong>：UDP はハンドシェイクがないので、偽装した送信元（＝被害者）にそのまま応答が届く。</li><li><strong>応答が要求より大きい（増幅率が高い）</strong>：小さな問い合わせで大きな応答（DNS の ANY 応答、NTP の monlist 等）を被害者に送らせられる。</li><li>対策：オープンリゾルバ・不要な UDP サービスの停止、<strong>送信元IP偽装の防止（イングレスフィルタリング）</strong>。</li></ul>'
  }
];
