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
              <template #title>
                <span>{{ t("TXT_CODE_b1e2e1b4") }}</span>
              </template>
              <delete-outlined />
            </a-tooltip>
          </li>
        </ul>
      </div>
      <div class="terminal-wrapper global-card-container-shadow position-relative">
        <div class="terminal-container">
          <div
            v-if="!containerState.isDesignMode"
            :id="terminalDomId"
            :style="{ height: props.height }"
          ></div>
          <div v-else :style="{ height: props.height }">
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
          <div class="static-log-content" :style="{ height: props.height }">
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
        <div>
          <img :src="connectErrorImage" style="width: 100%; height: 110px" />
        </div>
        <a-typography-title :level="5">{{ $t("TXT_CODE_9c95b60f") }}</a-typography-title>
        <a-typography-paragraph>
          <pre style="font-size: 12px"><code>{{ socketError?.message||"" }}</code></pre>
          <div v-if="isXhrPollError" style="font-size: 12px">
            <span> {{ xhrPollErrorReason }}</span>
          </div>
        </a-typography-paragraph>
        <a-typography-paragraph v-if="isXhrPollError">
          <div class="flex" style="gap: 8px; font-size: 12px">
            <span><strong>{{ $t("TXT_CODE_d4c8fb3b") }}</strong></span>
            <a href="https://discord.gg/auDk2Rj7aD" target="_blank">{{ $t("TXT_CODE_9b3ce825") }}</a>
            <span>|</span>
            <a href="https://news.lazycloud.one/" target="_blank">{{ $t("TXT_CODE_10cc2794") }}</a>
          </div>
        </a-typography-paragraph>
        <a-typography-title :level="5">{{ $t("TXT_CODE_f1c96d8a") }}</a-typography-title>
        <a-typography-paragraph>
          <ul>
            <li>{{ $t("TXT_CODE_ceba9262") }}</li>
            <li>{{ $t("TXT_CODE_84099e5") }}</li>
            <li>{{ $t("TXT_CODE_86ff658a") }}</li>
          </ul>
          <div class="flex flex-center">
            <a-typography-link @click="refreshPage">
              {{ $t("TXT_CODE_f8b28901") }}
            </a-typography-link>
          </div>
        </a-typography-paragraph>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
/* 錯誤提示卡片 - 保持原樣 */
.error-card {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  top: 0;
  z-index: 20;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 0.4);

  .error-card-container {
    overflow: hidden;
    max-width: 440px;
    border: 1px solid var(--color-gray-6) !important;
    background-color: var(--color-gray-1);
    border-radius: 4px;
    padding: 16px;
    box-shadow: 0px 4px 12px rgba(0, 0, 0, 0.15);
  }
}

.console-wrapper {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;

  /* 實時終端容器 */
  .realtime-terminal-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
  }

  /* 終端視窗主體 - 與 Xterm 顏色統一 */
  .terminal-wrapper {
    flex: 1;
    border: 1px solid var(--card-border-color);
    position: relative;
    background-color: #1e1e1e; // Xterm 背景色
    padding: 8px;
    border-radius: 6px;
    border-top-left-radius: 0; // 核心：貼合上方分頁按鈕
    overflow: hidden;
    display: flex;
    flex-direction: column;
    margin-bottom: 8px;

    .terminal-container {
      flex: 1;
      height: 100%;
      width: 100%;
    }
  }

  /* 指令輸入框 - 確保不與終端重疊 */
  .command-input {
    position: relative;
    flex-shrink: 0;
    width: 100%;
    z-index: 10;

    .history {
      display: flex;
      max-width: 100%;
      overflow-x: auto;
      z-index: 15;
      position: absolute;
      top: -35px;
      left: 0;
      li {
        list-style: none;
        margin-right: 4px;
        span {
          padding: 3px 12px;
          max-width: 200px;
          overflow: hidden;
          text-overflow: ellipsis;
          cursor: pointer;
        }
      }
      &::-webkit-scrollbar { height: 0 !important; }
    }
  }

  /* 頂部操作組 (清屏等) */
  .terminal-button-group {
    z-index: 11;
    position: absolute;
    top: 12px;
    right: 20px;
    color: #fff;

    ul {
      display: flex;
      opacity: 0;
      transition: opacity 0.3s;
      margin: 0;
      padding: 0;
      li {
        cursor: pointer;
        list-style: none;
        padding: 5px;
        margin-left: 5px;
        border-radius: 4px;
        font-size: 18px;
        &:hover { background-color: rgba(255, 255, 255, 0.1); }
      }
    }

    &:hover ul { opacity: 0.8; }
  }
}

/* 靜態日誌視圖 (WARN/ERROR 分頁) */
.static-log-view-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background-color: #1e1e1e;
  border: 1px solid var(--card-border-color);
  border-radius: 6px;
  border-top-left-radius: 0; // 核心：貼合上方分頁按鈕
  overflow: hidden;
  margin-bottom: 8px;

  .static-log-content {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
    color: #d4d4d4;
    /* 強制使用與終端一致的等寬字體 */
    font-family: "Menlo", "Monaco", "Consolas", "Courier New", monospace;
    font-size: 13px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-all;
    background-color: #1e1e1e;
    
    pre {
      margin: 0;
      color: inherit;
      background: transparent;
      border: none;
      padding: 0;
    }

    /* 滾動條美化 - 讓它看起來更像終端內部滾動 */
    &::-webkit-scrollbar {
      width: 8px;
    }
    &::-webkit-scrollbar-track {
      background: #1e1e1e;
    }
    &::-webkit-scrollbar-thumb {
      background: #333;
      border-radius: 4px;
      &:hover { background: #444; }
    }
  }

  /* 確保 Spin 加載動畫覆蓋整個區域 */
  :deep(.ant-spin-nested-loading),
  :deep(.ant-spin-container) {
    height: 100%;
    display: flex;
    flex-direction: column;
  }
}

.terminal-loading {
  z-index: 12;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

/* 全域輔助類 */
.flex-center { display: flex; align-items: center; justify-content: center; }
.mt-10 { margin-top: 10px; }
</style>
