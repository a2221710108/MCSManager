<script setup lang="ts">
import connectErrorImage from "@/assets/daemon_connection_error.png";
import { useCommandHistory } from "@/hooks/useCommandHistory";
import { useXhrPollError } from "@/hooks/useXhrPollError";
import { t } from "@/lang/i18n";
import { getInstanceOutputLog } from "@/services/apis/instance";
import { useLayoutContainerStore } from "@/stores/useLayoutContainerStore";
import { CodeOutlined, DeleteOutlined, LoadingOutlined, InfoCircleOutlined } from "@ant-design/icons-vue";
import { Terminal } from "@xterm/xterm";
import { message } from "ant-design-vue";
import { onMounted, ref } from "vue";
import { encodeConsoleColor, type UseTerminalHook } from "../hooks/useTerminal";
import { getRandomId } from "../tools/randId";

const props = defineProps<{
  instanceId: string;
  daemonId: string;
  height: string;
  useTerminalHook: UseTerminalHook;
}>();

const { containerState } = useLayoutContainerStore();

// --- 新增：靜態日誌視圖狀態 ---
const isStaticView = ref(false);
const staticLogContent = ref("");
const isLogLoading = ref(false);

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

const instanceId = props.instanceId;
const daemonId = props.daemonId;

const terminalDomId = `terminal-window-${getRandomId()}`;
const socketError = ref<Error>();
const { isXhrPollError, xhrPollErrorReason } = useXhrPollError(socketError);

let term: Terminal | undefined;
let inputRef = ref<HTMLElement | null>(null);

const handleSendCommand = () => {
  if (focusHistoryList.value) return;
  sendCommand(commandInputValue.value || "");
  commandInputValue.value = "";
};

const handleClickHistoryItem = (item: string) => {
  clickHistoryItem(item);
  inputRef.value?.focus();
};

const initTerminal = async () => {
  if (containerState.isDesignMode) return;
  const dom = document.getElementById(terminalDomId);
  if (dom) {
    const term = initTerminalWindow(dom);
    return term;
  }
  throw new Error(t("TXT_CODE_42bcfe0c"));
};

// --- 公開給父組件的方法 ---
const showLogView = (content: string, loading: boolean) => {
  isStaticView.value = true;
  staticLogContent.value = content;
  isLogLoading.value = loading;
};

const showDefaultView = () => {
  isStaticView.value = false;
};

defineExpose({
  showLogView,
  showDefaultView
});

events.on("opened", () => {
  message.success(t("TXT_CODE_e13abbb1"));
});

events.on("stopped", () => {
  message.success(t("TXT_CODE_efb6d377"));
});

events.on("error", (error: Error) => {
  socketError.value = error;
});

events.once("detail", async () => {
  try {
    const { value } = await getInstanceOutputLog().execute({
      params: { uuid: instanceId || "", daemonId: daemonId || "" }
    });

    if (value) {
      if (state.value?.config?.terminalOption?.haveColor) {
        term?.write(encodeConsoleColor(value));
      } else {
        term?.write(value);
      }
    }
  } catch (error: any) {}
});

const refreshPage = () => {
  window.location.reload();
};

onMounted(async () => {
  try {
    if (instanceId && daemonId) {
      await setUpTerminal({ instanceId, daemonId });
    }
    term = await initTerminal();

    if (term) {
      term.parser.registerOscHandler(11, () => true);
      term.parser.registerOscHandler(10, () => true);

      const core = (term as any)._core;
      if (core && core.coreService) {
        const originalTriggerData = core.coreService.triggerDataEvent.bind(core.coreService);
        core.coreService.triggerDataEvent = (data: string) => {
          if (data.includes('\x1b[') && data.endsWith('R')) {
            return; 
          }
          originalTriggerData(data);
        };
      }
    }
  } catch (error: any) {
    console.error(error);
    throw error;
  }
});
</script>

<template>
  <div class="console-wrapper">
    <div v-show="!isStaticView" class="realtime-terminal-container">
      <div v-if="!isConnect" class="terminal-loading">
        <LoadingOutlined style="font-size: 72px; color: white" />
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

      <div class="terminal-wrapper global-card-container-shadow">
        <div class="terminal-container">
          <div
            v-if="!containerState.isDesignMode"
            :id="terminalDomId"
            class="xterm-dom-container"
          ></div>
          <div v-else class="xterm-dom-container flex-center">
            <p class="terminal-design-tip">{{ $t("TXT_CODE_7ac6f85c") }}</p>
          </div>
        </div>
      </div>

      <div class="command-input">
        <div v-show="focusHistoryList" class="history">
          <li v-for="(item, key) in history" :key="item">
            <a-tag
              :color="key !== selectLocation ? 'blue' : '#108ee9'"
              @click="handleClickHistoryItem(item)"
            >
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
          <template #prefix>
            <CodeOutlined style="font-size: 18px" />
          </template>
        </a-input>
      </div>
    </div>

    <div v-if="isStaticView" class="static-log-view-wrapper">
      <div class="terminal-wrapper global-card-container-shadow">
        <a-spin :spinning="isLogLoading" :tip="t('正在加載日誌...')">
          <div class="static-log-content">
            <pre v-if="staticLogContent">{{ staticLogContent }}</pre>
            <div v-else-if="!isLogLoading" class="flex-center flex-column" style="height: 100%; opacity: 0.5;">
              <InfoCircleOutlined style="font-size: 32px;" />
              <p class="mt-10">{{ t("暫無相關日誌信息") }}</p>
            </div>
          </div>
        </a-spin>
      </div>
      <div class="command-input" style="visibility: hidden;">
        <a-input disabled />
      </div>
    </div>

    <div v-if="socketError" class="error-card">
      <div class="error-card-container">
        <a-typography-title :level="5">{{ $t("TXT_CODE_6929b0b2") }}</a-typography-title>
        <a-typography-paragraph>
          {{ $t("TXT_CODE_812a629e") + socketAddress }}
        </a-typography-paragraph>
        <div class="mb-12">
          <img :src="connectErrorImage" style="width: 100%; height: 110px; object-fit: contain" />
        </div>
        <a-typography-title :level="5">{{ $t("TXT_CODE_9c95b60f") }}</a-typography-title>
        <a-typography-paragraph>
          <pre class="error-msg-box"><code>{{ socketError?.message||"" }}</code></pre>
        </a-typography-paragraph>
        <div class="flex flex-center mt-12">
          <a-button type="primary" @click="refreshPage">{{ $t("TXT_CODE_f8b28901") }}</a-button>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.console-wrapper {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden;

  .realtime-terminal-container,
  .static-log-view-wrapper {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    overflow: hidden;
  }

  /* 終端主體：自動撐開並切割溢出 */
  .terminal-wrapper {
    flex: 1; 
    position: relative;
    background-color: #1e1e1e;
    padding: 10px;
    border-radius: 6px;
    border: 1px solid var(--card-border-color);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    margin-bottom: 12px;

    .terminal-container {
      flex: 1;
      width: 100%;
      height: 100%;
      
      .xterm-dom-container {
        height: 100% !important;
        width: 100%;
      }
    }
  }

  /* 輸入框：固定在底部，不參與縮放 */
  .command-input {
    flex-shrink: 0;
    position: relative;
    z-index: 10;
    
    .history {
      display: flex;
      position: absolute;
      top: -38px;
      left: 0;
      width: 100%;
      overflow-x: auto;
      padding-bottom: 4px;
      li { list-style: none; margin-right: 6px; }
      &::-webkit-scrollbar { height: 0 !important; }
    }
  }

  /* 靜態日誌文字樣式 */
  .static-log-content {
    flex: 1;
    overflow-y: auto;
    color: #d4d4d4;
    font-family: "JetBrains Mono", "Menlo", "Consolas", monospace;
    font-size: 13px;
    line-height: 1.6;
    
    pre {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-all;
    }
  }
}

/* 懸浮按鈕組 */
.terminal-button-group {
  z-index: 20;
  position: absolute;
  top: 15px;
  right: 25px;
  ul {
    margin: 0; padding: 0;
    li {
      color: #aaa;
      cursor: pointer;
      font-size: 18px;
      transition: color 0.2s;
      &:hover { color: #fff; }
    }
  }
}

/* 錯誤提示樣式優化 */
.error-card {
  position: absolute;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);

  .error-card-container {
    background: var(--color-gray-1);
    padding: 24px;
    border-radius: 8px;
    max-width: 420px;
    width: 90%;
    box-shadow: 0 10px 30px rgba(0,0,0,0.3);
  }
}

.error-msg-box {
  background: #f5f5f5;
  padding: 8px;
  border-radius: 4px;
  font-size: 12px;
  max-height: 100px;
  overflow-y: auto;
}

.terminal-loading {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  z-index: 30;
}

.flex-center { display: flex; align-items: center; justify-content: center; }
.flex-column { flex-direction: column; }
.mt-10 { margin-top: 10px; }
.mt-12 { margin-top: 12px; }
.mb-12 { margin-bottom: 12px; }
</style>
