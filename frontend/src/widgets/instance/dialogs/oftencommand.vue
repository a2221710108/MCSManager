<script setup lang="ts">
import { ref, reactive } from "vue";
import { t } from "@/lang/i18n";
import { message } from "ant-design-vue";
import type { InstanceDetail } from "@/types";
import type { UseTerminalHook } from "../../../hooks/useTerminal";
import { 
  SendOutlined, 
  SettingOutlined, 
  RocketOutlined, 
  UserOutlined,
  ReloadOutlined 
} from "@ant-design/icons-vue";

// --- 1. 定義類型接口，解決 TS2339 報錯 ---
interface CommandItem {
  label: string;
  cmd: string;
  options?: string[];      // 可選屬性
  placeholder?: string[];  // 可選屬性
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

// 用於儲存所有指令的動態輸入值 (格式：{ "指令Label_參數序號": "值" })
const formState = reactive<Record<string, string>>({});

// --- 2. 簡潔配置區 (你可以直接在這裡增加指令) ---
const COMMAND_GROUPS: CommandGroup[] = [
  {
    group: "EssentialsX " + t("玩家管理"),
    icon: UserOutlined,
    commands: [
      { label: t("傳送玩家至玩家"), cmd: "tp {player} {player}" }, 
      { label: t("給予物品"), cmd: "give {player} {text} {text}", placeholder: [t("物品ID"), t("數量")] },
      { label: t("私訊玩家"), cmd: "msg {player} {text}", placeholder: ["", t("訊息內容")] },
    ]
  },
  {
    group: t("環境與遊戲規則"),
    icon: SettingOutlined,
    commands: [
      { label: t("生物自然生成"), cmd: "gamerule spawn_mobs {val}", options: ["true", "false"] },
      { label: t("怪物自然生成"), cmd: "gamerule spawn_monsters {val}", options: ["true", "false"] },
      { label: t("難度設置"), cmd: "difficulty {val}", options: ["peaceful", "easy", "normal", "hard"] },
      { label: t("時間設置"), cmd: "time set {val}", options: ["day", "night", "noon", "midnight"] },
      { label: t("死亡不掉落"), cmd: "gamerule keep_inventory {val}", options: ["true", "false"] },
      { label: t("積雪厚度"), cmd: "gamerule max_snow_accumulation_height {text}", placeholder: [t("數字")] },
    ]
  }
];

// --- 3. 邏輯處理函數 ---

// 解析指令中包含哪些參數類型
const getParams = (cmd: string) => {
  const matches = cmd.match(/\{(player|val|text)\}/g) || [];
  return matches.map(m => m.replace(/[{}]/g, ''));
};

const fetchPlayers = async () => {
  const { ip, port } = props.instanceInfo?.config?.pingConfig || {};
  if (!ip) return;
  isFetchingPlayers.value = true;
  try {
    const res = await fetch(`https://api.mcstatus.io/v2/status/java/${ip}:${port || 25565}?t=${Date.now()}`);
    const data = await res.json();
    if (data.online && data.players?.list) {
      onlinePlayers.value = data.players.list.map((p: any) => p.name_raw || p.name);
    } else {
      onlinePlayers.value = [];
    }
  } catch (e) {
    console.error("Fetch players error:", e);
  } finally {
    isFetchingPlayers.value = false;
  }
};

const runCommand = async (item: CommandItem) => {
  if (!isConnect.value) return message.error(t("終端連線尚未就緒，請檢查伺服器狀態"));
  
  const params = getParams(item.cmd);
  let finalCmd = item.cmd;

  // 按順序替換參數
  for (let i = 0; i < params.length; i++) {
    const val = formState[`${item.label}_${i}`];
    if (!val && params[i] !== 'text') {
      return message.warn(`${t("請完成所有輸入項目")}`);
    }
    // 每次只替換第一個匹配到的參數標籤
    finalCmd = finalCmd.replace(/\{(player|val|text)\}/, val || ""); 
  }

  try {
    await sendCommand(finalCmd);
    message.success(`${t("指令發送成功")}: /${finalCmd}`);
  } catch (err: any) {
    message.error(`${t("執行失敗")}: ${err.message || err}`);
  }
};

const openDialog = () => {
  open.value = true;
  fetchPlayers();
};

defineExpose({ openDialog });
</script>

<template>
  <a-modal
    v-model:open="open"
    :title="t('快捷指令')"
    :footer="null"
    :width="750"
    centered
    destroy-on-close
  >
    <div class="command-container">
      <div class="header-tip">
        <a-typography-text type="secondary">
          <ReloadOutlined :spin="isFetchingPlayers" @click="fetchPlayers" style="cursor: pointer" />
          {{ t(" 數據可能有 1-5 分鐘延遲，取決於 API 延遲") }}
        </a-typography-text>
      </div>

      <a-collapse ghost expand-icon-position="right" :default-active-key="[COMMAND_GROUPS[0].group]">
        <a-collapse-panel v-for="group in COMMAND_GROUPS" :key="group.group">
          <template #header>
            <span class="group-title"><component :is="group.icon" class="mr-8" /> {{ group.group }}</span>
          </template>

          <div class="cmd-grid">
            <div v-for="item in group.commands" :key="item.label" class="cmd-card">
              <span class="cmd-label">{{ item.label }}</span>
              
              <div class="cmd-controls">
                <template v-for="(type, index) in getParams(item.cmd)" :key="index">
                  
                  <a-select
                    v-if="type === 'player'"
                    v-model:value="formState[`${item.label}_${index}`]"
                    :placeholder="t('玩家')"
                    size="small"
                    show-search
                    class="ctrl-player"
                    :loading="isFetchingPlayers"
                  >
                    <a-select-option v-for="n in onlinePlayers" :key="n" :value="n">{{ n }}</a-select-option>
                  </a-select>

                  <a-select
                    v-else-if="type === 'val'"
                    v-model:value="formState[`${item.label}_${index}`]"
                    size="small"
                    class="ctrl-option"
                  >
                    <a-select-option v-for="opt in (item.options || [])" :key="opt" :value="opt">
                      {{ opt }}
                    </a-select-option>
                  </a-select>

                  <a-input
                    v-else
                    v-model:value="formState[`${item.label}_${index}`]"
                    :placeholder="(item.placeholder && item.placeholder[index]) || t('輸入...')"
                    size="small"
                    class="ctrl-text"
                  />
                </template>

                <a-button type="primary" size="small" shape="circle" @click="runCommand(item)">
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

<style lang="scss" scoped>
.command-container {
  max-height: 65vh;
  overflow-y: auto;
  padding-right: 8px;
}
.header-tip {
  margin-bottom: 12px;
  padding-left: 12px;
}
.group-title {
  font-weight: bold;
  font-size: 15px;
  display: flex;
  align-items: center;
}
.mr-8 { margin-right: 8px; }

.cmd-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.cmd-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 10px;
  background: #fdfdfd;
  border: 1px solid #f0f0f0;
  border-radius: 4px;
  transition: all 0.2s;
  &:hover {
    border-color: #1890ff;
    background: #f0f7ff;
  }
}

.cmd-label {
  font-size: 13px;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 110px;
}

.cmd-controls {
  display: flex;
  gap: 4px;
  align-items: center;
}

// 根據不同輸入類型設定寬度，確保在雙列佈局下不擠擁
.ctrl-player { width: 90px; }
.ctrl-option { width: 80px; }
.ctrl-text { width: 80px; }

@media (max-width: 700px) {
  .cmd-grid {
    grid-template-columns: 1fr;
  }
}
</style>
