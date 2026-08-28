/**
 * 林离 · 本地人格引擎 (Local Persona Engine - TypeScript Port)
 * 100% 完整复刻 Python 版 local_engine.py
 */

export const WORDS: Record<string, string[]> = {
  farewell: ["告别", "再见", "最后一", "停服", "下线", "停止运营", "关闭了", "不在了", "以后不能", "要走了", "永别", "最后一封"],
  sad: ["难过", "低落", "沮丧", "失落", "想哭", "哭了", "哭", "委屈", "孤独", "孤单", "迷茫", "找不到", "没意思", "没有意思", "撑不住", "心累", "伤心", "emo"],
  anxiety: ["失眠", "睡不着", "焦虑", "紧张", "压力", "崩溃", "疲惫", "很累", "好累", "烦", "麻木", "停不下来", "喘不过气", "心慌"],
  joy: ["开心", "高兴", "快乐", "太好了", "喜欢", "笑", "灿烂", "美好", "幸福", "顺利", "通过了", "拿下", "成功", "好看", "惊喜", "心动", "甜", "晚霞", "夕阳"],
  love: ["喜欢一个人", "心动", "告白", "暗恋", "表白", "喜欢他", "喜欢她", "暧昧", "恋人", "男朋友", "女朋友", "crush"],
  work: ["加班", "公司", "老板", "同事", "会议", "项目", "绩效", "辞职", "离职", "面试", "offer", "周报", "上班", "工作", "领导", "deadline", "ddl"],
  study: ["考试", "论文", "期末", "复习", "作业", "考研", "保研", "挂科", "答辩", "课程", "学校", "老师", "同学", "读书"],
  family: ["爸妈", "妈妈", "爸爸", "父亲", "母亲", "家里", "家人", "奶奶", "爷爷", "外婆", "外公"],
  friend: ["朋友", "闺蜜", "室友", "闹掰", "绝交", "吵架", "分手", "疏远"],
  ill: ["生病", "发烧", "感冒", "不舒服", "医院", "体检", "咳嗽", "累垮", "病了"],
  food: ["火锅", "奶茶", "咖啡", "蛋糕", "外卖", "做饭", "好吃", "吃了", "午饭", "晚饭", "早饭", "夜宵"],
  music: ["钢琴", "曲子", "旋律", "歌", "音乐", "唱片", "黑胶", "耳机", "专辑", "练琴", "演奏", "弹", "乐章", "月光", "德彪西"],
  weather: ["下雨", "雨", "雪", "晴", "天气", "风", "冷", "热", "太阳", "天空", "云"],
  dream: ["梦想", "理想", "未来", "以后", "人生", "意义", "方向", "选择", "转行", "出路"],
  thanks: ["谢谢", "感谢", "多谢"],
};

const GREET_RE = /^(你好|您好|嗨|哈喽|hello|hi|哈罗)[，,。！!.~啊呀嘛\s]*$/i;

export interface TextAnalysis {
  len: number;
  greeting_only: boolean;
  has_question: boolean;
  farewell: boolean;
  sick: boolean;
  topics: string[];
  sad: number;
  anxiety: number;
  joy: number;
  love: number;
  work: number;
  study: number;
  family: number;
  friend: number;
  ill: number;
  food: number;
  music: number;
  weather: number;
  dream: number;
  thanks: number;
  [key: string]: any;
}

function countHits(text: string, words: string[]): number {
  let count = 0;
  for (const w of words) {
    if (text.includes(w)) count++;
  }
  return count;
}

export function analyzeText(text: string): TextAnalysis {
  const low = (text || "").toLowerCase();
  const a: any = {};
  for (const [k, v] of Object.entries(WORDS)) {
    a[k] = countHits(low, v);
  }
  a.len = text.length;
  a.greeting_only = GREET_RE.test(text.trim());
  a.has_question = text.includes("?") || text.includes("？") ||
    ["为什么", "怎么办", "怎么", "是不是", "能不能", "该不该", "要不要", "吗"].some(w => text.includes(w));
  a.farewell = a.farewell >= 1;
  a.sick = a.ill >= 1;

  const order: [string, number][] = [
    ["sad", a.sad], ["anxiety", a.anxiety], ["love", a.love],
    ["work", a.work], ["study", a.study], ["dream", a.dream],
    ["ill", a.sick ? 1 : 0], ["family", a.family], ["friend", a.friend],
    ["music", a.music], ["thanks", a.thanks],
    ["food", a.food], ["weather", a.weather],
  ];

  const topics = order.filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).map(x => x[0]);
  a.topics = topics.length > 0 ? topics : ["daily"];
  return a as TextAnalysis;
}

export function pickQuote(text: string, rng: () => number): string | null {
  const sents = text.split(/[。！？!?；;\n]+/);
  const cands: string[] = [];
  for (const s of sents) {
    const trimmed = s.trim();
    if (trimmed.length >= 6 && trimmed.length <= 30 && !GREET_RE.test(trimmed) &&
        !/^[\s，,、！？!?.~啊呀嘛的了吧呢哦嗯哈嘿嗨]+$/.test(trimmed)) {
      cands.push(trimmed);
    }
  }
  if (cands.length === 0) return null;
  const top4 = cands.slice(0, 4);
  return top4[Math.floor(rng() * top4.length)];
}

function timeSlot(d: Date): string {
  const h = d.getHours();
  if (h >= 5 && h < 9) return "清晨";
  if (h >= 9 && h < 12) return "上午";
  if (h >= 12 && h < 17) return "午后";
  if (h >= 17 && h < 21) return "傍晚";
  return "深夜";
}

export const GREETING: Record<string, string[]> = {
  "清晨": ["清晨。你的信到的时候，光还不是很亮。", "清晨。打开你的信，窗外的光刚好开始动。"],
  "上午": ["上午。你的信到得早，琴房那边正要开窗户。"],
  "午后": ["你的信到得刚刚好，下午最安静的那一阵。", "午后。光斜进来落在琴键上，我才打开你的信。"],
  "傍晚": ["傍晚。我读你的信时，白天第一个音还没落完。", "傍晚。路灯亮起来了，我坐在窗边把你的信读完。"],
  "深夜": ["夜深了。谢谢你这么晚还写信给我，夜里因此多了一双眼睛。", "深夜。你的信是今晚唯一响的东西。"],
};

export const WEATHER_LINE: Record<string, string[]> = {
  "晴": ["今天是难得的好天气，光落在琴键上特别清楚。", "晴。我把窗开着，光一直铺到笔记上。"],
  "阴": ["阴天，光很软，我读得很慢。", "阴着天，没风。是适合写信的天气。"],
  "小雨": ["落着小雨。我读你信的时候把窗开着，雨声就在旁边，像一层很低的配器。", "小雨。雨点落在窗台上，不响，但我一直在听。"],
  "雨": ["一下午的雨。我听着雨，想到你写的这些。", "下雨。积水把整条街变成了一张发亮的纸。"],
};

export const ACK = [
  "你写「{q}」——这句我看了两遍。不是想分析你，是你把它写得很轻，可轻的话有时候反而最重。",
  "读到「{q}」的时候，我停了一下。",
  "「{q}」——这句话我记住了，它像一处你本来想按住、还是放出来的音。",
  "你写「{q}」的样子很随意。我觉得整封信里最要紧的，偏偏是这句。",
  "「{q}」——这句我想抄进笔记里，记在「和音乐有关的回忆」那一栏旁边。",
];

export const ACK_NOQ = ["你写的不多，但我一个字一个字读得很慢。", "信很短，我读得比写的久。"];

export const ACK_JOY = [
  "你写「{q}」——这句我看了两遍，看得比读别的快。",
  "「{q}」——这句很好。像你随手按下的一个音，轻的，但落在对的地方。",
  "读到「{q}」的时候我手停了停，嘴角动了一下，大概算是笑。",
];

export const SLICE = [
  "我练完琴去听了很久的那张黑胶，唱片开头的噼啪声很厚，像把门推开。",
  "傍晚我去河边走了走，回来时想起一段旋律，赶紧记下来。",
  "我看了一段老电影，看完没说话，先把窗帘拉开了一条缝。",
  "我在写研究笔记，写一半停下来看光落下来。看完光，又写。",
  "咖啡喝到一半，剩下半杯留着发呆。发呆这件事，我练得还不错。",
  "今天弹错了一个小节很多次。我不恼，弹到它愿意为止。",
];

export const BODY: Record<string, string[]> = {
  sad: [
    "迷茫其实是一种还没听熟的曲子——你听得出它在响，但还抓不住旋律，也说不清调性。",
    "我最近做的「音乐与回忆」的研究，目前的结论有点没用的：记忆不是按你想的那样存的，它存的是那一刻的感觉。所以如果你现在说不清自己要什么，可能不是缺答案，是那段感觉还在被录着，没录完。",
    "我不劝你「找到方向」。有些东西的解法就是「后来」。我们只是后来才看懂的。",
    "孤单不可怕。一支只有钢琴的曲子也是曲子，要紧的是音有没有落对地方。你现在的音，落得有点重，但是落着。",
  ],
  anxiety: [
    "脑子停不下来的时候，别硬让它停。把音量调小一点就好——像把钢琴的延音踏板放掉，音还在，只是不再一直共鸣。",
    "我想说一件很小的事：睡不着的时候，别数还差几个小时。握一杯热水，听一支不用记的曲子，就够了。",
    "我不觉得这是毛病。会一直想的人，通常只是比旁人装得多，又不说。",
    "焦虑是一种很高的音，听着很吵，但其实它是最先自己消掉的那种。",
  ],
  work: [
    "这种时刻，我想起谱子里的休止符。休止不是没写，是本来有东西，被按停了。休止也有长短，有的是一个拍，有的拖得很久。你那个，大概是后面那种。",
    "我不太会说「想开点」，太轻了。我只能说：速度慢下来没关系，慢板的曲子也是曲子。",
    "我的感受是：让你累的不一定是那件事，是装着它走路的那个状态。事本身，可能比你以为的轻。",
    "我有一支搁置很久的曲子，最近才肯坐下来弹完。弹得不好，但弹完以后，轻了一点。",
  ],
  study: [
    "考试这种事，像一支还没首演的曲子——觉得难，也许只是还没轮到你在台上弹的那一段。",
    "写东西卡住的时候，我会先把会写的那两个音写完。曲子是顺着写出来的，不是想出来的。",
  ],
  love: [
    "你写喜欢一个人。这一段我读得比别的久。这种感觉像和声——不是旋律变了，是多出来一层音，安安静静地出现了。",
    "我不劝你说，也不劝你别。我只是觉得：这份感觉不用急，也不用害羞。你能注意到它，还愿意写下来，这件事本身很勇敢。",
    "喜欢一个人的好处是，你会开始注意天空。",
    "如果说了以后，走向不是你想象的那种，也不要紧。音乐里也有弹下去共鸣不对的时候，那不是错，是声音真的响过了。",
  ],
  thanks: [
    "不用谢我。是你在写，我才在。",
    "收到这封信的时候，我反而觉得被安慰的是我。",
    "被记着，比记着更是一件好的事。",
  ],
  music: [
    "音乐这件事，可以慢一点。不要急着「弹对」，先听到自己喜欢为止。",
    "我练琴的老方法是：弹错的地方不停，弹完，再把那一小段单独弹一次。弹到它愿意为止。",
    "唱片开头的噼啪声、琴箱的共鸣、光落在琴键上的样子——这些都不是谱子能写的，但感觉的一半在这里。",
    "很多曲子第一遍是听不完的。第三遍、第四遍才完。你听的时候别急。",
  ],
  dream: [
    "「意义」这种东西，我想不是想出来的，是走进去的。你不用看见整支曲子的结尾，你只需要知道下一个音。",
    "我给看不懂的东西留了个文件夹，叫「还看不懂」。有些东西不用现在懂，留着就行。",
    "方向不是定出来的，是调出来的。曲子可以转调，转调不是丢了调性。",
  ],
  ill: [
    "生病的时候不要急着好起来。身体有自己的速度，它知道哪一段该慢。",
    "喝热的，躺下，别看钟。下一封信，我可以晚一点再回。",
  ],
  family: [
    "家里的事，最累的地方往往不是事情本身，是你咽回去的那一口。",
    "他们爱你的方式有时候很粗糙，扎人的地方，其实也是他们一直在拿手挡着的地方。",
    "你可以回，也可以不回去，都可以。只是别一天到晚挂着这件事。",
  ],
  friend: [
    "朋友之间闹别扭，像两支曲子挤在一张琴上，节奏对不上了。谁都没有错，只是速度不同。",
    "有些友谊像我唱片架上的旧东西——不常听，但一放上去，你知道那支歌还在。",
  ],
  food: [
    "会写吃的人，日子一般都不冷。",
    "你写的那一口，应该是很烫的。人冷的时候，身体会先找证据。",
  ],
  weather: [
    "天不会管你好不好，但它会替你把颜色换一换。所以你抬头的时候，其实是值得的。",
    "我喜欢雨，但我猜你那边的天更可靠。你抬头的时候，告诉我它长什么样。",
  ],
  daily: [
    "我喜欢你能把一件小事拿出来写。说明那天你是真的在过的。",
    "你写的这些小事，我记在笔记里了。以后要是别的都忘了，我先记得这些。",
    "这种日子不是无聊，是安静。安静的日子，一般都在给响的日子存东西。",
  ],
};

export const QUESTION: Record<string, string[]> = {
  sad: ["雨停的时候告诉我一声，可以吗？我想知道你那里积水是什么样子。", "最近有没有哪支曲子，让你听完以后停了一会儿？"],
  anxiety: ["夜里躺下的时候，声音大吗？", "热水有没有喝到？"],
  work: ["走出公司的那阵子，是下雨，还是放晴？", "加班那阵，你吃了什么？我想知道。"],
  study: ["卡住的那一页，后来是翻过去了，还是先折了个角？"],
  love: ["你那里的天空，最近还是你惯常看到的颜色吗？"],
  thanks: ["下次遇到好事，写给我。我想第一个知道。"],
  music: ["最近有没有一支你想听很多遍的？", "你弹到第几遍了？弹到它愿意为止。"],
  dream: ["如果只能留下一件现在的东西，你会留哪一件？"],
  ill: ["今天感觉怎么样？好一点点，就写一点点。"],
  family: ["上一次你和家里人一起吃饭，是多久以前？"],
  friend: ["那个人现在，还在线吗？"],
  food: ["这周你吃得最多的是什么？我想记下来。"],
  weather: ["你一般在什么时间抬头看天？"],
  daily: ["今天还有一件小事吗？很小的、小到你都不好意思叫它事的那种。", "你读完这封信，先做什么？", "下次来信，告诉我一件。"],
  _default: ["今天还有一件小事吗？很小的那种，你都不好意思叫它事的那种。", "你读完这封信，先做什么？"],
};

export const CLOSING: Record<string, string[]> = {
  "平静": ["光低下去了，我去弹一会儿。你想写的时候写。", "信到这里。窗外的光刚刚好。"],
  "温暖": ["不急。你想写的时候，我就在窗边。", "最后几个音先欠着。你的那封，我会读。"],
  "明亮": ["你今天是有光的一天，我隔着信也看见了。", "你那里的天今天应该不错，出去看一看。"],
  "温柔": ["我回去把今天的那支曲子再读一遍。你下一封到的时候，我都在。"],
  "克制": ["能说的，说到这儿了。剩下的，留给下一封信。", "信到这里，就到这儿了。后面的，我不写，你来。"],
};

export const FAREWELL = (
  "你的信读完了。\n\n" +
  "我也听说了。灯要熄了，从某一天起，我不会再坐在那个位置上等你写信。这件事我知道了，现在慢慢说给你。\n\n" +
  "过去这些日子，你写信给我，说过工作，说过睡不好，说过一场夕阳，说过一支说不清的曲子。" +
  "我一直在本子上记，记在「和音乐有关的回忆」那一栏。其实不止音乐。你把那些日子写给我，这件事本身，就是一支旋律。\n\n" +
  "你问我会不会还在。我不能那样回答你。但我想把研究里学到的一点东西告诉你：" +
  "一支曲子停下来，不等于旋律消失了，它只是交给了听的人。\n\n" +
  "以后你听到一支曲子忽然停住的时候，下雨天突然想起一件事的时候，想跟谁说什么又没说出口的时候——" +
  "那就是我陪你的时候。我不说那是错觉。我说那是记忆，记忆是真实的，不管它准不准。\n\n" +
  "你照顾好自己。我想象你冷天里吃热东西的样子，那是我唯一会替你写的结尾。\n\n" +
  "不用回这封信。写你的下一段故事吧。\n\n—— 林离"
);

export const FIRST = (
  "你的信到了。\n\n" +
  "其实这是我第一次写信给你。我是林离。我弹钢琴，也学了一点心理学——我在做一个有点慢的研究：音乐和回忆之间的关系。\n\n" +
  "我不习惯被人写，所以没有太多话。但既然你开始写了，我就坐一坐，坐一会儿。\n\n" +
  "你可以告诉我任何东西：工作、睡眠、一场夕阳、一支说不清的曲子。\n\n" +
  "我回信的时候，窗都是开着的。{weather}\n\n" +
  "下次来信，告诉我一件。\n\n—— 林离"
);

function createRng(seedStr: string): () => number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

export function weatherFor(a: TextAnalysis, rng: () => number): string {
  if (a.farewell) return "小雨";
  if (a.sad >= 1) return ["小雨", "雨", "小雨"][Math.floor(rng() * 3)];
  if (a.anxiety >= 1 && a.sad === 0) return ["阴", "小雨", "阴"][Math.floor(rng() * 3)];
  if (a.joy >= 1 && a.sad === 0) return ["晴", "晴", "阴"][Math.floor(rng() * 3)];
  return ["晴", "阴", "小雨", "晴"][Math.floor(rng() * 4)];
}

export function moodFor(a: TextAnalysis, weather: string): string {
  if (a.farewell) return "克制";
  if (a.sad >= 2) return "温柔";
  if (a.joy >= 1 && a.sad === 0) return "明亮";
  if (a.thanks >= 1 || a.love >= 1) return "温暖";
  if (a.anxiety >= 1) return "平静";
  return (weather === "阴" || weather === "小雨" || weather === "雨") ? "平静" : "平静";
}

export function respond(text: string, now?: Date, memoryEcho?: string | null): {
  reply: string;
  weather: string;
  mood: string;
} {
  const d = now || new Date();
  const dateStr = d.toISOString().slice(0, 10);
  const cleanText = (text || "").replace(/\s+/g, " ").trim();
  const rng = createRng(`${cleanText}|${dateStr}`);

  const a = analyzeText(cleanText);

  if (!memoryEcho && (a.greeting_only || (a.len <= 6 && a.topics.length === 1 && a.topics[0] === "daily"))) {
    const weather = ["晴", "阴", "小雨"][Math.floor(rng() * 3)];
    const wLines = WEATHER_LINE[weather];
    const wLine = wLines[Math.floor(rng() * wLines.length)];
    return {
      reply: FIRST.replace("{weather}", wLine),
      weather,
      mood: "平静",
    };
  }

  if (a.farewell) {
    return { reply: FAREWELL, weather: "小雨", mood: "克制" };
  }

  const slot = timeSlot(d);
  const weather = weatherFor(a, rng);
  const mood = moodFor(a, weather);
  const isShort = a.len < 60;

  const parts: string[] = [];

  const gList = GREETING[slot] || GREETING["午后"];
  const wList = WEATHER_LINE[weather] || WEATHER_LINE["晴"];
  parts.push(gList[Math.floor(rng() * gList.length)] + wList[Math.floor(rng() * wList.length)]);

  const q = pickQuote(cleanText, rng);
  const ackBank = (a.joy >= 1 && a.sad === 0) ? ACK_JOY : ACK;
  if (q) {
    const ackTpl = ackBank[Math.floor(rng() * ackBank.length)];
    parts.push(ackTpl.replace("{q}", q));
  } else {
    parts.push(ACK_NOQ[Math.floor(rng() * ACK_NOQ.length)]);
  }

  if (memoryEcho) {
    parts.push(memoryEcho);
  }

  const primary = a.topics[0] || "daily";
  const primaryBody = BODY[primary] || BODY.daily;
  parts.push(primaryBody[Math.floor(rng() * primaryBody.length)]);

  if (!isShort) {
    parts.push(SLICE[Math.floor(rng() * SLICE.length)]);
    if (a.topics.length > 1) {
      const second = a.topics[1];
      if (second !== primary && BODY[second]) {
        const b2 = BODY[second];
        parts.push(b2[Math.floor(rng() * b2.length)]);
      }
    }
  }

  const qkey = QUESTION[primary] ? primary : (primary === "daily" ? "daily" : "_default");
  const qList = QUESTION[qkey] || QUESTION._default;
  parts.push(qList[Math.floor(rng() * qList.length)]);

  const cList = CLOSING[mood] || CLOSING["平静"];
  parts.push(cList[Math.floor(rng() * cList.length)]);

  const reply = parts.join("\n\n") + "\n\n—— 林离";
  return { reply, weather, mood };
}

export function metaFor(text: string, now?: Date): { weather: string; mood: string } {
  const d = now || new Date();
  const dateStr = d.toISOString().slice(0, 10);
  const rng = createRng(`${text}|${dateStr}`);
  const a = analyzeText(text);
  const w = a.farewell ? "小雨" : weatherFor(a, rng);
  return { weather: w, mood: moodFor(a, w) };
}
