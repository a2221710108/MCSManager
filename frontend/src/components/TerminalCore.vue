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
import { onMounted, ref, watch } from "vue";
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
    // 如果是過濾模式，開啟自動換行轉換
    const term = initTerminalWindow(dom, props.filter ? { convertEol: true } : {});
    return term;
  }
  throw new Error(t("TXT_CODE_42bcfe0c"));
};

// --- 新增：日誌過濾分析邏輯 ---
const performLogAnalysis = (rawLog: string) => {
  if (!props.filter || !term) return;
  
  const lines = rawLog.split(/\r?\n/);
  // 取最後 500 行進行分析
  const last500 = lines.slice(-500);
  
  // 匹配 [WARN] 或 WARN: 格式 (不分大小寫)
  const filterKey = props.filter.toUpperCase();
  const filteredLines = last500.filter(line => 
    line.toUpperCase().includes(`[${filterKey}]`) || 
    line.toUpperCase().includes(`${filterKey}:`)
  );

  term.clear();
  term.write(`\x1b[44;37m ${filterKey} 日誌分析 (最後 500 行) \x1b[0m\r\n\n`);
  
  if (filteredLines.length === 0) {
    term.write(`\x1b[33m目前沒有發現任何 ${filterKey} 級別的信息。\x1b[0m\r\n`);
  } else {
    // 重新合併並處理顏色
    const output = filteredLines.join('\r\n');
    term.write(state.value?.config?.terminalOption?.haveColor ? encodeConsoleColor(output) : output);
  }
};

events.on("opened", () => {
  if (!props.filter) message.success(t("TXT_CODE_e13abbb1"));
});

events.on("stopped", () => {
  if (!props.filter) message.success(t("TXT_CODE_efb6d377"));
});

events.on("error", (error: Error) => {
  socketError.value = error;
});

// 修改 detail 事件：區分普通模式與過濾模式
events.once("detail", async () => {
  try {
    const { value } = await getInstanceOutputLog().execute({
      params: { uuid: instanceId || "", daemonId: daemonId || "" }
    });

    if (value) {
      if (props.filter) {
        performLogAnalysis(value);
      } else {
        if (state.value?.config?.terminalOption?.haveColor) {
          term?.write(encodeConsoleColor(value));
        } else {
          term?.write(value);
        }
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
          if (data.includes('\x1b[') && data.endsWith('R')) return; 
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
              <FileSearchOutlined /> 正在查看 {{ props.filter }} 日誌過濾視圖。此模式下無法輸入指令。
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
        <div class="flex flex-center">
            <a-typography-link @click="refreshPage">
              {{ $t("TXT_CODE_f8b28901") }}
            </a-typography-link>
        </div>
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
