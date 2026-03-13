<script setup lang="ts">
import { ref, computed, reactive } from "vue";
import { t } from "@/lang/i18n";
import { message } from "ant-design-vue";
import type { InstanceDetail } from "@/types";
import type { UseTerminalHook } from "../../../hooks/useTerminal";
import {
  SettingOutlined,
  ThunderboltOutlined,
  ClockCircleOutlined,
  SafetyCertificateOutlined,
  RocketOutlined,
  InfoCircleOutlined,
  SendOutlined
} from "@ant-design/icons-vue";

const props = defineProps<{
  instanceInfo?: InstanceDetail;
  useTerminalHook: UseTerminalHook;
}>();

const open = ref(false);
const { sendCommand, isConnect } = props.useTerminalHook;

// --- 指令配置區 ---
const COMMAND_GROUPS = [
  {
    group: t("環境與難度"),
    icon: ThunderboltOutlined,
    commands: [
      { label: t("遊戲難度"), cmd: "difficulty {val}", options: ["peaceful", "easy", "normal", "hard"] },
      { label: t("切換天氣"), cmd: "weather {val}", options: ["clear", "rain", "thunder"] },
      { label: t("更改時間"), cmd: "time set {val}", options: ["day", "night", "noon", "midnight"] },
    ]
  },
  {
    group: t("遊戲規則 (Gamerule)"),
    icon: SettingOutlined,
    commands: [
      { label: t("死亡不掉落"), cmd: "gamerule keepInventory {val}", options: ["true", "false"] },
      { label: t("生物破壞地形"), cmd: "gamerule mobGriefing {val}", options: ["true", "false"] },
      { label: t("啟用自然回血"), cmd: "gamerule naturalRegeneration {val}", options: ["true", "false"] },
      { label: t("日夜循環"), cmd: "gamerule doDaylightCycle {val}", options: ["true", "false"] },
    ]
  },
  {
    group: "EssentialsX " + t("常用"),
    icon: RocketOutlined,
    isPlugin: true,
    commands: [
      { label: t("傳送到出生點"), cmd: "spawn", type: "instant" },
      { label: t("設置當前為出生點"), cmd: "setspawn", type: "instant" },
      { label: t("切換全體飛行"), cmd: "fly {val}", options: ["on", "off"] },
      { label: t("清理地面物品"), cmd: "remove drops 999999", type: "instant" },
      { label: t("全服公告"), cmd: "broadcast {text}", type: "input" },
    ]
  }
];

// 用於存儲下拉選單或輸入框的臨時值
const formState = reactive<Record<string, any>>({
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

// --- 執行邏輯 ---
const runCommand = async (baseCmd: string, type: string = "option") => {
  if (!isConnect.value) return message.error(t("終端連線尚未就緒"));

  let finalCmd = baseCmd;
  
  if (type === "option" || type === "input") {
    // 提取 key 用於尋找 formState 中的值 (例如 "difficulty {val}" -> "difficulty")
    const stateKey = baseCmd.replace(" {val}", "").replace(" {text}", "");
    const val = formState[stateKey];
    
    if (type === "input" && !val) return message.warn(t("請輸入內容"));
    finalCmd = baseCmd.replace("{val}", val).replace("{text}", val);
  }

  try {
    await sendCommand(finalCmd);
    message.success(`${t("執行成功")}: /${finalCmd}`);
  } catch (err: any) {
    message.error(`${t("執行失敗")}: ${err.message}`);
  }
};

const openDialog = () => (open.value = true);
defineExpose({ openDialog });
</script>

<template>
  <a-modal
    v-model:open="open"
    :title="t('快捷指令控制台')"
    :footer="null"
    :width="700"
    centered
  >
    <div class="cmd-manager">
      <a-alert
        type="info"
        show-icon
        class="mb-16"
        :message="t('溫馨提示：EssentialsX 指令需要伺服器已安裝該插件方可生效。')"
      >
        <template #icon><InfoCircleOutlined /></template>
      </a-alert>

      <div v-for="group in COMMAND_GROUPS" :key="group.group" class="cmd-group">
        <h3 class="group-title">
          <component :is="group.icon" /> {{ group.group }}
          <a-tag v-if="group.isPlugin" color="blue" class="ml-8">Plugin</a-tag>
        </h3>
        
        <div class="cmd-grid">
          <div v-for="item in group.commands" :key="item.label" class="cmd-item">
            <span class="cmd-label">{{ item.label }}</span>
            
            <div class="cmd-actions">
              <a-select
                v-if="item.options"
                v-model:value="formState[item.cmd.replace(' {val}', '')]"
                size="small"
                style="width: 110px"
              >
                <a-select-option v-for="opt in item.options" :key="opt" :value="opt">
                  {{ opt }}
                </a-select-option>
              </a-select>

              <a-input
                v-if="item.type === 'input'"
                v-model:value="formState[item.cmd.replace(' {text}', '')]"
                size="small"
                placeholder="..."
                style="width: 110px"
              />

              <a-button 
                type="primary" 
                ghost 
                size="small" 
                :disabled="!isConnect"
                @click="runCommand(item.cmd, item.type)"
              >
                <template #icon><SendOutlined /></template>
                {{ item.type === 'instant' ? t('執行') : '' }}
              </a-button>
            </div>
          </div>
        </div>
        <a-divider />
      </div>
    </div>
  </a-modal>
</template>

<style lang="scss" scoped>
.cmd-manager {
  max-height: 550px;
  overflow-y: auto;
  padding-right: 8px;
}
.mb-16 { margin-bottom: 16px; }
.ml-8 { margin-left: 8px; }

.group-title {
  display: flex;
  align-items: center;
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 16px;
  color: #333;
}

.cmd-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.cmd-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background: #f8f9fa;
  border-radius: 6px;
  border: 1px solid #f0f0f0;
  transition: all 0.3s;

  &:hover {
    border-color: #1890ff;
    background: #fff;
  }
}

.cmd-label {
  font-size: 14px;
  color: #555;
}

.cmd-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

:deep(.ant-divider-horizontal) {
  margin: 16px 0;
}
</style>
