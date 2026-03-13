<script setup lang="ts">
import { ref, reactive } from "vue";
import { t } from "@/lang/i18n";
import { message } from "ant-design-vue";
import type { InstanceDetail } from "@/types";
import type { UseTerminalHook } from "../../../hooks/useTerminal";
import {
  SettingOutlined,
  ThunderboltOutlined,
  RocketOutlined,
  InfoCircleOutlined,
  SendOutlined,
  HistoryOutlined
} from "@ant-design/icons-vue";

// 1. 定義類型接口以解決 TS2339 錯誤
interface CommandItem {
  label: string;
  cmd: string;
  type: "option" | "input" | "instant";
  options?: string[];
  placeholder?: string;
}

interface CommandGroup {
  group: string;
  icon: any;
  isPlugin?: boolean;
  commands: CommandItem[];
}

const props = defineProps<{
  instanceInfo?: InstanceDetail;
  useTerminalHook: UseTerminalHook;
}>();

const open = ref(false);
const { sendCommand, isConnect } = props.useTerminalHook;

// 2. 指令數據配置
const COMMAND_GROUPS: CommandGroup[] = [
  {
    group: t("環境與時間"),
    icon: HistoryOutlined,
    commands: [
      { label: t("遊戲難度"), cmd: "difficulty {val}", type: "option", options: ["peaceful", "easy", "normal", "hard"] },
      { label: t("天氣切換"), cmd: "weather {val}", type: "option", options: ["clear", "rain", "thunder"] },
      { label: t("時間設置"), cmd: "time set {val}", type: "option", options: ["day", "night", "noon", "midnight"] },
    ]
  },
  {
    group: t("遊戲規則 (Gamerule)"),
    icon: SettingOutlined,
    commands: [
      { label: t("死亡不掉落"), cmd: "gamerule keepInventory {val}", type: "option", options: ["true", "false"] },
      { label: t("生物破壞地形"), cmd: "gamerule mobGriefing {val}", type: "option", options: ["true", "false"] },
      { label: t("自然回血"), cmd: "gamerule naturalRegeneration {val}", type: "option", options: ["true", "false"] },
      { label: t("日夜循環"), cmd: "gamerule doDaylightCycle {val}", type: "option", options: ["true", "false"] },
    ]
  },
  {
    group: "EssentialsX " + t("常用插件指令"),
    icon: RocketOutlined,
    isPlugin: true,
    commands: [
      { label: t("傳送至出生點"), cmd: "spawn", type: "instant" },
      { label: t("設置出生點"), cmd: "setspawn", type: "instant" },
      { label: t("個人飛行狀態"), cmd: "fly {val}", type: "option", options: ["on", "off"] },
      { label: t("清理地面物品"), cmd: "remove drops 99999", type: "instant" },
      { label: t("全服公告"), cmd: "broadcast {text}", type: "input", placeholder: t("輸入公告內容") },
    ]
  }
];

// 3. 響應式表單狀態 (用於存儲選中的值或輸入的文字)
const formState = reactive<Record<string, string>>({
  "difficulty": "normal",
  "weather": "clear",
  "time set": "day",
  "gamerule keepInventory": "true",
  "gamerule mobGriefing": "true",
  "gamerule naturalRegeneration": "true",
  "gamerule doDaylightCycle": "true",
  "fly": "on",
  "broadcast": ""
});

// 4. 指令執行邏輯
const runCommand = async (item: CommandItem) => {
  if (!isConnect.value) {
    return message.error(t("終端連線尚未就緒，請檢查伺服器狀態"));
  }

  let finalCmd = item.cmd;

  if (item.type === "option") {
    // 獲取 key (例如 "difficulty") 並從 formState 拿值
    const key = item.cmd.replace(" {val}", "");
    const val = formState[key];
    finalCmd = item.cmd.replace("{val}", val);
  } else if (item.type === "input") {
    const key = item.cmd.replace(" {text}", "");
    const val = formState[key];
    if (!val) return message.warn(t("請先輸入內容"));
    finalCmd = item.cmd.replace("{text}", val);
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
};

defineExpose({ openDialog });
</script>

<template>
  <a-modal
    v-model:open="open"
    :title="t('快捷指令管理')"
    :footer="null"
    :width="750"
    centered
    destroy-on-close
  >
    <div class="command-container">
      <a-alert type="info" show-icon class="mb-16">
        <template #message>
          {{ t("點擊執行快捷指令。部分指令可能需要管理員 (OP) 權限或特定插件支持。") }}
        </template>
        <template #icon><InfoCircleOutlined /></template>
      </a-alert>

      <div v-for="group in COMMAND_GROUPS" :key="group.group" class="cmd-group-section">
        <div class="group-header">
          <component :is="group.icon" class="mr-8" />
          <span class="group-name">{{ group.group }}</span>
          <a-tag v-if="group.isPlugin" color="blue" class="ml-8">Plugin</a-tag>
        </div>

        <div class="cmd-grid">
          <div v-for="item in group.commands" :key="item.label" class="cmd-card">
            <div class="cmd-info">
              <span class="cmd-label">{{ item.label }}</span>
            </div>

            <div class="cmd-control">
              <a-select
                v-if="item.type === 'option'"
                v-model:value="formState[item.cmd.replace(' {val}', '')]"
                size="small"
                class="ctrl-select"
              >
                <a-select-option v-for="opt in item.options" :key="opt" :value="opt">
                  {{ opt }}
                </a-select-option>
              </a-select>

              <a-input
                v-if="item.type === 'input'"
                v-model:value="formState[item.cmd.replace(' {text}', '')]"
                size="small"
                :placeholder="item.placeholder"
                class="ctrl-input"
              />

              <a-button
                type="primary"
                size="small"
                :disabled="!isConnect"
                @click="runCommand(item)"
              >
                <template #icon><SendOutlined /></template>
                <span v-if="item.type === 'instant'">{{ t("執行") }}</span>
              </a-button>
            </div>
          </div>
        </div>
        <a-divider style="margin: 20px 0" />
      </div>
    </div>
  </a-modal>
</template>

<style lang="scss" scoped>
.command-container {
  max-height: 600px;
  overflow-y: auto;
  padding: 4px;
}

.mb-16 { margin-bottom: 16px; }
.ml-8 { margin-left: 8px; }
.mr-8 { margin-right: 8px; }

.cmd-group-section {
  .group-header {
    display: flex;
    align-items: center;
    margin-bottom: 12px;
    .group-name {
      font-size: 15px;
      font-weight: bold;
      color: var(--color-text-1);
    }
  }
}

.cmd-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr); // 雙列佈局
  gap: 12px;
}

.cmd-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background-color: rgba(0, 0, 0, 0.02);
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  transition: all 0.2s;

  &:hover {
    border-color: #1890ff;
    background-color: #fff;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  }
}

.cmd-label {
  font-size: 13px;
  color: #555;
}

.cmd-control {
  display: flex;
  align-items: center;
  gap: 8px;

  .ctrl-select {
    width: 100px;
  }
  .ctrl-input {
    width: 120px;
  }
}

@media (max-width: 600px) {
  .cmd-grid {
    grid-template-columns: 1fr; // 手機端切換為單列
  }
}
</style>
