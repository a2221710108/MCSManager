<script setup lang="ts">
import { onMounted, ref, reactive, watch, nextTick } from "vue";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { message } from "ant-design-vue";
import { LoadingOutlined, DeleteOutlined, CodeOutlined } from "@ant-design/icons-vue";

import { t } from "@/lang/i18n";
import { getRandomId } from "../tools/randId";
import { useLayoutContainerStore } from "@/stores/useLayoutContainerStore";
import { useCommandHistory } from "@/hooks/useCommandHistory";
import { getInstanceOutputLog } from "@/services/apis/instance";
import { encodeConsoleColor, type UseTerminalHook } from "../hooks/useTerminal";

const props = defineProps<{
  instanceId: string;
  daemonId: string;
  height: string;
  useTerminalHook: UseTerminalHook;
}>();

const { containerState } = useLayoutContainerStore();
const {
  focusHistoryList,
  selectLocation,
  history,
  commandInputValue,
  handleHistorySelect,
  clickHistoryItem
} = useCommandHistory();

const {
  state,
  events,
  isConnect,
  execute: setUpTerminal,
  initTerminalWindow,
  sendCommand,
  clearTerminal
} = props.useTerminalHook;

// --- 狀態管理 ---
const activeTab = ref("ALL");
const isMinecraft = ref(false);
const inputRef = ref<HTMLElement | null>(null);

const terminals = reactive({
  ALL: { term: null as Terminal | null, id: `term-all-${getRandomId()}`, fit: null as FitAddon | null },
  WARN: { term: null as Terminal | null, id: `term-warn-${getRandomId()}`, fit: null as FitAddon | null },
  ERROR: { term: null as Terminal | null, id: `term-error-${getRandomId()}`, fit: null as FitAddon | null }
});

// --- 工具：清洗 ANSI 顏色並進行過濾匹配 ---
const stripAnsi = (str: string) => str.replace(/[\u001b\u009b][[()#;?]*(?:[a-zA-Z\d\n\r]*(?:;[a-zA-Z\d\n\r]*)*)?/g, "");

const writeToTabs = (data: string) => {
  if (!data) return;
  
  // 1. ALL 終端永遠寫入原始數據
  terminals.ALL.term?.write(data);

  // 2. 針對 Minecraft 進行行過濾
  if (isMinecraft.value) {
    const cleanData = stripAnsi(data).toUpperCase();
    
    // 匹配 WARN
    if (cleanData.includes("WARN") || cleanData.includes("WARNING")) {
      terminals.WARN.term?.write(data);
    }
    // 匹配 ERROR / FATAL / EXCEPTION
    if (cleanData.includes("ERROR") || cleanData.includes("FATAL") || cleanData.includes("EXCEPTION")) {
      terminals.ERROR.term?.write(data);
    }
  }
};

// --- 初始化終端實例 ---
const initAllTerminals = async () => {
  if (containerState.isDesignMode) return;
  
  // 初始化主終端
  const domAll = document.getElementById(terminals.ALL.id);
  if (domAll) {
    terminals.ALL.term = initTerminalWindow(domAll);
    const fit = new FitAddon();
    terminals.ALL.term.loadAddon(fit);
    terminals.ALL.fit = fit;
  }

  // 初始化副終端 (WARN/ERROR)
  if (isMinecraft.value) {
    await nextTick();
    (["WARN", "ERROR"] as const).forEach(tab => {
      const dom = document.getElementById(terminals[tab].id);
      if (dom) {
        // 使用與主終端相同的配置
        const tObj = new Terminal((terminals.ALL.term as any).options);
        const fit = new FitAddon();
        tObj.loadAddon(fit);
        tObj.open(dom);
        fit.fit();
        terminals[tab].term = tObj;
        terminals[tab].fit = fit;
      }
    });
  }
};

// --- 事件處理 ---

// 即時數據流
events.on("stdout", (data: any) => {
  const rawText = typeof data === 'string' ? data : data.text;
  writeToTabs(rawText);
});

// 歷史日誌加載 (修復刷新後空白的核心)
events.once("detail", async () => {
  try {
    const { value } = await getInstanceOutputLog().execute({
      params: { uuid: props.instanceId || "", daemonId: props.daemonId || "" }
    });

    if (value) {
      const haveColor = state.value?.config?.terminalOption?.haveColor;
      const finalLog = haveColor ? encodeConsoleColor(value) : value;

      // 必須按行拆分，否則整個大日誌塊包含一個 WARN 就會被全塞進 WARN 分頁
      const lines = finalLog.split(/\r?\n/);
      lines.forEach(line => {
        writeToTabs(line + "\r\n");
      });
    }
  } catch (error: any) {
    console.error("Load history error:", error);
  }
});

events.on("opened", () => message.success(t("TXT_CODE_e13abbb1")));
events.on("stopped", () => message.success(t("TXT_CODE_efb6d377")));

// 監聽類型
watch(() => state.value?.config?.type, (type) => {
  isMinecraft.value = !!(type && type.includes("minecraft"));
}, { immediate: true });

// 切換標籤時重新調整寬度
watch(activeTab, async () => {
  await nextTick();
  const current = (terminals as any)[activeTab.value];
  current?.fit?.fit();
});

const handleSendCommand = () => {
  if (focusHistoryList.value) return;
  sendCommand(commandInputValue.value || "");
  commandInputValue.value = "";
};

const handleClearAll = () => {
  clearTerminal();
  terminals.WARN.term?.clear();
  terminals.ERROR.term?.clear();
};

onMounted(async () => {
  try {
    if (props.instanceId && props.daemonId) {
      await setUpTerminal({ instanceId: props.instanceId, daemonId: props.daemonId });
    }
    await initAllTerminals();
  } catch (error) {
    console.error(error);
  }
});
</script>

<template>
  <div class="console-wrapper">
    <div v-if="!isConnect" class="terminal-loading">
      <LoadingOutlined style="font-size: 72px; color: white" />
    </div>

    <div v-if="isMinecraft" class="terminal-tabs">
      <div 
        v-for="tab in (['ALL', 'WARN', 'ERROR'] as const)" 
        :key="tab"
        :class="['tab-item', activeTab === tab ? 'active' : '']"
        @click="activeTab = tab"
      >
        {{ tab }}
      </div>
    </div>

    <div class="terminal-button-group position-absolute-right">
      <ul>
        <li @click="handleClearAll">
          <a-tooltip placement="top">
            <template #title><span>{{ t("TXT_CODE_b1e2e1b4") }}</span></template>
            <delete-outlined />
          </a-tooltip>
        </li>
      </ul>
    </div>

    <div class="terminal-wrapper global-card-container-shadow position-relative">
      <div class="terminal-container">
        <div v-show="activeTab === 'ALL'" :id="terminals.ALL.id" :style="{ height: props.height }"></div>
        <template v-if="isMinecraft">
          <div v-show="activeTab === 'WARN'" :id="terminals.WARN.id" :style="{ height: props.height }"></div>
          <div v-show="activeTab === 'ERROR'" :id="terminals.ERROR.id" :style="{ height: props.height }"></div>
        </template>

        <div v-if="containerState.isDesignMode" :style="{ height: props.height }">
          <p class="terminal-design-tip">{{ t("TXT_CODE_7ac6f85c") }}</p>
        </div>
      </div>
    </div>

    <div class="command-input">
      <div v-show="focusHistoryList" class="history">
        <li v-for="(item, key) in history" :key="item">
          <a-tag :color="key !== selectLocation ? 'blue' : '#108ee9'" @click="clickHistoryItem(item)">
            {{ item.length > 14 ? item.slice(0, 14) + "..." : item }}
          </a-tag>
        </li>
      </div>
      <a-input
        ref="inputRef"
        v-model:value="commandInputValue"
        :placeholder="t('TXT_CODE_555e2c1b')"
        autofocus
        :disabled="containerState.isDesignMode || !isConnect"
        @press-enter="handleSendCommand"
        @keydown="handleHistorySelect"
      >
        <template #prefix><CodeOutlined style="font-size: 18px" /></template>
      </a-input>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.console-wrapper {
  position: relative;
  display: flex;
  flex-direction: column;

  .terminal-loading {
    z-index: 12;
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
  }

  // 標籤導航欄
  .terminal-tabs {
    display: flex;
    gap: 4px;
    margin-bottom: 0px; 
    padding-left: 2px;
    z-index: 2;

    .tab-item {
      padding: 6px 20px;
      background: #252525;
      color: #777;
      border-radius: 6px 6px 0 0;
      cursor: pointer;
      font-size: 13px;
      transition: all 0.2s ease;
      border: 1px solid transparent;
      border-bottom: none;
      user-select: none;
      
      &:hover {
        color: #bbb;
        background: #2d2d2d;
      }
      
      &.active {
        background: #1e1e1e;
        color: #fff;
        font-weight: 600;
        border: 1px solid var(--card-border-color);
        border-bottom: 1px solid #1e1e1e; 
        margin-bottom: -1px; 
      }
    }
  }

  .terminal-button-group {
    z-index: 11;
    position: absolute;
    right: 0;
    top: 0;

    ul {
      display: flex;
      margin: 0;
      padding: 0;
      opacity: 0.3;
      transition: opacity 0.3s;
      
      li {
        cursor: pointer;
        list-style: none;
        padding: 6px;
        font-size: 18px;
        color: #eee;
        display: flex;
        align-items: center;
        
        &:hover {
          background-color: #3e3e3e;
          border-radius: 6px;
          color: #ff4d4f;
        }
      }
    }
    &:hover ul {
      opacity: 1;
    }
  }

  .terminal-wrapper {
    border: 1px solid var(--card-border-color);
    background-color: #1e1e1e;
    padding: 10px;
    border-radius: 0 8px 8px 8px; 
    position: relative;
    overflow: hidden;
    z-index: 1;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);

    .terminal-container {
      height: 100%;
      width: 100%;
    }
  }

  .command-input {
    position: relative;
    margin-top: 12px;

    .history {
      display: flex;
      max-width: 100%;
      overflow-x: auto;
      gap: 6px;
      z-index: 10;
      position: absolute;
      top: -38px;
      left: 0;
      padding: 2px 0;

      &::-webkit-scrollbar {
        height: 0 !important;
        display: none;
      }

      li {
        list-style: none;
        flex-shrink: 0;
      }
    }

    // 修復這裡的選擇器報錯
    :deep(.ant-input-affine-wrapper) {
      background-color: #1e1e1e;
      border-color: var(--card-border-color);
      border-radius: 6px;
      
      input {
        color: #ccc;
        font-family: 'Fira Code', 'JetBrains Mono', monospace;
      }

      // 不使用後綴拼接，改用完整類名或分開寫
      &:hover {
        border-color: #40a9ff;
      }
    }

    // 處理聚焦狀態
    :deep(.ant-input-affine-wrapper-focused) {
      border-color: #40a9ff;
      box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.1);
    }
  }

  .terminal-design-tip {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #666;
    font-style: italic;
  }
}

@media (max-width: 768px) {
  .console-wrapper {
    .terminal-tabs {
      .tab-item {
        padding: 4px 12px;
        font-size: 12px;
      }
    }
    .terminal-wrapper {
      padding: 4px;
    }
  }
}
</style>
