<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { t } from "@/lang/i18n";
import type { InstanceDetail } from "@/types";
import { message, Modal } from "ant-design-vue";
import { fileContent, uploadAddress } from "@/services/apis/fileManager";
import uploadService from "@/services/uploadService";
import { parseForwardAddress } from "@/tools/protocol";
import {
  SaveOutlined,
  ReloadOutlined,
  SettingOutlined,
  UndoOutlined
} from "@ant-design/icons-vue";

const props = defineProps<{
  instanceInfo?: InstanceDetail;
  instanceId?: string;
  daemonId?: string;
  useTerminalHook?: any;
}>();

const open = ref(false);
const isLoading = ref(false);
const isSaving = ref(false);
const activeTab = ref("server");

const CONFIG_DIR = "LazyCloudGameServer/Pal/Saved/Config/LinuxServer/";
const CONFIG_FILE_PATH = `${CONFIG_DIR}PalWorldSettings.ini`;
const SH_FILE_PATH = "settings.sh";
const SH_UPLOAD_DIR = "/";

const formData = ref<Record<string, any>>({});
const rawSettings = ref<Record<string, string>>({});

const settingsShContent = ref<string>("");
const publicLobbyEnabled = ref<boolean>(false);

const { execute: fetchFileContent } = fileContent();
const { execute: getUploadMissionCfg } = uploadAddress();

// 冷卻工具函數
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ---------- 配置 Schema 定義 ----------
interface ConfigField {
  name: string;
  display: string;
  type: "string" | "number" | "boolean" | "select" | "tuple";
  options?: { value: string; label: string }[];
  description?: string;
  span?: number; 
  disabled?: boolean;
}

interface ConfigTab {
  key: string;
  tab: string;
  fields: ConfigField[];
}

const configTabs = ref<ConfigTab[]>([
  {
    key: "server",
    tab: "伺服器基礎",
    fields: [
      { name: "ServerName", display: "伺服器名稱", type: "string", description: "伺服器顯示名稱", span: 12 },
      { name: "ServerDescription", display: "伺服器描述", type: "string", description: "伺服器描述信息", span: 12 },
      { name: "ServerPassword", display: "伺服器密碼", type: "string", description: "進入伺服器所需的密碼", span: 12 },
      { name: "AdminPassword", display: "管理員密碼", type: "string", description: "伺服器管理員密碼", span: 12 },
      { name: "ServerPlayerMaxNum", display: "最大玩家數量", type: "number", description: "伺服器可容納的最大玩家數量 (1-32)", span: 12 },
      { name: "PublicPort", display: "公共端口", type: "number", description: "伺服器對外開放的端口號 (1024-65535)", span: 12, disabled: true },
      { name: "PublicIP", display: "公共IP地址", type: "string", description: "伺服器的公共IP地址", span: 12, disabled: true },
      { name: "Region", display: "伺服器區域", type: "string", description: "伺服器所在區域", span: 12 },
      { name: "bShowPlayerList", display: "顯示玩家列表", type: "boolean", description: "是否允許玩家查看在線列表", span: 12 },
      { name: "bIsShowJoinLeftMessage", display: "加入/離開訊息", type: "boolean", description: "是否顯示玩家加入或離開的訊息", span: 12 },
      { name: "ChatPostLimitPerMinute", display: "聊天頻率限制", type: "number", description: "每分鐘允許發送的聊天訊息數量", span: 12 },
      { name: "bAllowClientMod", display: "允許客戶端Mod", type: "boolean", description: "是否允許玩家使用客戶端 Mod", span: 12 },
      { name: "AutoSaveSpan", display: "自動存檔頻率", type: "number", description: "伺服器自動存檔的間隔時間 (分鐘)", span: 12 },
      { name: "bIsUseBackupSaveData", display: "使用備份存檔", type: "boolean", description: "當存檔損壞時是否自動使用備份存檔", span: 12 },
      { name: "LogFormatType", display: "日誌格式", type: "string", description: "伺服器日誌輸出的格式 (例如: Text)", span: 12 },
    ]
  },
  {
    key: "world",
    tab: "世界與難度",
    fields: [
      { name: "Difficulty", display: "遊戲難度", type: "select", description: "遊戲整體難度設置", options: [
        { value: "None", label: "預設" }, { value: "Easy", label: "簡單" }, { value: "Normal", label: "普通" }, { value: "Hard", label: "困難" }
      ], span: 12},
      { name: "DayTimeSpeedRate", display: "白天時間加速率", type: "number", description: "控制遊戲中日夜循環的速度 (0.1-5)", span: 12 },
      { name: "NightTimeSpeedRate", display: "夜晚時間加速率", type: "number", description: "控制夜晚時間流逝速度 (0.1-5)", span: 12 },
      { name: "RandomizerType", display: "隨機化類型", type: "string", description: "帕魯隨機化生成的類型 (None 或其他)", span: 12 },
      { name: "RandomizerSeed", display: "隨機化種子", type: "string", description: "隨機化生成所使用的種子碼", span: 12 },
      { name: "bIsRandomizerPalLevelRandom", display: "隨機帕魯等級", type: "boolean", description: "隨機化模式下帕魯等級是否隨機", span: 12 },
      { name: "bHardcore", display: "硬核模式", type: "boolean", description: "啟用後玩家死亡將永久刪除角色", span: 12 },
      { name: "bPalLost", display: "帕魯丟失", type: "boolean", description: "硬核模式下帕魯是否會丟失", span: 12 },
      { name: "bCharacterRecreateInHardcore", display: "硬核重生限制", type: "boolean", description: "硬核模式下是否限制角色重建", span: 12 },
      { name: "EnablePredatorBossPal", display: "啟用掠食者頭目", type: "boolean", description: "是否啟用掠食者帕魯的生成", span: 12 },
      { name: "bIsMultiplay", display: "多人遊戲模式", type: "boolean", description: "是否啟用多人遊戲模式", span: 12 },
      { name: "bIsPvP", display: "PVP模式", type: "boolean", description: "是否啟用PVP模式", span: 12 },
      { name: "bEnablePlayerToPlayerDamage", display: "啟用玩家PVP傷害", type: "boolean", description: "是否允許玩家之間造成傷害", span: 12 },
      { name: "bEnableFriendlyFire", display: "啟用友軍傷害", type: "boolean", description: "是否允許對隊友造成傷害", span: 12 },
      { name: "DeathPenalty", display: "死亡懲罰", type: "select", description: "玩家死亡時的懲罰類型", options: [
        { value: "None", label: "無懲罰" }, { value: "Item", label: "掉落物品" }, { value: "ItemAndEquipment", label: "掉落物品和裝備" }, { value: "All", label: "掉落所有物品" }
      ], span: 12},
      { name: "SupplyDropSpan", display: "空投間隔", type: "number", description: "空投物資的生成間隔時間 (分鐘)", span: 12 },
      { name: "bInvisibleOtherGuildBaseCampAreaFX", display: "隱藏他公會據點特效", type: "boolean", description: "是否隱藏其他公會據點的範圍特效", span: 12 },
      { name: "bBuildAreaLimit", display: "建造區域限制", type: "boolean", description: "是否限制建造區域", span: 12 },
    ]
  },
  {
    key: "exp",
    tab: "經驗與捕獲",
    fields: [
      { name: "ExpRate", display: "經驗倍率", type: "number", description: "玩家和帕魯獲得經驗的倍率 (0.1-20)", span: 12 },
      { name: "PalCaptureRate", display: "帕魯捕獲倍率", type: "number", description: "影響捕獲帕魯的成功率 (0.5-2)", span: 12 },
      { name: "PalSpawnNumRate", display: "帕魯出現數量倍率", type: "number", description: "野生帕魯的刷新數量倍率 (0.5-3)", span: 12 },
      { name: "PalEggDefaultHatchingTime", display: "帕魯蛋孵化時間", type: "number", description: "帕魯蛋孵化所需的預設時間(小時) (0-9999)", span: 12 },
      { name: "WorkSpeedRate", display: "工作速度倍率", type: "number", description: "帕魯工作效率的倍率 (0.1-5)", span: 12 },
      { name: "MonsterFarmActionSpeedRate", display: "農場工作速度", type: "number", description: "帕魯在農場的工作速度倍率", span: 12 },
      { name: "bAllowGlobalPalboxExport", display: "允許匯出帕魯", type: "boolean", description: "是否允許將帕魯匯出至全域盒子", span: 12 },
      { name: "bAllowGlobalPalboxImport", display: "允許匯入帕魯", type: "boolean", description: "是否允許從全域盒子匯入帕魯", span: 12 },
    ]
  },
  {
    key: "damage",
    tab: "戰鬥與生存",
    fields: [
      { name: "PalDamageRateAttack", display: "帕魯攻擊傷害倍率", type: "number", description: "帕魯造成傷害的倍率 (0.1-5)", span: 12 },
      { name: "PalDamageRateDefense", display: "帕魯防禦倍率", type: "number", description: "帕魯受到傷害的倍率 (0.1-5)", span: 12 },
      { name: "PlayerDamageRateAttack", display: "玩家攻擊傷害倍率", type: "number", description: "玩家造成傷害的倍率 (0.1-5)", span: 12 },
      { name: "PlayerDamageRateDefense", display: "玩家防禦倍率", type: "number", description: "玩家受到傷害的倍率 (0.1-5)", span: 12 },
      { name: "PlayerStomachDecreaceRate", display: "玩家飢餓度消耗倍率", type: "number", description: "玩家飢餓度下降速度 (0.1-5)", span: 12 },
      { name: "PlayerStaminaDecreaceRate", display: "玩家體力消耗倍率", type: "number", description: "玩家體力消耗速度 (0.1-5)", span: 12 },
      { name: "PlayerAutoHPRegeneRate", display: "玩家生命自動恢復倍率", type: "number", description: "玩家生命值自動恢復速度 (0.1-5)", span: 12 },
      { name: "PlayerAutoHpRegeneRateInSleep", display: "玩家睡眠時生命恢復倍率", type: "number", description: "玩家睡覺時生命值恢復速度 (0.1-5)", span: 12 },
      { name: "PalStomachDecreaceRate", display: "帕魯飢餓度消耗倍率", type: "number", description: "帕魯飢餓度下降速度 (0.1-5)", span: 12 },
      { name: "PalStaminaDecreaceRate", display: "帕魯體力消耗倍率", type: "number", description: "帕魯體力消耗速度 (0.1-5)", span: 12 },
      { name: "PalAutoHPRegeneRate", display: "帕魯生命自動恢復倍率", type: "number", description: "帕魯生命值自動恢復速度 (0.1-5)", span: 12 },
      { name: "PalAutoHpRegeneRateInSleep", display: "帕魯睡眠時生命恢復倍率", type: "number", description: "帕魯睡覺時生命值恢復速度 (0.1-5)", span: 12 },
      { name: "ItemWeightRate", display: "物品重量倍率", type: "number", description: "玩家可攜帶物品的重量倍率", span: 12 },
      { name: "EquipmentDurabilityDamageRate", display: "裝備耐久損壞率", type: "number", description: "裝備耐久度消耗的倍率", span: 12 },
      { name: "ItemCorruptionMultiplier", display: "物品腐敗倍率", type: "number", description: "物品腐敗速度的倍率", span: 12 },
      { name: "bAllowEnhanceStat_Health", display: "允許強化生命", type: "boolean", description: "是否允許強化帕魯的生命屬性", span: 12 },
      { name: "bAllowEnhanceStat_Attack", display: "允許強化攻擊", type: "boolean", description: "是否允許強化帕魯的攻擊屬性", span: 12 },
      { name: "bAllowEnhanceStat_Stamina", display: "允許強化體力", type: "boolean", description: "是否允許強化帕魯的體力屬性", span: 12 },
      { name: "bAllowEnhanceStat_Weight", display: "允許強化重量", type: "boolean", description: "是否允許強化帕魯的重量屬性", span: 12 },
      { name: "bAllowEnhanceStat_WorkSpeed", display: "允許強化工作速度", type: "boolean", description: "是否允許強化帕魯的工作速度屬性", span: 12 },
      { name: "BlockRespawnTime", display: "禁止重生時間", type: "number", description: "玩家死亡後禁止重生的時間 (秒)", span: 12 },
      { name: "RespawnPenaltyDurationThreshold", display: "重生懲罰閾值", type: "number", description: "觸發重生懲罰的時間閾值", span: 12 },
      { name: "RespawnPenaltyTimeScale", display: "重生懲罰時間倍率", type: "number", description: "重生懲罰的時間倍率", span: 12 },
    ]
  },
  {
    key: "resource",
    tab: "採集與建築",
    fields: [
      { name: "CollectionDropRate", display: "採集物品掉落倍率", type: "number", description: "採集資源時的掉落數量倍率 (0.5-3)", span: 12 },
      { name: "CollectionObjectHpRate", display: "採集物耐久倍率", type: "number", description: "可採集物品的耐久度倍率 (0.5-3)", span: 12 },
      { name: "CollectionObjectRespawnSpeedRate", display: "採集物重生速度倍率", type: "number", description: "採集物品重新刷新的速度 (0.5-3)", span: 12 },
      { name: "EnemyDropItemRate", display: "敵人掉落物品倍率", type: "number", description: "擊敗敵人時掉落物品的數量倍率 (0.5-3)", span: 12 },
      { name: "DropItemMaxNum", display: "掉落物品最大數量", type: "number", description: "地面上掉落物品的最大數量 (0-9999)", span: 12 },
      { name: "DropItemAliveMaxHours", display: "掉落物品存在時間", type: "number", description: "掉落物品在地面上存在的最大小時數 (0.5-240)", span: 12 },
      { name: "BuildObjectHpRate", display: "建築物生命值倍率", type: "number", description: "建築物生命值倍率", span: 12 },
      { name: "BuildObjectDamageRate", display: "建築物受損倍率", type: "number", description: "建築物受到傷害的倍率 (0.5-3)", span: 12 },
      { name: "BuildObjectDeteriorationDamageRate", display: "建築物老化損壞倍率", type: "number", description: "建築物隨時間老化的損壞速度 (0-10)", span: 12 },
      { name: "MaxBuildingLimitNum", display: "建築數量上限", type: "number", description: "伺服器允許的建築總數量上限 (0為不限制)", span: 12 },
      { name: "bEnableBuildingPlayerUIdDisplay", display: "顯示建築建造者", type: "boolean", description: "是否在建築物上顯示建造者的名稱", span: 12 },
      { name: "BuildingNameDisplayCacheTTLSeconds", display: "建築名稱快取時間", type: "number", description: "建築物名稱顯示的快取時間 (秒)", span: 12 },
      { name: "PhysicsActiveDropItemMaxNum", display: "物理掉落物上限", type: "number", description: "具有物理碰撞的掉落物品最大數量 (-1為不限制)", span: 12 },
    ]
  },
  {
    key: "guild",
    tab: "據點與公會",
    fields: [
      { name: "BaseCampMaxNum", display: "據點最大數量", type: "number", description: "每個公會可建造的據點最大數量 (0-9999)", span: 12 },
      { name: "BaseCampWorkerMaxNum", display: "據點工作帕魯最大數量", type: "number", description: "每個據點可分配的工作帕魯最大數量 (0-20)", span: 12 },
      { name: "GuildPlayerMaxNum", display: "公會最大玩家數量", type: "number", description: "每個公會可容納的最大玩家數量 (1-100)", span: 12 },
      { name: "bAutoResetGuildNoOnlinePlayers", display: "自動重置無在線玩家的公會", type: "boolean", description: "是否自動重置沒有在線玩家的公會", span: 12 },
      { name: "AutoResetGuildTimeNoOnlinePlayers", display: "無在線玩家公會重置時間", type: "number", description: "公會無在線玩家多少小時後自動重置 (1-9999)", span: 12 },
      { name: "BaseCampMaxNumInGuild", display: "單公會據點上限", type: "number", description: "單個公會可以擁有的據點最大數量", span: 12 },
      { name: "MaxGuildsPerFrame", display: "每幀公會處理數", type: "number", description: "伺服器每幀處理的公會數量上限", span: 12 },
      { name: "GuildRejoinCooldownMinutes", display: "公會重入冷卻", type: "number", description: "退出公會後再次加入的冷卻時間 (分鐘)", span: 12 },
      { name: "AutoTransferMasterCheckIntervalSeconds", display: "會長轉移檢查間隔", type: "number", description: "自動轉移會長的檢查間隔 (秒)", span: 12 },
      { name: "AutoTransferMasterThresholdDays", display: "會長轉移離線閾值", type: "number", description: "會長離線多少天後自動轉移會長", span: 12 },
      { name: "DenyTechnologyList", display: "禁用科技列表", type: "tuple", description: "禁用的科技列表，以逗號分隔 (例如: Tech1,Tech2)", span: 24 },
    ]
  },
  {
    key: "advanced",
    tab: "高級與效能",
    fields: [
      { name: "RCONEnabled", display: "啟用RCON", type: "boolean", description: "是否啟用RCON遠端控制", span: 12 },
      { name: "RCONPort", display: "RCON端口", type: "number", description: "RCON服務的端口號 (1024-65535)", span: 12 },
      { name: "RESTAPIEnabled", display: "啟用REST API", type: "boolean", description: "是否啟用REST API", span: 12 },
      { name: "RESTAPIPort", display: "REST API端口", type: "number", description: "REST API服務的端口號", span: 12 },
      { name: "bUseAuth", display: "使用身分驗證", type: "boolean", description: "是否啟用玩家身分驗證", span: 12 },
      { name: "BanListURL", display: "封禁列表URL", type: "string", description: "獲取封禁列表的URL地址", span: 24 },
      { name: "bEnableFastTravel", display: "啟用快速旅行", type: "boolean", description: "是否允許快速旅行功能", span: 12 },
      { name: "bIsStartLocationSelectByMap", display: "地圖選擇出生點", type: "boolean", description: "是否允許在地圖上選擇出生點", span: 12 },
      { name: "bEnableFastTravelOnlyBaseCamp", display: "僅據點快速旅行", type: "boolean", description: "是否僅允許在據點之間進行快速旅行", span: 12 },
      { name: "CrossplayPlatforms", display: "跨平台支援", type: "tuple", description: "允許跨平台連線的列表，以逗號分隔 (例如: Steam,Xbox,PS5,Mac)", span: 24 },
      { name: "ServerReplicatePawnCullDistance", display: "伺服器渲染距離", type: "number", description: "伺服器同步角色物件的距離 (UE單位)", span: 12 },
      { name: "ItemContainerForceMarkDirtyInterval", display: "容器更新間隔", type: "number", description: "物品容器強制標記為髒的更新間隔 (秒)", span: 12 },
      { name: "PlayerDataPalStorageUpdateCheckTickInterval", display: "帕魯盒更新頻率", type: "number", description: "玩家帕魯盒數據更新的檢查間隔 (秒)", span: 12 },
    ]
  },
  {
    key: "pvp_voice",
    tab: "PVP與語音系統",
    fields: [
      { name: "bEnableVoiceChat", display: "啟用語音聊天", type: "boolean", description: "是否啟用遊戲內語音聊天功能", span: 12 },
      { name: "VoiceChatMaxVolumeDistance", display: "語音最大音量距離", type: "number", description: "語音可被聽到的最大距離", span: 12 },
      { name: "VoiceChatZeroVolumeDistance", display: "語音無音量距離", type: "number", description: "語音衰減至無聲的距離", span: 12 },
      { name: "bDisplayPvPItemNumOnWorldMap_BaseCamp", display: "地圖顯示據點PVP物品數", type: "boolean", description: "是否在世界地圖上顯示據點的 PVP 物品數量", span: 12 },
      { name: "bDisplayPvPItemNumOnWorldMap_Player", display: "地圖顯示玩家PVP物品數", type: "boolean", description: "是否在世界地圖上顯示玩家的 PVP 物品數量", span: 12 },
      { name: "AdditionalDropItemWhenPlayerKillingInPvPMode", display: "PVP擊殺掉落物品", type: "string", description: "在 PVP 模式下擊殺玩家時的額外掉落物品代碼", span: 12 },
      { name: "AdditionalDropItemNumWhenPlayerKillingInPvPMode", display: "PVP擊殺掉落數量", type: "number", description: "PVP 模式下擊殺玩家時額外掉落的物品數量", span: 12 },
      { name: "bAdditionalDropItemWhenPlayerKillingInPvPMode", display: "啟用PVP擊殺掉落", type: "boolean", description: "是否啟用 PVP 擊殺時的額外物品掉落", span: 12 },
    ]
  }
]);

const allFields = computed(() => {
  const fields: ConfigField[] = [];
  configTabs.value.forEach(tab => {
    fields.push(...tab.fields);
  });
  return fields;
});

// ---------- 解析與序列化邏輯 ----------
const parseOptionSettings = (content: string): Record<string, string> => {
  const result: Record<string, string> = {};
  let i = 0;
  while (i < content.length) {
    let keyEnd = content.indexOf('=', i);
    if (keyEnd === -1) break;
    const key = content.substring(i, keyEnd).trim();
    i = keyEnd + 1;
    
    let value = '';
    if (content[i] === '"') {
      let j = i + 1;
      while (j < content.length) {
        if (content[j] === '\\') { j += 2; } 
        else if (content[j] === '"') {
          value = content.substring(i, j + 1);
          i = j + 1;
          break;
        } else { j++; }
      }
    } else if (content[i] === '(') {
      let depth = 1;
      let j = i + 1;
      while (j < content.length && depth > 0) {
        if (content[j] === '(') depth++;
        if (content[j] === ')') depth--;
        j++;
      }
      value = content.substring(i, j);
      i = j;
    } else {
      let j = i;
      while (j < content.length && content[j] !== ',') { j++; }
      value = content.substring(i, j).trim();
      i = j;
    }
    
    if (key) result[key] = value;
    while (i < content.length && (content[i] === ',' || content[i] === ' ')) { i++; }
  }
  return result;
};

const convertValue = (field: ConfigField, rawValue: string) => {
  if (field.type === 'boolean') return rawValue === 'True';
  if (field.type === 'number') {
    const num = Number(rawValue);
    return isNaN(num) ? null : num;
  }
  if (field.type === 'string') {
    if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
      return rawValue.slice(1, -1).replace(/\\"/g, '"');
    }
    return rawValue;
  }
  if (field.type === 'tuple') {
    if (rawValue.startsWith('(') && rawValue.endsWith(')')) {
      return rawValue.slice(1, -1);
    }
    return rawValue;
  }
  return rawValue;
};

const formatValue = (field: ConfigField, value: any) => {
  if (field.type === 'boolean') return value ? 'True' : 'False';
  if (field.type === 'string') return `"${String(value).replace(/"/g, '\\"')}"`;
  if (field.type === 'tuple') return `(${value})`;
  return String(value);
};

// ---------- 檔案讀取 ----------
const loadConfig = async () => {
  isLoading.value = true;
  try {
    const res: any = await fetchFileContent({
      params: { daemonId: props.daemonId ?? "", uuid: props.instanceId ?? "" },
      data: { target: CONFIG_FILE_PATH }
    });
    
    let rawText = "";
    if (typeof res === "string") rawText = res;
    else if (res && typeof res === "object") rawText = res._value || res.value || res.data || res.content || "";

    if (!rawText) {
      message.warning(t("未找到配置檔案，將載入預設範本"));
      rawText = `[/Script/Pal.PalGameWorldSettings]\nOptionSettings=()\n`;
    }

    const match = rawText.match(/OptionSettings=\((.*)\)/s);
    if (match && match[1] !== null) {
      rawSettings.value = parseOptionSettings(match[1]);
      const uiData: Record<string, any> = {};
      allFields.value.forEach(field => {
        if (rawSettings.value[field.name] !== undefined) {
          uiData[field.name] = convertValue(field, rawSettings.value[field.name]);
        }
      });
      formData.value = uiData;
    } else {
      message.error(t("無法解析 PalWorldSettings.ini 格式"));
    }

    // 讀取 settings.sh 前冷卻 1 秒
    await sleep(1000);
    try {
      const resSh: any = await fetchFileContent({
        params: { daemonId: props.daemonId ?? "", uuid: props.instanceId ?? "" },
        data: { target: SH_FILE_PATH }
      });
      let shRawText = "";
      if (typeof resSh === "string") shRawText = resSh;
      else if (resSh && typeof resSh === "object") shRawText = resSh._value || resSh.value || resSh.data || resSh.content || "";
      settingsShContent.value = shRawText;
      publicLobbyEnabled.value = shRawText.includes("-publiclobby");
    } catch (err) {
      console.error("Read settings.sh error:", err);
      settingsShContent.value = "";
      publicLobbyEnabled.value = false;
    }

    message.success(t("配置檔案讀取成功"));
  } catch (err) {
    console.error("Load config error:", err);
    message.error(t("讀取配置檔案失敗"));
  } finally {
    isLoading.value = false;
  }
};

// 通用上傳函數
const uploadFileContent = async (dir: string, fileName: string, content: string) => {
  const blob = new Blob([content], { type: "text/plain" });
  const file = new File([blob], fileName);

  const mission = await getUploadMissionCfg({
    params: { upload_dir: dir, daemonId: props.daemonId!, uuid: props.instanceId!, file_name: fileName }
  });
  const config = mission.value;
  if (!config?.addr) throw new Error("獲取上傳憑證失敗");

  await new Promise<void>((resolve, reject) => {
    uploadService.append(file, parseForwardAddress(config.addr, "http"), config.password, { overwrite: true }, (task) => {
      task.instanceInfo = { instanceId: props.instanceId!, daemonId: props.daemonId! };
    });
    const unwatch = watch(() => uploadService.uiData.value.current, (curr) => {
      if (!curr) { unwatch(); resolve(); }
    });
  });
};

// ---------- 檔案保存 ----------
const saveConfig = async () => {
  isSaving.value = true;
  try {
    allFields.value.forEach(field => {
      const val = formData.value[field.name];
      
      // 如果介面上沒有這個值，不處理
      if (val === undefined) return;
      
      // 判斷是否為空值 (字串空、元組空、數字 null 或 空字串)
      const isEmpty = (field.type === 'string' && val === '') || 
                      (field.type === 'tuple' && val === '') || 
                      (field.type === 'number' && (val === null || val === ''));
                      
      if (isEmpty) {
        // 如果是空值，從 rawSettings 刪除該鍵，避免產生空值參數
        delete rawSettings.value[field.name];
      } else {
        // 防呆：如果是數字且值為 0，中斷保存並報錯
        if (field.type === 'number' && Number(val) === 0) {
          throw new Error(t("參數「") + field.display + t("」不能為 0，請填入大於 0 的數值（如 0.0001），或留空使用預設值"));
        }
        // 如果有值，格式化並更新
        rawSettings.value[field.name] = formatValue(field, val);
      }
    });

    // 重新組裝字串
    const fieldsStr = Object.keys(rawSettings.value).map(key => {
      return `${key}=${rawSettings.value[key]}`;
    }).join(',');

    const newContent = `[/Script/Pal.PalGameWorldSettings]\nOptionSettings=(${fieldsStr})\n`;

    await uploadFileContent(CONFIG_DIR, "PalWorldSettings.ini", newContent);

    // 處理 settings.sh
    let newShContent = settingsShContent.value;
    const hasFlag = newShContent.includes("-publiclobby");
    if (publicLobbyEnabled.value && !hasFlag) {
      newShContent = newShContent.replace(/\s*$/, "") + " -publiclobby";
    } else if (!publicLobbyEnabled.value && hasFlag) {
      newShContent = newShContent.replace(/\s*-publiclobby/g, "");
    }

    if (newShContent !== settingsShContent.value) {
      // 寫入 settings.sh 前冷卻 1 秒
      await sleep(1000);
      await uploadFileContent(SH_UPLOAD_DIR, "settings.sh", newShContent);
      settingsShContent.value = newShContent;
    }

    message.success(t("配置已成功儲存！"));
  } catch (err: any) {
    console.error("Save config error:", err);
    message.error(t("保存失敗: ") + err.message);
  } finally {
    isSaving.value = false;
  }
};

// ---------- 恢復預設值 ----------
const resetConfig = async () => {
  isSaving.value = true;
  try {
    const resetContent = `[/Script/Pal.PalGameWorldSettings]\nOptionSettings=()\n`;
    
    Modal.confirm({
      title: t("確認恢復預設值？"),
      content: t("這將刪除 PalWorldSettings.ini 中的所有參數。伺服器下次啟動時將自動重新生成預設配置。"),
      okText: t("確定恢復"),
      okType: "danger",
      cancelText: t("取消"),
      async onOk() {
        try {
          await uploadFileContent(CONFIG_DIR, "PalWorldSettings.ini", resetContent);
          message.success(t("已恢復預設值！"));
          await loadConfig();
        } catch (err: any) {
          message.error(t("恢復預設失敗: ") + err.message);
        } finally {
          isSaving.value = false;
        }
      },
      onCancel() {
        isSaving.value = false;
      }
    });
  } catch (err: any) {
    isSaving.value = false;
    message.error(t("發生錯誤: ") + err.message);
  }
};

const openDialog = () => {
  const status = props.instanceInfo?.status ?? 0;
  if (status > 0) {
    return message.error(t("伺服器正在運行中，請先完全關閉伺服器後再打開配置檔案進行修改！"));
  }
  
  open.value = true;
  activeTab.value = "server";
  loadConfig();
};

defineExpose({ openDialog });
</script>

<template>
  <a-modal
    v-model:open="open"
    :title="t('Palworld 配置管理')"
    :footer="null"
    :width="850"
    centered
    destroy-on-close
  >
    <div class="header-actions">
      <a-typography-text type="secondary">
        <SettingOutlined /> {{ t("配置檔案") }}: PalWorldSettings.ini
      </a-typography-text>
      <div class="header-right-controls">
        <a-button type="link" size="small" :loading="isLoading" @click="loadConfig">
          <template #icon><ReloadOutlined /></template> {{ t("重新讀取") }}
        </a-button>
        <a-button danger type="link" size="small" :loading="isSaving" @click="resetConfig">
          <template #icon><UndoOutlined /></template> {{ t("重置為預設值") }}
        </a-button>
        <a-button type="primary" size="small" :loading="isSaving" @click="saveConfig">
          <template #icon><SaveOutlined /></template> {{ t("儲存配置") }}
        </a-button>
      </div>
    </div>
    
    <a-divider style="margin: 12px 0 16px 0" />
    
    <div class="scroll-container">
      <a-spin :spinning="isLoading">
        <a-tabs v-model:activeKey="activeTab" type="card">
          <a-tab-pane v-for="tab in configTabs" :key="tab.key" :tab="t(tab.tab)">
            <a-form layout="vertical" class="config-form">
              <a-row :gutter="16">
                <a-col 
                  v-for="field in tab.fields" 
                  :key="field.name" 
                  :span="field.span || 12"
                >
                  <a-form-item 
                    :label="field.display" 
                    :name="field.name"
                    :extra="field.description"
                  >
                    <a-input-number 
                      v-if="field.type === 'number'" 
                      v-model:value="formData[field.name]" 
                      style="width: 100%"
                      :disabled="field.disabled" 
                    />
                    <a-switch 
                      v-else-if="field.type === 'boolean'" 
                      v-model:checked="formData[field.name]" 
                      :checked-children="'True'" 
                      :un-checked-children="'False'" 
                    />
                    <a-select 
                      v-else-if="field.type === 'select'" 
                      v-model:value="formData[field.name]"
                      style="width: 100%"
                    >
                      <a-select-option 
                        v-for="opt in field.options" 
                        :key="opt.value" 
                        :value="opt.value"
                      >
                        {{ opt.label }}
                      </a-select-option>
                    </a-select>
                    <a-textarea 
                      v-else-if="field.type === 'string' && field.span === 24" 
                      v-model:value="formData[field.name]" 
                      :rows="2" 
                      style="width: 100%"
                      :disabled="field.disabled"
                    />
                    <a-input 
                      v-else-if="field.type === 'tuple'" 
                      v-model:value="formData[field.name]" 
                      style="width: 100%" 
                      allow-clear
                      :disabled="field.disabled" 
                    />
                    <a-input 
                      v-else 
                      v-model:value="formData[field.name]" 
                      style="width: 100%" 
                      allow-clear
                      :disabled="field.disabled" 
                    />
                  </a-form-item>
                </a-col>
              </a-row>
              
              <a-row :gutter="16" v-if="tab.key === 'server'">
                <a-col :span="12">
                  <a-form-item 
                    label="公開伺服器" 
                    :extra="t('此為非 PC 玩家進入伺服器的唯一方式。開啟後可以在大廳搜索到您的伺服器，請務必填寫伺服器名稱')"
                  >
                    <a-switch 
                      v-model:checked="publicLobbyEnabled" 
                      :checked-children="'開啟'" 
                      :un-checked-children="'關閉'" 
                    />
                  </a-form-item>
                </a-col>
              </a-row>

            </a-form>
          </a-tab-pane>
        </a-tabs>
      </a-spin>
    </div>
  </a-modal>
</template>

<style lang="scss" scoped>
.header-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 4px;
  min-height: 24px;
}
.header-right-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}
.scroll-container {
  max-height: 65vh;
  overflow-y: auto;
  padding-right: 8px;
  &::-webkit-scrollbar { width: 6px; }
  &::-webkit-scrollbar-thumb { background-color: rgba(128, 128, 128, 0.25); border-radius: 3px; }
  &::-webkit-scrollbar-track { background-color: transparent; }
}
.config-form {
  padding: 8px 4px;
  
  :deep(.ant-form-item) {
    margin-bottom: 16px;
  }
  
  :deep(.ant-form-item-control-input) {
    min-height: 38px;
  }
  
  :deep(.ant-input:not(textarea)),
  :deep(.ant-input-affix-wrapper) {
    height: 38px !important;
    border-radius: 6px !important;
    padding-top: 0 !important;
    padding-bottom: 0 !important;
    display: flex;
    align-items: center;
  }

  :deep(textarea.ant-input) {
    border-radius: 6px !important;
    padding: 8px 11px !important;
    min-height: 38px !important;
    align-items: flex-start;
  }
  
  :deep(.ant-input-affix-wrapper > input.ant-input) {
    height: auto !important;
    padding: 0 !important;
  }

  :deep(.ant-input-number) {
    height: 38px !important;
    border-radius: 6px !important;
    line-height: 38px !important;
  }

  :deep(.ant-input-number-input) {
    height: 38px !important;
    line-height: 38px !important;
  }

  :deep(.ant-select .ant-select-selector) {
    height: 38px !important;
    border-radius: 6px !important;
    align-items: center;
  }

  :deep(.ant-select-single .ant-select-selector .ant-select-selection-item),
  :deep(.ant-select-single .ant-select-selector .ant-select-selection-placeholder) {
    line-height: 36px !important;
  }
  
  :deep(.ant-form-item-extra) {
    margin-top: 2px;
    color: rgba(128, 128, 128, 0.7);
    font-size: 12px;
    min-height: auto;
  }
}
@media (max-width: 768px) {
  .scroll-container {
    max-height: 50vh;
  }
  :deep(.ant-col) {
    flex: 0 0 100% !important;
    max-width: 100% !important;
  }
}
</style>
