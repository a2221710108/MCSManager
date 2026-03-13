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
      { label: t("發送全服信息"), cmd: "say {text}", type: "input", placeholder: t("") },
      { label: t("發送標題文字"), cmd: "title {text}", type: "input", placeholder: t("") },
    ]
  },
  {
    group: t("遊戲規則 (傷害)"),
    icon: SettingOutlined,
    commands: [
      { label: t("自然回血"), cmd: "gamerule natural_health_regeneration {val}", type: "option", options: ["true", "false"] },
      { label: t("溺水傷害"), cmd: "gamerule drowning_damage {val}", type: "option", options: ["true", "false"] },
      { label: t("摔落傷害"), cmd: "gamerule fall_damage {val}", type: "option", options: ["true", "false"] },
      { label: t("火焰傷害"), cmd: "gamerule fire_damage {val}", type: "option", options: ["true", "false"] },
      { label: t("冰凍傷害"), cmd: "gamerule freeze_damage {val}", type: "option", options: ["true", "false"] },
      { label: t("原諒死者"), cmd: "gamerule forgive_dead_players {val}", type: "option", options: ["true", "false"] },
      { label: t("誰都不原諒"), cmd: "gamerule universal_anger {val}", type: "option", options: ["true", "false"] },
    ]
  },
  {
    group: t("遊戲規則 (上帝)"),
    icon: SettingOutlined,
    commands: [
      { label: t("死亡不掉落"), cmd: "gamerule keep_inventory {val}", type: "option", options: ["true", "false"] },
      { label: t("生物破壞地形"), cmd: "gamerule mob_griefing {val}", type: "option", options: ["true", "false"] },
      { label: t("日夜循環"), cmd: "gamerule advance_time {val}", type: "option", options: ["true", "false"] },
      { label: t("指令方塊"), cmd: "gamerule command_blocks_work {val}", type: "option", options: ["true", "false"] },
      { label: t("鞘翅移動檢測"), cmd: "gamerule elytra_movement_check {val}", type: "option", options: ["true", "false"] },
      { label: t("玩家移動檢測"), cmd: "gamerule player_movement_check {val}", type: "option", options: ["true", "false"] },
      { label: t("玩家定位條"), cmd: "gamerule locator_bar {val}", type: "option", options: ["true", "false"] },
      { label: t("積雪厚度"), cmd: "gamerule max_snow_accumulation_height {text}", type: "input", placeholder: t("1 表示一格") },
      { label: t("創造模式傳送門等待時間"), cmd: "gamerule players_nether_portal_creative_delay {text}", type: "input", placeholder: t("20 代表一秒") },
      { label: t("生存模式傳送門等待時間"), cmd: "gamerule players_nether_portal_default_delay {text}", type: "input", placeholder: t("80") },
      { label: t("進入地獄"), cmd: "gamerule allow_entering_nether_using_portals {val}", type: "option", options: ["true", "false"] },
      { label: t("跳過夜晚睡眠比例"), cmd: "gamerule players_sleeping_percentage {text}", type: "input", placeholder: t("大於100將無法跳過") },
      { label: t("PVP"), cmd: "gamerule pvp {val}", type: "option", options: ["true", "false"] },
      { label: t("藤蔓蔓延"), cmd: "gamerule spread_vines {val}", type: "option", options: ["true", "false"] },
      { label: t("TNT爆炸"), cmd: "gamerule tnt_explodes {val}", type: "option", options: ["true", "false"] },
      { label: t("世界邊界"), cmd: "worldborder {text}", type: "input", placeholder: t("") },
    ]
  },
  {
    group: t("遊戲規則 (生成)"),
    icon: SettingOutlined,
    commands: [
      { label: t("生物自然生成"), cmd: "gamerule spawn_mobs {val}", type: "option", options: ["true", "false"] },
      { label: t("怪物自然生成"), cmd: "gamerule spawn_monsters {val}", type: "option", options: ["true", "false"] },
      { label: t("掠奪者巡邏隊"), cmd: "gamerule spawn_patrols {val}", type: "option", options: ["true", "false"] },
      { label: t("夜魅"), cmd: "gamerule spawn_phantoms {val}", type: "option", options: ["true", "false"] },
      { label: t("流浪商人"), cmd: "gamerule spawn_wandering_traders {val}", type: "option", options: ["true", "false"] },
      { label: t("伏守者"), cmd: "gamerule spawn_wardens {val}", type: "option", options: ["true", "false"] },
      { label: t("生怪磚"), cmd: "gamerule spawner_blocks_work {val}", type: "option", options: ["true", "false"] },
      { label: t("突襲事件"), cmd: "gamerule raids {val}", type: "option", options: ["true", "false"] },
    ]
  },
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
    :title="t('快捷指令')"
    :footer="null"
    :width="750"
    centered
    destroy-on-close
  >
    <div class="command-container">
      <a-alert type="info" show-icon class="mb-16">
        <template #message>
          {{ t("點擊執行快捷指令。部分指令可能只支持 Minecraft Java 版較新版本。") }}
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
