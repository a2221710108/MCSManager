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
  ReloadOutlined,
  HistoryOutlined
} from "@ant-design/icons-vue";

// --- 類型定義 ---
interface CommandItem {
  label: string;
  cmd: string;
  options?: string[];
  placeholder?: string[];
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

// --- 簡潔配置 (如果沒有數據，畫面會保持空白) ---
const COMMAND_GROUPS: CommandGroup[] = [
  {
    group: t("常用指令"),
    icon: RocketOutlined,
    commands: [
      { label: t("傳送玩家"), cmd: "tp {player} {player}" }, 
      { label: t("給予物品"), cmd: "give {player} {text} {text}", placeholder: [t("物品ID"), t("數量")] },
    ]
  },
  {
    group: t("伺服器規則"),
    icon: SettingOutlined,
    commands: [
      { label: t("生物生成"), cmd: "gamerule spawn_mobs {val}", options: ["true", "false"] },
      { label: t("時間設置"), cmd: "time set {val}", options: ["day", "night"] },
    ]
  }
];

const getParams = (cmd: string) => {
  const matches = cmd.match(/\{(player|val|text)\}/g) || [];
  return matches.map(m => m.replace(/[{}]/g, ''));
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
  } catch (e) {
    console.error(e);
  } finally {
    isFetchingPlayers.value = false;
  }
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
  } catch (err: any) {
    message.error(err.message || String(err));
  }
};

const openDialog = () => { open.value = true; fetchPlayers(); };
defineExpose({ openDialog });
</script>

<template>
  <a-modal
    v-model:open="open"
    :title="t('快捷指令')"
    :footer="null"
    :width="750"
    centered
  >
    <div v-if="COMMAND_GROUPS.length > 0" class="quick-cmd-container">
      
      <div class="header-toolbar">
        <span class="desc-text">{{ t("點擊執行快捷指令，數據刷新可能有 1-5 分鐘延遲") }}</span>
        <a-button class="refresh-btn" size="small" @click="fetchPlayers" :loading="isFetchingPlayers">
          <template #icon><ReloadOutlined /></template>
        </a-button>
      </div>

      <div v-for="group in COMMAND_GROUPS" :key="group.group" class="group-section">
        <div class="group-header">
          <component :is="group.icon" class="group-icon" />
          <span>{{ group.group }}</span>
        </div>

        <div class="cmd-grid">
          <div v-for="item in group.commands" :key="item.label" class="cmd-card">
            <div class="cmd-top">
              <span class="cmd-label">{{ item.label }}</span>
            </div>
            
            <div class="cmd-body">
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
                    <a-select-option v-for="opt in (item.options || [])" :key="opt" :value="opt">{{ opt }}</a-select-option>
                  </a-select>

                  <a-input
                    v-else
                    v-model:value="formState[`${item.label}_${index}`]"
                    :placeholder="(item.placeholder && item.placeholder[index]) || t('輸入')"
                    size="small"
                    class="param-input text-input"
                  />
                </template>
              </div>

              <a-button type="primary" size="small" class="exec-btn" @click="runCommand(item)">
                <SendOutlined />
              </a-button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </a-modal>
</template>

<style scoped>
.quick-cmd-container {
  padding: 4px;
}

.header-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.desc-text {
  font-size: 13px;
  opacity: 0.6;
}

.refresh-btn {
  border-radius: 8px;
  background: rgba(140, 140, 140, 0.1);
  border: 1px solid rgba(140, 140, 140, 0.2);
}

/* --- 分組樣式 --- */
.group-section {
  margin-bottom: 24px;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 12px;
  opacity: 0.85;
}

.group-icon {
  color: #1677ff;
}

/* --- 網格佈局 --- */
.cmd-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

/* --- 指令卡片設計 (參考你的 Java 切換組件) --- */
.cmd-card {
  background: rgba(22, 119, 255, 0.03);
  border: 1px solid rgba(140, 140, 140, 0.15);
  border-radius: 12px;
  padding: 12px;
  transition: all 0.2s ease;
}

.cmd-card:hover {
  border-color: #1677ff;
  background: rgba(22, 119, 255, 0.06);
  box-shadow: 0 4px 12px rgba(22, 119, 255, 0.08);
}

.cmd-top {
  margin-bottom: 10px;
}

.cmd-label {
  font-size: 13px;
  font-weight: 600;
  opacity: 0.9;
}

.cmd-body {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.inputs-group {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex: 1;
}

/* --- 輸入框樣式微調 --- */
.param-input {
  background: rgba(140, 140, 140, 0.05) !important;
}

.player-select { width: 100px; }
.val-select { width: 80px; }
.text-input { width: 90px; }

/* 執行按鈕樣式 */
.exec-btn {
  border-radius: 8px;
  height: 28px;
  width: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  background: #1677ff;
}

/* --- 玩家下拉選項 (頭像) --- */
.player-option {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mini-avatar {
  width: 18px;
  height: 18px;
  border-radius: 4px;
}

/* --- 響應式 --- */
@media (max-width: 650px) {
  .cmd-grid {
    grid-template-columns: 1fr;
  }
}
</style>
