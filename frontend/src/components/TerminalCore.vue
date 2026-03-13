<script setup lang="ts">
import { onMounted, ref, reactive, watch, nextTick, onBeforeUnmount } from "vue";
// ... (保持原有的 import 不變)
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit"; // 建議確保有 fit 插件以保證佈局自適應

const props = defineProps<{
  instanceId: string;
  daemonId: string;
  height: string;
  useTerminalHook: UseTerminalHook;
}>();

// --- 新增：標籤頁狀態管理 ---
const activeTab = ref("ALL");
const isMinecraft = ref(false);

// 存儲三個終端實例及其 DOM ID
const terminals = reactive({
  ALL: { term: null as Terminal | null, id: `term-all-${getRandomId()}`, fit: null as any },
  WARN: { term: null as Terminal | null, id: `term-warn-${getRandomId()}`, fit: null as any },
  ERROR: { term: null as Terminal | null, id: `term-error-${getRandomId()}` , fit: null as any }
});

const { containerState } = useLayoutContainerStore();
const { /* ...原有的解構 */ commandInputValue } = useCommandHistory();
const { state, events, isConnect, socketAddress, execute: setUpTerminal, initTerminalWindow, sendCommand, clearTerminal } = props.useTerminalHook;

// --- 新增：日誌過濾邏輯 ---
const writeToTabs = (data: string) => {
  // 1. 寫入默認終端 (保持原功能不變)
  terminals.ALL.term?.write(data);

  // 2. 如果是 Minecraft，則進行分流
  if (isMinecraft.value) {
    // 簡單過濾正則 (匹配 [時刻] [線程/LEVEL]:)
    if (data.includes("/WARN") || /WARN/i.test(data)) {
      terminals.WARN.term?.write(data);
    }
    if (data.includes("/ERROR") || /ERROR/i.test(data)) {
      terminals.ERROR.term?.write(data);
    }
  }
};

// 重寫初始化邏輯以支持多實例
const initAllTerminals = async () => {
  if (containerState.isDesignMode) return;
  
  // 初始化 ALL (這是主終端)
  const domAll = document.getElementById(terminals.ALL.id);
  if (domAll) {
    terminals.ALL.term = initTerminalWindow(domAll);
    // 執行你原有的攔截邏輯
    interceptDSR(terminals.ALL.term);
  }

  // 如果是 Minecraft，初始化另外兩個
  if (isMinecraft.value) {
    await nextTick();
    ["WARN", "ERROR"].forEach(tab => {
      const dom = document.getElementById((terminals as any)[tab].id);
      if (dom) {
        const t = new Terminal((terminals.ALL.term as any).options); // 繼承主終端配置
        const fitAddon = new FitAddon();
        t.loadAddon(fitAddon);
        t.open(dom);
        fitAddon.fit();
        (terminals as any)[tab].term = t;
        (terminals as any)[tab].fit = fitAddon;
      }
    });
  }
};

// 封裝你原有的 DSR 攔截邏輯
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

// 監聽數據流
events.on("data", (data: string) => {
  writeToTabs(data);
});

// 監聽實例類型
watch(() => state.value?.instanceInfo, (info) => {
  if (info?.config?.type) {
    // 判斷是否為 Minecraft (java 或 bedrock)
    isMinecraft.value = info.config.type.includes("minecraft");
  }
}, { immediate: true });

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

// 當切換標籤時重新調整大小
watch(activeTab, () => {
  nextTick(() => {
    (terminals as any)[activeTab.value]?.fit?.fit();
  });
});
</script>

<template>
  <div class="console-wrapper">
    <div v-if="!isConnect" class="terminal-loading">
      <LoadingOutlined style="font-size: 72px; color: white" />
    </div>

    <div v-if="isMinecraft" class="terminal-tabs">
      <div 
        v-for="tab in ['ALL', 'WARN', 'ERROR']" 
        :key="tab"
        :class="['tab-item', activeTab === tab ? 'active' : '']"
        @click="activeTab = tab"
      >
        {{ tab === 'ALL' ? t('TXT_CODE_555e2c1b').replace(':','') : tab }}
        <span v-if="tab === 'ERROR'" class="dot-error"></span>
      </div>
    </div>

    <div class="terminal-button-group position-absolute-right position-absolute-top">
      <ul>
        <li @click="clearTerminal()">
          <a-tooltip placement="top">
            <template #title><span>{{ t("TXT_CODE_b1e2e1b4") }}</span></template>
            <delete-outlined />
          </a-tooltip>
        </li>
      </ul>
    </div>

    <div class="terminal-wrapper global-card-container-shadow position-relative">
      <div class="terminal-container">
        <div 
          v-show="activeTab === 'ALL'"
          :id="terminals.ALL.id" 
          :style="{ height: props.height }"
        ></div>
        
        <div 
          v-if="isMinecraft"
          v-show="activeTab === 'WARN'"
          :id="terminals.WARN.id" 
          :style="{ height: props.height }"
        ></div>

        <div 
          v-if="isMinecraft"
          v-show="activeTab === 'ERROR'"
          :id="terminals.ERROR.id" 
          :style="{ height: props.height }"
        ></div>

        <div v-if="containerState.isDesignMode" :style="{ height: props.height }">
          <p class="terminal-design-tip">{{ $t("TXT_CODE_7ac6f85c") }}</p>
        </div>
      </div>
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
