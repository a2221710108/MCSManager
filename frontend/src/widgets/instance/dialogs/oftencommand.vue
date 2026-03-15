<script setup lang="ts">
import { ref, reactive, computed, watch } from "vue";
import { t } from "@/lang/i18n";
import { message } from "ant-design-vue";
import type { InstanceDetail } from "@/types";
import type { UseTerminalHook } from "../../../hooks/useTerminal";
import { 
  SendOutlined, 
  SettingOutlined, 
  RocketOutlined, 
  ReloadOutlined,
  HistoryOutlined,
  ExperimentOutlined,
  ThunderboltOutlined,
  SearchOutlined,
  TeamOutlined,
  ShopOutlined,
  SubnodeOutlined,
  PlayCircleOutlined
} from "@ant-design/icons-vue";
  
const searchQuery = ref("");
// --- 類型定義 ---
interface CommandItem {
  label: string;
  cmd: string;
  options?: string[];
  placeholder?: string | string[]; 
}

interface CommandGroup {
  group: string;
  icon: any;
  commands: CommandItem[];
}

const props = defineProps<{
  instanceInfo?: InstanceDetail;
  useTerminalHook: UseTerminalHook;
}>();

const open = ref(false);
const onlinePlayers = ref<string[]>([]);
const isFetchingPlayers = ref(false);
const { sendCommand, isConnect } = props.useTerminalHook;

const formState = reactive<Record<string, string>>({});

// --- 這裡新增 activeKeys 用於摺疊面板 ---
// 預設展開第一組，如果想全部預設關閉可以設為 ref([])
const activeKeys = ref<string[]>([t("環境與時間")]); 

// --- 指令配置 ---
const COMMAND_GROUPS: CommandGroup[] = [
  {
    group: t("環境與時間"),
    icon: HistoryOutlined,
    commands: [
      { label: t("遊戲難度"), cmd: "difficulty {val}", options: ["peaceful", "easy", "normal", "hard"] },
      { label: t("天氣切換"), cmd: "weather {val}", options: ["clear", "rain", "thunder"] },
      { label: t("時間設置"), cmd: "time set {val}", options: ["day", "night", "noon", "midnight"] },
      { label: t("發送全服信息"), cmd: "say {text}", placeholder: t("輸入信息") },
      { label: t("發送標題"), cmd: 'title {player} title {"text":"{text}","color":"{val}"}', placeholder: t("標題內容"), options: ["red", "yellow", "green", "blue"] },
      { label: t("全伺服器標題"), cmd: 'title @a title {"text":"{text}","color":"{val}"}', placeholder: t("標題內容"), options: ["red", "yellow", "green", "blue"] },
      { label: t("發送副標題"), cmd: 'title {player} subtitle {"text":"{text}","color":"{val}"}', placeholder: t("標題內容"), options: ["red", "yellow", "green", "blue"] },
      { label: t("全伺服器副標題"), cmd: 'title @a subtitle {"text":"{text}","color":"{val}"}', placeholder: t("標題內容"), options: ["red", "yellow", "green", "blue"] },
      { label: t("發送物品欄文字"), cmd: 'title {player} actionbar {"text":"{text}","color":"{val}"}', placeholder: t("標題內容"), options: ["red", "yellow", "green", "blue"] },
      { label: t("全伺服器物品欄文字"), cmd: 'title @a actionbar {"text":"{text}","color":"{val}"}', placeholder: t("標題內容"), options: ["red", "yellow", "green", "blue"] },
    ]
  },
  {
    group: t("玩家與實體"),
    icon: TeamOutlined,
    commands: [
      { label: t("騎乘（A騎B）"), cmd: "ride {player} mount {player}" }, 
      { label: t("解除騎乘"), cmd: "ride {player} dismount" },
      { label: t("傳送玩家（A傳B）"), cmd: "tp {player} {player}" }, 
      { label: t("增加經驗值"), cmd: "experience add {player} {text} points" ,placeholder: t("經驗值")},
      { label: t("設定等級"), cmd: "experience set {player} {text} levels" ,placeholder: t("等級")},
      { label: t("賦予標籤"), cmd: "tag {player} add {text}" ,placeholder: t("標籤")},
      { label: t("清除玩家以外的實體"), cmd: "kill @e[type=!player]" }, 
      { label: t("清除掉落物品"), cmd: "kill @e[type=item]" }, 
      { label: t("清除所有實體"), cmd: "kill @e" }, 
      { label: t("清除玩家附近實體"), cmd: "kill @e[type=!player,distance=..{text}]", placeholder: t("半徑") }, 
    ]
  },
  {
    group: t("尋找"),
    icon: SearchOutlined,
    commands: [
      { label: t("試煉密室"), cmd: "locate structure trial_chambers" }, 
      { label: t("平原村莊"), cmd: "locate structure village_plains" }, 
      { label: t("要塞"), cmd: "locate structure stronghold" }, 
      { label: t("古城"), cmd: "locate structure ancient_city" }, 
      { label: t("林地府邸"), cmd: "locate structure mansion" }, 
      { label: t("海底神廟"), cmd: "locate structure monument" }, 
      { label: t("掠奪者前哨站"), cmd: "locate structure pillager_outpost" }, 
      { label: t("廢棄礦坑"), cmd: "locate structure mineshaft" }, 
      { label: t("埋藏的寶藏"), cmd: "locate structure buried_treasure" }, 
      { label: t("沉船"), cmd: "locate structure shipwreck" }, 
      { label: t("地獄堡壘"), cmd: "locate structure trial_chambersfortress" }, 
      { label: t("堡壘遺跡"), cmd: "locate structure bastion_remnant" }, 
      { label: t("終界城"), cmd: "locate structure end_city" }, 
      { label: t("櫻花林"), cmd: "locate biome cherry_grove" }, 
      { label: t("紅樹林沼澤"), cmd: "locate biome mangrove_swamp" }, 
      { label: t("深暗之域"), cmd: "locate biome deep_dark" }, 
      { label: t("蘑菇島"), cmd: "locate biome mushroom_fields" }, 
      { label: t("冰刺平原"), cmd: "locate biome ice_spikes" }, 
      { label: t("尖峭峰"), cmd: "locate biome jagged_peaks" }, 
      { label: t("繁茂洞穴"), cmd: "locate biome lush_caves" }, 
      { label: t("鐘乳石洞穴"), cmd: "locate biome dripstone_caves" }, 
      { label: t("沙漠"), cmd: "locate biome desert" }, 
      { label: t("叢林"), cmd: "locate biome jungle" }, 
      { label: t("花林"), cmd: "locate biome flower_forest" }, 
    ]
  },
  {
    group: t("特殊物品"),
    icon: ShopOutlined,
    commands: [
      { label: t("屏障"), cmd: "give {player} barrier {text}" ,placeholder: t("數量")}, 
      { label: t("光源"), cmd: 'give {player} light[block_state={level:"{text}"}] {text}' ,placeholder: [t("玩家"), t("亮度 0-15"), t("數量")] },
      { label: t("結構空位"), cmd: "give {player} structure_void {text}" ,placeholder: t("數量")}, 
      { label: t("除錯棒"), cmd: "give {player} debug_stick {text}" ,placeholder: t("數量")}, 
      { label: t("指令方塊"), cmd: "give {player} command_block {text}" ,placeholder: t("數量")}, 
      { label: t("指令方塊礦車"), cmd: "give {player} command_block_minecart {text}" ,placeholder: t("數量")}, 
      { label: t("結構方塊"), cmd: "give {player} structure_block {text}" ,placeholder: t("數量")}, 
      { label: t("拼圖方塊"), cmd: "give {player} jigsaw {text}" ,placeholder: t("數量")}, 
      { label: t("知識之書"), cmd: "give {player} knowledge_book {text}" ,placeholder: t("數量")}, 
    ]
  },
  {
    group: t("遊戲規則 (傷害)"),
    icon: SettingOutlined,
    commands: [
      { label: t("自然回血"), cmd: "gamerule natural_health_regeneration {val}", options: ["true", "false"] },
      { label: t("溺水傷害"), cmd: "gamerule drowning_damage {val}", options: ["true", "false"] },
      { label: t("摔落傷害"), cmd: "gamerule fall_damage {val}", options: ["true", "false"] },
      { label: t("火焰傷害"), cmd: "gamerule fire_damage {val}", options: ["true", "false"] },
      { label: t("冰凍傷害"), cmd: "gamerule freeze_damage {val}", options: ["true", "false"] },
      { label: t("原諒死者"), cmd: "gamerule forgive_dead_players {val}", options: ["true", "false"] },
      { label: t("怪物無差別仇恨"), cmd: "gamerule universal_anger {val}", options: ["true", "false"] },
    ]
  },
  {
    group: t("遊戲規則 (上帝)"),
    icon: SettingOutlined,
    commands: [
      { label: t("死亡不掉落"), cmd: "gamerule keep_inventory {val}", options: ["true", "false"] },
      { label: t("生物破壞地形"), cmd: "gamerule mob_griefing {val}", options: ["true", "false"] },
      { label: t("日夜循環"), cmd: "gamerule advance_time {val}", options: ["true", "false"] },
      { label: t("指令方塊"), cmd: "gamerule command_blocks_work {val}", options: ["true", "false"] },
      { label: t("鞘翅移動檢測"), cmd: "gamerule elytra_movement_check {val}", options: ["true", "false"] },
      { label: t("玩家移動檢測"), cmd: "gamerule player_movement_check {val}", options: ["true", "false"] },
      { label: t("玩家定位條"), cmd: "gamerule locator_bar {val}", options: ["true", "false"] },
      { label: t("積雪厚度"), cmd: "gamerule max_snow_accumulation_height {text}", placeholder: t("1 表示一格") },
      { label: t("創造傳送門等待時間"), cmd: "gamerule players_nether_portal_creative_delay {text}", placeholder: t("20 代表一秒") },
      { label: t("生存傳送門等待時間"), cmd: "gamerule players_nether_portal_default_delay {text}", placeholder: "80" },
      { label: t("允許進入地獄"), cmd: "gamerule allow_entering_nether_using_portals {val}", options: ["true", "false"] },
      { label: t("跳過夜晚睡眠比例"), cmd: "gamerule players_sleeping_percentage {text}", placeholder: t("大於100將無法跳過") },
      { label: t("PVP"), cmd: "gamerule pvp {val}", options: ["true", "false"] },
      { label: t("藤蔓蔓延"), cmd: "gamerule spread_vines {val}", options: ["true", "false"] },
      { label: t("TNT爆炸"), cmd: "gamerule tnt_explodes {val}", options: ["true", "false"] },
      { label: t("設定世界中心"), cmd: "worldborder center {text}", placeholder: "x z" },
      { label: t("設定世界邊界"), cmd: "worldborder set {text}", placeholder: "" },
      { label: t("重置世界邊界"), cmd: "worldborder set 59999968" },
    ]
  },
  {
    group: t("遊戲規則 (生成)"),
    icon: SettingOutlined,
    commands: [
      { label: t("生物自然生成"), cmd: "gamerule spawn_mobs {val}", options: ["true", "false"] },
      { label: t("怪物自然生成"), cmd: "gamerule spawn_monsters {val}", options: ["true", "false"] },
      { label: t("掠奪者巡邏隊"), cmd: "gamerule spawn_patrols {val}", options: ["true", "false"] },
      { label: t("夜魅"), cmd: "gamerule spawn_phantoms {val}", options: ["true", "false"] },
      { label: t("流浪商人"), cmd: "gamerule spawn_wandering_traders {val}", options: ["true", "false"] },
      { label: t("伏守者"), cmd: "gamerule spawn_wardens {val}", options: ["true", "false"] },
      { label: t("生怪磚"), cmd: "gamerule spawner_blocks_work {val}", options: ["true", "false"] },
      { label: t("突襲事件"), cmd: "gamerule raids {val}", options: ["true", "false"] },
    ]
  },
  {
    group: t("基礎屬性（個人）"),
    icon: SubnodeOutlined,
    commands: [
      { label: t("防禦"), cmd: "attribute {player} minecraft:armor base set {text}", placeholder: t("數值") }, 
      { label: t("最高生命值"), cmd: "attribute {player} minecraft:max_health base set {text}", placeholder: t("數值") }, 
      { label: t("防護強度"), cmd: "attribute {player} minecraft:armor_toughnes base set {text}", placeholder: t("數值") }, 
      { label: t("攻擊傷害"), cmd: "attribute {player} minecraft:attack_damage base set {text}", placeholder: t("數值") }, 
      { label: t("擊退"), cmd: "attribute {player} minecraft:attack_knockback base set {text}", placeholder: t("數值") }, 
      { label: t("攻擊速度"), cmd: "attribute {player} minecraft:attack_speed base set {text}", placeholder: t("數值") }, 
      { label: t("挖掘速度"), cmd: "attribute {player} minecraft:block_break_speed base set {text}", placeholder: t("數值") },
      { label: t("方塊互動距離"), cmd: "attribute {player} minecraft:block_interaction_range base set {text}", placeholder: t("數值") }, 
      { label: t("實體互動距離"), cmd: "attribute {player} minecraft:entity_interaction_range base set {text}", placeholder: t("數值") }, 
      { label: t("燃燒時間"), cmd: "attribute {player} minecraft:block_break_spee base set {text}", placeholder: t("數值") }, 
      { label: t("抗爆炸擊退"), cmd: "attribute {player} minecraft:explosion_knockback_resistance base set {text}", placeholder: t("數值") }, 
      { label: t("摔落傷害倍率"), cmd: "attribute {player} minecraft:fall_damage_multiplier base set {text}", placeholder: t("數值") }, 
      { label: t("抗擊退"), cmd: "attribute {player} minecraft:knockback_resistance base set {text}", placeholder: t("數值") }, 
      { label: t("最大傷害吸收值"), cmd: "attribute {player} minecraft:max_absorption base set {text}", placeholder: t("數值") }, 
      { label: t("幸運"), cmd: "attribute {player} minecraft:luck base set {text}", placeholder: t("數值") }, 
      { label: t("挖掘效率"), cmd: "attribute {player} minecraft:mining_efficiency base set {text}", placeholder: t("數值") }, 
      { label: t("移動效率(受限時)"), cmd: "attribute {player} minecraft:movement_efficiency base set {text}", placeholder: t("數值") }, 
      { label: t("額外氧氣"), cmd: "attribute {player} minecraft:oxygen_bonus base set {text}", placeholder: t("數值") }, 
      { label: t("安全摔落高度"), cmd: "attribute {player} minecraft:safe_fall_distance base set {text}", placeholder: t("數值") }, 
      { label: t("大小"), cmd: "attribute {player} minecraft:scale base set {text}", placeholder: t("數值") }, 
      { label: t("潛行速度"), cmd: "attribute {player} minecraft:sneaking_speed base set {text}", placeholder: t("數值") }, 
      { label: t("最大行走高度"), cmd: "attribute {player} minecraft:step_height base set {text}", placeholder: t("數值") }, 
      { label: t("水中挖掘速度"), cmd: "attribute {player} minecraft:submerged_mining_speed base set {text}", placeholder: t("數值") }, 
      { label: t("橫掃傷害率"), cmd: "attribute {player} minecraft:sweeping_damage_ratio base set {text}", placeholder: t("數值") }, 
      { label: t("水中移動效率"), cmd: "attribute {player} minecraft:water_movement_efficiency base set {text}", placeholder: t("數值") }, 
      { label: t("路徑點傳輸距離"), cmd: "attribute {player} minecraft:waypoint_transmit_range base set {text}", placeholder: t("數值") }, 
      { label: t("路徑點接收距離"), cmd: "attribute {player} minecraft:waypoint_receive_range base set {text}", placeholder: t("數值") }, 
    ]
  },
  {
    group: t("基礎屬性（在線玩家）"),
    icon: SubnodeOutlined,
    commands: [
      { label: t("防禦"), cmd: "attribute @a minecraft:armor base set {text}", placeholder: t("數值") }, 
      { label: t("最高生命值"), cmd: "attribute @a minecraft:max_health base set {text}", placeholder: t("數值") }, 
      { label: t("防護強度"), cmd: "attribute @a minecraft:armor_toughnes base set {text}", placeholder: t("數值") }, 
      { label: t("攻擊傷害"), cmd: "attribute @a minecraft:attack_damage base set {text}", placeholder: t("數值") }, 
      { label: t("擊退"), cmd: "attribute @a minecraft:attack_knockback base set {text}", placeholder: t("數值") }, 
      { label: t("攻擊速度"), cmd: "attribute @a minecraft:attack_speed base set {text}", placeholder: t("數值") }, 
      { label: t("挖掘速度"), cmd: "attribute @a minecraft:block_break_speed base set {text}", placeholder: t("數值") },
      { label: t("方塊互動距離"), cmd: "attribute @a minecraft:block_interaction_range base set {text}", placeholder: t("數值") }, 
      { label: t("實體互動距離"), cmd: "attribute @a minecraft:entity_interaction_range base set {text}", placeholder: t("數值") }, 
      { label: t("燃燒時間"), cmd: "attribute @a minecraft:block_break_spee base set {text}", placeholder: t("數值") }, 
      { label: t("抗爆炸擊退"), cmd: "attribute @a minecraft:explosion_knockback_resistance base set {text}", placeholder: t("數值") }, 
      { label: t("摔落傷害倍率"), cmd: "attribute @a minecraft:fall_damage_multiplier base set {text}", placeholder: t("數值") }, 
      { label: t("抗擊退"), cmd: "attribute @a minecraft:knockback_resistance base set {text}", placeholder: t("數值") }, 
      { label: t("最大傷害吸收值"), cmd: "attribute @a minecraft:max_absorption base set {text}", placeholder: t("數值") }, 
      { label: t("幸運"), cmd: "attribute @a minecraft:luck base set {text}", placeholder: t("數值") }, 
      { label: t("挖掘效率"), cmd: "attribute @a minecraft:mining_efficiency base set {text}", placeholder: t("數值") }, 
      { label: t("移動效率(受限時)"), cmd: "attribute @a minecraft:movement_efficiency base set {text}", placeholder: t("數值") }, 
      { label: t("額外氧氣"), cmd: "attribute @a minecraft:oxygen_bonus base set {text}", placeholder: t("數值") }, 
      { label: t("安全摔落高度"), cmd: "attribute @a minecraft:safe_fall_distance base set {text}", placeholder: t("數值") }, 
      { label: t("大小"), cmd: "attribute @a minecraft:scale base set {text}", placeholder: t("數值") }, 
      { label: t("潛行速度"), cmd: "attribute @a minecraft:sneaking_speed base set {text}", placeholder: t("數值") }, 
      { label: t("最大行走高度"), cmd: "attribute @a minecraft:step_height base set {text}", placeholder: t("數值") }, 
      { label: t("水中挖掘速度"), cmd: "attribute @a minecraft:submerged_mining_speed base set {text}", placeholder: t("數值") }, 
      { label: t("橫掃傷害率"), cmd: "attribute @a minecraft:sweeping_damage_ratio base set {text}", placeholder: t("數值") }, 
      { label: t("水中移動效率"), cmd: "attribute @a minecraft:water_movement_efficiency base set {text}", placeholder: t("數值") }, 
      { label: t("路徑點傳輸距離"), cmd: "attribute @a minecraft:waypoint_transmit_range base set {text}", placeholder: t("數值") }, 
      { label: t("路徑點接收距離"), cmd: "attribute @a minecraft:waypoint_receive_range base set {text}", placeholder: t("數值") }, 
    ]
  },
  {
    group: t("播放音效"),
    icon: PlayCircleOutlined,
    commands: [
      { label: t("苦力怕即將爆炸"), cmd: "playsound entity.creeper.primed master {player} ~ ~ ~ {text} {text}", placeholder: [t("玩家"), t("範圍(0.1以上)"), t("音調(0.1以上)")] },
      { label: t("隨機洞穴音效"), cmd: "playsound ambient.cave master master {player} ~ ~ ~ {text} {text}", placeholder: [t("玩家"), t("範圍(0.1以上)"), t("音調(0.1以上)")] },
      { label: t("終界使者瞬移"), cmd: "playsound entity.enderman.teleport master {player} ~ ~ ~ {text} {text}", placeholder: [t("玩家"), t("範圍(0.1以上)"), t("音調(0.1以上)")] },
      { label: t("惡魂的尖叫"), cmd: "playsound entity.ghast.scream master {player} ~ ~ ~ {text} {text}", placeholder: [t("玩家"), t("範圍(0.1以上)"), t("音調(0.1以上)")] },
      { label: t("殭屍敲門"), cmd: "playsound entity.zombie.attack_wooden_door master {player} ~ ~ ~ {text} {text}", placeholder: [t("玩家"), t("範圍(0.1以上)"), t("音調(0.1以上)")] },
      { label: t("村民的憤怒"), cmd: "playsound entity.villager.no master {player} ~ ~ ~ {text} {text}", placeholder: [t("玩家"), t("範圍(0.1以上)"), t("音調(0.1以上)")] },
      { label: t("地獄門"), cmd: "playsound block.portal.ambient master {player} ~ ~ ~ {text} {text}", placeholder: [t("玩家"), t("範圍(0.1以上)"), t("音調(0.1以上)")] },
      { label: t("閃電"), cmd: "playsound entity.lightning_bolt.thunder master {player} ~ ~ ~ {text} {text}", placeholder: [t("玩家"), t("範圍(0.1以上)"), t("音調(0.1以上)")] },
      { label: t("吃東西"), cmd: "playsound entity.generic.eat master {player} ~ ~ ~ {text} {text}", placeholder: [t("玩家"), t("範圍(0.1以上)"), t("音調(0.1以上)")] },
      { label: t("凋零誕生"), cmd: "playsound entity.wither.spawn master {player} ~ ~ ~ {text} {text}", placeholder: [t("玩家"), t("範圍(0.1以上)"), t("音調(0.1以上)")] },
      { label: t("凋零死亡"), cmd: "playsound entity.wither.death master {player} ~ ~ ~ {text} {text}", placeholder: [t("玩家"), t("範圍(0.1以上)"), t("音調(0.1以上)")] },
      { label: t("守衛者驚嚇"), cmd: "playsound entity.elder_guardian.curse master {player} ~ ~ ~ {text} {text}", placeholder: [t("玩家"), t("範圍(0.1以上)"), t("音調(0.1以上)")] },
      { label: t("Warden的心跳"), cmd: "playsound entity.warden.heartbeat master {player} ~ ~ ~ {text} {text}", placeholder: [t("玩家"), t("範圍(0.1以上)"), t("音調(0.1以上)")] },
      { label: t("Warden的超音波"), cmd: "playsound entity.warden.sonic_boom master {player} ~ ~ ~ {text} {text}", placeholder: [t("玩家"), t("範圍(0.1以上)"), t("音調(0.1以上)")] },
      { label: t("末影龍死亡"), cmd: "playsound entity.wither.death master {player} ~ ~ ~ {text} {text}", placeholder: [t("玩家"), t("範圍(0.1以上)"), t("音調(0.1以上)")] },
      { label: t("凋零死亡"), cmd: "playsound entity.ender_dragon.death master {player} ~ ~ ~ {text} {text}", placeholder: [t("玩家"), t("範圍(0.1以上)"), t("音調(0.1以上)")] },
      { label: t("凋零死亡"), cmd: "playsound entity.wither.death master {player} ~ ~ ~ {text} {text}", placeholder: [t("玩家"), t("範圍(0.1以上)"), t("音調(0.1以上)")] },
    ]
  },
  {
    group: t("召喚（敵對生物）"),
    icon: ThunderboltOutlined,
    commands: [
      { label: t("殭屍"), cmd: "execute at {player} run summon zombie ~ ~ ~" }, 
      { label: t("骷髏"), cmd: "execute at {player} run summon skeleton ~ ~ ~" }, 
      { label: t("苦力怕"), cmd: "execute at {player} run summon creeper ~ ~ ~" }, 
      { label: t("蜘蛛"), cmd: "execute at {player} run summon spider ~ ~ ~" }, 
      { label: t("幽靈"), cmd: "execute at {player} run summon ghast ~ ~ ~" }, 
      { label: t("末影龍（會破壞地形）"), cmd: "execute at {player} run summon ender_dragon ~ ~ ~" }, 
      { label: t("凋零"), cmd: "execute at {player} run summon wither ~ ~ ~" }, 
      { label: t("監守者"), cmd: "execute at {player} run summon warden ~ ~ ~" }, 
      { label: t("微風"), cmd: "execute at {player} run summon breeze ~ ~ ~" }, 
      { label: t("沼骸"), cmd: "execute at {player} run summon bogged ~ ~ ~" }, 
      { label: t("掠奪者"), cmd: "execute at {player} run summon pillager ~ ~ ~" }, 
      { label: t("衛道士"), cmd: "execute at {player} run summon vindicator ~ ~ ~" }, 
      { label: t("喚魔者"), cmd: "execute at {player} run summon evoker ~ ~ ~" }, 
      { label: t("幻術師"), cmd: "execute at {player} run summon illusioner ~ ~ ~" }, 
    ]
  },
  {
    group: t("召喚（中立生物）"),
    icon: ThunderboltOutlined,
    commands: [
      { label: t("末影人"), cmd: "execute at {player} run summon enderman ~ ~ ~" }, 
      { label: t("狼 (狗)"), cmd: "execute at {player} run summon wolf ~ ~ ~" }, 
      { label: t("鐵人"), cmd: "execute at {player} run summon iron_golem ~ ~ ~" }, 
      { label: t("蜜蜂"), cmd: "execute at {player} run summon bee ~ ~ ~" }, 
      { label: t("豬靈"), cmd: "execute at {player} run summon piglin ~ ~ ~" }, 
      { label: t("山羊"), cmd: "execute at {player} run summon goat ~ ~ ~" }, 
      { label: t("駱駝"), cmd: "execute at {player} run summon camel ~ ~ ~" }, 
    ]
  },
  {
    group: t("召喚（友好生物）"),
    icon: ThunderboltOutlined,
    commands: [
      { label: t("村民"), cmd: "execute at {player} run summon villager ~ ~ ~" }, 
      { label: t("豬"), cmd: "execute at {player} run summon pig ~ ~ ~" }, 
      { label: t("牛"), cmd: "execute at {player} run summon cow ~ ~ ~" }, 
      { label: t("羊"), cmd: "execute at {player} run summon sheep ~ ~ ~" }, 
      { label: t("雞"), cmd: "execute at {player} run summon chicken ~ ~ ~" }, 
      { label: t("馬"), cmd: "execute at {player} run summon horse ~ ~ ~" }, 
      { label: t("貓"), cmd: "execute at {player} run summon cat ~ ~ ~" }, 
      { label: t("Allay"), cmd: "execute at {player} run summon allay ~ ~ ~" }, 
      { label: t("Sniffer"), cmd: "execute at {player} run summon sniffer ~ ~ ~" }, 
      { label: t("犰狳"), cmd: "execute at {player} run summon armadillo ~ ~ ~" }, 
      { label: t("青蛙"), cmd: "execute at {player} run summon frog ~ ~ ~" }, 
      { label: t("殭屍巨人"), cmd: "execute at {player} run summon giant ~ ~ ~" }, 
    ]
  },
  {
    group: t("召喚（特殊實體）"),
    icon: ThunderboltOutlined,
    commands: [
      { label: t("閃電"), cmd: "execute at {player} run summon lightning_bolt ~ ~ ~" }, 
      { label: t("盔甲架"), cmd: "execute at {player} run summon armor_stand ~ ~ ~" }, 
      { label: t("船"), cmd: "execute at {player} run summon boat ~ ~ ~" }, 
    ]
  },
  {
    group: t("效果"),
    icon: ExperimentOutlined,
    commands: [
      { label: t("迅捷"), cmd: "effect give {player} speed {text} {text}", placeholder: [t("玩家"), t("秒數"), t("等級")] }, 
      { label: t("急迫"), cmd: "effect give {player} haste {text} {text}", placeholder: [t("玩家"), t("秒數"), t("等級")] }, 
      { label: t("力量"), cmd: "effect give {player} strength {text} {text}", placeholder: [t("玩家"), t("秒數"), t("等級")] }, 
      { label: t("再生"), cmd: "effect give {player} regeneration {text} {text}", placeholder: [t("玩家"), t("秒數"), t("等級")] }, 
      { label: t("抗性"), cmd: "effect give {player} resistance {text} {text}", placeholder: [t("玩家"), t("秒數"), t("等級")] }, 
      { label: t("水中呼吸"), cmd: "effect give {player} water_breathing {text} {text}", placeholder: [t("玩家"), t("秒數"), t("等級")] }, 
      { label: t("隱形"), cmd: "effect give {player} invisibility {text} {text}", placeholder: [t("玩家"), t("秒數"), t("等級")] }, 
      { label: t("夜視"), cmd: "effect give {player} night_vision {text} {text}", placeholder: [t("玩家"), t("秒數"), t("等級")] }, 
      { label: t("失明"), cmd: "effect give {player} slowness {text} {text}", placeholder: [t("玩家"), t("秒數"), t("等級")] }, 
      { label: t("飢餓"), cmd: "effect give {player} blindness {text} {text}", placeholder: [t("玩家"), t("秒數"), t("等級")] }, 
      { label: t("虛弱"), cmd: "effect give {player} hunger {text} {text}", placeholder: [t("玩家"), t("秒數"), t("等級")] }, 
      { label: t("中毒"), cmd: "effect give {player} weakness {text} {text}", placeholder: [t("玩家"), t("秒數"), t("等級")] }, 
      { label: t("凋零"), cmd: "effect give {player} poison {text} {text}", placeholder: [t("玩家"), t("秒數"), t("等級")] }, 
      { label: t("飄浮"), cmd: "effect give {player} levitation {text} {text}", placeholder: [t("玩家"), t("秒數"), t("等級")] }, 
      { label: t("緩降"), cmd: "effect give {player} slow_falling {text} {text}", placeholder: [t("玩家"), t("秒數"), t("等級")] }, 
      { label: t("導引神力"), cmd: "effect give {player} conduit_power {text} {text}", placeholder: [t("玩家"), t("秒數"), t("等級")] }, 
      { label: t("不祥之兆"), cmd: "effect give {player} bad_omen {text} {text}", placeholder: [t("玩家"), t("秒數"), t("等級")] }, 
    ]
  },
  {
    group: t("EssentialsX 指令（需安裝對應的 Plugin）"),
    icon: RocketOutlined,
    commands: [
      { label: t("廣播信息"), cmd: "broadcast {text}", placeholder: t("輸入廣播內容") },
      { label: t("點燃"), cmd: "burn {player}" },
      { label: t("熄滅"), cmd: "ext {player}" },
      { label: t("補充飢餓"), cmd: "feed {player}" },
      { label: t("清空物品"), cmd: "clearinventory {player}" },
      { label: t("獲取玩家座標"), cmd: "getpos {player}" },
      { label: t("允許飛行"), cmd: "fly {player}" },
      { label: t("無敵"), cmd: "god {player}" },
      // 修正：移除了 placeholder 後面多餘的引號
      { label: t("閃電劈人"), cmd: "lightning {player} {text}", placeholder: [t("玩家"), t("傷害")] },
      { label: t("發射核彈"), cmd: "nuke {player}" },
      { label: t("綽號"), cmd: "nickname {player} {text}", placeholder: [t("玩家"), t("新名稱")] },
      { label: t("移除綽號"), cmd: "nick {player} off" },
      { label: t("PM"), cmd: "msg {player} {text}", placeholder: [t("對象"), t("訊息內容")] },
      { label: t("修改指定玩家時間"), cmd: "ptime {val} {player}", options: ["day", "night", "noon", "midnight"] },
      { label: t("重置指定玩家時間"), cmd: "ptime reset {player}" },
      { label: t("個人天氣"), cmd: "pweather {val} {player}", options: ["storm", "sun", "clear"] },
      { label: t("重置個人天氣"), cmd: "pweather reset {player}" },
      // 修正：移除了 placeholder 後面多餘的引號
      { label: t("強制他人執行指令"), cmd: "sudo {player} {text}", placeholder: [t("對象"), t("指令內容")] },
      { label: t("治療"), cmd: "heal {player}" },
      // 修正：補齊了 options 的右括號 ] 
      { label: t("隱身"), cmd: "vanish {player} {val}", options: ["on", "off"] },
    ]
  }
];

// --- 核心過濾邏輯：修正後 ---
const filteredGroups = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return COMMAND_GROUPS;

  return COMMAND_GROUPS.map(group => {
    const matchedCommands = group.commands.filter(cmd => 
      cmd.label.toLowerCase().includes(query) || 
      cmd.cmd.toLowerCase().includes(query)
    );
    return { ...group, commands: matchedCommands };
  }).filter(group => group.commands.length > 0);
});

// 監聽搜索詞，實現自動展開
watch(searchQuery, (val) => {
  if (val.trim()) {
    activeKeys.value = filteredGroups.value.map(g => g.group);
  } else {
    activeKeys.value = [t("環境與時間")];
  }
});
  
// --- 邏輯函數 ---
const getParams = (cmd: string) => {
  const matches = cmd.match(/\{(player|val|text)\}/g) || [];
  return matches.map(m => m.replace(/[{}]/g, ''));
};

const getPlaceholder = (item: CommandItem, index: number) => {
  if (!item.placeholder) return t("輸入");
  if (Array.isArray(item.placeholder)) return item.placeholder[index] || t("輸入");
  return item.placeholder;
};

const getAvatar = (name: string) => `https://minotar.net/avatar/${name}/20`;

const fetchPlayers = async () => {
  const { ip, port } = props.instanceInfo?.config?.pingConfig || {};
  if (!ip) return;
  isFetchingPlayers.value = true;
  try {
    const res = await fetch(`https://api.mcstatus.io/v2/status/java/${ip}:${port || 25565}?t=${Date.now()}`);
    const data = await res.json();
    onlinePlayers.value = data.online && data.players?.list 
      ? data.players.list.map((p: any) => p.name_raw || p.name) 
      : [];
  } catch (e) { console.error(e); } finally { isFetchingPlayers.value = false; }
};

const runCommand = async (item: CommandItem) => {
  if (!isConnect.value) return message.error(t("連線尚未就緒"));
  const params = getParams(item.cmd);
  let finalCmd = item.cmd;
  for (let i = 0; i < params.length; i++) {
    const val = formState[`${item.label}_${i}`];
    if (!val && params[i] !== 'text') return message.warn(t("請完整輸入項目"));
    finalCmd = finalCmd.replace(/\{(player|val|text)\}/, val || ""); 
  }
  try {
    await sendCommand(finalCmd);
    message.success(`${t("發送成功")}: /${finalCmd}`);
  } catch (err: any) { message.error(err.message || String(err)); }
};

const openDialog = () => { open.value = true; fetchPlayers(); };
defineExpose({ openDialog });
</script>

<template>
  <a-modal
    v-model:open="open"
    :title="t('快捷指令')"
    :footer="null"
    :width="800"
    centered
    class="quick-cmd-modal"
  >
    <div v-if="COMMAND_GROUPS.length > 0" class="quick-cmd-container">
      <div class="header-toolbar">
        <span class="desc-text">{{ t("Minecraft 版本不同可能導致部分指令無法使用；玩家數據可能有 1-5 分鐘延遲，取決於 API 緩存") }}</span>
        <a-button class="refresh-btn" size="small" @click="fetchPlayers" :loading="isFetchingPlayers">
          <template #icon><ReloadOutlined /></template>
        </a-button>
      </div>
      
     <div class="search-container">
  <a-input
    v-model:value="searchQuery"
    :placeholder="t('搜索指令或關鍵字...')"
    allow-clear
    class="custom-search-input"
  >
    <template #prefix><SearchOutlined /></template>
  </a-input>
</div>
      
      <a-collapse v-model:activeKey="activeKeys" ghost expand-icon-position="right" class="custom-collapse">
        <a-collapse-panel v-for="group in filteredGroups" :key="group.group">
          <template #header>
            <div class="group-header">
              <component :is="group.icon" class="group-icon" />
              <span>{{ group.group }}</span>
              <span class="cmd-count">{{ group.commands.length }}</span>
            </div>
          </template>

          <div class="cmd-list">
            <div v-for="item in group.commands" :key="item.label" class="cmd-row">
              <div class="cmd-label-section">
                <span class="cmd-label">{{ item.label }}</span>
              </div>
              
              <div class="cmd-controls-section">
                <div class="inputs-group">
                  <template v-for="(type, index) in getParams(item.cmd)" :key="index">
                    <a-select
                      v-if="type === 'player'"
                      v-model:value="formState[`${item.label}_${index}`]"
                      :placeholder="t('玩家')"
                      size="small"
                      show-search
                      class="param-input player-select"
                    >
                      <a-select-option v-for="n in onlinePlayers" :key="n" :value="n">
                        <div class="player-option">
                          <img :src="getAvatar(n)" class="mini-avatar" />
                          <span>{{ n }}</span>
                        </div>
                      </a-select-option>
                    </a-select>

                    <a-select
                      v-else-if="type === 'val'"
                      v-model:value="formState[`${item.label}_${index}`]"
                      size="small"
                      class="param-input val-select"
                    >
                      <a-select-option v-for="opt in (item.options || [])" :key="opt" :value="opt">
                        {{ opt }}
                      </a-select-option>
                    </a-select>

                    <a-input
                      v-else
                      v-model:value="formState[`${item.label}_${index}`]"
                      :placeholder="getPlaceholder(item, index)"
                      size="small"
                      class="param-input text-input"
                    />
                  </template>
                </div>
              </div>

              <div class="cmd-action-section">
                <a-button type="primary" size="small" class="exec-btn" @click="runCommand(item)">
                  <template #icon><SendOutlined /></template>
                </a-button>
              </div>
            </div>
          </div>
        </a-collapse-panel>
      </a-collapse>
    </div>
  </a-modal>
</template>

<style scoped>
.quick-cmd-container {
  padding: 0 4px;
  max-height: 70vh;
  overflow-y: auto;
}

.header-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding: 0 12px;
}

.desc-text {
  font-size: 12px;
  opacity: 0.5;
}

.refresh-btn {
  border-radius: 6px;
  background: rgba(140, 140, 140, 0.1);
  border: none;
}

/* --- 摺疊面板樣式 (維持原樣) --- */
.custom-collapse :deep(.ant-collapse-item) {
  border-bottom: 1px solid rgba(140, 140, 140, 0.1) !important;
  margin-bottom: 4px;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 600;
  /* 恢復原始顏色引用 */
  color: var(--ant-primary-color);
}

.cmd-count {
  font-size: 11px;
  background: rgba(22, 119, 255, 0.1);
  padding: 1px 6px;
  border-radius: 10px;
  font-weight: normal;
}

/* --- 指令列表：核心雙列實現 --- */
.cmd-list {
  display: grid;
  /* 核心：雙列顯示 */
  grid-template-columns: repeat(2, 1fr); 
  gap: 6px;
  padding: 8px 0;
}

.cmd-row {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  /* 恢復原本的淡淡背景 */
  background: rgba(22, 119, 255, 0.02);
  border: 1px solid rgba(140, 140, 140, 0.08);
  border-radius: 8px;
  transition: all 0.2s;
  gap: 12px;
}

.cmd-row:hover {
  background: rgba(22, 119, 255, 0.05);
  border-color: rgba(22, 119, 255, 0.3);
}

.cmd-label-section {
  min-width: 140px;
  max-width: 140px;
}

.cmd-label {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
}

.cmd-controls-section {
  flex: 1;
  display: flex;
  justify-content: flex-start;
}

.inputs-group {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.cmd-action-section {
  display: flex;
  align-items: center;
}

/* --- 恢復原本輸入組件樣式 --- */
.param-input {
  background: rgba(140, 140, 140, 0.05) !important;
  border-radius: 4px !important;
}

.player-select { width: 110px; }
.val-select { width: 110px; }
.text-input { width: 110px; }

.exec-btn {
  border-radius: 6px;
  background: #1677ff;
  border: none;
  opacity: 0.8;
}

.exec-btn:hover {
  opacity: 1;
  transform: scale(1.05);
}

.player-option {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mini-avatar {
  width: 16px;
  height: 16px;
  border-radius: 3px;
}

/* --- 響應式：手機端自動恢復單列 --- */
@media (max-width: 800px) {
  .cmd-list {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 600px) {
  .cmd-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  .cmd-label-section {
    max-width: 100%;
  }
  .cmd-controls-section {
    width: 100%;
  }
  .inputs-group {
    width: 100%;
  }
  .param-input {
    flex: 1;
  }
  .cmd-action-section {
    width: 100%;
    justify-content: flex-end;
  }
}

/* 搜索框容器 */
.search-box {
  padding: 0 12px 16px 12px;
}

/* 適配深色模式的搜索框 */
.custom-search {
  /* 使用透明度疊加，這樣在深色背景下會變深，淺色下會變淺 */
  background: var(--ant-input-bg, rgba(140, 140, 140, 0.05)) !important;
  border-radius: 8px !important;
  border: 1px solid rgba(140, 140, 140, 0.1) !important;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.custom-search:hover, .custom-search:focus-within {
  border-color: var(--ant-primary-color) !important;
  background: var(--ant-component-background, #ffffff) !important;
  box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.1);
}

/* 針對輸入框內文字與圖標的深色模式優化 */
.custom-search :deep(.ant-input),
.custom-search :deep(.ant-input-prefix) {
  color: var(--ant-text-color) !important;
  background: transparent !important;
}

.custom-search :deep(.ant-input::placeholder) {
  color: var(--ant-text-color-placeholder);
}

/* 讓清除按鈕也適配 */
.custom-search :deep(.ant-input-clear-icon) {
  color: var(--ant-text-color-secondary);
}
</style>
