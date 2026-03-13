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
  socketAddress,
  execute: setUpTerminal,
  initTerminalWindow,
  sendCommand,
  clearTerminal
} = props.useTerminalHook;

// --- 標籤頁狀態 ---
const activeTab = ref("ALL");
const isMinecraft = ref(false);

const terminals = reactive({
  ALL: { term: null as Terminal | null, id: `term-all-${getRandomId()}`, fit: null as FitAddon | null },
  WARN: { term: null as Terminal | null, id: `term-warn-${getRandomId()}`, fit: null as FitAddon | null },
  ERROR: { term: null as Terminal | null, id: `term-error-${getRandomId()}`, fit: null as FitAddon | null }
});

const inputRef = ref<HTMLElement | null>(null);

// --- 工具函數：移除 ANSI 顏色代碼以便正確過濾 ---
const stripAnsi = (str: string) => str.replace(/[\u001b\u009b][[()#;?]*(?:[a-zA-Z\d\n\r]*(?:;[a-zA-Z\d\n\r]*)*)?/g, "");

// --- 核心分流寫入邏輯 ---
const writeToTabs = (data: string) => {
  if (!data) return;
  
  // 1. 寫入主終端
  terminals.ALL.term?.write(data);

  // 2. 只有 Minecraft 實例執行過濾
  if (isMinecraft.value) {
    const cleanData = stripAnsi(data);
    // 匹配 [Server thread/WARN]: 或包含 WARN 關鍵字
    if (/\[.*WARN\]/i.test(cleanData) || cleanData.includes("WARN")) {
      terminals.WARN.term?.write(data);
    }
    // 匹配 [Server thread/ERROR]: 或包含 ERROR 關鍵字
    if (/\[.*ERROR\]/i.test(cleanData) || cleanData.includes("ERROR")) {
      terminals.ERROR.term?.write(data);
    }
  }
};

const interceptDSR = (term: any) => {
  if (!term) return;
  term.parser.registerOscHandler(11, () => true);
  term.parser.registerOscHandler(10, () => true);
  const core = term._core;
  if (core?.coreService) {
    const originalTriggerData = core.coreService.triggerDataEvent.bind(core.coreService);
    core.coreService.triggerDataEvent = (data: string) => {
      if (data.includes('\x1b[') && data.endsWith('R')) return;
      originalTriggerData(data);
    };
  }
};

const initAllTerminals = async () => {
  if (containerState.isDesignMode) return;
  
  const domAll = document.getElementById(terminals.ALL.id);
  if (domAll) {
    terminals.ALL.term = initTerminalWindow(domAll);
    interceptDSR(terminals.ALL.term);
    const fit = new FitAddon();
    terminals.ALL.term.loadAddon(fit);
    terminals.ALL.fit = fit;
  }

  if (isMinecraft.value) {
    await nextTick();
    (["WARN", "ERROR"] as const).forEach(tab => {
      const dom = document.getElementById(terminals[tab].id);
      if (dom) {
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

// --- 監聽事件 ---

// 1. 即時數據流
events.on("data", (data: string) => writeToTabs(data));

// 2. 歷史記錄加載 (修復刷新後空白的問題)
events.once("detail", async () => {
  try {
    const { value } = await getInstanceOutputLog().execute({
      params: { uuid: props.instanceId || "", daemonId: props.daemonId || "" }
    });

    if (value) {
      const finalLog = state.value?.config?.terminalOption?.haveColor 
        ? encodeConsoleColor(value) 
        : value;

      // 歷史記錄通常是一大塊字串，我們按行拆分後過濾，確保 WARN/ERROR 分頁能收到數據
      const lines = finalLog.split(/\r?\n/);
      lines.forEach(line => {
        writeToTabs(line + "\r\n");
      });
    }
  } catch (error: any) {
    console.error("History Log Error:", error);
  }
});

events.on("opened", () => message.success(t("TXT_CODE_e13abbb1")));
events.on("stopped", () => message.success(t("TXT_CODE_efb6d377")));

watch(() => state.value?.config?.type, (type) => {
  isMinecraft.value = !!(type && type.includes("minecraft"));
}, { immediate: true });

watch(activeTab, async () => {
  await nextTick();
  (terminals as any)[activeTab.value]?.fit?.fit();
});

const handleSendCommand = () => {
  if (focusHistoryList.value) return;
  sendCommand(commandInputValue.value || "");
  commandInputValue.value = "";
};

const handleClickHistoryItem = (item: string) => {
  clickHistoryItem(item);
  inputRef.value?.focus();
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
        {{ tab === 'ALL' ? t('TXT_CODE_555e2c1b').replace(':','') : tab }}
      </div>
    </div>

    <div class="terminal-button-group position-absolute-right position-absolute-top">
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
          <a-tag :color="key !== selectLocation ? 'blue' : '#108ee9'" @click="handleClickHistoryItem(item)">
            {{ item.length > 14 ? item.slice(0, 14) + "..." : item }}
          </a-tag>
        </li>
      </div>
      <a-input
        ref="inputRef"
        v-model:value="commandInputValue"
        :placeholder="t('TXT_CODE_555e2c1b')"
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
/* 新增：標籤頁樣式，採用簡約深色風格 */
.terminal-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 8px;
  
  .tab-item {
    padding: 4px 16px;
    background: #2a2a2a;
    color: #999;
    border-radius: 4px 4px 0 0;
    cursor: pointer;
    font-size: 12px;
    transition: all 0.3s;
    border: 1px solid transparent;
    border-bottom: none;

    &:hover {
      background: #333;
      color: #eee;
    }

    &.active {
      background: #1e1e1e;
      color: #fff;
      border-color: var(--card-border-color);
      font-weight: bold;
    }

    .dot-error {
      display: inline-block;
      width: 6px;
      height: 6px;
      background: #ff4d4f;
      border-radius: 50%;
      margin-left: 4px;
      vertical-align: middle;
    }
  }
}

.error-card {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  top: 0;
  z-index: 10;
  border-radius: 20px;

  display: flex;
  align-items: center;
  justify-content: center;

  .error-card-container {
    overflow: hidden;
    max-width: 440px;
    border: 1px solid var(--color-gray-6) !important;
    background-color: var(--color-gray-1);
    border-radius: 4px;
    padding: 12px;
    box-shadow: 0px 0px 2px var(--color-gray-7);
  }

  @media (max-width: 992px) {
    .error-card-container {
      max-width: 90vw !important;
    }
  }
}
.console-wrapper {
  position: relative;

  .terminal-loading {
    z-index: 12;
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
  }

  .terminal-button-group {
    z-index: 11;
    margin-right: 20px;
    padding-bottom: 50px;
    padding-left: 50px;
    border-radius: 6px;
    color: #fff;

    &:hover {
      ul {
        transition: all 1s;
        opacity: 0.8;
      }
    }

    ul {
      display: flex;
      opacity: 0;

      li {
        cursor: pointer;
        list-style: none;
        padding: 5px;
        margin-left: 5px;
        border-radius: 6px;
        font-size: 20px;

        &:hover {
          background-color: #3e3e3e;
        }
      }
    }
  }

  .terminal-wrapper {
    border: 1px solid var(--card-border-color);
    position: relative;
    overflow: hidden;
    height: 100%;
    background-color: #1e1e1e;
    padding: 8px;
    border-radius: 6px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    .terminal-container {
      // min-width: 1200px;
      height: 100%;
    }

    margin-bottom: 12px;
  }

  .command-input {
    position: relative;

    .history {
      display: flex;
      max-width: 100%;
      overflow: scroll;
      z-index: 10;
      position: absolute;
      top: -35px;
      left: 0;

      li {
        list-style: none;
        span {
          padding: 3px 20px;
          max-width: 300px;
          overflow: hidden;
          text-overflow: ellipsis;
          cursor: pointer;
        }
      }

      &::-webkit-scrollbar {
        width: 0 !important;
        height: 0 !important;
      }
    }
  }

  .terminal-design-tip {
    color: rgba(255, 255, 255, 0.584);
  }
}


</style>
