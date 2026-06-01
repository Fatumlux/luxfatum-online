import type { CharacterCard } from "../types";

const CHARACTER_BASE: Omit<CharacterCard, "role" | "complexity" | "tags" | "shortDesc" | "battleTip">[] = [
  {id:"ningyao",name:"寧曜",hp:7,atk:3,spd:2,passive:"每場1次，即將被擊倒時若已有裁定，可消耗1裁定保留1HP。",skill:{name:"寧曜裁定",cost:2,cd:2,desc:"對1敵造成2傷害並封印；若目標在此技能結算前已持有封印，額外造成1傷害。"},res:{name:"裁光",desc:"技能後回復1HP。"}},
  {id:"hengshuo",name:"衡朔",hp:8,atk:2,spd:2,passive:"每回合1次，可代替1名我方角色承受傷害；若已有守護，由守護優先承傷。代承後衡朔本回合受傷+1。",skill:{name:"近身護衛",cost:2,cd:2,desc:"我方1角色本回合受傷-2，並移除1個觀測；若該角色實際承傷且成功減傷，衡朔回復1HP。"},res:{name:"護持",desc:"技能目標獲得守護；守護承傷優先於衡朔被動。"}},
  {id:"youming",name:"幽冥",hp:6,atk:1,spd:4,passive:"每回合第一次受到傷害-1。",skill:{name:"幽影封步",cost:2,cd:2,desc:"對1名敵方角色造成2點傷害，並給予遲緩。"},res:{name:"暗痕",desc:"技能後目標ATK-1，持續到該目標下次行動結束。"}},
  {id:"leiting",name:"雷霆",hp:7,atk:2,spd:3,passive:"普攻HP高於自己的敵人時，傷害+1。",skill:{name:"雷斬突進",cost:2,cd:2,desc:"對1敵造成2傷害。"},res:{name:"壓陣",desc:"技能後給予目標觀測。"}},
  {id:"baijian",name:"白繭",hp:8,atk:1,spd:2,passive:"回合結束時，若白繭本回合未使用技能，回復目前HP最低的我方1HP。",skill:{name:"白色繭房",cost:3,cd:2,desc:"我方1角色回復2HP，並移除1個負面狀態；若該角色目前HP最低，額外回復1HP。"},res:{name:"包覆",desc:"技能目標獲得守護。"}},
  {id:"dengzhen",name:"燈真",hp:8,atk:2,spd:3,passive:"回合開始時，若技能冷卻為0且上次觸發已間隔至少2回合，我方獲得1能量。",skill:{name:"秩序重排",cost:1,cd:2,desc:"選1角色本回合SPD+2或-2；若目標是我方，回復3HP。"},res:{name:"整序",desc:"技能目標本回合受傷-1。"}},
  {id:"ino",name:"伊諾",hp:8,atk:2,spd:3,passive:"每場2次、每回合最多1次，敵方使用技能時，可使其費用+1；若仍成功，伊諾獲1能量並回復1HP。",skill:{name:"弱點標記",cost:2,cd:2,desc:"對1敵造成1傷害並給予觀測；若目標已有觀測，改為造成3傷害並移除觀測。"},res:{name:"解析",desc:"技能目標本回合受傷+1。"}},
  {id:"aila",name:"艾菈",hp:8,atk:2,spd:3,passive:"若自己沒有負面狀態，受到技能傷害-1；若有封印，回合開始時移除。",skill:{name:"靜默封存",cost:2,cd:2,desc:"對1敵造成2傷害並給予封印；若目標有觀測，額外造成2傷害。"},res:{name:"低聲",desc:"技能後獲得1能量。"}},
  {id:"leiyouxi",name:"雷幽曦",hp:6,atk:2,spd:3,passive:"我方角色被擊倒後，雷幽曦下一次造成傷害+1；此增傷最多累積1層。",skill:{name:"強硬破口",cost:2,cd:2,desc:"對1敵造成3傷害；若我方落後，給予混亂。"},res:{name:"反擊",desc:"若我方落後，本次技能傷害+1。"}},
  {id:"baidengling",name:"白燈澪",hp:8,atk:2,spd:3,passive:"每場1次，即將被擊倒時保留1HP；下回合不能使用技能。",skill:{name:"希望微光",cost:2,cd:2,desc:"我方全體回復1HP；HP最低我方額外回復1HP；若我方落後，額外獲得1裁定。"},res:{name:"餘光",desc:"技能後，HP最低的我方角色移除1個負面狀態。"}},
  {id:"yiaiqian",name:"伊艾栞",hp:7,atk:2,spd:2,passive:"任一角色技能成功結算後，獲得1紀錄，最多3個。",skill:{name:"重放紀錄",cost:2,cd:1,desc:"消耗1紀錄，複製上一個成功結算技能的基礎傷害或治癒值+1；若沒有紀錄，對1敵造成2傷害。"},res:{name:"續寫",desc:"技能後獲得1能量；若消耗最後1個紀錄，額外獲得1能量。"}},
  {id:"weixiang",name:"未響",hp:8,atk:2,spd:1,passive:"我方每回合第一次受到3以上傷害時，該傷害-1。",skill:{name:"沉默支點",cost:2,cd:2,desc:"我方1角色獲得守護並回復1HP；若目標已滿HP，改為下次受傷-1。"},res:{name:"支點",desc:"技能目標本回合下次受傷額外-1。"}},
  {id:"xiaomo",name:"小莫",hp:6,atk:2,spd:4,passive:"每場1次，即將被擊倒時擲硬幣；正面保留1HP，反面獲得1裁定。",skill:{name:"欸我亂講的",cost:2,cd:1,desc:"指定1敵擲硬幣；正面造成4傷害，反面給予混亂。反面不造成傷害且不觸發「下注」的遲緩追加。"},res:{name:"下注",desc:"若本次未造成傷害，可追加遲緩；但反面不造成傷害且不觸發此遲緩追加。"}},
  {id:"huiyin",name:"迴音",hp:8,atk:2,spd:3,passive:"每回合1次，我方獲得負面狀態時，可轉移給自己。",skill:{name:"回聲模仿",cost:2,cd:1,desc:"複製我方上一個可被複製且成功結算的技能，數值+1；若沒有可複製技能，改為對1敵造成2傷害。"},res:{name:"回聲",desc:"此技能費用-1。"}},
  {id:"yingli",name:"映璃",hp:7,atk:2,spd:4,passive:"不能被觀測；每回合第一次成為技能目標時，該傷害-1。",skill:{name:"視線偏移",cost:2,cd:2,desc:"對1敵造成1傷害並給予混亂；若目標已有混亂，額外造成2傷害。"},res:{name:"偏移",desc:"技能後映璃本回合受傷-1。"}},
  {id:"tianxun",name:"天訊",hp:7,atk:2,spd:4,passive:"回合開始時，由操作者選1名我方角色SPD+1。",skill:{name:"規則補充",cost:2,cd:2,desc:"選1項：普攻傷害+1、技能傷害+1、我方全體SPD+1、最低SPD先行動。"},res:{name:"加碼",desc:"可選2項，但天訊本回合不能防禦。"}},
  {id:"xuntian",name:"訊天",hp:7,atk:3,spd:2,passive:"攻擊帶有封印/混亂的敵人時，傷害+1。",skill:{name:"紅色爆點",cost:3,cd:2,desc:"對1敵造成3傷害；下回合使用技能費用+1。"},res:{name:"收束",desc:"技能後若目標HP為2以下，額外造成1傷害。"}},
  {id:"zuozhe",name:"作者",hp:6,atk:2,spd:1,passive:"每場1次，即將被擊倒時，敵方全體受到1傷害；其中HP最低者額外受到1傷害。若因此擊倒敵方角色，作者獲得1裁定。",skill:{name:"我加一條設定",cost:2,cd:2,desc:"對1敵造成2傷害並擲硬幣；正面給予混亂，反面令其本回合與下回合ATK/SPD-1。"},res:{name:"重寫",desc:"技能後額外給予觀測。"}},
  {id:"jingren",name:"鏡刃",hp:7,atk:2,spd:1,passive:"每場2次、每回合最多1次，敵方傷害技能或普攻包含鏡刃作為目標時，可發動干擾：該次攻擊不對我方造成傷害，並將最多2點傷害反彈給攻擊者；附帶負面狀態仍照常結算。",skill:{name:"影步守勢",cost:2,cd:2,desc:"賦予自身守護。下回合，鏡刃的SPD變為4。"},res:{name:"鏡返增幅",desc:"全域鏡返節奏更穩定，但每回合仍只能發動1次。"}},
  {id:"kelu",name:"刻律",hp:8,atk:2,spd:3,passive:"每回合開始時，選擇1名敵方角色賦予時間稅；場上同時最多只能有1個時間稅，回合結束必定移除。帶有時間稅的角色本回合第一次成功使用技能後，該技能冷卻+1、受到1傷害並移除時間稅。延滯不因回合結束移除，直到目標下次成功使用技能後移除。",skill:{name:"延後判決",cost:1,cd:2,desc:"對1敵造成2傷害。若該角色技能正在冷卻，使其冷卻+1；若目標帶有時間稅，改為冷卻+2並移除時間稅；若目標沒有技能正在冷卻，改為賦予延滯。"},res:{name:"秒針斷裂",desc:"使用技能後，若目標技能冷卻因此增加，刻律獲得1能量。每回合最多觸發1次。"}},
  {id:"liewu",name:"裂舞",hp:6,atk:2,spd:3,passive:"每當任一角色成功使用技能後，裂舞獲得1層戰意，最多3層。裂舞使用普攻時，最多可消耗1層戰意；消耗後，該次普攻後對同一目標追加1傷害，不再追加完整普攻。",skill:{name:"收勢護身",cost:2,cd:2,desc:"消耗2層戰意。本回合裂舞首次受到傷害時，該次傷害-2。若戰意不足2層，不能使用此技能。"},res:{name:"回氣",desc:"裂舞使用技能後，回復1HP。"}},
  {id:"songya",name:"訟鴉",hp:8,atk:2,spd:3,passive:"每回合開始時，若場上沒有欠條，可選擇1名敵方角色賦予欠條。帶有欠條的角色本回合第一次行動後，若未指定訟鴉為目標，訟鴉方獲得1能量且該角色受到2傷害；若有指定訟鴉，移除欠條。欠條不是負面狀態。",skill:{name:"追加條款",cost:2,cd:2,desc:"選擇1名敵方角色賦予欠條；若目標已經有欠條，改為升級為加重欠條。加重欠條結算時，若未指定訟鴉，訟鴉方獲得1能量，該角色受到2傷害且獲得延滯。"},res:{name:"收據成立",desc:"使用技能後，若場上存在欠條或加重欠條，訟鴉回復1HP。每回合最多觸發1次。"}},
  {id:"qiheng",name:"祈衡",hp:8,atk:2,spd:2,passive:"回合開始時，若我方存活角色中最高HP與最低HP相差3以上，可使HP最高的我方失去1HP，並使HP最低的我方回復1HP。此失去HP不視為受到傷害，不能使角色HP低於1。每回合最多1次。",skill:{name:"代價轉衡",cost:2,cd:2,desc:"選擇1名我方角色與1名敵方角色。我方目標失去1～3HP，敵方目標受到2＋失去HP數量的傷害。代價來源不能因此被擊倒；若失去3HP，來源本回合下次受傷+1。"},res:{name:"平線",desc:"技能後，若本次代價來源失去1HP，HP最低的我方角色回復1HP；若失去2HP，祈衡回復1HP；若失去3HP，不觸發共鳴。"}},
  {id:"shili",name:"蝕璃",hp:8,atk:2,spd:3,passive:"每回合第一次有敵方角色受到治療時，若該角色沒有腐蝕，給予1層腐蝕；若已帶有腐蝕，改為使其受到1傷害。",skill:{name:"黑針縫合",cost:2,cd:2,desc:"對1名敵方角色造成2傷害，並給予1層腐蝕。若目標本回合曾受到治療，額外造成1傷害。"},res:{name:"壞死擴散",desc:"蝕璃使用技能後，若目標帶有腐蝕，給予另一名敵方角色1層腐蝕。"}},
  {id:"fengxing",name:"縫星",hp:7,atk:2,spd:4,passive:"每回合開始時，選擇1名我方角色設置星線。本回合敵方第一次指定該角色為普攻或技能目標時，攻擊者受到2傷害，然後移除星線；未觸發則回合結束移除。",skill:{name:"縫進星裡",cost:2,cd:2,desc:"選擇1名敵方角色，給予縫線。帶有縫線的角色本回合第一次造成傷害後，若該次傷害指定的是縫星方HP最低角色，該角色受到1傷害。"},res:{name:"童話打結",desc:"設置星線時使用共鳴後，若該星線被觸發，攻擊者額外獲得遲緩。"}}
];

type CharacterMeta = Pick<CharacterCard, "role" | "complexity" | "tags" | "shortDesc" | "battleTip">;

const CHARACTER_META: Record<string, CharacterMeta> = {
  ningyao: { role: "裁定封印", complexity: 2, tags: ["封印", "保命", "裁定"], shortDesc: "耐久下修，仍以封印與保命壓節奏。", battleTip: "先讓敵人帶封印再開技能，才能打出額外 1 傷害。" },
  hengshuo: { role: "護衛承傷", complexity: 3, tags: ["代承", "減傷", "守護"], shortDesc: "技能判定回到中線，維持穩定防線。", battleTip: "代承後自己本回合更脆，別讓衡朔連續吃大傷。" },
  youming: { role: "高速牽制", complexity: 2, tags: ["遲緩", "減傷", "降攻"], shortDesc: "HP 與 ATK 下修，保留高速牽制價值。", battleTip: "共鳴降攻會拖到目標下次行動結束，適合壓制爆發角。" },
  leiting: { role: "破口打手", complexity: 2, tags: ["普攻", "觀測", "壓血"], shortDesc: "數值與技能傷害降溫，靠普攻條件補傷。", battleTip: "優先攻擊 HP 高於自己的敵人，才能吃到被動 +1。" },
  baijian: { role: "淨化治癒", complexity: 2, tags: ["治療", "淨化", "守護"], shortDesc: "技能變貴，未施放技能時才有回合末續航。", battleTip: "該回合要補大口或留被動補小口，選一個節奏。" },
  dengzhen: { role: "節奏調度", complexity: 3, tags: ["能量", "速度", "治療"], shortDesc: "HP、費用與我方治療大幅強化，成為主力節奏角。", battleTip: "1 費 SPD 調整很靈活，對我方使用還能補 3 HP。" },
  ino: { role: "技能干涉", complexity: 4, tags: ["觀測", "費用", "反制"], shortDesc: "HP 提升，標記現在也能造成 1 傷害。", battleTip: "干涉成功會回復 1 HP，留給對手關鍵技能最划算。" },
  aila: { role: "封印控制", complexity: 2, tags: ["封印", "技能傷害", "減傷"], shortDesc: "改成穩定 2 傷害加封印，觀測目標會更痛。", battleTip: "先用觀測鋪墊，艾菈能直接打出 4 傷害並封印。" },
  leiyouxi: { role: "逆風反擊", complexity: 2, tags: ["混亂", "落後", "爆發"], shortDesc: "身板與 ATK 降溫，共鳴只在落後時加傷。", battleTip: "落後時技能同時有混亂與共鳴加傷，是翻盤窗口。" },
  baidengling: { role: "團隊續戰", complexity: 2, tags: ["群補", "保命", "裁定"], shortDesc: "HP 與 ATK 上修，純補角也能提供壓力。", battleTip: "保命後不能用技能，下一回合要安排防禦或休息。" },
  yiaiqian: { role: "技能複寫", complexity: 4, tags: ["紀錄", "複製", "能量"], shortDesc: "紀錄上限回到 3，重放數值 +1，無紀錄也有保底。", battleTip: "好技能值得重放，空窗期也能用 2 傷害補節奏。" },
  weixiang: { role: "防線支點", complexity: 2, tags: ["守護", "減傷", "治療"], shortDesc: "維持穩定防線，擅長扛住單次大傷。", battleTip: "滿血目標會改給下次受傷 -1，不會浪費治療。" },
  xiaomo: { role: "硬幣賭徒", complexity: 3, tags: ["硬幣", "混亂", "裁定"], shortDesc: "硬幣風險維持在合理區間。", battleTip: "反面不打傷害，也不會追加「下注」遲緩。" },
  huiyin: { role: "回聲支援", complexity: 4, tags: ["複製", "轉移", "保底"], shortDesc: "HP 與冷卻強化，複製數值 +1，保底傷害回到 2。", battleTip: "先讓隊友開出好技能，迴音下一拍能把數值放大。" },
  yingli: { role: "目標偏移", complexity: 3, tags: ["混亂", "傷害", "抗觀測"], shortDesc: "HP 提升，技能改為穩定傷害加混亂。", battleTip: "對已有混亂目標再出手，總傷害會跳到 3。" },
  tianxun: { role: "規則主持", complexity: 4, tags: ["速度", "全局", "規則"], shortDesc: "回合開始提速，規則補充改為 +1 支援。", battleTip: "回合開始先幫關鍵角色提速，再用 +1 規則微調輸出或行動序。" },
  xuntian: { role: "收束爆點", complexity: 2, tags: ["收割", "封印", "技能傷害"], shortDesc: "技能傷害降為 3，但保留 2 HP 收束斬殺。", battleTip: "先削到 2 HP 以下，再用共鳴收束補最後 1 點。" },
  zuozhe: { role: "終局亂入", complexity: 3, tags: ["死亡反擊", "混亂", "減益"], shortDesc: "HP 下修，降低死亡反擊前的站場量。", battleTip: "被擊倒前盡量讓敵方最低 HP 進入額外傷害斬殺線。" },
  jingren: { role: "反射核心", complexity: 4, tags: ["鏡返", "守護", "反制"], shortDesc: "ATK 降溫，鏡返反彈傷害上限 2。", battleTip: "鏡返更偏保護而非爆殺，留給高價值目標。" },
  kelu: { role: "冷卻稅務", complexity: 3, tags: ["冷卻", "時間稅", "傷害"], shortDesc: "HP、ATK、費用全面強化，技能本身也造成 2 傷害。", battleTip: "時間稅成功觸發會再打 1 傷害，逼對手猶豫是否放技能。" },
  liewu: { role: "戰意鬥士", complexity: 4, tags: ["戰意", "普攻", "減傷"], shortDesc: "戰意普攻改為追加 1 傷害，不再追加完整普攻。", battleTip: "戰意現在是穩定補傷與護身資源，不是爆量連擊。" },
  songya: { role: "債務壓迫", complexity: 4, tags: ["欠條", "能量", "傷害"], shortDesc: "HP 與 ATK 上修，欠條未指定訟鴉會追加 2 傷害。", battleTip: "把欠條掛在不想打訟鴉的角色身上，逼他交出不舒服的行動。" },
  qiheng: { role: "代價爆發", complexity: 4, tags: ["代價", "爆發", "均衡"], shortDesc: "HP 上修，代價玩法更穩。", battleTip: "失去 3 HP 只適合安全回合，否則來源可能被反收。" },
  shili: { role: "腐蝕壓血", complexity: 3, tags: ["腐蝕", "治療反制", "擴散"], shortDesc: "HP 上修，反治療角色能站得更久。", battleTip: "腐蝕不會把治療降到 0，重點是逼對手浪費治療量。" },
  fengxing: { role: "線軸陷阱", complexity: 4, tags: ["星線", "縫線", "反傷"], shortDesc: "ATK 上修，星線反傷回到 2，縫線維持 1。", battleTip: "共鳴遲緩仍是關鍵價值，星線要放在對手最想打的目標上。" }
};

export const CHARACTERS: CharacterCard[] = CHARACTER_BASE.map(character => ({
  ...character,
  ...CHARACTER_META[character.id]
}));

export const byId = (id: string) => CHARACTERS.find(character => character.id === id);

export const cardImage = (id: string) => `assets/portraits/${id}.jpg`;
export const portraitImage = cardImage;

export const artFocus = (id: string) => ({
  ningyao:"center 18%", hengshuo:"center 14%", youming:"center 16%", leiting:"center 9%",
  baijian:"center 16%", dengzhen:"center 14%", ino:"center 14%", aila:"center 16%",
  leiyouxi:"center 9%", baidengling:"center 16%", yiaiqian:"center 9%", weixiang:"center 14%",
  xiaomo:"center 18%", huiyin:"center 14%", yingli:"center 16%", tianxun:"center 9%",
  xuntian:"center 9%", zuozhe:"center 8%", jingren:"center 16%", kelu:"center 17%",
  liewu:"center 18%", songya:"center 18%", qiheng:"center 14%", shili:"center 14%", fengxing:"center 12%"
}[id] || "center 16%");

export const slotFocus = (id: string) => ({
  ningyao:"center 18%", hengshuo:"center 14%", youming:"center 16%", leiting:"center 9%",
  baijian:"center 16%", dengzhen:"center 14%", ino:"center 14%", aila:"center 16%",
  leiyouxi:"center 9%", baidengling:"center 16%", yiaiqian:"center 9%", weixiang:"center 14%",
  xiaomo:"center 18%", huiyin:"center 14%", yingli:"center 16%", tianxun:"center 9%",
  xuntian:"center 9%", zuozhe:"center 8%", jingren:"center 10%", kelu:"center 11%",
  liewu:"center 12%", songya:"center 18%", qiheng:"center 14%", shili:"center 14%", fengxing:"center 12%"
}[id] || "center 14%");
