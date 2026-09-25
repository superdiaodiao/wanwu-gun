// Everything 女娲 and the townsfolk say.

export const INTRO = [
  '咳咳——小泥人，醒醒！本宫是女娲。',
  '昨晚炼五色石炼得太嗨，一锤子下去……天被本宫捅了个窟窿。',
  '天庭的神仙都团建去了，这事只能靠你。',
  '这颗五色石给你当核心。推着它，把人间的东西统统滚进来——越滚越大！',
  '比球小的，一碰就粘上；比球大的会把你弹开，先绕着走，等长大了再来。',
];
// how big the ball must be to patch the hole all the way (m)
export const SKY_GOAL = 50;
export const INTRO_TIMED = '天上的窟窿，得一块五十米的补天石才补得上。天黑之前——六分钟——滚到五十米，越大越好。去吧！';
export const INTRO_FREE = '不着急，慢慢滚。滚到五十米就够补天了，到时候本宫叫你。';
export const GOAL_FREE = '五十米！够补天了——想补天就点「去补天」。接着滚到两百米，本宫封你「五色神石」！';
export const ALL_ROLLED = '城里都被你滚空了……该去补天了！点「去补天」就行。';

// size (m) → 女娲's comment. The HUD goal is always the next entry.
export const MILESTONES = [
  [0.1, '十厘米！瓜子、硬币都粘上了。继续！'],
  [0.2, '二十厘米！包子和苹果也能滚了。'],
  [0.3, '三十厘米！拖鞋和饭盒都不在话下。'],
  [0.5, '半米了！小心，猫会跑。'],
  [1, '一米！大妈们开始注意到你了。'],
  [2, '两米！人……也能滚了。本宫什么都没说。'],
  [4, '四米！汽车见了你都得让道。'],
  [8, '八米！小吃街已经装不下你了。'],
  [15, '十五米！去东边广场看看，那边的音乐可真吵。'],
  [30, '三十米！楼……楼也能滚了！'],
  [SKY_GOAL, '五十米！够补天了！别停——滚到两百米，本宫封你「五色神石」！'],
  [120, '一百二十米！城里的高楼，随便挑。'],
  [200, '两百米！「五色神石」到手！去郊外看看山——六百米就是「开天辟地」。'],
  [600, '六百米！「开天辟地」！你已经比有些山还大了。'],
  [900, '九百米……本宫的炼丹炉都没这么大。'],
];

// first time each thing gets rolled up
export const QUIPS = {
  guazi: '瓜子，一切伟大的开始。',
  mahjong_zhong: '三缺一……现在四缺四了。',
  mahjong_fa: '发财！——被滚走了。',
  chess_red: '帅被滚走了，这盘棋没法下了。',
  baozi: '包子滚进去了？给本宫留一个！',
  tanghulu: '冰糖葫芦……本宫的最爱……',
  red_envelope: '红包！本宫替你收着。',
  coin_1yuan: '一块钱也是钱。',
  cat_orange: '十只橘猫九只胖，这只是真的胖。',
  cat_black: '黑猫：喵。（它看起来并不意外）',
  cat_sleeping: '它……还在睡。',
  dog_husky: '哈士奇：嗷呜～（它看起来很开心）',
  dog_teddy: '泰迪：汪！汪汪汪！汪！',
  dog_shiba: '柴犬：……（一脸嫌弃）',
  goose: '你居然敢滚大鹅？！',
  chicken: '咯咯哒！',
  pigeon: '和平鸽：不和平了。',
  koi: '锦鲤！好运滚滚来！',
  buffalo: '牛魔王表示强烈抗议。',
  auntie: '大妈：小伙子，推慢点！',
  auntie_dance: '大妈：音乐别停，接着跳！',
  auntie_veg: '大妈：我的葱！我的葱！',
  uncle: '大爷：我这蒲扇还没扇完呢！',
  uncle_chess: '大爷：将军！——诶，我的棋呢？',
  uncle_birdcage: '连鸟带笼带大爷，一起滚了。',
  uncle_taichi: '大爷：以柔克刚……克不动。',
  fisherman: '大爷：鱼还没上钩，我先上钩了。',
  kid: '小朋友：好耶！再滚一次！',
  kid_balloon: '气球也一起上天了。',
  young_phone: '低头族：……（头都没抬）',
  delivery_rider: '外卖小哥：我还有三单没送！',
  security_guard: '保安：你哪个单元的？！',
  chef: '师傅：包子还没出锅呢！',
  jogger: '晨跑大哥：这下配速破纪录了。',
  grandma_stroller: '奶奶：慢点慢点，孩子睡着呢。',
  shared_bike: '共享单车：请在指定区域还车。',
  ebike: '电动车：请注意，请注意，倒车。',
  car_sedan: '车主：我的车！！',
  taxi: '师傅：去哪儿？上天？得加钱。',
  bus: '88 路公交：本车终点站——天上。',
  sprinkler_truck: '洒水车：顺便把天也洗一洗。',
  fire_truck: '消防车：天破了不归我们管啊！',
  bullet_train: '高铁：本次列车终点站——南天门。',
  mahjong_table: '麻将桌：这把我胡了啊！',
  stone_lion: '石狮子：吼——（石化）',
  vending_machine: '售货机：谢谢惠顾。',
  lantern_red: '福气滚滚来！',
  res_6f: '一整栋楼！楼里还有人在包饺子呢。',
  res_18f: '十八层！电梯都不用坐了。',
  shop_baozi: '包子铺连锅端了。',
  shop_barber: 'Tony 老师：我的剪刀！',
  school: '学生们：今天不用上课了！',
  pagoda: '宝塔：阿弥陀佛。',
  temple_hall: '菩萨：善哉，善哉……滚哉。',
  tv_tower: '明珠塔也滚进来了……本宫都不敢看。',
  ferris_ring: '摩天轮：请系好安全带。',
  mall: '商场：今日全场五折——滚走的不算。',
  mountain_green: '连山都搬走了，愚公都得喊你一声师傅。',
  mountain_rocky: '这座山有雪，补天正好降降温。',
  mountain_karst: '桂林山水甲天下，现在归你了。',
  cloud: '云都滚进来了？好，补天正好用得上。',
  turbine_rotor: '风车：转啊转……转进去了。',
};

// said when nothing has been rolled up for a while, by size
export const NUDGES = [
  [0.4, '院子里还有好多小东西——麻将桌、晾衣架、花坛边都找找！'],
  [2, '出了南边的大门就是小吃街，人多车多好吃的多！'],
  [8, '东边是广场，西边是公园，都去转转！'],
  [40, '高楼都在城里，往远处滚！'],
  [200, '城外有农田、高铁和风车，再远就是山了。'],
  [Infinity, '去郊外！山在等你。'],
];

export const HURRY = '还剩一分钟！太阳要下山了，抓紧滚！';

export const SPEAKER_LINE = '广场舞音箱被你滚走了……整个广场都安静了。本宫谢谢你。';
export const TIME_UP = '时间到！让本宫看看你滚了多大……';
export const LAUNCH = '起——！';
export const PATCHED = '补——天——！';
export const PATCHED_PART = '补——……哎，还差一块。';

// [max size, rank, 女娲's verdict]
export const ENDINGS = [
  [0.5, '小泥丸', '就这？连天上一个针眼都补不上……再来一次！'],
  [2, '泥球', '嗯……勉强能把窟窿的边边角角糊一糊。'],
  [10, '石球', '不错！天补上一小块，剩下的本宫用浆糊。'],
  [SKY_GOAL, '巨石', '差一点！窟窿补上了一大半，剩下的本宫先用浆糊糊着。'],
  [200, '补天石', '天补上了！这么大的补天石，天庭都要给你送锦旗！'],
  [600, '五色神石', '你把半个人间都滚上了天……本宫宣布：你就是新一代滚神！'],
  [Infinity, '开天辟地', '……盘古都没你能滚。天补好了，顺便还多出一个月亮。'],
];

export function ending(size) {
  return ENDINGS.find(e => size < e[0]);
}

// ---- the other ways to play (modes.js) -------------------------------------------------------------
export const INTRO_DAILY = '每日挑战！今天的三个心愿，人人都一样。四分钟，看你滚多大——明天还有新的。';
export const INTRO_RIVALS = '对手赛！城里还有三颗别人家的五色石在滚。三分钟，谁最大谁赢——比你小的，直接滚进来！';
/** the last stretch of a timed round */
export const hurryLine = left => (left >= 55 ? HURRY : `最后 ${Math.round(left)} 秒！冲啊！`);
export const LEVEL_DONE = ['过关！', '就是这样！', '漂亮！'];
export const LEVEL_FAIL = '差一点……再来一次！';

// 对手赛: said as it happens (the rivals' names go in)
export const ATE_RIVAL = name => `把「${name}」整个滚进来了！`;
export const RIVAL_ATE = (by, name) => `「${by}」把「${name}」滚走了`;
export const RIVAL_FIRST = '比你小的对手头上是金色的名字——追上去，直接滚进来！';

// poke 女娲 while she talks
export const POKES = [
  '戳本宫干嘛？快去滚！',
  '本宫的发髻很贵的，别乱摸。',
  '再戳，本宫就把你捏回泥巴。',
  '嗯？有事启奏，没事滚滚。',
  '哈哈，痒……别闹。',
  '本宫在补天，很忙的。',
];

// 五色石碎片 (shards.js)
export const SHARD_FIRST = '咦？五色石碎片！这是本宫当年炼石头掉的。一共十块，都藏在城里。';
export const SHARD_ALL = '十块五色石碎片全找齐了！本宫赏你一颗「五色神石」——去球皮里换上！';
