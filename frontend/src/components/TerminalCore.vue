<script setup lang="ts">
import connectErrorImage from "@/assets/daemon_connection_error.png";
import { useCommandHistory } from "@/hooks/useCommandHistory";
import { useXhrPollError } from "@/hooks/useXhrPollError";
import { t } from "@/lang/i18n";
import { getInstanceOutputLog } from "@/services/apis/instance";
import { useLayoutContainerStore } from "@/stores/useLayoutContainerStore";
import { CodeOutlined, DeleteOutlined, LoadingOutlined, FileSearchOutlined } from "@ant-design/icons-vue";
import { Terminal } from "@xterm/xterm";
import { message } from "ant-design-vue";
import { onMounted, ref, onUnmounted } from "vue";
import { encodeConsoleColor, type UseTerminalHook } from "../hooks/useTerminal";
import { getRandomId } from "../tools/randId";

const props = defineProps<{
  instanceId: string;
  daemonId: string;
  height: string;
  useTerminalHook: UseTerminalHook;
  // 新增：用於過濾日誌的標籤 (WARN / ERROR)
  filter?: string;
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
    // 這裡調用 Hook 封裝好的 xterm 初始化邏輯
    const termInstance = initTerminalWindow(dom);
    return termInstance;
  }
  throw new Error(t("TXT_CODE_42bcfe0c"));
};

// --- [核心邏輯] 歷史日誌分析 ---
const performLogAnalysis = (rawLog: string) => {
  if (!props.filter || !term) return;
  
  const lines = rawLog.split(/\r?\n/);
  const filterKey = props.filter.toUpperCase();
  
  // 匹配關鍵詞：如 [WARN], WARN:, [ERROR] 等
  const filteredLines = lines.filter(line => 
    line.toUpperCase().includes(`[${filterKey}]`) || 
    line.toUpperCase().includes(`${filterKey}:`)
  ).slice(-500); // 只顯示最後 500 行，保證性能

  term.clear();
  // 繪製橫幅
  term.write(`\x1b[44;37m ${filterKey} LOG ANALYSIS (Last 500 lines) \x1b[0m\r\n\r\n`);
  
  if (filteredLines.length === 0) {
    term.write(`\x1b[33m[LazyCloud] Currently no ${filterKey} messages found in history.\x1b[0m\r\n`);
  } else {
    filteredLines.forEach(line => {
      // 判斷是否需要進行顏色轉義
      const output = state.value?.config?.terminalOption?.haveColor 
        ? encodeConsoleColor(line) 
        : line;
      term?.write(output + '\r\n');
    });
  }
};

// 實時輸出處理：如果是分析模式，則不渲染到終端，避免混亂
const onStdout = (data: any) => {
  if (props.filter) return;
  const text = typeof data === "string" ? data : data?.text;
  if (text && term) {
    term.write(state.value?.config?.terminalOption?.haveColor ? encodeConsoleColor(text) : text);
  }
};

events.on("stdout", onStdout);

events.on("opened", () => {
  if (!props.filter) message.success(t("TXT_CODE_e13abbb1"));
});

events.on("stopped", () => {
  if (!props.filter) message.success(t("TXT_CODE_efb6d377"));
});

events.on("error", (error: Error) => {
  socketError.value = error;
});

// 當 Socket 詳細信息就緒後觸發
events.once("detail", async () => {
  try {
    const { value } = await getInstanceOutputLog().execute({
      params: { uuid: instanceId || "", daemonId: daemonId || "" }
    });

    if (value && term) {
      if (props.filter) {
        performLogAnalysis(value);
      } else {
        // 普通模式下，載入全量歷史
        term.write(state.value?.config?.terminalOption?.haveColor ? encodeConsoleColor(value) : value);
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
      // 修正排版：分析模式下強制換行
      if (props.filter) {
        term.options.convertEol = true;
      }

      term.parser.registerOscHandler(11, () => true);
      term.parser.registerOscHandler(10, () => true);
    }
  } catch (error: any) {
    console.error(error);
  }
});

onUnmounted(() => {
  // 卸載時移除事件監聽，防止內存洩漏
  events.off("stdout", onStdout);
});
</script>

<template>
  <div class="console-wrapper">
    <div v-if="!isConnect" class="terminal-loading">
      <LoadingOutlined style="font-size: 72px; color: white" />
    </div>
    
    <div v-if="!props.filter" class="terminal-button-group position-absolute-right position-absolute-top">
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
      <template v-if="!props.filter">
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
      </template>

      <template v-else>
        <a-alert type="info" banner>
          <template #message>
            <span style="font-size: 12px; color: #666;">
              <FileSearchOutlined /> 正在查看 {{ props.filter }} 日誌分析視圖 (最後 500 行)。
            </span>
          </template>
        </a-alert>
      </template>
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
            <a href="https://discord.gg/auDk2Rj7aD" target="_blank" rel="noopener noreferrer">Discord</a>
            <span>|</span>
            <a href="https://news.lazycloud.one/" target="_blank" rel="noopener noreferrer">News</a>
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
