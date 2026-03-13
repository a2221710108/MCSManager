<script setup lang="ts">
import { ref, reactive } from "vue";
import { t } from "@/lang/i18n";
import { message } from "ant-design-vue";
import type { InstanceDetail } from "@/types";
import type { UseTerminalHook } from "../../../hooks/useTerminal";
import { SendOutlined, HistoryOutlined, SettingOutlined, RocketOutlined, UserOutlined } from "@ant-design/icons-vue";

const props = defineProps<{
  instanceInfo?: InstanceDetail;
  useTerminalHook: UseTerminalHook;
}>();

const open = ref(false);
const onlinePlayers = ref<string[]>([]);
const { sendCommand, isConnect } = props.useTerminalHook;

// 用於儲存所有指令的動態輸入值 (格式：{ "指令Label_參數序號": "值" })
const formState = reactive<Record<string, string>>({});

// --- 簡潔配置區 ---
const COMMAND_GROUPS = [
  {
    group: t("玩家管理 (多參數範例)"),
    icon: UserOutlined,
    commands: [
      // 自動識別兩個 {player}，生成兩個下拉框
      { label: t("傳送玩家至玩家"), cmd: "tp {player} {player}" }, 
      // 自動識別 {player} 和 {text}
      { label: t("給予物品"), cmd: "give {player} {text} {text}", placeholder: [t("物品ID"), t("數量")] },
      { label: t("私訊玩家"), cmd: "msg {player} {text}" },
    ]
  },
  {
    group: t("遊戲規則"),
    icon: SettingOutlined,
    commands: [
      { label: t("生物生成"), cmd: "gamerule spawn_mobs {val}", options: ["true", "false"] },
      { label: t("難度設置"), cmd: "difficulty {val}", options: ["peaceful", "easy", "normal", "hard"] },
      { label: t("死亡不掉落"), cmd: "gamerule keep_inventory {val}", options: ["true", "false"] },
    ]
  }
];

// 解析指令中包含哪些參數類型
const getParams = (cmd: string) => {
  const matches = cmd.match(/\{(player|val|text)\}/g) || [];
  return matches.map(m => m.replace(/[{}]/g, ''));
};

// 執行指令邏輯
const runCommand = async (item: any) => {
  if (!isConnect.value) return message.error(t("連線未就緒"));
  
  const params = getParams(item.cmd);
  let finalCmd = item.cmd;

  // 按順序替換參數
  for (let i = 0; i < params.length; i++) {
    const val = formState[`${item.label}_${i}`];
    if (!val) return message.warn(`${t("請填寫第")} ${i + 1} ${t("個參數")}`);
    finalCmd = finalCmd.replace(/\{(player|val|text)\}/, val); // 每次只替換第一個匹配項
  }

  try {
    await sendCommand(finalCmd);
    message.success(`${t("執行成功")}: /${finalCmd}`);
  } catch (err: any) {
    message.error(err.message || String(err));
  }
};

const fetchPlayers = async () => {
  const { ip, port } = props.instanceInfo?.config?.pingConfig || {};
  if (!ip) return;
  try {
    const res = await fetch(`https://api.mcstatus.io/v2/status/java/${ip}:${port || 25565}?t=${Date.now()}`);
    const data = await res.json();
    if (data.online && data.players?.list) {
      onlinePlayers.value = data.players.list.map((p: any) => p.name_raw || p.name);
    }
  } catch (e) { console.error(e); }
};

const openDialog = () => { open.value = true; fetchPlayers(); };
defineExpose({ openDialog });
</script>

<template>
  <a-modal v-model:open="open" :title="t('快捷指令')" :footer="null" :width="750" centered>
    <div class="command-container">
      <a-collapse ghost expand-icon-position="right" :default-active-key="[COMMAND_GROUPS[0].group]">
        <a-collapse-panel v-for="group in COMMAND_GROUPS" :key="group.group">
          <template #header>
            <span class="group-title"><component :is="group.icon" /> {{ group.group }}</span>
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
                  >
                    <a-select-option v-for="n in onlinePlayers" :key="n" :value="n">{{ n }}</a-select-option>
                  </a-select>

                  <a-select
                    v-else-if="type === 'val'"
                    v-model:value="formState[`${item.label}_${index}`]"
                    size="small"
                    class="ctrl-option"
                  >
                    <a-select-option v-for="opt in item.options" :key="opt" :value="opt">{{ opt }}</a-select-option>
                  </a-select>

                  <a-input
                    v-else
                    v-model:value="formState[`${item.label}_${index}`]"
                    :placeholder="item.placeholder?.[index] || t('輸入...')"
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
.command-container { max-height: 70vh; overflow-y: auto; }
.group-title { font-weight: bold; display: flex; align-items: center; gap: 8px; }
.cmd-grid {
  display: grid;
  grid-template-columns: 1fr 1fr; // 保持你原本的兩列佈局
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
  &:hover { border-color: #1890ff; }
}
.cmd-label { font-size: 13px; color: #333; }
.cmd-controls {
  display: flex;
  gap: 4px;
  align-items: center;
}
.ctrl-player { width: 100px; }
.ctrl-option { width: 85px; }
.ctrl-text { width: 90px; }

@media (max-width: 600px) { .cmd-grid { grid-template-columns: 1fr; } }
</style>
