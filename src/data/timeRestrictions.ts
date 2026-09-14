// 時間通行止めの仮データ（Cさん担当・初心者向け簡易版）
// 本データは後回し。まず「今の時間なら ×通れません」と文字で出せればOK。

export interface TimeRestriction {
  id: string;
  name: string;
  description: string;
  // 適用曜日: 0=日 〜 6=土
  days: number[];
  // 適用時間帯（24h・分単位）。開始 <= 終了の範囲内を通行止めとみなす
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  // ルート上に含まれるかを判定するためのキーワード（道路名・地名の部分一致）
  roadKeywords: string[];
  // 付近判定用の代表座標と半径（m）。ルート座標が圏内に入れば「経由」とみなす
  center: [number, number]; // [lat, lng]
  radiusMeters: number;
}

export const TIME_RESTRICTIONS: TimeRestriction[] = [
  {
    id: 'school-zone-morning',
    name: '学校ゾーン（朝7–9時）',
    description: '平日朝の通学時間帯は車両進入禁止の区間があります',
    days: [1, 2, 3, 4, 5],
    startHour: 7,
    startMinute: 0,
    endHour: 9,
    endMinute: 0,
    roadKeywords: ['学校', '学園', '小学校', '中学校', '通学', 'スクールゾーン'],
    center: [35.6895, 139.6917], // 新宿区役所付近（仮）
    radiusMeters: 1500,
  },
  {
    id: 'ginza-pedestrian',
    name: '銀座歩行者天国',
    description: '週末・祝日の昼間は中央通りが歩行者天国になります',
    days: [0, 6],
    startHour: 12,
    startMinute: 0,
    endHour: 17,
    endMinute: 0,
    roadKeywords: ['中央通', '銀座', '歩行者天国', 'ホコ天'],
    center: [35.6717, 139.7649], // 銀座四丁目付近（仮）
    radiusMeters: 800,
  },
  {
    id: 'time-no-right-turn',
    name: '時間右折禁止',
    description: '指定時間帯は右折禁止になる交差点があります（仮データ1件）',
    days: [1, 2, 3, 4, 5],
    startHour: 7,
    startMinute: 30,
    endHour: 9,
    endMinute: 30,
    roadKeywords: ['右折禁止', '環七', '環状七号'],
    center: [35.69, 139.69], // 環七沿い（仮）
    radiusMeters: 2000,
  },
];
