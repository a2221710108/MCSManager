<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { t } from "@/lang/i18n";
import type { InstanceDetail } from "@/types";
import { message } from "ant-design-vue";
import { fileContent, uploadAddress } from "@/services/apis/fileManager";
import uploadService from "@/services/uploadService";
import { parseForwardAddress } from "@/tools/protocol";
import {
  SaveOutlined,
  ReloadOutlined,
  SettingOutlined
} from "@ant-design/icons-vue";

const props = defineProps<{
  instanceInfo?: InstanceDetail;
  instanceId?: string;
  daemonId?: string;
}>();

const open = ref(false);
const isLoading = ref(false);
const isSaving = ref(false);
const activeTab = ref("server");

const CONFIG_DIR = "LazyCloudGameServer/Pal/Saved/Config/LinuxServer/";
const CONFIG_FILE_PATH = `${CONFIG_DIR}PalWorldSettings.ini`;

const formData = ref<Record<string, any>>({});
const rawSettings = ref<Record<string, string>>({});

const { execute: fetchFileContent } = fileContent();
const { execute: getUploadMissionCfg } = uploadAddress();

// ---------- 配置 Schema 定義 ----------
interface ConfigField {
  name: string;
  display: string;
  type: "string" | "number" | "boolean" | "select";
  options?: { value: string; label: string }[];
  description?: string;
  span?: number; 
  disabled?: boolean; // 新增：是否禁用
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
      // 修正 1: 加入 disabled: true
      { name: "PublicPort", display: "公共端口", type: "number", description: "伺服器對外開放的端口號 (1024-65535)", span: 12, disabled: true },
      // 修正 1: 加入 disabled: true
      { name: "PublicIP", display: "公共IP地址", type: "string", description: "伺服器的公共IP地址", span: 12, disabled: true },
      { name: "Region", display: "伺服器區域", type: "string", description: "伺服器所在區域", span: 12 },
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
      { name: "bIsMultiplay", display: "多人遊戲模式", type: "boolean", description: "是否啟用多人遊戲模式", span: 12 },
      { name: "bIsPvP", display: "PVP模式", type: "boolean", description: "是否啟用PVP模式", span: 12 },
      { name: "bEnablePlayerToPlayerDamage", display: "啟用玩家PVP傷害", type: "boolean", description: "是否允許玩家之間造成傷害", span: 12 },
      { name: "bEnableFriendlyFire", display: "啟用友軍傷害", type: "boolean", description: "是否允許對隊友造成傷害", span: 12 },
      { name: "DeathPenalty", display: "死亡懲罰", type: "select", description: "玩家死亡時的懲罰類型", options: [
        { value: "None", label: "無懲罰" }, { value: "Item", label: "掉落物品" }, { value: "ItemAndEquipment", label: "掉落物品和裝備" }, { value: "All", label: "掉落所有物品" }
      ], span: 12},
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
    ]
  },
  {
    key: "advanced",
    tab: "高級與RCON",
    fields: [
      { name: "RCONEnabled", display: "啟用RCON", type: "boolean", description: "是否啟用RCON遠端控制", span: 12 },
      { name: "RCONPort", display: "RCON端口", type: "number", description: "RCON服務的端口號 (1024-65535)", span: 12 },
      { name: "RESTAPIEnabled", display: "啟用REST API", type: "boolean", description: "是否啟用REST API", span: 12 },
      { name: "RESTAPIPort", display: "REST API端口", type: "number", description: "REST API服務的端口號", span: 12 },
      { name: "bUseAuth", display: "使用身分驗證", type: "boolean", description: "是否啟用玩家身分驗證", span: 12 },
      { name: "BanListURL", display: "封禁列表URL", type: "string", description: "獲取封禁列表的URL地址", span: 24 },
      { name: "bEnableFastTravel", display: "啟用快速旅行", type: "boolean", description: "是否允許快速旅行功能", span: 12 },
      { name: "bIsStartLocationSelectByMap", display: "地圖選擇出生點", type: "boolean", description: "是否允許在地圖上選擇出生點", span: 12 },
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
  if (field.type === 'number') return Number(rawValue) || 0;
  if (field.type === 'string') {
    if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
      return rawValue.slice(1, -1).replace(/\\"/g, '"');
    }
    return rawValue;
  }
  return rawValue;
};

const formatValue = (field: ConfigField, value: any) => {
  if (field.type === 'boolean') return value ? 'True' : 'False';
  if (field.type === 'string') return `"${String(value).replace(/"/g, '\\"')}"`;
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
      rawText = `[/Script/Pal.PalGameWorldSettings]\nOptionSettings=(Difficulty=None,DayTimeSpeedRate=1.000000,NightTimeSpeedRate=1.000000,ExpRate=1.000000,PalCaptureRate=1.000000,PalSpawnNumRate=1.000000,PalDamageRateAttack=1.000000,PalDamageRateDefense=1.000000,PlayerDamageRateAttack=1.000000,PlayerDamageRateDefense=1.000000,PlayerStomachDecreaceRate=1.000000,PlayerStaminaDecreaceRate=1.000000,PlayerAutoHPRegeneRate=1.000000,PlayerAutoHpRegeneRateInSleep=1.000000,PalStomachDecreaceRate=1.000000,PalStaminaDecreaceRate=1.000000,PalAutoHPRegeneRate=1.000000,PalAutoHpRegeneRateInSleep=1.000000,BuildObjectDamageRate=1.000000,BuildObjectDeteriorationDamageRate=1.000000,CollectionDropRate=2.000000,CollectionObjectHpRate=1.000000,CollectionObjectRespawnSpeedRate=1.000000,EnemyDropItemRate=1.000000,DeathPenalty=None,bEnablePlayerToPlayerDamage=False,bEnableFriendlyFire=False,bEnableInvaderEnemy=True,bActiveUNKO=False,bEnableAimAssistPad=True,bEnableAimAssistKeyboard=False,DropItemMaxNum=3000,DropItemMaxNum_UNKO=100,BaseCampMaxNum=128,BaseCampWorkerMaxNum=15,DropItemAliveMaxHours=1.000000,bAutoResetGuildNoOnlinePlayers=False,AutoResetGuildTimeNoOnlinePlayers=72.000000,GuildPlayerMaxNum=20,PalEggDefaultHatchingTime=1.000000,WorkSpeedRate=1.500000,bIsMultiplay=False,bIsPvP=False,bCanPickupOtherGuildDeathPenaltyDrop=False,bEnableNonLoginPenalty=True,bEnableFastTravel=True,bIsStartLocationSelectByMap=True,bExistPlayerAfterLogout=False,bEnableDefenseOtherGuildPlayer=False,CoopPlayerMaxNum=4,ServerPlayerMaxNum=32,ServerName="Default Palworld Server",ServerDescription="",AdminPassword="",ServerPassword="",PublicPort=8211,PublicIP="",RCONEnabled=False,RCONPort=25575,Region="",bUseAuth=True,BanListURL="https://api.palworldgame.com/api/banlist.txt")`;
    }

    const match = rawText.match(/OptionSettings=\((.*)\)/s);
    if (match && match[1]) {
      rawSettings.value = parseOptionSettings(match[1]);
      
      const uiData: Record<string, any> = {};
      allFields.value.forEach(field => {
        if (rawSettings.value[field.name] !== undefined) {
          uiData[field.name] = convertValue(field, rawSettings.value[field.name]);
        }
      });
      formData.value = uiData;
      message.success(t("配置檔案讀取成功"));
    } else {
      message.error(t("無法解析 PalWorldSettings.ini 格式"));
    }
  } catch (err) {
    console.error("Load config error:", err);
    message.error(t("讀取配置檔案失敗"));
  } finally {
    isLoading.value = false;
  }
};

// ---------- 檔案保存 ----------
const saveConfig = async () => {
  isSaving.value = true;
  try {
    allFields.value.forEach(field => {
      if (formData.value[field.name] !== undefined) {
        rawSettings.value[field.name] = formatValue(field, formData.value[field.name]);
      }
    });

    const fieldsStr = Object.keys(rawSettings.value).map(key => {
      return `${key}=${rawSettings.value[key]}`;
    }).join(',');

    const newContent = `[/Script/Pal.PalGameWorldSettings]\nOptionSettings=(${fieldsStr})\n`;

    const blob = new Blob([newContent], { type: "text/plain" });
    const file = new File([blob], "PalWorldSettings.ini");

    const mission = await getUploadMissionCfg({
      params: {
        upload_dir: CONFIG_DIR,
        daemonId: props.daemonId!,
        uuid: props.instanceId!,
        file_name: file.name
      }
    });

    const config = mission.value;
    if (!config?.addr) throw new Error("獲取上傳憑證失敗");

    await new Promise<void>((resolve, reject) => {
      uploadService.append(
        file,
        parseForwardAddress(config.addr, "http"),
        config.password,
        { overwrite: true },
        (task) => {
          task.instanceInfo = { instanceId: props.instanceId!, daemonId: props.daemonId! };
        }
      );
      
      const unwatch = watch(() => uploadService.uiData.value.current, (curr) => {
        if (!curr) {
          unwatch();
          resolve();
        }
      });
    });

    message.success(t("配置已成功儲存！"));
  } catch (err: any) {
    console.error("Save config error:", err);
    message.error(t("保存配置檔案失敗: ") + err.message);
  } finally {
    isSaving.value = false;
  }
};

const openDialog = () => {
  open.value = true;
  activeTab.value = "server";
  loadConfig();
};

defineExpose({ openDialog });
</script>

<template>
  <a-modal
    v-model:open="open"
    :title="t('幻獸帕魯配置管理')"
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
        <a-button type="primary" size="small" :loading="isSaving" @click="saveConfig">
          <template #icon><SaveOutlined /></template> {{ t("保存配置") }}
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
                    <!-- 數字 -->
                    <a-input-number 
                      v-if="field.type === 'number'" 
                      v-model:value="formData[field.name]" 
                      style="width: 100%"
                      :disabled="field.disabled" 
                    />
                    <!-- 布林值 -->
                    <a-switch 
                      v-else-if="field.type === 'boolean'" 
                      v-model:checked="formData[field.name]" 
                      :checked-children="'True'" 
                      :un-checked-children="'False'" 
                    />
                    <!-- 下拉選單 -->
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
                    <!-- 多行文字 (描述) -->
                    <a-textarea 
                      v-else-if="field.type === 'string' && field.span === 24" 
                      v-model:value="formData[field.name]" 
                      :rows="2" 
                      style="width: 100%"
                      :disabled="field.disabled"
                    />
                    <!-- 單行文字 -->
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
  
  /* 修正 2: 強制各種輸入元件長寬高與置中完美對齊 */
  :deep(.ant-form-item) {
    margin-bottom: 16px;
  }
  
  :deep(.ant-form-item-control-input) {
    min-height: 38px;
  }
  
  /* 統一基本高度 */
  :deep(.ant-input),
  :deep(.ant-input-number),
  :deep(.ant-select .ant-select-selector) {
    height: 38px !important;
    border-radius: 6px !important; /* 統一圓角 */
  }

  /* 統一內部文字置中對齊 */
  :deep(.ant-select-selection-item),
  :deep(.ant-select-selection-placeholder) {
    line-height: 36px !important;
  }

  :deep(.ant-input-number-input) {
    height: 36px !important;
  }

  /* 針對可能出現的密碼輸入框 icon 對齊 */
  :deep(.ant-input-affix-wrapper) {
    height: 38px !important;
    border-radius: 6px !important;
  }

  :deep(.ant-input-password-icon) {
    line-height: 38px !important;
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
